import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import DepartmentBrand from './DepartmentBrand';
import '../styles/dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function toYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseYMD(value) {
    const [year, month, day] = String(value || '').replace(/\//g, '-').split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
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

function formatShortDate(value) {
    const date = parseYMD(value);
    if (!date) return value || 'TBC';
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (toYMD(date) === toYMD(today)) return 'Today';
    if (toYMD(date) === toYMD(tomorrow)) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMonthDay(value) {
    const date = parseYMD(value);
    if (!date) return { month: 'TBC', day: '--' };
    return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        day: String(date.getDate()),
    };
}

function formatTimeSlot(timeSlot) {
    if (!timeSlot) return 'Time TBC';
    try {
        const [start, end] = timeSlot.split('-');
        const formatTime = (value) => {
            const [hours, minutes = '00'] = value.split(':');
            const hour = Number(hours);
            const suffix = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            return `${displayHour}:${minutes} ${suffix}`;
        };
        return `${formatTime(start)} - ${formatTime(end)}`;
    } catch {
        return timeSlot;
    }
}

function sortEvents(a, b) {
    return `${a.date} ${a.timeSlot || ''}`.localeCompare(`${b.date} ${b.timeSlot || ''}`);
}

function normalizeTutoring(registration) {
    const details = registration.session_details || {};
    return {
        id: `tutoring-${registration.registration_id || registration.availability_id || `${details.date}-${details.time_slot}`}`,
        type: 'Tutoring',
        title: details.session_type || 'Tutoring session',
        date: details.date,
        timeSlot: details.time_slot,
        location: details.location,
        detail: details.tutor_name ? `Tutor: ${details.tutor_name}` : 'Tutor session',
        accent: 'blue',
    };
}

function normalizeClass(cls) {
    return {
        id: `class-${cls.id}`,
        type: 'Class',
        title: cls.title || 'Class',
        date: cls.date,
        timeSlot: cls.time_slot,
        location: cls.location,
        detail: `${cls.registered_count || 0}/${cls.capacity || 0} registered`,
        accent: 'gold',
    };
}

function Dashboard(){
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [profilePicture, setProfilePicture] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [bookings, setBookings] = useState([]);
    const [bookingsLoading, setBookingsLoading] = useState(true);
    const [bookingsError, setBookingsError] = useState('');
    const [displayName, setDisplayName] = useState(() => {
        const storedName = localStorage.getItem('preferred_name');
        if (storedName && storedName.includes('@')) {
            return 'Student';
        }
        return storedName || 'Student';
    });

    const fetchAdminRole = useCallback(async () => {
        try {
            const userEmail = localStorage.getItem('user_email');
            if (!userEmail) return;
            const response = await fetch(`${API_URL}/me/role?email=${encodeURIComponent(userEmail)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.is_allowed === false) {
                    logout();
                    navigate('/login');
                    return;
                }
                setIsAdmin(Boolean(data.is_admin));
            }
        } catch (error) {
            console.error('Error checking admin role:', error);
        }
    }, [logout, navigate]);

    const fetchUserProfile = useCallback(async () => {
        try {
            const userEmail = localStorage.getItem('user_email');
            if (!userEmail) {
                setProfileLoading(false);
                return;
            }

            const response = await fetch(`${API_URL}/profile/${encodeURIComponent(userEmail)}`);
            if (response.ok) {
                const profileData = await response.json();
                if (profileData.profile_picture) {
                    setProfilePicture(profileData.profile_picture);
                }
                if (profileData.preferred_name) {
                    localStorage.setItem('preferred_name', profileData.preferred_name);
                    setDisplayName(profileData.preferred_name);
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setProfileLoading(false);
        }
    }, []);

    const fetchBookings = useCallback(async () => {
        const userEmail = (localStorage.getItem('user_email') || '').toLowerCase();
        if (!userEmail) {
            setBookings([]);
            setBookingsLoading(false);
            return;
        }

        setBookingsLoading(true);
        setBookingsError('');
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

            setBookings(merged);
        } catch (error) {
            setBookings([]);
            setBookingsError(error.message);
        } finally {
            setBookingsLoading(false);
        }
    }, []);

    useEffect(() => {
        const user_id = localStorage.getItem('user_id');
        const preferred_name = localStorage.getItem('preferred_name');

        if (preferred_name && preferred_name.includes('@')) {
            localStorage.removeItem('preferred_name');
            setDisplayName('Student');
        }

        if (!user_id){
            navigate('/login');
            return;
        }

        setLoading(false);
        fetchUserProfile();
        fetchAdminRole();
        fetchBookings();
    }, [navigate, fetchUserProfile, fetchAdminRole, fetchBookings]);

    const currentDate = useMemo(() => new Date(), []);
    const todayKey = toYMD(currentDate);
    const userEmail = localStorage.getItem('user_email') || 'HKUST Finance';
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'S';

    const upcomingBookings = useMemo(
        () => bookings.filter((event) => event.date >= todayKey).slice(0, 5),
        [bookings, todayKey]
    );

    const bookingsByDate = useMemo(() => {
        const map = new Map();
        bookings.forEach((event) => {
            const list = map.get(event.date) || [];
            list.push(event);
            map.set(event.date, list);
        });
        return map;
    }, [bookings]);

    const monthCells = useMemo(() => buildMonthCells(currentDate), [currentDate]);

    const handleMySessionsClick = () => {
        navigate('/sessions');
    };

    const getGreeting = () => {
        const hour = currentDate.getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        return "Good Evening";
    };

    const formatDate = () => {
        return currentDate.toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    const quickActions = [
        {
            title: 'Create Sessions',
            description: 'Open tutor scheduling tools and publish new slots.',
            icon: 'fa-calendar-plus',
            accent: 'blue',
            onClick: () => navigate('/tutor-calendar'),
        },
        {
            title: 'Register Session',
            description: 'Browse available sessions and reserve your place.',
            icon: 'fa-clipboard-check',
            accent: 'green',
            onClick: () => navigate('/register-session'),
        },
        {
            title: 'Classes',
            description: 'Review class calendars and department events.',
            icon: 'fa-graduation-cap',
            accent: 'gold',
            onClick: () => navigate('/classes'),
        },
        {
            title: 'My Sessions',
            description: 'See upcoming bookings and session history.',
            icon: 'fa-book-open',
            accent: 'teal',
            onClick: handleMySessionsClick,
        },
        {
            title: 'Verification',
            description: 'Complete or check your student verification.',
            icon: 'fa-shield-halved',
            accent: 'red',
            onClick: () => navigate('/verification'),
        },
    ];

    if (isAdmin) {
        quickActions.push({
            title: 'Database',
            description: 'Add, edit, or remove database entries.',
            icon: 'fa-database',
            accent: 'purple',
            onClick: () => navigate('/database'),
        });
    }

    if (loading){
        return (
            <div className="dashboard-loading-screen">
                <div className="dashboard-loading-mark">
                    <i className="fas fa-chart-line"></i>
                </div>
                <span>Loading your dashboard...</span>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-content">
                    <DepartmentBrand subtitle="Session Calendar" />
                    <div className="user-section">
                        <div className="user-info">
                            <span className="user-name">Welcome, {displayName}</span>
                            <span className="user-email">{userEmail}</span>
                            <button
                                className="profile-icon-btn"
                                onClick={() => navigate('/profile')}
                                title="Update Profile"
                                aria-label="Update Profile"
                            >
                                {profileLoading ? (
                                    <i className="fas fa-spinner fa-spin"></i>
                                ) : profilePicture ? (
                                    <img
                                        src={profilePicture}
                                        alt="Profile"
                                        className="profile-picture-small"
                                    />
                                ) : (
                                    <i className="fas fa-user-circle"></i>
                                )}
                            </button>
                        </div>
                        <button
                            className="logout-btn"
                            onClick={() => {
                                logout();
                                navigate('/login');
                            }}
                        >
                            <i className="fas fa-arrow-right-from-bracket"></i>
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            <section className="dashboard-hero" aria-labelledby="dashboard-greeting">
                <div className="hero-content">
                    <p className="hero-eyebrow">
                        <i className="fas fa-calendar-day"></i>
                        {formatDate()}
                    </p>
                    <h1 className="greeting" id="dashboard-greeting">
                        {getGreeting()}, <span>{displayName}</span>
                    </h1>
                    <p className="motivation">
                        Your booked tutoring sessions and classes are shown below as soon as you sign in.
                    </p>
                    <div className="hero-meta-row">
                        <span><i className="fas fa-bolt"></i> Ready for today</span>
                        <span><i className="fas fa-location-dot"></i> HKUST</span>
                    </div>
                </div>
                <aside className="hero-profile-card" aria-label="Profile summary">
                    <div className="hero-avatar">
                        {profilePicture ? (
                            <img src={profilePicture} alt="" />
                        ) : (
                            <span>{initials}</span>
                        )}
                    </div>
                    <div>
                        <span className="hero-card-label">Signed in as</span>
                        <strong>{displayName}</strong>
                        <small>{userEmail}</small>
                    </div>
                </aside>
            </section>

            <main className="dashboard-main">
                <DashboardSchedule
                    bookingsLoading={bookingsLoading}
                    bookingsError={bookingsError}
                    upcomingBookings={upcomingBookings}
                    bookingsByDate={bookingsByDate}
                    monthCells={monthCells}
                    currentDate={currentDate}
                    onRefresh={fetchBookings}
                    navigate={navigate}
                />

                <div className="dashboard-section-heading quick-actions-heading">
                    <div>
                        <p>Quick actions</p>
                        <h2>What do you want to do next?</h2>
                    </div>
                </div>
                <div className="action-grid">
                    {quickActions.map((action, index) => (
                        <button
                            className={`action-card action-card-${action.accent}`}
                            key={action.title}
                            onClick={action.onClick}
                            style={{ '--card-delay': `${120 + index * 70}ms` }}
                        >
                            <span className="card-icon" aria-hidden="true">
                                <i className={`fas ${action.icon}`}></i>
                            </span>
                            <span className="card-copy">
                                <span className="card-title">{action.title}</span>
                                <span className="card-description">{action.description}</span>
                            </span>
                            <span className="card-arrow" aria-hidden="true">
                                <i className="fas fa-arrow-right"></i>
                            </span>
                        </button>
                    ))}
                </div>
            </main>
        </div>
    );
}

function DashboardSchedule({
    bookingsLoading,
    bookingsError,
    upcomingBookings,
    bookingsByDate,
    monthCells,
    currentDate,
    onRefresh,
    navigate,
}) {
    const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const currentMonth = currentDate.getMonth();
    const todayKey = toYMD(currentDate);

    return (
        <section className="dashboard-schedule" aria-labelledby="dashboard-schedule-title">
            <div className="dashboard-section-heading schedule-heading">
                <div>
                    <p>Coming up</p>
                    <h2 id="dashboard-schedule-title">What you have soon</h2>
                </div>
                <button type="button" className="schedule-open-calendar" onClick={() => navigate('/calendar')}>
                    <i className="fas fa-calendar-days"></i>
                    Full calendar
                </button>
            </div>

            <div className="schedule-panel">
                <section className="schedule-list-card" aria-label="Upcoming booked sessions and classes">
                    <div className="schedule-card-header">
                        <div>
                            <span>Next bookings</span>
                            <strong>{upcomingBookings.length ? `${upcomingBookings.length} soon` : 'Nothing soon'}</strong>
                        </div>
                        <button type="button" onClick={onRefresh} aria-label="Refresh schedule">
                            <i className="fas fa-rotate"></i>
                        </button>
                    </div>

                    {bookingsLoading ? (
                        <div className="schedule-state">
                            <i className="fas fa-circle-notch fa-spin"></i>
                            Loading your bookings...
                        </div>
                    ) : bookingsError ? (
                        <div className="schedule-state schedule-state-error">
                            <strong>Could not load your bookings.</strong>
                            <span>{bookingsError}</span>
                        </div>
                    ) : upcomingBookings.length ? (
                        <ul className="schedule-list">
                            {upcomingBookings.map((event) => {
                                const dateParts = formatMonthDay(event.date);
                                return (
                                    <li key={event.id}>
                                        <div className={`schedule-date-badge schedule-date-${event.accent}`}>
                                            <span>{dateParts.month}</span>
                                            <strong>{dateParts.day}</strong>
                                        </div>
                                        <div className="schedule-item-copy">
                                            <div className="schedule-item-title-row">
                                                <strong>{event.title}</strong>
                                                <span className={`schedule-type schedule-type-${event.accent}`}>{event.type}</span>
                                            </div>
                                            <span>{formatShortDate(event.date)} - {formatTimeSlot(event.timeSlot)}</span>
                                            <small>{event.location || 'Location TBC'} - {event.detail}</small>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="schedule-empty">
                            <i className="fas fa-calendar-check"></i>
                            <div>
                                <strong>No bookings coming up</strong>
                                <span>Register for a tutoring session or class and it will show here immediately.</span>
                            </div>
                            <div className="schedule-empty-actions">
                                <button type="button" onClick={() => navigate('/register-session')}>Find tutoring</button>
                                <button type="button" onClick={() => navigate('/classes')}>View classes</button>
                            </div>
                        </div>
                    )}
                </section>

                <section className="schedule-month-card" aria-label={`${monthLabel} booking calendar`}>
                    <div className="schedule-month-header">
                        <span>This month</span>
                        <strong>{monthLabel}</strong>
                    </div>
                    <div className="schedule-mini-calendar">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                            <span className="schedule-mini-weekday" key={`${day}-${index}`}>{day}</span>
                        ))}
                        {monthCells.map((date) => {
                            const dateKey = toYMD(date);
                            const events = bookingsByDate.get(dateKey) || [];
                            const outside = date.getMonth() !== currentMonth;
                            const today = dateKey === todayKey;
                            return (
                                <button
                                    type="button"
                                    key={dateKey}
                                    className={`schedule-mini-day ${outside ? 'outside' : ''} ${today ? 'today' : ''} ${events.length ? 'has-events' : ''}`}
                                    onClick={() => navigate('/calendar')}
                                    aria-label={`${formatShortDate(dateKey)}${events.length ? `, ${events.length} booking${events.length === 1 ? '' : 's'}` : ''}`}
                                >
                                    <span>{date.getDate()}</span>
                                    <span className="schedule-mini-dots">
                                        {events.slice(0, 3).map((event) => (
                                            <i key={event.id} className={`schedule-mini-dot schedule-mini-dot-${event.accent}`}></i>
                                        ))}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </div>
        </section>
    );
}

export default Dashboard;
