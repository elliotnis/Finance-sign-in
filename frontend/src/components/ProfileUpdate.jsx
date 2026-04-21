import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authcontext';
import '../styles/auth.css';

function ProfileUpdate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    fullName: '',
    preferredName: '',
    yearOfStudy: '',
    major: '',
    contactNumber: '',
    studentId: '',
    profileEmail: '',
    profilePicture: null
  });
  const [currentProfile, setCurrentProfile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [profileImagePreview, setProfileImagePreview] = useState(null);

  // Get user email from localStorage or auth context
  const userEmail = user?.email || localStorage.getItem('email');

  useEffect(() => {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    fetchCurrentProfile();
  }, [userEmail, navigate]);

  const fetchCurrentProfile = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/profile/${encodeURIComponent(userEmail)}`);
      
      if (response.ok) {
        const profileData = await response.json();
        setCurrentProfile(profileData);
        setFormData({
          fullName: profileData.full_name || '',
          preferredName: profileData.preferred_name || '',
          yearOfStudy: profileData.study_year || '',
          major: profileData.major || '',
          contactNumber: profileData.contact_phone || '',
          studentId: profileData.SID || '',
          profileEmail: profileData.personal_email || '',
          profilePicture: profileData.profile_picture || null
        });
        
        // Set profile image preview if exists
        if (profileData.profile_picture) {
          setProfileImagePreview(profileData.profile_picture);
        }
      } else if (response.status === 404) {
        // Profile doesn't exist yet, user needs to complete it first
        setError('Profile not found. Please complete your profile first.');
        setTimeout(() => navigate('/complete-profile'), 2000);
      }
    } catch (err) {
      setError('Failed to fetch profile data');
    } finally {
      setFetchingProfile(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      
      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        setError('File size must be less than 5MB');
        return;
      }

      // Create image preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64String = e.target.result;
        setProfileImagePreview(base64String);
        setFormData(prev => ({
          ...prev,
          profilePicture: base64String
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      // Create profile update data
      const profileUpdateData = {
        full_name: formData.fullName,
        preferred_name: formData.preferredName,
        SID: formData.studentId,
        study_year: formData.yearOfStudy,
        major: formData.major,
        contact_phone: formData.contactNumber,
        profile_email: formData.profileEmail,
        profile_picture: formData.profilePicture
      };

      const response = await fetch(`${API_URL}/profile/${encodeURIComponent(userEmail)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileUpdateData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Profile update failed');
      }

      // Update username in localStorage if preferred name changed
      if (formData.preferredName !== currentProfile?.preferred_name) {
        localStorage.setItem('username', formData.preferredName || formData.fullName);
      }

      setSuccess('Profile updated successfully!');
      setCurrentProfile({
        ...currentProfile,
        full_name: formData.fullName,
        preferred_name: formData.preferredName,
        study_year: formData.yearOfStudy,
        major: formData.major,
        contact_phone: formData.contactNumber,
        SID: formData.studentId,
        personal_email: formData.profileEmail
      });

      // Redirect to dashboard after successful update
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProfile) {
    return (
      <div className="container">
        <div className="login-form">
          <div className="logo-container">
            <div className="logo-text">
              <h1>HKUST</h1>
              <span>Finance Department Portal</span>
            </div>
          </div>
          <h2>Loading Profile...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="logo-container">
          <div className="logo-text">
            <h1>HKUST</h1>
            <span>Finance Department Portal</span>
          </div>
        </div>

        <h2>Update Your Profile</h2>
        <p className="subtitle">Modify your profile information below</p>
        
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        {/* Profile Picture Upload */}
        <div className="input-group profile-picture-section">
          <label htmlFor="profilePicture">Profile Picture</label>
          <div className="profile-picture-container">
            <div className="profile-picture-preview">
              {profileImagePreview ? (
                <img 
                  src={profileImagePreview} 
                  alt="Profile Preview" 
                  className="profile-picture-circle"
                />
              ) : (
                <div className="profile-picture-placeholder">
                  <i className="fas fa-user"></i>
                </div>
              )}
            </div>
            <input
              type="file"
              id="profilePicture"
              name="profilePicture"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="profilePicture" className="profile-picture-upload-btn">
              <i className="fas fa-camera"></i> Choose Photo
            </label>
          </div>
          <small>Upload a new profile picture (JPG, PNG, max 5MB)</small>
        </div>

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

        <div className="input-group">
          <label htmlFor="profileEmail">Personal Email *</label>
          <input
            type="email"
            id="profileEmail"
            name="profileEmail"
            value={formData.profileEmail}
            onChange={handleInputChange}
            placeholder="e.g. john.smith@gmail.com"
            required
          />
          <i className="fas fa-envelope input-icon"></i>
          <small>This can be different from your HKUST login email</small>
        </div>

        <div className="input-group">
          <label>Registration Email (Cannot be changed)</label>
          <input
            type="email"
            value={userEmail}
            disabled
            style={{ backgroundColor: '#f5f5f5', color: '#666' }}
          />
          <i className="fas fa-lock input-icon"></i>
        </div>

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Updating Profile...' : 'Update Profile'}
        </button>

        <div className="signup-link">
          <button 
            type="button" 
            onClick={() => navigate('/dashboard')}
            className="back-btn"
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#0066cc', 
              textDecoration: 'underline',
              cursor: 'pointer' 
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </form>
    </div>
  );
}

export default ProfileUpdate;