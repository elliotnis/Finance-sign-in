"""Opt-in People Finder, consent-based introductions, and a durable mail outbox."""
import hashlib
import os
import re
from datetime import datetime, timedelta
from html import escape
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .mongo import db, user_collection
from .portal_session import session_email
from .utils import is_admin
from .email_service import send_email, EmailConfigError, EmailSendError

router = APIRouter(prefix='/people', tags=['People Finder'])
profiles = db.get_collection('people_profiles')
requests = db.get_collection('people_connections')
notices = db.get_collection('people_notifications')
reports = db.get_collection('people_reports')

PROGRAMMES = ['DDP (FINA)', 'PBA (FINA)', 'MSE (FINA)', 'QFIN']
MAJORS = ['ACCT', 'ECON', 'IS', 'OM', 'MARK', 'MGMT', 'CS', 'MATH']
MINORS = MAJORS + ['Psychological and Behavioral Science', 'Other']
EXPERIENCE = ['high_school', 'year_1_internship', 'year_2_internship', 'year_3_internship', 'year_4_internship', 'activities', 'societies', 'scholarships', 'certifications', 'licenses']
DECLARATION = 'I declare that all information provided is correct and subject to HKUST Academic Honor Code. Students who violate the above condition may result in failure in FINA 3001.'


def policy():
    def number(name, default, low, high):
        try:
            return min(high, max(low, int(os.getenv(name, str(default)))))
        except ValueError:
            return default
    return dict(response_days=number('PEOPLE_RESPONSE_DAYS', 5, 3, 5),
                missed_limit=number('PEOPLE_MISSED_LIMIT', 3, 2, 10),
                restriction_days=30, toggle_days=30,
                report_grace_hours=number('PEOPLE_REPORT_GRACE_HOURS', 72, 0, 168),
                daily_request_limit=number('PEOPLE_DAILY_REQUEST_LIMIT', 5, 1, 20))


class PublicProfile(BaseModel):
    enabled: bool = False
    full_name: str = Field(min_length=1, max_length=120)
    preferred_name: str = Field(default='', max_length=80)
    programme: str
    study_year: int = Field(ge=1, le=5)
    entry_year: int = Field(ge=2000, le=2100)
    graduation_year: int = Field(ge=2000, le=2110)
    additional_majors: list[str] = Field(default_factory=list, max_length=8)
    minors: list[str] = Field(default_factory=list, max_length=9)
    extended_major: Literal['', 'AI', 'Other'] = ''
    interests: str = Field(default='', max_length=600)
    linkedin_url: str = Field(default='', max_length=400)
    experience: dict[str, str] = Field(default_factory=dict)
    declaration: bool = False

    @field_validator('linkedin_url')
    @classmethod
    def linkedin(cls, value):
        value = value.strip()
        if not value:
            return ''
        if value.startswith(('www.linkedin.com/', 'linkedin.com/')):
            value = 'https://' + value
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.hostname not in ('linkedin.com', 'www.linkedin.com') or not parsed.path.startswith('/in/') or not parsed.path[4:].strip('/') or parsed.username or parsed.password or parsed.port:
            raise ValueError('Use your https://www.linkedin.com/in/... profile link')
        return value

    @model_validator(mode='after')
    def eligibility(self):
        self.full_name = self.full_name.strip()
        self.preferred_name = self.preferred_name.strip()
        if not self.full_name or self.programme not in PROGRAMMES:
            raise ValueError('Enter your full name and choose a programme')
        if self.graduation_year < self.entry_year or self.graduation_year - self.entry_year > 10:
            raise ValueError('Check your study period')
        if any(value not in MAJORS for value in self.additional_majors) or any(value not in MINORS for value in self.minors):
            raise ValueError('Choose a listed major or minor')
        if any(key not in EXPERIENCE or len(value) > 2000 for key, value in self.experience.items()):
            raise ValueError('Experience fields must contain at most 2,000 characters')
        self.experience = {key: value.strip() for key, value in self.experience.items() if value.strip()}
        if self.study_year < 3 and self.experience:
            raise ValueError('Manual experience profiles are available in Years 3–5; use LinkedIn in Years 1–2')
        if self.enabled and not self.declaration:
            raise ValueError('Accept the accuracy declaration before joining People Finder')
        meaningful = any(value for key, value in self.experience.items() if key != 'high_school')
        if self.enabled and not (self.linkedin_url or self.study_year >= 3 and meaningful):
            raise ValueError('Share a LinkedIn profile or, in Years 3–5, complete your experience')
        return self


