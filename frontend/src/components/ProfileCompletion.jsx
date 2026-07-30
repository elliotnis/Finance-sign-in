import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import PortalAuthShell from './PortalAuthShell';
import '../styles/auth.css';

function getSafeReturnTo(locationState) {
  const requested = locationState.returnTo || sessionStorage.getItem('post_login_redirect') || '';
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

function ProfileCompletion() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  // Try to get from location state first, then sessionStorage
  const locationState = location.state || {};
  const sessionData = JSON.parse(sessionStorage.getItem('pendingProfile') || '{}');
  
  const userEmail = locationState.email || sessionData.email || '';
  const userId = locationState.userId;
  const returnTo = getSafeReturnTo(locationState);

  console.log('ProfileCompletion rendered');
  console.log('Location state:', location.state);
  console.log('User email:', userEmail);
  console.log('User ID:', userId);

  const [formData, setFormData] = useState({
    fullName: '',
    preferredName: '',
    yearOfStudy: '',
    major: '',
    contactNumber: '',
    studentId: '',
    graduationYear: '',
    biography: '',
    biographyPublic: false,
    linkedinUrl: '',
    credentials: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');
      
      // Create profile data according to backend schema
      const profileData = {
        login_email: userEmail,
        full_name: formData.fullName,
        preferred_name: formData.preferredName,
        SID: formData.studentId,
        study_year: formData.yearOfStudy,
        major: formData.major,
        contact_phone: formData.contactNumber,
        profile_email: userEmail, // Using the same email for profile
        graduation_year: formData.graduationYear ? Number(formData.graduationYear) : null,
        biography: formData.biography,
        biography_public: formData.biographyPublic,
        linkedin_url: formData.linkedinUrl || null,
        credentials: formData.credentials.split('\n').map((item) => item.trim()).filter(Boolean),
      };

      const response = await fetch(`${API_URL}/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Profile creation failed');
      }

      // Log the user in and navigate to dashboard
      login({
        user_id: userId,
        username: formData.preferredName || formData.fullName,
        email: userEmail
      });

      console.log('Profile created successfully:', data);
      sessionStorage.removeItem('post_login_redirect');
      navigate(returnTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalAuthShell currentStage="profile">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="logo-container">
          <div className="logo-text">
            <h1>HKUST</h1>
            <span>Finance student services</span>
          </div>
        </div>

        <h2>Build your student record</h2>
        <p className="subtitle">Add the details tutors and admins need before you enter the portal.</p>
        
        {error && <p className="error-message">{error}</p>}

        <div className="input-group">
          <label htmlFor="fullName">Full English Name *</label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={formData.fullName}
            onChange={handleInputChange}
            placeholder="e.g. John Smith"
            required
          />
          <i className="fas fa-user input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="graduationYear">Expected graduation year</label>
          <input type="number" id="graduationYear" name="graduationYear" min="2000" max="2200" value={formData.graduationYear} onChange={handleInputChange} placeholder="e.g. 2028" />
          <i className="fas fa-calendar input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="biography">Biography (optional)</label>
          <textarea id="biography" name="biography" rows="4" value={formData.biography} onChange={handleInputChange} placeholder="Your interests, experience, and what you can help with" />
        </div>

        <div className="input-group">
          <label htmlFor="credentials">Credentials / highlights (one per line)</label>
          <textarea id="credentials" name="credentials" rows="3" value={formData.credentials} onChange={handleInputChange} placeholder="CFA level, internship, competition, society role" />
        </div>

        <div className="input-group">
          <label htmlFor="linkedinUrl">LinkedIn profile (optional)</label>
          <input type="url" id="linkedinUrl" name="linkedinUrl" value={formData.linkedinUrl} onChange={handleInputChange} placeholder="https://www.linkedin.com/in/..." />
        </div>

        <label className="checkbox-row">
          <input type="checkbox" name="biographyPublic" checked={formData.biographyPublic} onChange={(e) => setFormData((prev) => ({ ...prev, biographyPublic: e.target.checked }))} />
          Make my biography and credentials discoverable in the People directory
        </label>

        <div className="input-group">
          <label htmlFor="preferredName">Preferred Name *</label>
          <input
            type="text"
            id="preferredName"
            name="preferredName"
            value={formData.preferredName}
            onChange={handleInputChange}
            placeholder="e.g. John"
            required
          />
          <i className="fas fa-user-tag input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="studentId">Student ID *</label>
          <input
            type="text"
            id="studentId"
            name="studentId"
            value={formData.studentId}
            onChange={handleInputChange}
            placeholder="e.g. 20123456"
            required
          />
          <i className="fas fa-id-card input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="yearOfStudy">Year of Study *</label>
          <select
            id="yearOfStudy"
            name="yearOfStudy"
            value={formData.yearOfStudy}
            onChange={handleInputChange}
            required
          >
            <option value="">Select Year</option>
            <option value="1">Year 1</option>
            <option value="2">Year 2</option>
            <option value="3">Year 3</option>
            <option value="4">Year 4</option>
            <option value="5">Year 5</option>
          </select>
          <i className="fas fa-graduation-cap input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="major">Major *</label>
          <select
            id="major"
            name="major"
            value={formData.major}
            onChange={handleInputChange}
            required
          >
            <option value="">Select Major</option>
            <option value="QFIN">Quantitative Finance (QFIN)</option>
            <option value="FINA">Finance (FINA)</option>
            <option value="SGFN">Sustainable and Green Finance (SGFN)</option>
          </select>
          <i className="fas fa-book input-icon"></i>
        </div>

        <div className="input-group">
          <label htmlFor="contactNumber">Contact Number *</label>
          <input
            type="tel"
            id="contactNumber"
            name="contactNumber"
            value={formData.contactNumber}
            onChange={handleInputChange}
            placeholder="e.g. +852 1234 5678"
            required
          />
          <i className="fas fa-phone input-icon"></i>
        </div>

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Creating profile...' : 'Enter portal'}
        </button>

        <div className="signup-link">
          <small>All fields are required to access the platform</small>
        </div>
      </form>
    </PortalAuthShell>
  );
}

export default ProfileCompletion;
