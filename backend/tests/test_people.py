"""Run with PEOPLE_TEST_MONGO_URI to exercise a disposable database, never portal data."""
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from uuid import uuid4


@unittest.skipUnless(os.getenv('PEOPLE_TEST_MONGO_URI'), 'requires disposable Mongo integration database')
class PeopleFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from pymongo import MongoClient
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app import people
        from app.portal_session import session_email
        cls.people = people
        cls.mongo = MongoClient(os.environ['PEOPLE_TEST_MONGO_URI'])
        cls.db = cls.mongo['people_test_' + uuid4().hex]
        cls.patches = [patch.object(people, key, value) for key, value in {
            'db': cls.db, 'profiles': cls.db.people_profiles, 'requests': cls.db.people_connections,
            'notices': cls.db.people_notifications, 'reports': cls.db.people_reports,
            'user_collection': cls.db.user_collection, 'send_email': lambda *args, **kwargs: None,
            'is_admin': lambda actor: actor == 'admin@example.test',
        }.items()]
        for item in cls.patches: item.start()
        people.init_indexes()
        app = FastAPI()
        app.include_router(people.router)
        cls.actor = 'a@example.test'
        app.dependency_overrides[session_email] = lambda: cls.actor
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.mongo.drop_database(cls.db.name)
        for item in reversed(cls.patches): item.stop()
        cls.mongo.close()

    def setUp(self):
        for name in self.db.list_collection_names(): self.db[name].delete_many({})
        self.body = dict(enabled=True, full_name='Student A', preferred_name='A',programme='QFIN',study_year=3,
                         entry_year=2024,graduation_year=2028,linkedin_url='https://www.linkedin.com/in/student-a',declaration=True)
        for actor in ['a@example.test', 'b@example.test', 'c@example.test']:
            type(self).actor=actor
            response=self.client.put('/people/me',json={**self.body,'full_name':actor[0].upper()+' Student'})
            self.assertEqual(response.status_code,200,response.text)
        type(self).actor='a@example.test'
        self.recipient=self.db.people_profiles.find_one({'_id':'b@example.test'})['public_id']

    def request(self):
        response=self.client.post('/people/connections',json={'recipient_id':self.recipient,'message':' '.join(['introduction']*25),'contact':'PRIVATE-SENDER'})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def accept(self, req):
        type(self).actor='b@example.test'
        response=self.client.post('/people/connections/'+req['id']+'/decision',json={'version':req['version'],'action':'accept','contact':'PRIVATE-RECIPIENT'})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def test_private_contact_and_acceptance(self):
        self.db.user_collection.insert_one({'email':'b@example.test','profile':{'SID':'SECRET-SID','contact_phone':'SECRET-PHONE'}})
        directory=self.client.get('/people/directory').text
        for secret in ['b@example.test','SECRET-SID','SECRET-PHONE','restricted_until']: self.assertNotIn(secret,directory)
        req=self.request()
        self.assertNotIn('PRIVATE',str(req))
        type(self).actor='b@example.test'
        self.assertNotIn('PRIVATE',self.client.get('/people/connections').text)
        self.assertNotIn('PRIVATE',self.client.get('/people/notifications').text)
        type(self).actor='c@example.test'
        self.assertEqual(self.client.get('/people/connections').json()['connections'],[])
        spoof=self.client.post('/people/connections/'+req['id']+'/decision',json={'version':req['version'],'action':'accept','contact':'Xyz'})
        self.assertEqual(spoof.status_code,409)
        accepted=self.accept(req)
        self.assertEqual(accepted['contact'],'PRIVATE-SENDER')
        type(self).actor='a@example.test'
        self.assertEqual(self.client.get('/people/connections').json()['connections'][0]['contact'],'PRIVATE-RECIPIENT')

    def test_validation_toggle_and_duplicate(self):
        self.assertEqual(self.client.post('/people/connections',json={'recipient_id':self.recipient,'message':'word '*24,'contact':'test'}).status_code,422)
        self.assertEqual(self.client.put('/people/me',json={**self.body,'study_year':1,'experience':{'activities':'Society'}}).status_code,422)
        self.assertEqual(self.client.put('/people/me',json={**self.body,'linkedin_url':'javascript:alert(1)'}).status_code,422)
        self.assertEqual(self.client.put('/people/me',json={**self.body,'enabled':False}).status_code,409)
        req=self.request()
        self.assertEqual(self.client.post('/people/connections',json={'recipient_id':self.recipient,'message':'word '*200,'contact':'test'}).status_code,409)
        type(self).actor='b@example.test'
        self.assertEqual(self.client.post('/people/connections/'+req['id']+'/decision',json={'version':req['version'],'action':'decline'}).status_code,200)
        self.assertNotIn('sender_contact',self.db.people_connections.find_one({'_id':req['id']}))

    def test_expiry_restriction_and_review(self):
        req=self.request()
        self.db.people_connections.update_one({'_id':req['id']},{'$set':{'expires_at':datetime.utcnow()-timedelta(days=1)}})
        self.people.expire_requests();self.people.expire_requests()
        self.assertEqual(self.db.people_connections.find_one({'_id':req['id']})['status'],'expired')
        self.assertEqual(self.db.people_notifications.count_documents({'title':'Connection request expired'}),2)
        for i in range(2): self.db.people_connections.insert_one({'_id':str(i),'recipient':'b@example.test','status':'expired','expired_at':datetime.utcnow()})
        self.people.expire_requests()
        self.assertGreater(self.db.people_profiles.find_one({'_id':'b@example.test'})['restricted_until'],datetime.utcnow())
        type(self).actor='b@example.test'
        self.assertEqual(self.client.get('/people/directory').status_code,403)

    def test_reports_require_review(self):
        req=self.request();self.accept(req)
        payload={'reason':'Repeated attempts to arrange our meeting received no response.'}
        self.assertEqual(self.client.post('/people/connections/'+req['id']+'/report',json=payload).status_code,409)
        self.db.people_connections.update_one({'_id':req['id']},{'$set':{'report_after':datetime.utcnow()-timedelta(days=1)}})
        self.assertEqual(self.client.post('/people/connections/'+req['id']+'/report',json=payload).status_code,200)
        self.assertNotIn('restricted_until',self.db.people_profiles.find_one({'_id':'a@example.test'}))
        self.assertEqual(self.client.get('/people/reports').status_code,403)
        type(self).actor='admin@example.test'
        report=self.client.get('/people/reports').json()['reports'][0]
        self.assertEqual(self.client.post('/people/reports/'+report['_id']+'/review',json={'action':'restrict','reason':'Reviewed evidence supports the report.'}).status_code,200)
        self.assertGreater(self.db.people_profiles.find_one({'_id':'a@example.test'})['restricted_until'],datetime.utcnow())
        restriction=self.client.get('/people/restrictions').json()['restrictions'][0]
        self.assertEqual(self.client.post('/people/restrictions/'+restriction['id']+'/lift',json={'reason':'The student appeal was reviewed and accepted.'}).status_code,200)
        self.assertTrue(self.people.active(self.db.people_profiles.find_one({'_id':'a@example.test'})))

    def test_private_meeting_visibility_and_calendar(self):
        req=self.request();self.accept(req)
        payload={'date':(datetime.utcnow()+timedelta(days=3)).strftime('%Y-%m-%d'),'time':'14:00','location':'Library','message':'Career conversation'}
        response=self.client.post('/people/connections/'+req['id']+'/meetings',json=payload)
        self.assertEqual(response.status_code,200,response.text)
        meeting=response.json()['id']
        ics=self.client.get('/people/meetings/'+meeting+'/calendar')
        self.assertEqual(ics.status_code,200)
        self.assertIn('BEGIN:VCALENDAR',ics.text)
        self.assertNotIn('@example.test',ics.text)
        type(self).actor='c@example.test'
        self.assertEqual(self.client.get('/people/meetings').json()['meetings'],[])
        self.assertEqual(self.client.get('/people/meetings/'+meeting+'/calendar').status_code,404)
        self.assertEqual(self.client.post('/people/connections/'+req['id']+'/meetings',json=payload).status_code,404)
        type(self).actor='a@example.test'
        self.assertEqual(self.client.post('/people/meetings/'+meeting+'/decision',json={'action':'accept','version':''}).status_code,200)

    def test_email_failure_keeps_inapp_and_retry(self):
        from app.email_service import EmailSendError
        with patch.object(self.people,'send_email',side_effect=EmailSendError('SMTP unavailable')):
            self.request()
        self.assertEqual(self.db.people_notifications.find_one()['email_status'],'failed')
        type(self).actor='admin@example.test'
        self.assertEqual(self.client.post('/people/notifications/retry-failed').status_code,200)
        self.assertEqual(self.db.people_notifications.find_one()['email_status'],'sent')

    def test_filters_and_inactive_consent(self):
        self.assertEqual(len(self.client.get('/people/directory?year=3&programme=QFIN').json()['profiles']),2)
        self.assertEqual(self.client.get('/people/directory?year=1').json()['profiles'],[])
        req=self.request()
        self.db.people_profiles.update_one({'_id':'a@example.test'},{'$set':{'enabled':False}})
        type(self).actor='b@example.test'
        self.assertEqual(self.client.post('/people/connections/'+req['id']+'/decision',json={'version':req['version'],'action':'accept','contact':'test'}).status_code,409)
        self.assertNotIn('linkedin_url',self.client.get('/people/connections').json()['connections'][0]['peer'])

    def test_mail_attachment_and_no_contact_in_email(self):
        with patch.object(self.people,'send_email') as mail:
            req=self.request();self.accept(req)
            payload={'date':(datetime.utcnow()+timedelta(days=3)).strftime('%Y-%m-%d'),'time':'15:00','location':'Campus'}
            self.client.post('/people/connections/'+req['id']+'/meetings',json=payload)
            calls=mail.call_args_list
            self.assertTrue(any('BEGIN:VCALENDAR' in (c.kwargs.get('calendar_body') or '') for c in calls))
            for call in calls:
                self.assertNotIn('PRIVATE-SENDER',str(call))
                self.assertNotIn('PRIVATE-RECIPIENT',str(call))
                self.assertNotIn('@example.test',call.kwargs.get('calendar_body') or '')
