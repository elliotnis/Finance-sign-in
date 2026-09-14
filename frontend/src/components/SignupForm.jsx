import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PortalAuthShell from './PortalAuthShell';
import '../styles/auth.css';

function SignupForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');
      
      const response = await fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Signup failed');
      }

      sessionStorage.setItem('portal_session', data.session_token);
      // Handle successful signup
      
      // save to session storage
      sessionStorage.setItem('pendingProfile', JSON.stringify({
        email: email
      }));


      // Navigate to profile completion page with user data
      navigate('/complete-profile', { 
        state: { 
          email: email,
          userId: data.user_id 
        } 
      });
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <PortalAuthShell currentStage="access">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="logo-container">
          <div className="logo-text">
            <h1>HKUST</h1>
            <span>Finance community portal</span>
          </div>
        </div>

        <h2>Create your portal access</h2>
        {error && <p className="error-message">{error}</p>}

        <div className="input-group">
          <label htmlFor="email">HKUST ITSC Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. jsmith@connect.ust.hk or jsmith@ust.hk"
            required
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
            placeholder="Create a password"
            required
          />
          <i className="fas fa-lock input-icon"></i>
          <i
            className={`fas ${showPassword ? 'fa-eye' : 'fa-eye-slash'} toggle-password`}
            onClick={togglePasswordVisibility}
          ></i>
        </div>

        <button type="submit" className="login-btn">Create account</button>

        <div className="signup-link">
          Already have an account? <Link to="/login">Sign In</Link>
        </div>
      </form>
    </PortalAuthShell>
  );
}

export default SignupForm;
