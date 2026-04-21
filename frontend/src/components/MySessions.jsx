import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/MySessions.css';
import { useAuth } from '../contexts/authcontext.jsx';

function SessionsPage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const { user } = useAuth();

    useEffect(() => {
        console.log('MySessions: user object:', user);
        console.log('MySessions: user email:', user?.email);
        if (user?.email) {
            fetchMySessions();
        } else {
            console.log('No user email found, not fetching sessions');
            setLoading(false);
        }
    }, [user]);

    const fetchMySessions = async () => {
        try {
            setLoading(true);
            setError(null);
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const url = `${API_URL}/my-sessions/${encodeURIComponent(user.email)}`;
            console.log('Fetching sessions from:', url);
            console.log('User email being used:', user.email);
            
            const response = await fetch(url);
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch sessions: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Sessions data received:', data);
            setSessions(data.registrations || []);
            console.log('Sessions set to:', data.registrations || []);
            
        } catch (err) {
            setError(err.message);
            console.error('Error fetching sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    // in case not logged in
    if (!user) {
        return (
            <div className="sessions-page">
                <div className="loading-state">
                    <p>Please log in to view your sessions</p>
                </div>
            </div>
        );
    }

    // in case no email
    if (!user.email) {
        return (
            <div className="sessions-page">
                <div className="error-state">
                    <h2>Email Required</h2>
                    <p>Your account email is not available. Please contact support.</p>
                    <p>Username: {user.username}</p>
                </div>
            </div>
        );
    }

    // Format date from "2025/10/15" to "October 15, 2025"
    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString.replace(/\//g, '-'));
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            return dateString; // Return original if formatting fails
        }
    };

    // Format time slot from "14:30-15:30" to "2:30 PM - 3:30 PM"
    const formatTimeSlot = (timeSlot) => {
        try {
            const [start, end] = timeSlot.split('-');
            const formatTime = (time) => {
                const [hours, minutes] = time.split(':');
                const hour = parseInt(hours);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour % 12 || 12;
                return `${displayHour}:${minutes} ${ampm}`;
            };
            return `${formatTime(start)} - ${formatTime(end)}`;
        } catch (error) {
            return timeSlot; // Return original if formatting fails
        }
    };

    // Handle session cancellation
    const handleCancelRegistration = async (registrationId, sessionDetails) => {
        const confirmMessage = `Are you sure you want to cancel this registration?\n\nSession: ${sessionDetails.session_type}\nDate: ${formatDate(sessionDetails.date)}\nTime: ${formatTimeSlot(sessionDetails.time_slot)}`;
        
        if (window.confirm(confirmMessage)) {
            try {
                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                const response = await fetch(`${API_URL}/student/register`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        student_email: user.email,
                        availability_id: registrationId
                    })
                });

                if (response.ok) {
                    alert('Registration cancelled successfully!');
                    // Refetch sessions to update the list
                    await fetchMySessions();
                } else {
                    const errorData = await response.json();
                    alert(`Failed to cancel registration: ${errorData.detail}`);
                }
            } catch (err) {
                console.error('Error cancelling registration:', err);
                alert('Failed to cancel registration. Please try again.');
            }
        }
    };

    if (loading) {
        return (
            <div className="sessions-page">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading your sessions...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="sessions-page">
                <button 
                    className="back-button" 
                    onClick={() => navigate('/dashboard')}
                >
                    ← Back to Dashboard
                </button>
                <div className="error-state">
                    <h2>Error Loading Sessions</h2>
                    <p>Error: {error}</p>
                    <p>Debug info:</p>
                    <ul style={{ textAlign: 'left' }}>
                        <li>User email: {user?.email || 'Not found'}</li>
                        <li>API URL: {import.meta.env.VITE_API_URL || 'http://localhost:8000'}</li>
                    </ul>
                    <button onClick={fetchMySessions} className="btn-primary">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="sessions-page">
            <button 
                className="back-button" 
                onClick={() => navigate('/dashboard')}
            >
                ← Back to Dashboard
            </button>
            <div className="sessions-header">
                <h1>My Sessions</h1>
                <p>
                    {sessions.length === 0 
                        ? "You haven't registered for any sessions yet."
                        : `You have ${sessions.length} registered session${sessions.length !== 1 ? 's' : ''}`
                    }
                </p>
            </div>
            
            {sessions.length === 0 ? (
                <div className="empty-state">
                    <h3>No sessions found</h3>
                    <p>Register for a session to see it here!</p>
                    <button className="btn-primary" onClick={() => window.history.back()}>
                        Browse Available Sessions
                    </button>
                </div>
            ) : (
                <div className="sessions-list">
                    {sessions.map(registration => (
                        <div key={registration.registration_id} className="session-card">
                            <div className="session-main-info">
                                <div className="session-tutor">
                                    <h3>Tutor: {registration.session_details.tutor_name}</h3>
                                    {registration.tutor_profile && (
                                        <div className="tutor-profile-details">
                                            {registration.tutor_profile.preferred_name && (
                                                <div>
                                                    <strong>👤 Preferred Name:</strong> {registration.tutor_profile.preferred_name}
                                                </div>
                                            )}
                                            {registration.tutor_profile.email && (
                                                <div>
                                                    <strong>📧 Email:</strong> {registration.tutor_profile.email}
                                                </div>
                                            )}
                                            {registration.tutor_profile.study_year && (
                                                <div>
                                                    <strong>📚 Year of Study:</strong> {registration.tutor_profile.study_year}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="session-details">
                                    <h4>{registration.session_details.session_type}</h4>
                                    <p className="session-description">
                                        {registration.session_details.description}
                                    </p>
                                    
                                    <div className="session-meta">
                                        <div className="meta-item">
                                            <span className="label">Date:</span>
                                            <span className="value">
                                                {formatDate(registration.session_details.date)}
                                            </span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="label">Time:</span>
                                            <span className="value">
                                                {formatTimeSlot(registration.session_details.time_slot)}
                                            </span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="label">Location:</span>
                                            <span className="value">
                                                {registration.session_details.location}
                                            </span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="label">Registered On:</span>
                                            <span className="value">
                                                {new Date(registration.registration_time).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="session-status-actions">
                                <div className="status-section">
                                    <span className="status active">
                                        {registration.status}
                                    </span>
                                </div>
                                
                                <div className="session-actions">
                                    <button 
                                        className="btn-secondary"
                                        onClick={() => handleCancelRegistration(registration.availability_id, registration.session_details)}
                                    >
                                        Cancel Registration
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SessionsPage;