class Introduction(BaseModel):
    recipient_id: str
    message: str = Field(max_length=12000)
    contact: str = Field(min_length=3, max_length=300)

    @field_validator('message')
    @classmethod
    def words(cls, value):
        if len(value.split()) < 25:
            raise ValueError('Write at least 25 words explaining why you want to connect')
        return value.strip()

    @field_validator('contact')
    @classmethod
    def contact_value(cls, value):
        if len(value.strip()) < 3:
            raise ValueError('Provide a contact method')
        return value.strip()


class Decision(BaseModel):
    version: str
    action: Literal['accept', 'decline']
    contact: str = Field(default='', max_length=300)


class Report(BaseModel):
    reason: str = Field(min_length=20, max_length=3000)


class Review(BaseModel):
    action: Literal['dismiss', 'restrict']
    reason: str = Field(min_length=10, max_length=2000)


def init_indexes():
    profiles.create_index('public_id', unique=True)
    db.people_daily_quota.create_index('expires_at', expireAfterSeconds=0)
    db.people_meetings.create_index([('organizer', 1), ('date', -1)])
    db.people_meetings.create_index([('attendee', 1), ('date', -1)])
    requests.create_index([('recipient', 1), ('status', 1), ('expires_at', 1)])
    requests.create_index([('sender', 1), ('created_at', -1)])
    notices.create_index([('recipient', 1), ('created_at', -1)])
    reports.create_index([('connection_id', 1), ('version', 1), ('reporter', 1)], unique=True)


def public_view(profile):
    keys = ['full_name', 'preferred_name', 'programme', 'study_year', 'entry_year', 'graduation_year', 'additional_majors', 'minors', 'extended_major', 'interests', 'linkedin_url', 'experience']
    return {'id': profile['public_id'], **{key: profile.get(key) for key in keys}}


def active(profile, now=None):
    return bool(profile and profile.get('enabled') and profile.get('declaration') and profile.get('restricted_until', datetime.min) <= (now or datetime.utcnow()))


def participant(actor):
    profile = profiles.find_one({'_id': actor})
    if not active(profile):
        raise HTTPException(403, 'Join People Finder in your settings first, or wait until your restriction ends.')
    return profile


def notify(recipient, key, title, text, connection_id=None):
    notices.update_one({'_id': key}, {'$setOnInsert': {
        'recipient': recipient, 'title': title, 'text': text, 'connection_id': connection_id,
        'read': False, 'email_status': 'pending', 'created_at': datetime.utcnow(),
    }}, upsert=True)


def deliver_notifications():
    now = datetime.utcnow()
    notices.update_many({'email_status': 'sending', 'claimed_at': {'$lt': now - timedelta(minutes=5)}}, {'$set': {'email_status': 'pending'}})
    for notice in notices.find({'email_status': 'pending'}).limit(50):
        claimed = notices.update_one({'_id': notice['_id'], 'email_status': 'pending'}, {'$set': {'email_status': 'sending', 'claimed_at': now}})
        if not claimed.modified_count:
            continue
        url = os.getenv('FRONTEND_URL', 'http://localhost:8080').rstrip('/') + '/people?tab=connections'
        text = notice['text'] + '\n\nOpen People Finder: ' + url
        try:
            meeting = db.people_meetings.find_one({'_id': notice.get('meeting_id')}) if notice.get('meeting_id') else None
            attachment = meeting_ics(meeting) if meeting else None
            send_email(notice['recipient'], notice['title'], f'<p>{escape(text).replace(chr(10), "<br>")}</p>', text, smtp_profile='finaugevents', calendar_body=attachment, calendar_method='PUBLISH')
            status = 'sent'
        except (EmailConfigError, EmailSendError):
            status = 'failed'
        notices.update_one({'_id': notice['_id']}, {'$set': {'email_status': status}})


