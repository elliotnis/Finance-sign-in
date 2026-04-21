import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import '../styles/verification.css';

function Verification() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showReflectionModal, setShowReflectionModal] = useState(false);
    const [selectedSession, setSelectedSession] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    
    // Reflection form data
    const [reflectionForm, setReflectionForm] = useState({
        other_person_name: '',
        attitude_rating: '',
        meeting_content: '',
        photo_base64: ''
    });

    useEffect(() => {
        if (user?.email) {
            fetchVerificationSessions();
        } else {
            navigate('/login');
        }
    }, [user, navigate]);

    const fetchVerificationSessions = async () => {
        try {
            setLoading(true);
            setError(null);
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/verification/${encodeURIComponent(user.email)}`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch verification sessions');
            }
            
            const data = await response.json();
            setSessions(data.sessions || []);
        } catch (err) {
            setError(err.message);
            console.error('Error fetching verification sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleReflectionClick = (session) => {
        setSelectedSession(session);
        setReflectionForm({
            other_person_name: '',
            attitude_rating: '',
            meeting_content: '',
            photo_base64: ''
        });
        setShowReflectionModal(true);
    };

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('Photo size must be less than 5MB');
                return;
            }
            
            const reader = new FileReader();
            reader.onloadend = () => {
                setReflectionForm({
                    ...reflectionForm,
                    photo_base64: reader.result
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmitReflection = async (e) => {
        e.preventDefault();
        
        if (!reflectionForm.other_person_name || !reflectionForm.attitude_rating || 
            !reflectionForm.meeting_content || !reflectionForm.photo_base64) {
            alert('Please fill in all fields and upload a photo');
            return;
        }
        
        setSubmitting(true);
        
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/verification/reflect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    session_id: selectedSession.session_id,
                    submitted_by: user.email,
                    role: selectedSession.user_role,
                    other_person_name: reflectionForm.other_person_name,
                    attitude_rating: reflectionForm.attitude_rating,
                    meeting_content: reflectionForm.meeting_content,
                    photo_base64: reflectionForm.photo_base64
                })
            });
            
            if (response.ok) {
                alert('Reflection submitted successfully!');
                setShowReflectionModal(false);
                setSelectedSession(null);
                // Refresh sessions
                fetchVerificationSessions();
            } else {
                const errorData = await response.json();
                alert(`Failed to submit reflection: ${errorData.detail}`);
            }
        } catch (error) {
            console.error('Error submitting reflection:', error);
            alert('Error submitting reflection. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    };

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
            return timeSlot;
        }
    };

    if (loading) {
        return (
            <div className="verification-page">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading verification sessions...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="verification-page">
                <button 
                    className="back-button"
                    onClick={() => navigate('/dashboard')}
                >
                    ← Back to Dashboard
                </button>
                <div className="error-state">
                    <h2>Error Loading Sessions</h2>
                    <p>{error}</p>
                    <button onClick={fetchVerificationSessions} className="btn-primary">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="verification-page">
            <div className="verification-header">
                <button 
                    className="back-button"
                    onClick={() => navigate('/dashboard')}
                >
                    ← Back to Dashboard
                </button>
                <h1>Session Verification</h1>
                <p className="subtitle">
                    Verify your attendance and share your experience
                </p>
                
                {sessions.length > 0 && (
                    <div className="stats-bar">
                        <div className="stat">
                            <span className="stat-number">{sessions.length}</span>
                            <span className="stat-label">Total Sessions</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">
                                {sessions.filter(s => s.is_verified).length}
                            </span>
                            <span className="stat-label">You Verified</span>
                        </div>
                        <div className="stat pending">
                            <span className="stat-number">
                                {sessions.filter(s => !s.is_verified).length}
                            </span>
                            <span className="stat-label">You Need to Verify</span>
                        </div>
                    </div>
                )}
            </div>

            {sessions.length === 0 ? (
                <div className="empty-state">
                    <h3>No Sessions to Verify</h3>
                    <p>You don't have any completed sessions yet.</p>
                    <button 
                        className="btn-primary" 
                        onClick={() => navigate('/register-session')}
                    >
                        Browse Available Sessions
                    </button>
                </div>
            ) : (
                <div className="sessions-list">
                    {sessions.map(session => (
                        <div 
                            key={session.session_id} 
                            className={`verification-card ${session.is_verified ? 'verified' : ''}`}
                        >
                            <div className="card-header">
                                <div className="session-info">
                                    <h3>{session.session_type}</h3>
                                    <p className="session-meta">
                                        <span>📅 {formatDate(session.date)}</span>
                                        <span>🕐 {formatTimeSlot(session.time_slot)}</span>
                                        <span>📍 {session.location}</span>
                                    </p>
                                </div>
                                <div className="verification-status">
                                    {session.is_verified ? (
                                        <span className="badge verified">✓ You Verified</span>
                                    ) : (
                                        <span className="badge pending">⏳ Not Verified</span>
                                    )}
                                </div>
                            </div>

                            <div className="card-body">
                                <div className="participants">
                                    {/* Show user's role first */}
                                    <div className="participant">
                                        <strong>Your Role:</strong> 
                                        {session.user_role === 'tutor' ? 'Tutor' : 'Student'}
                                        {((session.user_role === 'tutor' && session.tutor_reflected) || 
                                          (session.user_role === 'student' && session.student_reflected)) && (
                                            <span className="check-icon">✓</span>
                                        )}
                                    </div>
                                    
                                    {/* Show the other person's info */}
                                    <div className="participant">
                                        <strong>
                                            {session.user_role === 'tutor' ? 'Student:' : 'Tutor:'}
                                        </strong> 
                                        {session.user_role === 'tutor' ? 
                                            (session.student_name || 'N/A') : 
                                            session.tutor_name
                                        }
                                    </div>
                                </div>

                                <div className="card-actions">
                                    {session.is_verified ? (
                                        <button className="btn-secondary" disabled>
                                            ✓ You Submitted Reflection
                                        </button>
                                    ) : (
                                        <button 
                                            className="btn-primary"
                                            onClick={() => handleReflectionClick(session)}
                                        >
                                            Submit Reflection to Verify
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reflection Modal */}
            {showReflectionModal && selectedSession && (
                <div className="modal-overlay">
                    <div className="modal-content reflection-modal">
                        <h2>Submit Session Reflection</h2>
                        <p className="modal-subtitle">
                            {selectedSession.session_type} - {formatDate(selectedSession.date)}
                        </p>

                        <form onSubmit={handleSubmitReflection}>
                            <div className="form-group">
                                <label>
                                    {selectedSession.user_role === 'tutor' ? 'Student Name' : 'Tutor Name'} *
                                </label>
                                <input
                                    type="text"
                                    value={reflectionForm.other_person_name}
                                    onChange={(e) => setReflectionForm({
                                        ...reflectionForm,
                                        other_person_name: e.target.value
                                    })}
                                    placeholder={`Enter ${selectedSession.user_role === 'tutor' ? 'student' : 'tutor'} name`}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Attitude Rating *</label>
                                <select
                                    value={reflectionForm.attitude_rating}
                                    onChange={(e) => setReflectionForm({
                                        ...reflectionForm,
                                        attitude_rating: e.target.value
                                    })}
                                    required
                                >
                                    <option value="">Select rating</option>
                                    <option value="Excellent">⭐⭐⭐⭐⭐ Excellent</option>
                                    <option value="Good">⭐⭐⭐⭐ Good</option>
                                    <option value="Fair">⭐⭐⭐ Fair</option>
                                    <option value="Poor">⭐⭐ Poor</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Meeting Content *</label>
                                <textarea
                                    value={reflectionForm.meeting_content}
                                    onChange={(e) => setReflectionForm({
                                        ...reflectionForm,
                                        meeting_content: e.target.value
                                    })}
                                    placeholder="Describe what was discussed in the meeting..."
                                    rows="4"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Session Photo *</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    required
                                />
                                {reflectionForm.photo_base64 && (
                                    <div className="photo-preview">
                                        <img 
                                            src={reflectionForm.photo_base64} 
                                            alt="Preview" 
                                            style={{ maxWidth: '200px', marginTop: '10px', borderRadius: '8px' }}
                                        />
                                    </div>
                                )}
                                <small>Upload a photo from the session (max 5MB)</small>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="cancel-btn"
                                    onClick={() => {
                                        setShowReflectionModal(false);
                                        setSelectedSession(null);
                                    }}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="submit-btn"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Submitting...' : 'Submit Reflection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Verification;

