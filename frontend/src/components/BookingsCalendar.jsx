import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppointmentTypeSelect from './AppointmentTypeSelect';
import '../styles/bookingsCalendar.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ALL_APPOINTMENT_TYPES = 'all';
const SESSION_COLORS = [
  '#19745c', '#2f74c0', '#a6531c', '#6541a2',
  '#ba3f33', '#0d7280', '#806313', '#6b513f',
];

function getSessionColor(sessionType) {
  const hash = String(sessionType || 'Appointments').split('').reduce((total, character) => (
    ((total << 5) - total) + character.charCodeAt(0)
  ), 0);
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TODAY_KEY = toYMD(new Date());

function parseYMD(value) {
  const [year, month, day] = String(value || '').replace(/\//g, '-').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  const date = parseYMD(value);
  if (!date) return value || '';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildMonthCells(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatTimeSlot(timeSlot) {
  if (!timeSlot) return 'Time TBC';
  try {
    const [start, end] = timeSlot.split('-');
    const formatTime = (value) => {
      const [hours, minutes = '00'] = value.split(':');
      const hour = Number(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    };
    return `${formatTime(start)} - ${formatTime(end)}`;
  } catch {
    return timeSlot;
  }
}

function sortEvents(a, b) {
  return `${a.date} ${a.time_slot || ''}`.localeCompare(`${b.date} ${b.time_slot || ''}`);
}

function normalizeTutoring(registration) {
  const details = registration.session_details || {};
  const appointmentType = details.session_type || 'Tutoring session';
  return {
    id: `tutoring-${registration.registration_id || registration.availability_id || `${details.date}-${details.time_slot}`}`,
    category: 'Tutoring',
    title: appointmentType,
    subtitle: details.tutor_name ? `Tutor: ${details.tutor_name}` : 'Tutor session',
    date: details.date,
    time_slot: details.time_slot,
    location: details.location,
    description: details.description,
    tone: 'blue',
    filterValue: `session:${appointmentType}`,
  };
}

function normalizeClass(cls) {
  return {
    id: `class-${cls.id}`,
    category: 'Class',
    title: cls.title || 'Class',
    subtitle: `${cls.registered_count || 0}/${cls.capacity || 0} registered`,
    date: cls.date,
    time_slot: cls.time_slot,
    location: cls.location,
    description: cls.description,
    tone: 'gold',
    filterValue: 'classes',
  };
}

function BookingsCalendar() {
  const navigate = useNavigate();
  const userEmail = (localStorage.getItem('user_email') || '').toLowerCase();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(TODAY_KEY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAppointmentType, setSelectedAppointmentType] = useState(ALL_APPOINTMENT_TYPES);

  useEffect(() => {
    if (!localStorage.getItem('user_id')) {
      navigate('/login');
      return;
    }
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function loadBookings() {
    if (!userEmail) {
      setLoading(false);
      setError('No signed-in email was found.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [sessionsResponse, classesResponse] = await Promise.all([
        fetch(`${API_URL}/my-sessions/${encodeURIComponent(userEmail)}`),
        fetch(`${API_URL}/classes/my/${encodeURIComponent(userEmail)}`),
      ]);

      const sessionsData = await sessionsResponse.json().catch(() => ({}));
      const classesData = await classesResponse.json().catch(() => ({}));
      if (!sessionsResponse.ok) throw new Error(sessionsData.detail || 'Could not load tutoring sessions.');
      if (!classesResponse.ok) throw new Error(classesData.detail || 'Could not load classes.');

      const merged = [
        ...(sessionsData.registrations || []).map(normalizeTutoring),
        ...(classesData.classes || []).map(normalizeClass),
      ]
        .filter((event) => event.date)
        .sort(sortEvents);

      setEvents(merged);
      const nextEvent = merged.find((event) => event.date >= TODAY_KEY) || merged[0];
      if (nextEvent) {
        const nextDate = parseYMD(nextEvent.date);
        if (nextDate) {
          setSelectedDate(nextEvent.date);
          setCurrentMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
        }
      }
    } catch (err) {
      setError(err.message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  const monthCells = useMemo(() => buildMonthCells(currentMonth), [currentMonth]);

  const tutoringTypes = useMemo(() => Array.from(new Set(
    events
      .filter((event) => event.category === 'Tutoring')
      .map((event) => event.title)
  )).sort((a, b) => a.localeCompare(b)), [events]);

  const appointmentTypeOptions = useMemo(() => [
    {
      value: ALL_APPOINTMENT_TYPES,
      label: 'All appointments',
      description: 'Tutoring sessions and classes together',
      count: events.length,
      color: '#003b7a',
      icon: 'fa-layer-group',
    },
    {
      value: 'classes',
      label: 'Classes',
      description: 'Department classes and events',
      count: events.filter((event) => event.category === 'Class').length,
      color: '#c7952b',
      icon: 'fa-graduation-cap',
    },
    ...tutoringTypes.map((type) => {
      const count = events.filter((event) => event.filterValue === `session:${type}`).length;
      return {
        value: `session:${type}`,
        label: type,
        description: count === 1 ? '1 booked appointment' : `${count} booked appointments`,
        count,
        color: getSessionColor(type),
      };
    }),
  ], [events, tutoringTypes]);

  const filteredEvents = useMemo(() => (
    selectedAppointmentType === ALL_APPOINTMENT_TYPES
      ? events
      : events.filter((event) => event.filterValue === selectedAppointmentType)
  ), [events, selectedAppointmentType]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    filteredEvents.forEach((event) => {
      const list = map.get(event.date) || [];
      list.push(event);
      map.set(event.date, list);
    });
    return map;
  }, [filteredEvents]);

  const selectedEvents = eventsByDate.get(selectedDate) || [];

  const monthEvents = useMemo(() => {
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();
    return filteredEvents.filter((event) => {
      const date = parseYMD(event.date);
      return date && date.getMonth() === month && date.getFullYear() === year;
    });
  }, [currentMonth, filteredEvents]);

  const tutoringCount = events.filter((event) => event.category === 'Tutoring').length;
  const classCount = events.filter((event) => event.category === 'Class').length;

  function moveMonth(delta) {
    setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    setCurrentMonth(new Date());
    setSelectedDate(TODAY_KEY);
  }

  function handleAppointmentTypeChange(nextType) {
    setSelectedAppointmentType(nextType);

    const matchingEvents = nextType === ALL_APPOINTMENT_TYPES
      ? events
      : events.filter((event) => event.filterValue === nextType);
    const nextEvent = matchingEvents.find((event) => event.date >= TODAY_KEY) || matchingEvents[0];
    const nextDate = parseYMD(nextEvent?.date);

    if (nextEvent && nextDate) {
      setSelectedDate(nextEvent.date);
      setCurrentMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  }

  if (loading) {
    return (
      <div className="booking-page booking-loading">
        <i className="fas fa-circle-notch fa-spin"></i>
        <span>Loading your calendar...</span>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <header className="booking-header">
        <button type="button" className="booking-icon-button" onClick={() => navigate('/dashboard')}>
          <i className="fas fa-arrow-left"></i>
          <span>Dashboard</span>
        </button>
        <div className="booking-title">
          <span>FINA student portal</span>
          <h1>My Calendar</h1>
        </div>
        <button type="button" className="booking-icon-button" onClick={loadBookings}>
          <i className="fas fa-rotate"></i>
          <span>Refresh</span>
        </button>
      </header>

      {error && <div className="booking-error">{error}</div>}

      <main className="booking-layout">
        <section className="booking-board">
          <div className="booking-toolbar">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
              <i className="fas fa-chevron-left"></i>
            </button>
            <div>
              <span>{monthEvents.length} booking{monthEvents.length === 1 ? '' : 's'}</span>
              <h2>{formatMonth(currentMonth)}</h2>
            </div>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">
              <i className="fas fa-chevron-right"></i>
            </button>
            <button type="button" className="booking-today" onClick={goToday}>Today</button>
          </div>

          <div className="booking-filter-bar">
            <AppointmentTypeSelect
              id="calendar-appointment-type"
              label="Appointments to view"
              value={selectedAppointmentType}
              options={appointmentTypeOptions}
              onChange={handleAppointmentTypeChange}
              icon="fa-calendar-days"
              compact
            />
            <p aria-live="polite">
              <strong>{filteredEvents.length}</strong>
              <span>of {events.length} appointments visible</span>
            </p>
          </div>

          <div className="booking-month-grid" aria-label={`${formatMonth(currentMonth)} filtered bookings`}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div className="booking-weekday" key={day}>{day}</div>
            ))}
            {monthCells.map((date) => {
              const ymd = toYMD(date);
              const dayEvents = eventsByDate.get(ymd) || [];
              const outside = date.getMonth() !== currentMonth.getMonth();
              const today = ymd === TODAY_KEY;
              const selected = ymd === selectedDate;
              return (
                <button
                  type="button"
                  className={`booking-day ${outside ? 'outside' : ''} ${today ? 'today' : ''} ${selected ? 'selected' : ''}`}
                  key={ymd}
                  onClick={() => setSelectedDate(ymd)}
                >
                  <span className="booking-day-number">{date.getDate()}</span>
                  <span className="booking-day-events">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className={`booking-event booking-event-${event.tone}`}
                      >
                        <strong>{event.time_slot || 'Time TBC'}</strong>
                        <span>{event.title}</span>
                      </span>
                    ))}
                    {dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="booking-side-panel">
          <section className="booking-summary">
            <span>Signed in as</span>
            <strong>{userEmail}</strong>
            <div className="booking-summary-counts">
              <div>
                <b>{tutoringCount}</b>
                <small>Tutoring</small>
              </div>
              <div>
                <b>{classCount}</b>
                <small>Classes</small>
              </div>
            </div>
          </section>

          <section className="booking-detail">
            <div className="booking-detail-head">
              <span>{formatDate(selectedDate)}</span>
              <strong>{selectedEvents.length} booked</strong>
            </div>

            {selectedEvents.length ? (
              selectedEvents.map((event) => (
                <article className="booking-detail-item" key={event.id}>
                  <span className={`booking-pill booking-pill-${event.tone}`}>
                    {event.category}
                  </span>
                  <h2>{event.title}</h2>
                  <dl>
                    <div>
                      <dt>Time</dt>
                      <dd>{formatTimeSlot(event.time_slot)}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{event.location || 'TBC'}</dd>
                    </div>
                    <div>
                      <dt>Details</dt>
                      <dd>{event.subtitle}</dd>
                    </div>
                  </dl>
                  {event.description && <p>{event.description}</p>}
                </article>
              ))
            ) : (
              <div className="booking-empty">
                <h2>No bookings on this day</h2>
                <p>Register for a tutoring session or class and it will appear on this calendar.</p>
                <div className="booking-empty-actions">
                  <button type="button" onClick={() => navigate('/register-session')}>Browse sessions</button>
                  <button type="button" onClick={() => navigate('/classes')}>View classes</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default BookingsCalendar;
