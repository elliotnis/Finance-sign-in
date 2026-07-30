import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DepartmentBrand from './DepartmentBrand';
import '../styles/dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

function PeopleDirectory() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [program, setProgram] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProfiles = async () => {
    const viewerEmail = localStorage.getItem('user_email');
    if (!viewerEmail) {
      navigate('/login');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const url = new URL(`${API_URL}/profiles/directory`, window.location.origin);
      url.searchParams.set('viewer_email', viewerEmail);
      url.searchParams.set('q', query);
      if (program) url.searchParams.set('program', program);
      const response = await fetch(url);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not load the People directory.');
      setProfiles(data.profiles || []);
    } catch (err) {
      setProfiles([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfiles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <DepartmentBrand subtitle="People" />
          <button className="logout-btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="dashboard-content">
          <h1>People directory</h1>
          <p className="subtitle">Search biographies and credentials that students have explicitly made public.</p>
          <form className="form-row" onSubmit={(event) => { event.preventDefault(); loadProfiles(); }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, programme, biography or credential" />
            <select value={program} onChange={(event) => setProgram(event.target.value)}>
              <option value="">All programmes</option>
              <option value="FINA">FINA</option>
              <option value="QFIN">QFIN</option>
              <option value="SGFN">SGFN</option>
            </select>
            <button className="primary-btn" type="submit">Search</button>
          </form>
          {error && <p className="error-message">{error}</p>}
          {loading ? <p>Loading public biographies…</p> : profiles.length === 0 ? <p>No public biographies match that search.</p> : (
            <div className="classes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
              {profiles.map((profile) => (
                <article className="modal-card" key={`${profile.full_name}-${profile.major}`}>
                  <h2>{profile.preferred_name || profile.full_name}</h2>
                  <p><strong>{profile.major || 'Finance'} · </strong>{profile.graduation_year ? `Class of ${profile.graduation_year}` : profile.study_year ? `Year ${profile.study_year}` : ''}</p>
                  <p>{profile.biography}</p>
                  {profile.credentials?.length > 0 && <ul>{profile.credentials.map((credential) => <li key={credential}>{credential}</li>)}</ul>}
                  {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noreferrer">Open LinkedIn</a>}
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default PeopleDirectory;
