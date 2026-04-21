import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import '../styles/auth.css';

function ProfileCompletion() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  // Try to get from location state first, then sessionStorage
  const locationState = location.state || {};
  const sessionData = JSON.parse(sessionStorage.getItem('pendingProfile') || '{}');
  
  const userEmail = locationState.email || sessionData.email || '';
  const userId = locationState.userId;

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
    studentId: ''
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
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      // Create profile data according to backend schema
      const profileData = {
        login_email: userEmail,
        full_name: formData.fullName,
        preferred_name: formData.preferredName,
        SID: formData.studentId,
        study_year: formData.yearOfStudy,
        major: formData.major,
        contact_phone: formData.contactNumber,
        profile_email: userEmail // Using the same email for profile
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
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

        <h2>Complete Your Profile</h2>
        <p className="subtitle">Please fill in your details to complete your account setup</p>
        
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
          {loading ? 'Creating Profile...' : 'Complete Profile'}
        </button>

        <div className="signup-link">
          <small>All fields are required to access the platform</small>
        </div>
      </form>
    </div>
  );
}

export default ProfileCompletion;