def expire_requests():
    now = datetime.utcnow()
    for req in requests.find({'status': 'pending', 'expires_at': {'$lte': now}}):
        updated = requests.update_one({'_id': req['_id'], 'version': req['version'], 'status': 'pending'}, {'$set': {'status': 'expired', 'expired_at': now}, '$unset': {'sender_contact': '', 'recipient_contact': ''}})
        if not updated.modified_count:
            continue
        for email in (req['sender'], req['recipient']):
            notify(email, f"{req['version']}:expired:{email}", 'Connection request expired', 'The request was not answered before its deadline.', req['_id'])
        profiles.update_one({'_id': req['recipient']}, {'$push': {'missed_responses': {'$each': [now], '$slice': -20}}})
    # Reconcile restrictions separately so a restart between expiry and restriction is safe.
    for profile in profiles.find({'enabled': True}):
        since = max(now - timedelta(days=30), profile.get('last_expiry_restriction', datetime.min))
        missed = list(requests.find({'recipient': profile['_id'], 'status': 'expired', 'expired_at': {'$gt': since}}))
        if len(missed) >= policy()['missed_limit'] and profile.get('restricted_until', datetime.min) <= now:
            until = now + timedelta(days=30)
            changed = profiles.update_one({'_id': profile['_id'], 'last_expiry_restriction': profile.get('last_expiry_restriction')}, {'$set': {'restricted_until': until, 'last_expiry_restriction': now}})
            if changed.modified_count:
                notify(profile['_id'], f"restriction:{profile['public_id']}:{now.isoformat()}", 'People Finder paused for 30 days', f"You missed {len(missed)} request deadlines. You can use connections again after {until.date()}.")


@router.get('/me')
def me(actor: str = Depends(session_email)):
    profile = profiles.find_one({'_id': actor})
    user = user_collection.find_one({'email': actor}) or {}
    base = user.get('profile') or {}
    own = None if not profile else {key: value for key, value in profile.items() if key not in ('_id', 'missed_responses')}
    return {'profile': own, 'seed': {'full_name': base.get('full_name', ''), 'preferred_name': base.get('preferred_name', ''), 'study_year': base.get('study_year', '')}, 'policy': policy(), 'is_admin': is_admin(actor), 'declaration': DECLARATION}


@router.put('/me')
def save_profile(data: PublicProfile, actor: str = Depends(session_email)):
    now = datetime.utcnow()
    previous = profiles.find_one({'_id': actor})
    changing = previous is None or data.enabled != previous.get('enabled', False)
    if changing and previous and previous.get('next_toggle_at', datetime.min) > now:
        raise HTTPException(409, f"You can change your connection preference after {previous['next_toggle_at'].isoformat()}Z")
    version = (previous or {}).get('version', 0)
    updates = {**data.model_dump(), 'version': version + 1, 'updated_at': now, 'declaration_version': 'proposal-2026-09'}
    if data.declaration:
        updates['declared_at'] = now
    if changing:
        updates['next_toggle_at'] = now + timedelta(days=30)
    if not previous:
        try:
            profiles.insert_one({'_id': actor, 'public_id': uuid4().hex, **updates})
        except DuplicateKeyError:
            raise HTTPException(409, 'Your profile changed. Refresh and try again.')
    else:
        result = profiles.update_one({'_id': actor, 'version': version}, {'$set': updates})
        if not result.modified_count:
            raise HTTPException(409, 'Your profile changed. Refresh and try again.')
    return me(actor)


