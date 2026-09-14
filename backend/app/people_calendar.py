"""Calendar export for private People Finder meetings."""
from datetime import datetime, timezone, timedelta

def calendar_attachment(event, recipient, cancelled=False):
    def text(value):
        return str(value or '').replace('\\', '\\\\').replace('\r', '').replace('\n', '\\n').replace(';', '\\;').replace(',', '\\,')

    def instant(clock):
        hour, minute = map(int, clock.split(':'))
        local = datetime.strptime(event['date'], '%Y-%m-%d').replace(tzinfo=timezone(timedelta(hours=8)))
        return (local + timedelta(hours=hour, minutes=minute)).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

    start, end = event['time_slot'].split('-')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HKUST FINA//Student Portal//EN',
             'METHOD:CANCEL' if cancelled else 'METHOD:REQUEST', 'BEGIN:VEVENT',
             f"UID:{event['id']}@fina-portal", f"SEQUENCE:{event.get('revision', 0)}",
             f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
             f'DTSTART:{instant(start)}', f'DTEND:{instant(end)}',
             f"SUMMARY:{text(event['title'])}", f"DESCRIPTION:{text(event.get('description'))}",
             f"LOCATION:{text(event['location'])}", f"ORGANIZER:mailto:{event['created_by']}",
             f'ATTENDEE;RSVP=TRUE:mailto:{recipient}', 'STATUS:CANCELLED' if cancelled else 'STATUS:CONFIRMED',
             'END:VEVENT', 'END:VCALENDAR']
    folded = []
    for line in lines:
        chunk = ''
        for char in line:
            if len((chunk + char).encode('utf-8')) > 75:
                folded.append(chunk)
                chunk = ' '
            chunk += char
        folded.append(chunk)
    return '\r\n'.join(folded) + '\r\n'


