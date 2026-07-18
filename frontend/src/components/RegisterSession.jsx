import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppointmentTypeSelect from './AppointmentTypeSelect';
import DepartmentBrand from './DepartmentBrand';
import '../styles/tutorCalendar.css';
import '../styles/registerSession.css';

const ALL_APPOINTMENT_TYPES = 'all';

function RegisterSession() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [sessionTypes, setSessionTypes] = useState([]);
    const [selectedSessionType, setSelectedSessionType] = useState(ALL_APPOINTMENT_TYPES);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(true);
    const [slotsError, setSlotsError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [registering, setRegistering] = useState(false);
    const [showCreatorConflictModal, setShowCreatorConflictModal] = useState(false);
    const [creatorConflictInfo, setCreatorConflictInfo] = useState(null);
    const [pendingTutor, setPendingTutor] = useState(null);

    // Color palette for sessions (same as TutorCalendar for consistency)
    const sessionColors = [
        '#19745c', '#2f74c0', '#a6531c', '#6541a2',
        '#ba3f33', '#0d7280', '#806313', '#6b513f',
        '#46566d', '#94345f', '#3f51a2', '#18715e'
    ];

    // Function to get consistent color for session type
    const getSessionColor = (sessionType) => {
        const hash = String(sessionType || 'Appointments').split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return sessionColors[Math.abs(hash) % sessionColors.length];
    };

    // Time slots from 9 AM to 11 PM
    const timeSlots = [
        '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
        '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
        '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00',
        '21:00-22:00', '22:00-23:00'
    ];

    useEffect(() => {
        const user_id = localStorage.getItem('user_id');
        
        if (!user_id) {
            navigate('/login');
            return;
        }
        
        fetchSessionTypes();
        setLoading(false);
    }, [navigate]);

    // Always fetch every appointment type; the custom control filters this data locally.
    useEffect(() => {
        fetchAvailableSlots();
    }, [currentWeek]);

    const fetchSessionTypes = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/session-types`);
            if (!response.ok) throw new Error('Could not load appointment types.');
            const data = await response.json();
            setSessionTypes(data.session_types || []);
        } catch (error) {
            console.error('Error fetching session types:', error);
        }
    };

    const fetchAvailableSlots = async () => {
        setSlotsLoading(true);
        setSlotsError('');
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const userEmail = localStorage.getItem('user_email');
            
            const url = new URL(`${API_URL}/student/calendar`);
            if (userEmail) {
                url.searchParams.append('student_email', userEmail);
            }
            
            const response = await fetch(url.toString());
            
            if (response.ok) {
                const data = await response.json();
                setAvailableSlots(data.calendar_slots || []);
            } else {
                const errorData = await response.json().catch(() => ({}));
                setSlotsError(errorData.detail || 'Could not load available appointments.');
                setAvailableSlots([]);
            }
        } catch (error) {
            console.error('Error fetching available slots:', error);
            setSlotsError('Could not load available appointments. Please try again.');
            setAvailableSlots([]);
        } finally {
            setSlotsLoading(false);
        }
    };

    // Get week dates
    const getWeekDates = (date) => {
        const week = [];
        const startDate = new Date(date);
        const day = startDate.getDay();
        const diff = startDate.getDate() - day;
        
        for (let i = 0; i < 7; i++) {
            const weekDate = new Date(startDate.setDate(diff + i));
            week.push(new Date(weekDate));
        }
        return week;
    };

    const weekDates = getWeekDates(currentWeek);

    const navigateWeek = (direction) => {
        const newDate = new Date(currentWeek);
        newDate.setDate(newDate.getDate() + (direction * 7));
        setCurrentWeek(newDate);
    };

    const formatDate = (date) => {
        // Use local date to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // YYYY-MM-DD format
    };

    const getMonthYear = (date) => {
        return date.toLocaleDateString('en-US', { 
            month: 'short',
            year: 'numeric'
        });
    };

    // Check if a date is in the past
    const isPastDate = (date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        return checkDate < today;
    };

    const filteredAvailableSlots = selectedSessionType === ALL_APPOINTMENT_TYPES
        ? availableSlots
        : availableSlots.filter((slot) => slot.session_type === selectedSessionType);

    const getAppointmentCount = (slots) => slots.reduce(
        (total, slot) => total + (slot.available_tutors?.length || 0),
        0
    );

    const appointmentTypeOptions = [
        {
            value: ALL_APPOINTMENT_TYPES,
            label: 'All appointment types',
            description: 'See every open appointment together',
            count: getAppointmentCount(availableSlots),
            color: '#003b7a',
            icon: 'fa-layer-group',
        },
        ...sessionTypes.map((type) => {
            const typeSlots = availableSlots.filter((slot) => slot.session_type === type);
            const count = getAppointmentCount(typeSlots);
            return {
                value: type,
                label: type,
                description: count === 1 ? '1 open appointment' : `${count} open appointments`,
                count,
                color: getSessionColor(type),
            };
        }),
    ];

    // Get every appointment group for a specific date and time slot.
    const getAvailableGroups = (date, timeSlot) => {
        const dateStr = formatDate(date);
        return filteredAvailableSlots.filter(
            (slot) => slot.date === dateStr && slot.time_slot === timeSlot
        );
    };

    const getHostNames = (tutors) => tutors
        .map((tutor) => tutor.tutor_name?.trim() || tutor.tutor_email?.split('@')[0] || 'Tutor')
        .filter(Boolean);

    const getHostSummary = (tutors) => {
        const hostNames = getHostNames(tutors);
        if (hostNames.length <= 2) return hostNames.join(', ');
        return `${hostNames.slice(0, 2).join(', ')} +${hostNames.length - 2}`;
    };

    const getTypeSummary = (groups) => {
        if (groups.length <= 2) return groups.map((group) => group.session_type).join(' + ');
        return `${groups.slice(0, 2).map((group) => group.session_type).join(' + ')} +${groups.length - 2}`;
    };

    // Handle slot click - show every available appointment in that time.
    const handleSlotClick = (date, timeSlot, groups) => {
        if (groups.length === 0 || isPastDate(date)) {
            return;
        }

        setSelectedSlot({
            date: formatDate(date),
            timeSlot: timeSlot,
            groups,
        });
        setShowConfirmModal(true);
    };

    // Handle registration
    const handleRegister = async (tutor, forceCancelCreatorSession = false) => {
        setRegistering(true);
        
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const userEmail = localStorage.getItem('user_email');
            
            const response = await fetch(`${API_URL}/student/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    student_email: userEmail,
                    availability_id: tutor.id,
                    force_cancel_creator_session: forceCancelCreatorSession
                })
            });

            if (response.ok) {
                alert('Successfully registered for the session!');
                setShowConfirmModal(false);
                setSelectedSlot(null);
                setShowCreatorConflictModal(false);
                setCreatorConflictInfo(null);
                setPendingTutor(null);
                // Refresh available slots
                fetchAvailableSlots();
            } else {
                const errorData = await response.json();
                
                // Handle creator conflict errors
                if (response.status === 409 && errorData.detail && typeof errorData.detail === 'object') {
                    const conflictDetail = errorData.detail;
                    
                    if (conflictDetail.error === 'creator_session_booked') {
                        // Creator session is booked - cannot proceed
                        alert(conflictDetail.message);
                        setShowConfirmModal(false);
                        setSelectedSlot(null);
                    } else if (conflictDetail.error === 'creator_session_exists') {
                        // Creator session exists but not booked - show confirmation dialog
                        setCreatorConflictInfo(conflictDetail);
                        setPendingTutor(tutor);
                        setShowConfirmModal(false);
                        setShowCreatorConflictModal(true);
                    }
                } else {
                    // Handle other errors
                    const errorMessage = typeof errorData.detail === 'string' 
                        ? errorData.detail 
                        : errorData.detail?.message || 'Unknown error';
                    alert(`Registration failed: ${errorMessage}`);
                }
            }
        } catch (error) {
            console.error('Error registering for session:', error);
            alert('Error registering for session. Please try again.');
        } finally {
            setRegistering(false);
        }
    };
    
    // Handle confirmation to cancel creator session and proceed with registration
    const handleConfirmCancelCreatorSession = async () => {
        if (pendingTutor) {
            await handleRegister(pendingTutor, true);
        }
    };

    if (loading) {
        return <div className="loading-spinner">Loading...</div>;
    }

    const username = localStorage.getItem('username');

    return (
        <div className="dashboard-container register-session-page">
            <header className="dashboard-header">
                <div className="header-content">
                    <DepartmentBrand subtitle="Session Registration" />
                    <div className="user-section">
                        <div className="user-info">
                            <span className="user-name">Welcome, {username || 'Student'}!</span>
                            <span className="user-role">Book a mentor session</span>
                        </div>
                        <button 
                            className="logout-btn"
                            onClick={() => navigate('/dashboard')}
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </header>

            <main className="dashboard-main">
                <div className="dashboard-content">
                    <div className="calendar-header">
                        <div className="left-controls">
                            <div className="session-type-filter">
                                <AppointmentTypeSelect
                                    id="session-type"
                                    label="Appointment type"
                                    value={selectedSessionType}
                                    options={appointmentTypeOptions}
                                    onChange={setSelectedSessionType}
                                    icon="fa-calendar-check"
                                />
                            </div>
                            <div className="calendar-nav">
                                <button 
                                    className="calendar-nav-btn"
                                    onClick={() => navigateWeek(-1)}
                                >
                                    ←
                                </button>
                                <button 
                                    className="today-btn"
                                    onClick={() => setCurrentWeek(new Date())}
                                >
                                    This Week
                                </button>
                                <button 
                                    className="calendar-nav-btn"
                                    onClick={() => navigateWeek(1)}
                                >
                                    →
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="instructions">
                        <p>All open appointments are shown by default. Use the type menu whenever you want a more focused view.</p>
                        <p>Colored slots show the available hosts. Click a slot to compare appointment types and choose who to meet.</p>
                    </div>

                    {slotsError && (
                        <div className="register-status register-status--error" role="alert">
                            <div>
                                <strong>Appointments could not be loaded</strong>
                                <span>{slotsError}</span>
                            </div>
                            <button type="button" onClick={fetchAvailableSlots}>Try again</button>
                        </div>
                    )}

                    {!slotsLoading && !slotsError && filteredAvailableSlots.length === 0 && (
                        <div className="register-empty-state">
                            <h3>No open appointments in this view</h3>
                            <p>
                                {selectedSessionType === ALL_APPOINTMENT_TYPES
                                    ? 'We’re adding more appointments soon. Please check back later.'
                                    : 'Try All appointment types or check this type again later.'}
                            </p>
                        </div>
                    )}

                    <div className={`weekly-calendar ${slotsLoading ? 'is-loading' : ''}`}>
                        <div className="calendar-month-indicator">
                            {getMonthYear(currentWeek)}
                        </div>

                        <div className="calendar-grid">
                            <div className="time-column">
                                <div className="time-header">Time</div>
                                {timeSlots.map(timeSlot => (
                                    <div key={timeSlot} className="time-slot-label">
                                        {timeSlot}
                                    </div>
                                ))}
                            </div>

                            {weekDates.map((date, dayIndex) => (
                                <div key={dayIndex} className="day-column">
                                    <div className="day-header">
                                        <div className="day-name">
                                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </div>
                                        <div className="day-date">
                                            {date.getDate()}
                                        </div>
                                    </div>

                                    {timeSlots.map(timeSlot => {
                                        const groups = getAvailableGroups(date, timeSlot);
                                        const tutors = groups.flatMap((group) => group.available_tutors || []);
                                        const hasAppointments = tutors.length > 0;
                                        const isPast = isPastDate(date);
                                        const hostNames = getHostNames(tutors);
                                        const primaryColor = getSessionColor(groups[0]?.session_type);
                                        const secondaryColor = getSessionColor(groups[1]?.session_type || groups[0]?.session_type);

                                        return (
                                            <div
                                                key={`${dayIndex}-${timeSlot}`}
                                                className={`time-slot ${hasAppointments ? 'available' : ''} ${isPast ? 'past-date' : ''}`}
                                            >
                                                {hasAppointments && !isPast ? (
                                                    <button
                                                        type="button"
                                                        className={`available-slot-card ${groups.length > 1 ? 'has-multiple-types' : ''}`}
                                                        style={{
                                                            '--slot-primary': primaryColor,
                                                            '--slot-secondary': secondaryColor,
                                                        }}
                                                        onClick={() => handleSlotClick(date, timeSlot, groups)}
                                                        aria-label={`${tutors.length} open appointment${tutors.length === 1 ? '' : 's'} for ${getTypeSummary(groups)} at ${timeSlot}`}
                                                    >
                                                        <div className="slot-host-label">
                                                            <i className={`fas ${groups.length > 1 ? 'fa-layer-group' : 'fa-user'}`} aria-hidden="true"></i>
                                                            {groups.length > 1 ? `${groups.length} appointment types` : groups[0].session_type}
                                                        </div>
                                                        <div className="slot-host-names" title={groups.length > 1 ? getTypeSummary(groups) : hostNames.join(', ')}>
                                                            {groups.length > 1 ? getTypeSummary(groups) : getHostSummary(tutors)}
                                                        </div>
                                                        <div className="slot-count">
                                                            {tutors.length} open appointment{tutors.length > 1 ? 's' : ''}
                                                        </div>
                                                    </button>
                                                ) : (
                                                    <div className="empty-slot"></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {slotsLoading && (
                            <div className="register-calendar-loading" aria-live="polite">
                                <i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
                                <span>Finding every open appointment...</span>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {showConfirmModal && selectedSlot && (
                <div className="modal-overlay">
                    <div className="modal-content tutor-selection-modal">
                        <h3>Choose an Appointment</h3>
                        <div className="modal-info">
                            <p><strong>Date:</strong> {selectedSlot.date}</p>
                            <p><strong>Time:</strong> {selectedSlot.timeSlot}</p>
                            <p>
                                <strong>Showing:</strong>{' '}
                                {selectedSlot.groups.length === 1
                                    ? selectedSlot.groups[0].session_type
                                    : `${selectedSlot.groups.length} appointment types`}
                            </p>
                        </div>
                        
                        <p className="select-instruction">Compare the available types and hosts, then register:</p>
                        <div className="appointment-groups">
                            {selectedSlot.groups.map((group) => (
                                <section className="appointment-group" key={group.session_type}>
                                    <div
                                        className="appointment-group__heading"
                                        style={{ '--appointment-group-color': getSessionColor(group.session_type) }}
                                    >
                                        <span className="appointment-group__swatch" aria-hidden="true"></span>
                                        <div>
                                            <strong>{group.session_type}</strong>
                                            <small>
                                                {group.available_tutors.length} host{group.available_tutors.length === 1 ? '' : 's'} available
                                            </small>
                                        </div>
                                    </div>
                                    <div className="tutors-list">
                                        {group.available_tutors.map(tutor => (
                                            <div key={tutor.id} className="tutor-card">
                                                <div className="tutor-info">
                                                    <p className="tutor-host-label">Hosted by</p>
                                                    <h4>{tutor.tutor_name || tutor.tutor_email}</h4>
                                                    <p className="tutor-location">
                                                        <i className="fas fa-location-dot" aria-hidden="true"></i>
                                                        {tutor.location}
                                                    </p>
                                                    {tutor.description && (
                                                        <p className="tutor-description">{tutor.description}</p>
                                                    )}
                                                </div>
                                                <button
                                                    className="register-btn"
                                                    onClick={() => handleRegister(tutor)}
                                                    disabled={registering}
                                                >
                                                    {registering ? 'Registering...' : 'Register'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>

                        <div className="modal-actions">
                            <button 
                                type="button" 
                                className="cancel-btn"
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    setSelectedSlot(null);
                                }}
                                disabled={registering}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCreatorConflictModal && creatorConflictInfo && (
                <div className="modal-overlay">
                    <div className="modal-content conflict-modal">
                        <h3>⚠️ Time Conflict Warning</h3>
                        <div className="conflict-message">
                            <p>{creatorConflictInfo.message}</p>
                        </div>
                        
                        <div className="conflict-details">
                            <h4>Your Created Session Details:</h4>
                            <div className="conflict-info">
                                <p><strong>Type:</strong> {creatorConflictInfo.conflict_info.session_type}</p>
                                <p><strong>Location:</strong> {creatorConflictInfo.conflict_info.location}</p>
                                <p><strong>Status:</strong> <span style={{ color: '#2ecc71' }}>Available (Not Booked)</span></p>
                            </div>
                        </div>

                        <div className="warning-message" style={{ 
                            background: '#fff3cd', 
                            border: '1px solid #ffc107', 
                            borderRadius: '4px', 
                            padding: '12px', 
                            marginTop: '16px' 
                        }}>
                            <p style={{ margin: 0, color: '#856404' }}>
                                <strong>Warning:</strong> If you confirm this booking, your created session will be automatically cancelled.
                            </p>
                        </div>

                        <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button 
                                type="button" 
                                className="cancel-btn"
                                onClick={() => {
                                    setShowCreatorConflictModal(false);
                                    setCreatorConflictInfo(null);
                                    setPendingTutor(null);
                                }}
                                disabled={registering}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '4px',
                                    border: '1px solid #ddd',
                                    background: '#f8f9fa',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button 
                                type="button"
                                className="submit-btn"
                                onClick={handleConfirmCancelCreatorSession}
                                disabled={registering}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#e74c3c',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                {registering ? 'Processing...' : 'Confirm & Cancel My Session'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RegisterSession;
