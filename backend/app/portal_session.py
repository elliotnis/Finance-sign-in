"""Server-issued sessions for event invitations and recipient inboxes."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Header, HTTPException
from .mongo import db
from .utils import is_email_allowed

sessions = db.get_collection('portal_session_collection')


def issue_session(email):
    token = secrets.token_urlsafe(32)
    sessions.insert_one({'_id': hashlib.sha256(token.encode()).hexdigest(), 'email': email,
                         'expires_at': datetime.now(timezone.utc) + timedelta(hours=12)})
    return token


def session_email(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Please sign in again to access your portal account.')
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    session = sessions.find_one({'_id': digest, 'expires_at': {'$gt': datetime.now(timezone.utc)}})
    if not session or not is_email_allowed(session['email']):
        raise HTTPException(401, 'Your session has expired. Please sign in again.')
    return session['email']
