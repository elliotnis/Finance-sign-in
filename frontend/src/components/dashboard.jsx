import { useEffect, useState } from 'react';
import {useNavigate} from 'react-router-dom';
import '../styles/dashboard.css';

function Dashboard(){
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [profilePicture, setProfilePicture] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
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
        fetchAdminRole();
    }, [navigate]);

    const fetchAdminRole = async () => {
        try {
            const userEmail = localStorage.getItem('user_email');
            if (!userEmail) return;
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/me/role?email=${encodeURIComponent(userEmail)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.is_allowed === false) {
                    localStorage.removeItem('user_id');
                    localStorage.removeItem('username');
                    localStorage.removeItem('preferred_name');
                    localStorage.removeItem('user_email');
                    navigate('/login');
                    return;
                }
                setIsAdmin(Boolean(data.is_admin));
            }
        } catch (error) {
            console.error('Error checking admin role:', error);
        }
    };

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
        return (
            <div className="dashboard-loading-screen">
                <div className="dashboard-loading-mark">
                    <i className="fas fa-chart-line"></i>
                </div>
                <span>Loading your dashboard...</span>
            </div>
        )
    }

    const currentDate = new Date();
    const userEmail = localStorage.getItem('user_email') || 'HKUST Finance';
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'S';

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

    return (
        <div className="dashboard-container">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-content">
                    <div className="logo-section">
                        <div className="brand-mark" aria-hidden="true">
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <div>
                            <h1>HKUST FINA Department</h1>
                            <span>Session Calendar</span>
                        </div>
                    </div>
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
                                localStorage.removeItem('user_id');
                                localStorage.removeItem('preferred_name');
                                localStorage.removeItem('user_email');
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
                        Manage FINA sessions, class schedules, and verification without digging through menus.
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

            {/* Main Content */}
            <main className="dashboard-main">
                <div className="dashboard-section-heading">
                    <p>Quick actions</p>
                    <h2>What do you want to do next?</h2>
                </div>
                {/* Quick Actions Grid */}
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

export default Dashboard;