@router.get('/directory')
def directory(q: str = '', programme: str = '', year: int | None = None, major: str = '', minor: str = '', extended: str = '', page: int = 1, actor: str = Depends(session_email)):
    participant(actor)
    query = {'enabled': True, 'declaration': True, '_id': {'$ne': actor}, '$or': [{'restricted_until': {'$exists': False}}, {'restricted_until': {'$lte': datetime.utcnow()}}]}
    for key, value in [('programme', programme), ('study_year', year), ('additional_majors', major), ('minors', minor), ('extended_major', extended)]:
        if value:
            query[key] = value
    if q.strip():
        regex = {'$regex': re.escape(q.strip()[:100]), '$options': 'i'}
        query['$and'] = [{'$or': [{key: regex} for key in ['full_name', 'preferred_name', 'interests'] + ['experience.' + key for key in EXPERIENCE]]}]
    page = max(1, page)
    items = list(profiles.find(query).sort('full_name', 1).skip((page - 1) * 24).limit(25))
    return {'profiles': [public_view(p) for p in items[:24]], 'has_more': len(items) > 24, 'page': page}


def connection_view(req, actor):
    peer_email = req['recipient'] if actor == req['sender'] else req['sender']
    peer = profiles.find_one({'_id': peer_email})
    result = {key: req.get(key) for key in ['version', 'status', 'message', 'created_at', 'expires_at', 'accepted_at', 'report_after']}
    result.update(id=req['_id'], incoming=actor == req['recipient'], peer=public_view(peer) if active(peer) else {'full_name': 'Former member', 'id': ''})
    if req['status'] == 'accepted':
        result['contact'] = req.get('sender_contact') if actor == req['recipient'] else req.get('recipient_contact')
    return result


@router.get('/connections')
def connections(actor: str = Depends(session_email)):
    expire_requests()
    return {'connections': [connection_view(req, actor) for req in requests.find({'$or': [{'sender': actor}, {'recipient': actor}]}).sort('created_at', -1).limit(100)]}


