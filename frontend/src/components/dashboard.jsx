import { useEffect, useState } from 'react';
import {useNavigate} from 'react-router-dom';
import '../styles/dashboard.css';

function Dashboard(){
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [profilePicture, setProfilePicture] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [displayName, setDisplayName] = useState(() => {
        const storedName = localStorage.getItem('preferred_name');
        // If stored name is email or looks like email, show Student
        if (storedName && storedName.includes('@')) {
            return 'Student';
        }
        return storedName || 'Student';
    });

    useEffect(() => {
        const user_id = localStorage.getItem('user_id');
        const username = localStorage.getItem('username');
        const preferred_name = localStorage.getItem('preferred_name');
        
        // Clean up if preferred_name is actually an email
        if (preferred_name && preferred_name.includes('@')) {
            localStorage.removeItem('preferred_name');
            setDisplayName('Student');
        }

        console.log('Dashboard checking user_id:', user_id);
        console.log('Dashboard checking preferred_name:', preferred_name);
        console.log('Full localStorage:', JSON.stringify(localStorage));
        
        // Authentication failed
        if (!user_id){
            console.log('No user_id found, redirecting to login');
            navigate('/login');
            return;
        }
        console.log('User authenticated, setting loading to false');
        setLoading(false);
        
        // Fetch user profile to get profile picture
        fetchUserProfile();
    }, [navigate]);

    const fetchUserProfile = async () => {
        try {
            const userEmail = localStorage.getItem('user_email');
            if (!userEmail) {
                setProfileLoading(false);
                return;
            }

            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
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
    };
    if (loading){
        return <div>Loading...</div>
    }
    // Get user info
    const user_id = localStorage.getItem('user_id');
   
    
    // Simple calendar - just show current month
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay();
    
    // Create simple days array
    const daysToShow = [];
    
    // Add empty days for previous month
    for (let i = 0; i < startingDayOfWeek; i++) {
        daysToShow.push(null);
    }
    
    // Add days of current month
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        daysToShow.push(day);
    }
    
    // Add empty days to fill grid (42 total)
    while (daysToShow.length < 42) {
        daysToShow.push(null);
    }

    // FOR MY SESSIONS BUTTON
    const handleMySessionsClick = () => {
        navigate('/sessions'); // Redirect to sessions page
    };

    // Get current time info
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

    return (
        <div className="dashboard-container">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-content">
                    <div className="logo-section">
                        <h1>HKUST FINA Department</h1>
                        <span>Session Calendar</span>
                    </div>
                    <div className="user-section">
                        <div className="user-info">
                            <span className="user-name">Welcome, {displayName}!</span>
                            <button 
                                className="profile-icon-btn"
                                onClick={() => navigate('/profile')}
                                title="Update Profile"
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
                                localStorage.removeItem('user_id');
                                localStorage.removeItem('preferred_name');
                                localStorage.removeItem('user_email');
                                navigate('/login');
                            }}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>
            
            {/* Hero Section with Gradient */}
            <div className="dashboard-hero">
                <div className="hero-content">
                    <h1 className="greeting">{getGreeting()},</h1>
                    <h2 className="greeting-name">{displayName}!</h2>
                    <h3 className="motivation">Time to study midterms</h3>
                </div>
            </div>

            {/* Main Content */}
            <div className="dashboard-main">
                {/* Quick Actions Grid */}
                <div className="action-grid">
                    <button className="action-card" onClick={() => navigate('/tutor-calendar')}>
                        <div className="card-icon">➕</div>
                        <span className="card-title">Create Sessions</span>
                    </button>
                    
                    <button className="action-card" onClick={() => navigate('/register-session')}>
                        <div className="card-icon">📅</div>
                        <span className="card-title">Register Session</span>
                    </button>
                    
                    <button className="action-card" onClick={handleMySessionsClick}>
                        <div className="card-icon">📚</div>
                        <span className="card-title">My Sessions</span>
                    </button>
                    
                    <button className="action-card" onClick={() => navigate('/verification')}>
                        <div className="card-icon">✓</div>
                        <span className="card-title">Verification</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;