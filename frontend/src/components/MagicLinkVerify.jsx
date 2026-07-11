import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import '../styles/auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function MagicLinkVerify() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'error'
  const [error, setError] = useState('');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // StrictMode guard
    ranRef.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setError('This sign-in link is missing its token.');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/email-link/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.message || 'This link is invalid or expired.');
        }

        const email = data.email;
        let preferredName = null;
        let targetPath = '/dashboard';

        try {
          const profileResponse = await fetch(`${API_URL}/profile/${encodeURIComponent(email)}`);
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            preferredName = profileData.preferred_name;
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
          username: preferredName || email,
          email,
        };
        login(userData);

        if (targetPath === '/complete-profile') {
          navigate('/complete-profile', {
            replace: true,
            state: { email, userId: data.user_id },
          });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        setError(err.message || 'This sign-in link is invalid or expired.');
        setStatus('error');
      }
    })();
  }, [searchParams, login, navigate]);

  return (
    <div className="container">
      <div className="login-form" style={{ textAlign: 'center' }}>
        <div className="logo-container">
          <div className="logo-text">
            <h1>HKUST</h1>
            <span>Finance Department Portal</span>
          </div>
        </div>

        {status === 'verifying' && (
          <>
            <div className="email-link-sent-icon">
              <i className="fas fa-spinner fa-spin"></i>
            </div>
            <h2>Signing you in…</h2>
            <p style={{ color: '#555', marginTop: '1rem' }}>
              Please wait while we verify your sign-in link.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="email-link-sent-icon"
              style={{ background: 'rgba(198, 40, 40, .08)', color: '#c62828' }}
            >
              <i className="fas fa-times-circle"></i>
            </div>
            <h2 style={{ color: '#c62828' }}>Link not valid</h2>
            <p style={{ color: '#555', margin: '1rem 0 1.5rem' }}>{error}</p>
            <Link to="/login" className="login-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default MagicLinkVerify;