@router.post('/connections')
def connect(data: Introduction, tasks: BackgroundTasks, actor: str = Depends(session_email)):
    sender = participant(actor)
    recipient = profiles.find_one({'public_id': data.recipient_id})
    if not active(recipient) or recipient['_id'] == actor:
        raise HTTPException(404, 'This person is not available for a connection request')
    now = datetime.utcnow()
    # Atomic per-sender quota prevents parallel requests bypassing the limit.
    day = now.strftime('%Y-%m-%d')
    quota = db.get_collection('people_daily_quota')
    quota.update_one({'_id': actor + ':' + day}, {'$setOnInsert': {'count': 0, 'expires_at': now + timedelta(days=2)}}, upsert=True)
    claim = quota.update_one({'_id': actor + ':' + day, 'count': {'$lt': policy()['daily_request_limit']}}, {'$inc': {'count': 1}})
    if not claim.modified_count:
        raise HTTPException(429, 'Daily connection request limit reached. Try tomorrow.')
    pair = hashlib.sha256('\0'.join(sorted([actor, recipient['_id']])).encode()).hexdigest()
    version = uuid4().hex
    req = {'sender': actor, 'recipient': recipient['_id'], 'version': version, 'message': data.message,
           'sender_contact': data.contact, 'status': 'pending', 'created_at': now,
           'expires_at': now + timedelta(days=policy()['response_days'])}
    try:
        result = requests.find_one_and_update({'_id': pair, 'status': {'$nin': ['pending', 'accepted']}, 'created_at': {'$lte': now - timedelta(days=30)}}, {'$set': req, '$unset': {'recipient_contact': '', 'accepted_at': '', 'report_after': ''}}, upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        raise HTTPException(409, 'You already have a connection/request, or must wait 30 days before requesting again.')
    notify(recipient['_id'], version + ':request', f"Connection request from {sender['full_name']}", f"{sender['full_name']} would like to connect. Please accept or decline in People Finder within {policy()['response_days']} days.\n\n{data.message}\n\nTheir contact method will be revealed only if you accept.", pair)
    tasks.add_task(deliver_notifications)
    return connection_view(result, actor)


@router.post('/connections/{connection_id}/decision')
def decide(connection_id: str, data: Decision, tasks: BackgroundTasks, actor: str = Depends(session_email)):
    if data.action == 'accept':
        participant(actor)
        pending = requests.find_one({'_id': connection_id, 'version': data.version, 'recipient': actor, 'status': 'pending'})
        if not pending or not active(profiles.find_one({'_id': pending['sender']})):
            raise HTTPException(409, 'The sender is no longer available for connections')
        if len(data.contact.strip()) < 3:
            raise HTTPException(422, 'Provide your contact method to accept and share it with this person')
    now = datetime.utcnow()
    updates = {'status': 'accepted' if data.action == 'accept' else 'declined', 'decided_at': now}
    if data.action == 'accept':
        updates.update(recipient_contact=data.contact.strip(), accepted_at=now, report_after=now + timedelta(hours=policy()['report_grace_hours']))
    operation = {'$set': updates}
    if data.action == 'decline':
        operation['$unset'] = {'sender_contact': '', 'recipient_contact': ''}
    req = requests.find_one_and_update({'_id': connection_id, 'version': data.version, 'recipient': actor, 'status': 'pending', 'expires_at': {'$gt': now}}, operation, return_document=ReturnDocument.AFTER)
    if not req:
        raise HTTPException(409, 'This request is unavailable, expired, or already answered')
    for recipient in [req['sender'], req['recipient']]:
        notify(recipient, data.version + ':decision:' + recipient, 'Connection ' + updates['status'], 'Your connection request was ' + updates['status'] + '. Open People Finder to view it. Contact methods are shown there only for accepted connections.', connection_id)
    tasks.add_task(deliver_notifications)
    return connection_view(req, actor)


@router.get('/notifications')
def inbox(actor: str = Depends(session_email)):
    return {'notifications': [{key: value for key, value in item.items() if key not in ('recipient', 'claimed_at')} for item in notices.find({'recipient': actor}).sort('created_at', -1).limit(100)]}


@router.post('/notifications/{notice_id}/read')
def mark_read(notice_id: str, actor: str = Depends(session_email)):
    if not notices.update_one({'_id': notice_id, 'recipient': actor}, {'$set': {'read': True}}).matched_count:
        raise HTTPException(404, 'Notification not found')
    return {'success': True}


@router.post('/connections/{connection_id}/report')
def report_connection(connection_id: str, data: Report, actor: str = Depends(session_email)):
    req = requests.find_one({'_id': connection_id, 'status': 'accepted', '$or': [{'sender': actor}, {'recipient': actor}]})
    if not req or req.get('report_after', datetime.max) > datetime.utcnow():
        raise HTTPException(409, 'Reporting is available after the contact grace period for an accepted connection')
    try:
        reports.insert_one({'_id': uuid4().hex, 'connection_id': connection_id, 'version': req['version'], 'reporter': actor, 'reported': req['recipient'] if actor == req['sender'] else req['sender'], 'reason': data.reason, 'status': 'pending', 'created_at': datetime.utcnow()})
    except DuplicateKeyError:
        raise HTTPException(409, 'You already reported this connection')
    return {'success': True, 'message': 'Report submitted for administrator review. No restriction is applied automatically.'}


@router.get('/reports')
def admin_reports(actor: str = Depends(session_email)):
    if not is_admin(actor):
        raise HTTPException(403, 'Administrator access required')
    return {'reports': list(reports.find({}).sort('created_at', -1).limit(100))}


@router.post('/reports/{report_id}/review')
def review_report(report_id: str, data: Review, tasks: BackgroundTasks, actor: str = Depends(session_email)):
    if not is_admin(actor):
        raise HTTPException(403, 'Administrator access required')
    report = reports.find_one_and_update({'_id': report_id, 'status': 'pending'}, {'$set': {'status': data.action, 'reviewed_by': actor, 'review_reason': data.reason, 'reviewed_at': datetime.utcnow()}}, return_document=ReturnDocument.AFTER)
    if not report:
        raise HTTPException(409, 'Report has already been reviewed or does not exist')
    if data.action == 'restrict':
        until = datetime.utcnow() + timedelta(days=30)
        profiles.update_one({'_id': report['reported']}, {'$max': {'restricted_until': until}})
        notify(report['reported'], report_id + ':review', 'People Finder restricted for 30 days', 'An administrator reviewed a connection report. Reason: ' + data.reason + '. Your access resumes after ' + str(until.date()) + '.')
        tasks.add_task(deliver_notifications)
    return {'success': True}


@router.post('/notifications/retry-failed')
def retry_failed(tasks: BackgroundTasks, actor: str = Depends(session_email)):
    if not is_admin(actor):
        raise HTTPException(403, 'Administrator access required')
    notices.update_many({'email_status': 'failed'}, {'$set': {'email_status': 'pending'}})
    tasks.add_task(deliver_notifications)
    return {'success': True}


class Meeting(BaseModel):
    date: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    time: str = Field(pattern=r'^\d{2}:\d{2}$')
    duration: int = Field(default=30, ge=15, le=180)
    location: str = Field(min_length=1, max_length=400)
    message: str = Field(default='', max_length=2000)

    @model_validator(mode='after')
    def future(self):
        try:
            start = datetime.strptime(self.date + ' ' + self.time, '%Y-%m-%d %H:%M')
        except ValueError:
            raise ValueError('Enter a valid meeting date and time')
        if start <= datetime.utcnow() + timedelta(hours=8):
            raise ValueError('Choose a future meeting time in Hong Kong time')
        if (start + timedelta(minutes=self.duration)).date() != start.date():
            raise ValueError('The meeting must end on the same day')
        if not self.location.strip():
            raise ValueError('Provide a meeting location')
        return self


@router.post('/connections/{connection_id}/meetings')
def create_meeting(connection_id: str, data: Meeting, tasks: BackgroundTasks, actor: str = Depends(session_email)):
    participant(actor)
    connection = requests.find_one({'_id': connection_id, 'status': 'accepted', '$or': [{'sender': actor}, {'recipient': actor}]})
    if not connection:
        raise HTTPException(404, 'An accepted connection is required')
    peer = connection['recipient'] if actor == connection['sender'] else connection['sender']
    if not active(profiles.find_one({'_id': peer})):
        raise HTTPException(409, 'This person is not currently available for meetings')
    start = datetime.strptime(data.date + ' ' + data.time, '%Y-%m-%d %H:%M')
    meeting = {'_id': uuid4().hex, 'connection_id': connection_id, 'organizer': actor, 'attendee': peer,
               **data.model_dump(), 'status': 'invited', 'created_at': datetime.utcnow()}
    db.people_meetings.insert_one(meeting)
    for recipient in [actor, peer]:
        notify(recipient, meeting['_id'] + ':' + recipient, 'Private meeting invitation',
               f"{data.date} at {data.time} HKT · {data.duration} minutes\n{data.location}\n{data.message}\nOpen People Finder to view or respond to this private invitation.", connection_id)
        # Use the existing durable mail outbox; invitations disclose no account email to the peer.
        notices.update_one({'_id': meeting['_id'] + ':' + recipient}, {'$set': {'meeting_id': meeting['_id']}})
    tasks.add_task(deliver_notifications)
    return {'id': meeting['_id']}


@router.get('/meetings')
def list_meetings(actor: str = Depends(session_email)):
    return {'meetings': [{**{key: value for key, value in item.items() if key not in ('organizer', 'attendee')},
                          'incoming': item['attendee'] == actor,
                          'peer_name': (profiles.find_one({'_id': item['organizer'] if item['attendee'] == actor else item['attendee']}) or {}).get('full_name', 'Former member')}
                         for item in db.people_meetings.find({'$or': [{'organizer': actor}, {'attendee': actor}]}).sort('date', -1).limit(100)]}


@router.post('/meetings/{meeting_id}/decision')
def decide_meeting(meeting_id: str, data: Decision, tasks: BackgroundTasks, actor: str = Depends(session_email)):
    meeting = db.people_meetings.find_one_and_update({'_id': meeting_id, 'attendee': actor, 'status': 'invited'},
        {'$set': {'status': 'accepted' if data.action == 'accept' else 'declined'}}, return_document=ReturnDocument.AFTER)
    if not meeting:
        raise HTTPException(409, 'This invitation is unavailable or has already been answered')
    for recipient in [meeting['organizer'], actor]:
        notify(recipient, meeting_id + ':decision:' + recipient, 'Private meeting ' + meeting['status'],
               f"The meeting on {meeting['date']} at {meeting['time']} HKT was {meeting['status']}.", meeting['connection_id'])
    tasks.add_task(deliver_notifications)
    return {'success': True}


@router.get('/meetings/{meeting_id}/calendar')
def meeting_calendar(meeting_id: str, actor: str = Depends(session_email)):
    from fastapi.responses import Response
    meeting = db.people_meetings.find_one({'_id': meeting_id, '$or': [{'organizer': actor}, {'attendee': actor}], 'status': {'$ne': 'declined'}})
    if not meeting:
        raise HTTPException(404, 'Meeting not found')
    return Response(meeting_ics(meeting), media_type='text/calendar', headers={'Content-Disposition': 'attachment; filename="private-meeting.ics"'})


def meeting_ics(meeting):
    from .people_calendar import calendar_attachment
    end = (datetime.strptime(meeting['time'], '%H:%M') + timedelta(minutes=meeting['duration'])).strftime('%H:%M')
    event = dict(id=meeting['_id'], date=meeting['date'], time_slot=meeting['time']+'-'+end,
                 title='People Finder private meeting', location=meeting['location'], description=meeting['message'], created_by='noreply@people-finder.invalid')
    content = calendar_attachment(event, 'noreply@people-finder.invalid').replace('METHOD:REQUEST', 'METHOD:PUBLISH').replace('BEGIN:VEVENT', 'BEGIN:VEVENT\r\nCLASS:PRIVATE')
    return '\r\n'.join(line for line in content.split('\r\n') if not line.startswith(('ATTENDEE', 'ORGANIZER')))


@router.get('/restrictions')
def list_restrictions(actor: str = Depends(session_email)):
    if not is_admin(actor):
        raise HTTPException(403, 'Administrator access required')
    return {'restrictions': [{'id': p['public_id'], 'full_name': p['full_name'], 'until': p['restricted_until']}
                             for p in profiles.find({'restricted_until': {'$gt': datetime.utcnow()}}).limit(100)]}


@router.post('/restrictions/{public_id}/lift')
def lift_restriction(public_id: str, data: Report, tasks: BackgroundTasks, actor: str = Depends(session_email)):
    if not is_admin(actor):
        raise HTTPException(403, 'Administrator access required')
    now = datetime.utcnow()
    profile = profiles.find_one_and_update({'public_id': public_id, 'restricted_until': {'$gt': now}},
        {'$set': {'restricted_until': now, 'last_expiry_restriction': now, 'restriction_review': {'by': actor, 'at': now, 'reason': data.reason}}})
    if not profile:
        raise HTTPException(404, 'No active restriction found')
    notify(profile['_id'], uuid4().hex, 'People Finder restriction lifted', 'An administrator restored your access. Reason: ' + data.reason)
    tasks.add_task(deliver_notifications)
    return {'success': True}
