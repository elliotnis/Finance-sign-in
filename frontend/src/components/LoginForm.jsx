import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import PortalAuthShell from './PortalAuthShell';
import '../styles/auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const EMAIL_DOMAINS = ['connect.ust.hk', 'ust.hk'];

function getSafeReturnTo(location) {
  const requested = location.state?.returnTo || sessionStorage.getItem('post_login_redirect') || '';
  if (
    typeof requested === 'string'
    && requested.startsWith('/')
    && !requested.startsWith('//')
    && requested !== '/login'
  ) {
    return requested;
  }
  return '/dashboard';
}

function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState('password'); // 'password' | 'email-link'
  const returnTo = getSafeReturnTo(location);

  useEffect(() => {
    if (!authLoading && user) {
      navigate(returnTo, { replace: true });
    }
  }, [authLoading, navigate, returnTo, user]);

  if (authLoading || user) {
    return null;
  }

  return (
    <PortalAuthShell currentStage="access">
      <div className="login-form">
        <div className="logo-container">
          <div className="logo-text">
            <h1>HKUST</h1>
            <span>Finance student services</span>
          </div>
        </div>

        <h2>Sign in to your student desk</h2>

        <div className="login-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'password'}
            className={`login-mode-tab ${mode === 'password' ? 'active' : ''}`}
            onClick={() => setMode('password')}
          >
            Password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'email-link'}
            className={`login-mode-tab ${mode === 'email-link' ? 'active' : ''}`}
            onClick={() => setMode('email-link')}
          >
            HKUST Email Code
          </button>
        </div>

        {mode === 'password' ? (
          <PasswordLogin navigate={navigate} login={login} returnTo={returnTo} />
        ) : (
          <EmailLinkLogin navigate={navigate} returnTo={returnTo} />
        )}

        <div className="divider"><span>Department links</span></div>

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
      </div>
    </PortalAuthShell>
  );
}

