import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DepartmentBrand from './DepartmentBrand';
import '../styles/dashboard.css';
import '../styles/tutorCalendar.css';
import '../styles/classesCalendar.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const TIME_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
  '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
  '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00',
  '21:00-22:00',
];

const formatDateYMD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const isPastDate = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(date);
  check.setHours(0, 0, 0, 0);
  return check < today;
};

const getWeekDates = (anchor) => {
  const out = [];
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
};

function ClassesCalendar() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [classes, setClasses] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const userEmail = useMemo(
    () => (localStorage.getItem('user_email') || '').toLowerCase(),
    []
  );

  useEffect(() => {
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      navigate('/login');
      return;
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    if (!userEmail) return;
    fetch(`${API_URL}/me/role?email=${encodeURIComponent(userEmail)}`)
      .then((r) => (r.ok ? r.json() : { is_admin: false }))
      .then((data) => setIsAdmin(!!data.is_admin))
      .catch(() => setIsAdmin(false));
  }, [userEmail]);

  const weekDates = useMemo(() => getWeekDates(currentWeek), [currentWeek]);
  const weekFrom = formatDateYMD(weekDates[0]);
  const weekTo = formatDateYMD(weekDates[6]);

  const fetchClasses = async () => {
    try {
      const url = new URL(`${API_URL}/classes`);
      url.searchParams.append('date_from', weekFrom);
      url.searchParams.append('date_to', weekTo);
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error('Could not load classes');
      const data = await r.json();
      setClasses(data.classes || []);
    } catch (err) {
      console.error(err);
      setClasses([]);
    }
  };

  useEffect(() => {
    if (loading) return;
    fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, weekFrom, weekTo]);

  const navigateWeek = (direction) => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + direction * 7);
    setCurrentWeek(d);
  };

  const classesAt = (date, timeSlot) => {
    const ds = formatDateYMD(date);
    return classes.filter((c) => c.date === ds && c.time_slot === timeSlot);
  };

  const handleRegister = async () => {
    if (!selectedClass) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/classes/${selectedClass.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_email: userEmail }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Could not register');
      setSelectedClass(data.class);
      await fetchClasses();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnregister = async () => {
    if (!selectedClass) return;
    if (!window.confirm('Cancel your registration for this class?')) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/classes/${selectedClass.id}/register`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_email: userEmail }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Could not cancel');
      setSelectedClass(data.class);
      await fetchClasses();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelClass = async () => {
    if (!selectedClass || !isAdmin) return;
    if (!window.confirm('Cancel this class for everyone? This cannot be undone.')) return;
    setBusy(true);
    try {
      const url = new URL(`${API_URL}/classes/${selectedClass.id}`);
      url.searchParams.append('requested_by', userEmail);
      const r = await fetch(url.toString(), { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.detail || 'Could not cancel class');
      }
      setSelectedClass(null);
      await fetchClasses();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }

  const username = localStorage.getItem('username');

  return (
    <div className="dashboard-container classes-page">
      <header className="dashboard-header">
        <div className="header-content">
          <DepartmentBrand subtitle="Classes" />
          <div className="user-section">
            <div className="user-info">
              <span className="user-name">Welcome, {username || 'Student'}!</span>
              <span className="user-role">
                {isAdmin ? 'Admin · manage classes' : 'Browse and join classes'}
              </span>
            </div>
            <button className="logout-btn" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-main">
        <div className="classes-toolbar">
          <div className="week-nav">
            <button className="week-nav-btn" onClick={() => navigateWeek(-1)}>‹ Prev</button>
            <span className="week-nav-label">
              {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' – '}
              {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button className="week-nav-btn" onClick={() => navigateWeek(1)}>Next ›</button>
            <button className="week-nav-btn week-nav-today" onClick={() => setCurrentWeek(new Date())}>
              Today
            </button>
          </div>
          {isAdmin && (
            <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
              + Create Class
            </button>
          )}
        </div>

        <div className="classes-grid">
          <div className="classes-grid-header">
            <div className="classes-grid-time-col" />
            {weekDates.map((d) => (
              <div key={d.toISOString()} className={`classes-grid-day ${isPastDate(d) ? 'past' : ''}`}>
                <div className="day-name">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="day-date">{d.getDate()}</div>
              </div>
            ))}
          </div>

          {TIME_SLOTS.map((timeSlot) => (
            <div key={timeSlot} className="classes-grid-row">
              <div className="classes-grid-time-cell">{timeSlot}</div>
              {weekDates.map((d) => {
                const dayClasses = classesAt(d, timeSlot);
                const past = isPastDate(d);
                return (
                  <div key={d.toISOString() + timeSlot} className={`classes-grid-cell ${past ? 'past' : ''}`}>
                    {dayClasses.map((cls) => {
                      const mine = (cls.registered_students || []).includes(userEmail);
                      const cls_state = mine ? 'mine' : cls.is_full ? 'full' : 'open';
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          className={`class-block class-block--${cls_state}`}
                          onClick={() => setSelectedClass(cls)}
                          title={cls.title}
                        >
                          <span className="class-block-title">{cls.title}</span>
                          <span className="class-block-meta">
                            {cls.registered_count}/{cls.capacity}
                            {mine && ' · ✓'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedClass && (
        <ClassDetailsModal
          cls={selectedClass}
          userEmail={userEmail}
          isAdmin={isAdmin}
          busy={busy}
          onClose={() => setSelectedClass(null)}
          onRegister={handleRegister}
          onUnregister={handleUnregister}
          onCancelClass={handleCancelClass}
        />
      )}

      {showCreateModal && (
        <CreateClassModal
          adminEmail={userEmail}
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            setShowCreateModal(false);
            await fetchClasses();
          }}
        />
      )}
    </div>
  );
}

function ClassDetailsModal({
  cls, userEmail, isAdmin, busy, onClose,
  onRegister, onUnregister, onCancelClass,
}) {
  const mine = (cls.registered_students || []).includes(userEmail);
  const past = (() => {
    try {
      const [, end] = (cls.time_slot || '').split('-');
      const dt = new Date(`${cls.date}T${(end || '23:59').trim()}:00`);
      return dt < new Date();
    } catch {
      return false;
    }
  })();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="modal-title">{cls.title}</h2>
        <div className="modal-meta">
          <div><strong>Date:</strong> {cls.date}</div>
          <div><strong>Time:</strong> {cls.time_slot}</div>
          <div><strong>Location:</strong> {cls.location}</div>
          <div>
            <strong>Seats:</strong> {cls.registered_count} / {cls.capacity}
            {cls.is_full && <span className="badge badge-full">Full</span>}
            {mine && <span className="badge badge-mine">You're in</span>}
          </div>
          {cls.description && (
            <div className="modal-description">
              <strong>Details:</strong>
              <p>{cls.description}</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          {past ? (
            <span className="muted">This class has ended.</span>
          ) : mine ? (
            <button className="primary-btn danger" onClick={onUnregister} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel my registration'}
            </button>
          ) : cls.is_full ? (
            <button className="primary-btn" disabled>Class full</button>
          ) : (
            <button className="primary-btn" onClick={onRegister} disabled={busy}>
              {busy ? 'Registering…' : 'Register'}
            </button>
          )}

          {isAdmin && (
            <button className="secondary-btn danger-outline" onClick={onCancelClass} disabled={busy}>
              Admin: cancel class
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateClassModal({ adminEmail, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(formatDateYMD(new Date()));
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, date, time_slot: timeSlot,
          location, capacity: Number(capacity),
          created_by: adminEmail,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.detail || 'Could not create class');
      }
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="modal-title">Create a new class</h2>

        {error && <div className="modal-error">{error}</div>}

        <form className="create-class-form" onSubmit={submit}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Description (optional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <div className="form-row">
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Time slot
              <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value)} required />
            </label>
            <label>
              Capacity
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={busy}>
              {busy ? 'Creating…' : 'Create class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ClassesCalendar;
