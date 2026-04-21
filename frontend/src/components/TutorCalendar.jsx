import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/tutorCalendar.css';

function TutorCalendar() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [selectedTimeSlots, setSelectedTimeSlots] = useState(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showConflictModal, setShowConflictModal] = useState(false);
    const [conflictSlot, setConflictSlot] = useState(null);
    const [sessionTypes, setSessionTypes] = useState([]);
    const [existingSessions, setExistingSessions] = useState([]);
    const [formData, setFormData] = useState({
        session_type: '',
        location: '',
        description: ''
    });

    // Color palette for sessions
    const sessionColors = [
        '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', 
        '#F44336', '#00BCD4', '#FFEB3B', '#795548',
        '#607D8B', '#E91E63', '#3F51B5', '#009688'
    ];

    // Function to get consistent color for session type
    const getSessionColor = (sessionType) => {
        const hash = sessionType.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return sessionColors[Math.abs(hash) % sessionColors.length];
    };

    // Function to get short display name for session type
    const getSessionDisplayName = (sessionType) => {
        const typeMap = {
            'Course Tutoring': 'TUTORING',
            'Study Planning advice': 'PLAN',
            'Profile Coaching Sessions': 'COACHING',
            'Market News sharing': 'NEWS',
            'Casual Chat': 'CHAT',
            'Internship sharing': 'INTERN',
            'Lunch Meet': 'LUNCH',
            'Others': 'OTHERS'
        };
        return typeMap[sessionType] || sessionType.split(' ')[0].toUpperCase();
    };

    // Check if a date is in the past (before today)
    const isPastDate = (date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of today
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0); // Set to start of check date
        return checkDate < today;
    };

    // Check if there are any selected slots from future dates
    const hasValidSelectedSlots = () => {
        if (selectedTimeSlots.size === 0) return false;
        
        return Array.from(selectedTimeSlots).some(slotKey => {
            const [dateStr] = slotKey.split('_');
            const date = new Date(dateStr);
            return !isPastDate(date);
        });
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
        const username = localStorage.getItem('username');
        
        if (!user_id) {
            navigate('/login');
            return;
        }
        
        // Fetch session types and existing sessions
        fetchSessionTypes();
        fetchExistingSessions();
        setLoading(false);
    }, [navigate]);

    const fetchSessionTypes = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/session-types`);
            const data = await response.json();
            setSessionTypes(data.session_types);
        } catch (error) {
            console.error('Error fetching session types:', error);
        }
    };

    const fetchExistingSessions = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const userEmail = localStorage.getItem('user_email');
            
            if (!userEmail) return;
            
            const response = await fetch(`${API_URL}/tutor/availability/${encodeURIComponent(userEmail)}`);
            
            if (response.ok) {
                const data = await response.json();
                setExistingSessions(data.availabilities || []);
            } else if (response.status === 404) {
                // No existing sessions found, which is fine
                setExistingSessions([]);
            }
        } catch (error) {
            console.error('Error fetching existing sessions:', error);
            setExistingSessions([]);
        }
    };

    // Get week dates
    const getWeekDates = (date) => {
        const week = [];
        const startDate = new Date(date);
        const day = startDate.getDay();
        const diff = startDate.getDate() - day; // First day is Sunday
        
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
        // Refresh existing sessions when changing weeks
        fetchExistingSessions();
    };

    // Check if a time slot has an existing session
    const hasExistingSession = (date, timeSlot) => {
        const dateStr = formatDate(date);
        return existingSessions.some(session => 
            session.date === dateStr && session.time_slot === timeSlot
        );
    };

    // Get existing session details for a time slot
    const getExistingSession = (date, timeSlot) => {
        const dateStr = formatDate(date);
        return existingSessions.find(session => 
            session.date === dateStr && session.time_slot === timeSlot
        );
    };

    const formatDate = (date) => {
        // Use local date to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // YYYY-MM-DD format
    };

    const formatDisplayDate = (date) => {
        return date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
        });
    };

    const getMonthYear = (date) => {
        return date.toLocaleDateString('en-US', { 
            month: 'short',
            year: 'numeric'
        });
    };

    const handleTimeSlotClick = (date, timeSlot) => {
        // Check if this time slot already has an existing session
        if (hasExistingSession(date, timeSlot)) {
            const existingSession = getExistingSession(date, timeSlot);
            setConflictSlot({
                date: formatDate(date),
                timeSlot: timeSlot,
                session: existingSession
            });
            setShowConflictModal(true);
            return;
        }

        // Check if the date is in the past - prevent selection
        if (isPastDate(date)) {
            return; // Simply don't allow selection of past dates
        }

        const slotKey = `${formatDate(date)}_${timeSlot}`;
        
        // Only allow selecting one slot at a time
        if (selectedTimeSlots.has(slotKey)) {
            // If clicking the same slot, deselect it
            setSelectedTimeSlots(new Set());
        } else {
            // If clicking a different slot, select only this one
            setSelectedTimeSlots(new Set([slotKey]));
        }
    };

    const handleCreateSession = () => {
        if (selectedTimeSlots.size === 0) {
            alert('Please select a time slot');
            return;
        }
        setShowCreateModal(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.session_type || !formData.location) {
            alert('Please fill in all required fields');
            return;
        }

        const username = localStorage.getItem('username');
        const userEmail = localStorage.getItem('user_email'); // Use actual email
        
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const promises = Array.from(selectedTimeSlots).map(async (slotKey) => {
                const [date, timeSlot] = slotKey.split('_');
                
                const response = await fetch(`${API_URL}/tutor/availability`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        tutor_email: userEmail,
                        tutor_name: username,
                        session_type: formData.session_type,
                        date: date,
                        time_slot: timeSlot,
                        location: formData.location,
                        description: formData.description
                    })
                });

                if (!response.ok) {
                    throw new Error(`Failed to create session for ${date} ${timeSlot}`);
                }
                
                return response.json();
            });

            await Promise.all(promises);
            
            alert('Successfully created session!');
            setSelectedTimeSlots(new Set());
            setShowCreateModal(false);
            setFormData({
                session_type: '',
                location: '',
                description: ''
            });
            
            // Refresh existing sessions
            fetchExistingSessions();
            
        } catch (error) {
            console.error('Error creating sessions:', error);
            alert('Error creating sessions. Please try again.');
        }
    };

    const handleDeleteSession = async (sessionId) => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const userEmail = localStorage.getItem('user_email');
            
            const response = await fetch(`${API_URL}/tutor/availability/${sessionId}?tutor_email=${encodeURIComponent(userEmail)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Session deleted successfully!');
                setShowConflictModal(false);
                setConflictSlot(null);
                // Refresh existing sessions
                fetchExistingSessions();
            } else {
                const errorData = await response.json();
                alert(`Error deleting session: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('Error deleting session. Please try again.');
        }
    };

    const isTimeSlotSelected = (date, timeSlot) => {
        const slotKey = `${formatDate(date)}_${timeSlot}`;
        return selectedTimeSlots.has(slotKey);
    };

    if (loading) {
        return <div className="loading-spinner">Loading...</div>;
    }

    const username = localStorage.getItem('username');

    return (
        <div className="dashboard-container">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-content">
                    <div className="logo-section">
                        <h1>HKUST FINA Department</h1>
                        <span>Event Calendar</span>
                    </div>
                    <div className="user-section">
                        <div className="user-info">
                            <span className="user-name">Welcome, {username || 'Tutor'}!</span>
                            <span className="user-role">Create Your Sessions</span>
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

            {/* Main Content */}
            <main className="dashboard-main">
                <div className="dashboard-content">
                    <div className="calendar-header">
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
                        <div className="action-section">
                            <span className="selected-count">
                                {selectedTimeSlots.size > 0 ? '1 slot selected' : '0 slots selected'}
                            </span>
                            <button 
                                className="create-sessions-btn"
                                onClick={handleCreateSession}
                                disabled={!hasValidSelectedSlots()}
                            >
                                Create Session
                            </button>
                        </div>
                    </div>

                    {/* Instructions */}
                    <div className="instructions">
                        <p>Click on an empty time slot to select it, then click "Create Session" to add it to your availability.</p>
                        <p>Colored cards show your existing sessions. Click them to view details or delete if needed.</p>
                        <p>● Sessions with a dot indicator have been booked by students.</p>
                    </div>

                    {/* Weekly Calendar Grid */}
                    <div className="weekly-calendar">
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
                                        const hasExisting = hasExistingSession(date, timeSlot);
                                        const existingSession = hasExisting ? getExistingSession(date, timeSlot) : null;
                                        const isSelected = isTimeSlotSelected(date, timeSlot);
                                        const isPast = isPastDate(date);
                                        
                                        return (
                                            <div 
                                                key={`${dayIndex}-${timeSlot}`}
                                                className={`time-slot ${isSelected ? 'selected' : ''} ${hasExisting ? 'has-session' : ''} ${isPast && !hasExisting ? 'past-date' : ''}`}
                                                onClick={() => handleTimeSlotClick(date, timeSlot)}
                                                style={{ cursor: isPast && !hasExisting ? 'not-allowed' : 'pointer' }}
                                            >
                                                {hasExisting ? (
                                                    <div 
                                                        className="session-card"
                                                        style={{ backgroundColor: getSessionColor(existingSession.session_type) }}
                                                        title={`${existingSession.session_type} - ${existingSession.location}${existingSession.student_registered ? ` (Booked by student)` : ' (Available)'}`}
                                                    >
                                                        <div className="session-time">{timeSlot.split('-')[0]}</div>
                                                        <div className="session-title">{getSessionDisplayName(existingSession.session_type)}</div>
                                                        <div className="session-location">{existingSession.location}</div>
                                                        {existingSession.student_registered && (
                                                            <div className="session-booked-indicator">●</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="empty-slot">
                                                        {/* Only show time for empty slots when selected */}
                                                        {isSelected && <span className="slot-time">{timeSlot.split('-')[0]}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>

            {/* Create Sessions Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Create Session</h3>
                        <p>Creating session for the selected time slot</p>
                        
                        <form onSubmit={handleFormSubmit}>
                            <div className="form-group">
                                <label>Session Type *</label>
                                <select 
                                    value={formData.session_type}
                                    onChange={(e) => setFormData({...formData, session_type: e.target.value})}
                                    required
                                    onInvalid={(e) => e.target.setCustomValidity('Please select a session type')}
                                    onInput={(e) => e.target.setCustomValidity('')}
                                >
                                    <option value="">Select a session type</option>
                                    {sessionTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="form-group">
                                <label>Location *</label>
                                <input 
                                    type="text"
                                    value={formData.location}
                                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                                    placeholder="e.g., Room 101, Online, Library"
                                    required
                                    onInvalid={(e) => e.target.setCustomValidity('Please enter a location')}
                                    onInput={(e) => e.target.setCustomValidity('')}
                                />
                            </div>
                            
                            <div className="form-group">
                                <label>Description</label>
                                <textarea 
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    placeholder="Optional description about the session"
                                    rows="3"
                                />
                            </div>
                            
                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    className="cancel-btn"
                                    onClick={() => setShowCreateModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="submit-btn">
                                    Create Session
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Conflict Modal */}
            {showConflictModal && conflictSlot && (
                <div className="modal-overlay">
                    <div className="modal-content conflict-modal">
                        <h3>Time Slot Already Occupied</h3>
                        <p>You already have a session at this time:</p>
                        
                        <div className="conflict-details">
                            <div className="conflict-info">
                                <strong>Date:</strong> {conflictSlot.date}
                            </div>
                            <div className="conflict-info">
                                <strong>Time:</strong> {conflictSlot.timeSlot}
                            </div>
                            <div className="conflict-info">
                                <strong>Type:</strong> {conflictSlot.session.session_type}
                            </div>
                            <div className="conflict-info">
                                <strong>Location:</strong> {conflictSlot.session.location}
                            </div>
                            {conflictSlot.session.description && (
                                <div className="conflict-info">
                                    <strong>Description:</strong> {conflictSlot.session.description}
                                </div>
                            )}
                            <div className="conflict-info">
                                <strong>👤 Status:</strong> 
                                <span className={`status-badge ${conflictSlot.session.student_registered ? 'booked' : 'available'}`}>
                                    {conflictSlot.session.student_registered ? 
                                        'Booked by student' : 
                                        'Available for booking'
                                    }
                                </span>
                            </div>
                            {conflictSlot.session.student_profile && (
                                <div className="student-profile-details">
                                    <h4 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: '#2c3e50', fontSize: '1rem' }}>
                                        📋 Student Information:
                                    </h4>
                                    <div style={{ 
                                        background: '#f8f9fa', 
                                        padding: '0.75rem', 
                                        borderRadius: '6px',
                                        borderLeft: '3px solid #3498db'
                                    }}>
                                        {conflictSlot.session.student_profile.preferred_name && (
                                            <div style={{ marginBottom: '0.5rem' }}>
                                                <strong>👤 Preferred Name:</strong> {conflictSlot.session.student_profile.preferred_name}
                                            </div>
                                        )}
                                        {conflictSlot.session.student_profile.email && (
                                            <div style={{ marginBottom: '0.5rem' }}>
                                                <strong>📧 Email:</strong> {conflictSlot.session.student_profile.email}
                                            </div>
                                        )}
                                        {conflictSlot.session.student_profile.study_year && (
                                            <div style={{ marginBottom: '0' }}>
                                                <strong>📚 Year of Study:</strong> {conflictSlot.session.student_profile.study_year}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="conflict-actions">
                            <p>To create a new session at this time, you must first delete the existing session.</p>
                            
                            {conflictSlot.session.student_registered ? (
                                <div className="warning-message">
                                    ⚠️ <strong>Warning:</strong> This session has been booked by a student. 
                                    Deleting it will cancel their booking!
                                </div>
                            ) : null}
                            
                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    className="cancel-btn"
                                    onClick={() => {
                                        setShowConflictModal(false);
                                        setConflictSlot(null);
                                    }}
                                >
                                    Keep Existing Session
                                </button>
                                <button 
                                    type="button"
                                    className="delete-btn"
                                    onClick={() => handleDeleteSession(conflictSlot.session.id)}
                                >
                                    Delete & Replace
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TutorCalendar;