function PasswordLogin({ navigate, login, returnTo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.detail || data.message || data.error || 'Login failed';
        throw new Error(errorMessage);
      }

      let preferredName = null;
      let targetPath = returnTo;

      try {
        const profileResponse = await fetch(`${API_URL}/profile/${email}`);

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
        username: preferredName || data.email,
        email,
      };

      login(userData);

      if (targetPath === '/complete-profile') {
        navigate('/complete-profile', {
          state: { email, userId: data.user_id, returnTo },
        });
      } else {
        sessionStorage.removeItem('post_login_redirect');
        navigate(targetPath);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form className="auth-flow-panel" onSubmit={handleSubmit}>
      {error && (
        <div className="error-message" style={{
          background: '#ffebee', color: '#c62828', padding: '12px',
          borderRadius: '4px', marginBottom: '16px',
          border: '1px solid #ffcdd2', fontSize: '14px',
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
          placeholder="e.g. jsmith@connect.ust.hk or jsmith@ust.hk"
          required
          disabled={loading}
        />
        <i className="fas fa-envelope input-icon"></i>
      </div>

      <div className="input-group">
        <label htmlFor="password">Password</label>
        <input
          type={showPassword ? 'text' : 'password'}
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
          onClick={() => setShowPassword((s) => !s)}
        ></i>
      </div>

      <div className="options-group">
        <span className="remember-me" aria-live="polite">
          Your login will be remembered on this device.
        </span>
        <Link to="/forgot-password" className="forgot-password">Forgot Password?</Link>
      </div>

      <button type="submit" className="login-btn" disabled={loading}>
        {loading ? 'Signing In...' : 'Sign In'}
      </button>
    </form>
  );
}

function EmailLinkLogin({ navigate, returnTo }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [domain, setDomain] = useState(EMAIL_DOMAINS[0]);
  const [codeDigits, setCodeDigits] = useState(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const codeInputsRef = useRef([]);

  const toggleDomain = () => {
    setDomain((currentDomain) => (
      currentDomain === EMAIL_DOMAINS[0] ? EMAIL_DOMAINS[1] : EMAIL_DOMAINS[0]
    ));
  };

  const requestCode = async () => {
    const cleaned = username.trim().toLowerCase();
    if (!cleaned) {
      setError('Please enter your HKUST username.');
      return false;
    }
    if (cleaned.includes('@')) {
      setError("Enter only the part before the domain, then choose @connect.ust.hk or @ust.hk.");
      return false;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/email-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleaned, domain }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not send email.');
      }
      setSentTo(data.email);
      setCodeDigits(Array(6).fill(''));
      requestAnimationFrame(() => {
        if (codeInputsRef.current[0]) {
          codeInputsRef.current[0].focus();
        }
      });
      return true;
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    await requestCode();
  };

  const completeEmailLogin = async (email, userId) => {
    let preferredName = null;
    let targetPath = returnTo;

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
      user_id: userId,
      username: preferredName || email,
      email,
    };

    login(userData);

    if (targetPath === '/complete-profile') {
      navigate('/complete-profile', {
        state: { email, userId, returnTo },
      });
    } else {
      sessionStorage.removeItem('post_login_redirect');
      navigate(targetPath);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanedCode = codeDigits.join('');
    if (!/^\d{6}$/.test(cleanedCode)) {
      setError('Please enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/email-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sentTo, code: cleanedCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'This code is invalid or expired.');
      }

      await completeEmailLogin(data.email, data.user_id);
    } catch (err) {
      setError(err.message || 'This code is invalid or expired.');
      setLoading(false);
    }
  };

  const handleUseDifferent = () => {
    setSentTo('');
    setCodeDigits(Array(6).fill(''));
    setError('');
  };

  const focusCodeInput = (index) => {
    requestAnimationFrame(() => {
      codeInputsRef.current[index]?.focus();
    });
  };

  const handleCodeChange = (index, value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6 - index);
    const updated = [...codeDigits];

    if (!digits) {
      updated[index] = '';
      setCodeDigits(updated);
      return;
    }

    digits.split('').forEach((digit, offset) => {
      updated[index + offset] = digit;
    });
    setCodeDigits(updated);

    const nextIndex = index + digits.length;
    if (nextIndex < 6) {
      focusCodeInput(nextIndex);
    }
  };

  const handleCodeKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
      event.preventDefault();
      setCodeDigits((currentDigits) => {
        const updated = [...currentDigits];
        updated[index - 1] = '';
        return updated;
      });
      focusCodeInput(index - 1);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusCodeInput(index - 1);
    }
    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      focusCodeInput(index + 1);
    }
  };

  const handleCodePaste = (event, startIndex) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6 - startIndex);
    if (!pasted) {
      return;
    }

    event.preventDefault();
    const updated = [...codeDigits];
    for (let index = startIndex; index < 6; index += 1) {
      updated[index] = '';
    }
    for (let i = 0; i < pasted.length; i += 1) {
      updated[startIndex + i] = pasted[i];
    }
    setCodeDigits(updated);

    focusCodeInput(Math.min(startIndex + pasted.length, 5));
  };

  if (sentTo) {
    return (
      <div className="auth-flow-panel auth-code-flow">
        <div className="email-link-sent">
          <div className="email-link-sent-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <h3>Enter your code</h3>
          <p>
            We sent a 6-digit sign-in code to <strong>{sentTo}</strong>.<br />
            Enter it below to continue.
          </p>
        </div>

        <form onSubmit={handleVerifySubmit}>
          {error && (
            <div className="error-message" style={{
              background: '#ffebee', color: '#c62828', padding: '12px',
              borderRadius: '4px', marginBottom: '16px',
              border: '1px solid #ffcdd2', fontSize: '14px',
            }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
              {error}
            </div>
          )}

          <div className="input-group">
            <label id="email-code-label">6-digit code</label>
            <div className="otp-inputs" role="group" aria-labelledby="email-code-label">
              {codeDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    codeInputsRef.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={digit}
                  onChange={(event) => handleCodeChange(index, event.target.value)}
                  onKeyDown={(event) => handleCodeKeyDown(index, event)}
                  onPaste={(event) => handleCodePaste(event, index)}
                  onFocus={(event) => event.currentTarget.select()}
                  className={`otp-input${digit ? ' has-value' : ''}`}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  enterKeyHint={index === 5 ? 'done' : 'next'}
                  aria-label={`Code digit ${index + 1}`}
                  required
                  disabled={loading}
                />
              ))}
            </div>
            <p className="input-hint">
              We sent it to your <strong>{sentTo}</strong> inbox.
            </p>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Verifying code...' : 'Verify and sign in'}
          </button>
        </form>

        <div className="otp-actions">
          <button
            type="button"
            className="login-btn login-btn-secondary"
            onClick={requestCode}
            disabled={loading}
          >
            {loading ? 'Resending...' : 'Resend code'}
          </button>
          <button
            type="button"
            className="login-btn login-btn-secondary"
            onClick={handleUseDifferent}
            disabled={loading}
          >
            Use a different username
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-flow-panel" onSubmit={handleRequestSubmit}>
      {error && (
        <div className="error-message" style={{
          background: '#ffebee', color: '#c62828', padding: '12px',
          borderRadius: '4px', marginBottom: '16px',
          border: '1px solid #ffcdd2', fontSize: '14px',
        }}>
          <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
          {error}
        </div>
      )}

      <div className="input-group">
        <label htmlFor="hkust-username">HKUST ITSC Username</label>
        <div className="email-suffix-input">
          <input
            type="text"
            id="hkust-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. jsmith"
            autoComplete="username"
            required
            disabled={loading}
          />
          <button
            type="button"
            id="hkust-email-domain"
            className="email-domain-toggle"
            onClick={toggleDomain}
            aria-label={`HKUST email domain, currently @${domain}. Click to switch.`}
            disabled={loading}
          >
            @{domain}
          </button>
        </div>
        <p className="input-hint">
          Enter only the part before the domain. We'll email you a one-time sign-in code.
        </p>
      </div>

      <button type="submit" className="login-btn" disabled={loading}>
        {loading ? 'Sending code...' : 'Email me a sign-in code'}
      </button>
    </form>
  );
}

export default LoginForm;
