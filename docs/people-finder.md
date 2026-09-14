# People Finder

Implemented from the People Finder section of Proposal (1).pdf. Open `/people` from the dashboard. The interface follows the portal's cream paper, navy type and teal accents.

## Student flow

1. New account profile completion offers optional People Finder setup. Existing students use People Finder → Settings.
2. Explicit opt-in, public biography and the proposal's accuracy declaration are required to browse or request connections. Account email, phone and SID are never copied into the public directory. Years 1–2 need LinkedIn; Years 3–5 may enter manual experience instead.
3. Search/filter by names/interests, programme, year, additional major, minor and extended major. Cards display full name (preferred name), programme and study period. The three-dot menu offers Connect.
4. Introductions require 25 words and a separate private contact field. The recipient receives the introduction by email and in-app notification. Accepting requires their contact consent; only then can both participants see the other's contact. Declining/expiry removes stored contact fields. No private contact fields appear in notification emails.
5. Accepted connections can arrange private meetings in Connections. Only the two participants can view/respond/download those invitations. Emails include `.ics` entries; Google Calendar/Outlook import is also available in the portal. These are personal calendar entries, not automatic writes into an external calendar account. Meeting responses are recorded in the portal. Private meetings are stored separately from public tutoring slots and are not published on public calendars.
6. Reports for no follow-through require administrator review. Reports never automatically restrict another student. Administrators can apply or lift restrictions and retry failed notification emails.

## Defaults where the proposal was undecided

- Response deadline: 5 days (`PEOPLE_RESPONSE_DAYS`, range 3–5).
- Three missed deadlines in 30 days pause new connections for 30 days (`PEOPLE_MISSED_LIMIT`).
- Reports open 72 hours after acceptance (`PEOPLE_REPORT_GRACE_HOURS`).
- Five new request attempts per sender/day (`PEOPLE_DAILY_REQUEST_LIMIT`).
- Connection preference changes: once per 30 days. Profile biography remains editable.
- An unordered student pair has one current connection/request. After decline/expiry, new requests wait 30 days from the original request.

Accepted contact access remains available during restrictions; new requests and meeting creation are paused. Administrators can lift restrictions with a recorded reason. Policy values are exposed to users in Settings.

## Operations

Uses existing server-issued bearer sessions and `finaugevents` SMTP configuration. An older browser session without a bearer token must sign in again. People collections/indexes are created at startup. A 30-second recovery worker processes pending email and request expiry. Delivery failure leaves the in-app notification intact and records `failed`; the Reports tab provides an administrator retry. Email delivery is at least once: a process crash after SMTP accepts mail but before persistence can produce a duplicate.

## Verification

Eight integration tests exercise real Mongo queries in a uniquely named disposable database, cleaned up afterward:

```sh
PYTHONPATH=backend DATABASE_URI=mongodb://localhost:27017 DATABASE_NAME=portal_test_bootstrap PEOPLE_TEST_MONGO_URI=mongodb://localhost:27017 backend/.venv/bin/python -m unittest discover -s backend/tests -p test_people.py -v
```

Coverage includes directory privacy/filtering, junior eligibility, consent changes, duplicate requests, 25-word minimum, contact release, unauthorized decisions, expiry/restrictions, report review/lift, private meeting access, calendar privacy, SMTP failure/retry. Desktop and 390px mobile browser QA completed with isolated test users and captured email: opt-in → directory → request → recipient acceptance → private meeting.

This implements the People Finder feature set. It does not claim completion of unrelated proposal items such as CV changes, marketing or platform-wide load testing.

Production release preserves the existing public biography directory at `/directory`, staff profiles, finance services and portal assistant. The new connection workflow is at `/people`. Existing biographies are not automatically opted in. No local demo records are deployed.
