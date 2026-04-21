import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import '../styles/auth.css';

function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.detail || data.message || data.error || 'Login failed';
        throw new Error(errorMessage);
      }

      // Handle successful login
      console.log('Login successful:', data);

      // Fetch user profile to get preferred name
      let preferredName = null;
      let targetPath = '/dashboard';

      try {
        const profileResponse = await fetch(`${API_URL}/profile/${email}`);
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          preferredName = profileData.preferred_name;
          
          // Save preferred_name to localStorage for dashboard
          if (preferredName) {
            localStorage.setItem('preferred_name', preferredName);
          }
        } else if (profileResponse.status === 404) {
          targetPath = '/complete-profile';
        }
      } catch (profileErr) {
        console.error('Error fetching profile:', profileErr);
      }
      
      const userData = {
        user_id: data.user_id,
        username: preferredName || data.email,
        email: email
      };
      
      // Use the auth context login function with remember me
      login(userData, rememberMe);

      // Backwards compatibility
      if (rememberMe) {
        localStorage.setItem('user_email', email);
      } else {
        sessionStorage.setItem('user_email', email);
      }
      
      console.log('User data saved to context:', userData);

      // Navigate based on profile existence
      if (targetPath === '/complete-profile') {
        console.log('Profile not found, redirecting to profile creation');
        navigate('/complete-profile', {
          state: {
            email: email,
            userId: data.user_id
          }
        });
      } else {
        console.log('Redirecting to dashboard');
        navigate('/dashboard');
      }

    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="logo-container">
          <div className="logo-text">
            <h1>HKUST</h1>
            <span>Finance Department Portal</span>
          </div>
        </div>

        <h2>FINA/QFIN Student Portal</h2>
        
        {error && (
          <div className="error-message" style={{ 
            background: '#ffebee', 
            color: '#c62828', 
            padding: '12px', 
            borderRadius: '4px', 
            marginBottom: '16px',
            border: '1px solid #ffcdd2',
            fontSize: '14px'
          }}>
            <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
            {error}
          </div>
        )}

        <div className="input-group">
          <label htmlFor="email">HKUST ITSC Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. jsmith@connect.ust.hk"
            required
            disabled={loading}
          />
          <i className="fas fa-envelope input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            disabled={loading}
          />
          <i className="fas fa-lock input-icon"></i>
          <i
            className={`fas ${showPassword ? 'fa-eye' : 'fa-eye-slash'} toggle-password`}
            onClick={togglePasswordVisibility}
          ></i>
        </div>

        <div className="options-group">
          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            <span className="checkmark"></span>
            Remember my login
          </label>
          <Link to="/forgot-password" className="forgot-password">Forgot Password?</Link>
        </div>

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Signing In...' : 'Sign In'}
        </button>

        <div className="divider"><span>Quick Links</span></div>

        <div className="department-links">
          <a href="https://fina.hkust.edu.hk/" target="_blank" rel="noopener noreferrer">FINA Department</a>
          <a href="https://fina.hkust.edu.hk/programs/bsc-in-quantitative-finance/bsc-qf-overview" target="_blank" rel="noopener noreferrer">QFIN Program</a>
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSc0PmJBitZsdmmuyMy1GSvH9S779_aeE5mT249ll-_s7hImHw/viewform?usp=dialog" target="_blank" rel="noopener noreferrer">
            Report bugs / contact us!
          </a>
        </div>

        <div className="signup-link">
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </div>
      </form>
    </div>
  );
}

export default LoginForm;