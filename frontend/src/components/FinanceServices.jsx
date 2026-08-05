import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DepartmentBrand from './DepartmentBrand';
import '../styles/dashboard.css';
import '../styles/financeServices.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

function FinanceServices() {
  const navigate = useNavigate();
  const email = (localStorage.getItem('user_email') || '').toLowerCase();
  const [tab, setTab] = useState('resume');
  const [isAdmin, setIsAdmin] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [resume, setResume] = useState({ student_email: email, headline: '', education: '', experience: '', skills: '', certifications: '', cv_text: '', cv_file_name: '', status: 'draft' });
  const [polished, setPolished] = useState('');
  const [card, setCard] = useState({ student_email: email, name: '', title: '', programme: 'FINA', email, phone: '', linkedin_url: '', quantity: 1 });
  const [merch, setMerch] = useState({ student_email: email, item: 'FINA hoodie', size: 'M', quantity: 1, notes: '' });
  const [eventId, setEventId] = useState('');
  const [eventResponse, setEventResponse] = useState('yes');
  const [importText, setImportText] = useState('');

  const setField = (setter, name) => (event) => setter((current) => ({ ...current, [name]: event.target.value }));
  const csvList = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

  useEffect(() => {
    if (!localStorage.getItem('user_id')) {
      navigate('/login');
      return;
    }
    fetch(`${API_URL}/me/role?email=${encodeURIComponent(email)}`)
      .then((response) => response.json())
      .then((data) => setIsAdmin(Boolean(data.is_admin)))
      .catch(() => setIsAdmin(false));
    fetch(`${API_URL}/resume-book/student/${encodeURIComponent(email)}`)
      .then((response) => (response.ok ? response.json() : { entry: null }))
      .then((data) => {
        if (data.entry) setResume((current) => ({ ...current, ...data.entry, skills: (data.entry.skills || []).join(', '), certifications: (data.entry.certifications || []).join(', ') }));
      })
      .catch(() => {});
    const today = new Date();
    const future = new Date(today);
    future.setMonth(today.getMonth() + 6);
    const ymd = (date) => date.toISOString().slice(0, 10);
    fetch(`${API_URL}/classes?date_from=${ymd(today)}&date_to=${ymd(future)}&viewer_email=${encodeURIComponent(email)}`)
      .then((response) => (response.ok ? response.json() : { classes: [] }))
      .then((data) => setEvents(data.classes || []))
      .catch(() => setEvents([]));
  }, [email, navigate]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === eventId), [events, eventId]);

  async function request(path, options) {
    setError('');
    setNotice('');
    const response = await fetch(`${API_URL}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'The request could not be completed.');
    return data;
  }

  async function saveResume(event) {
    event.preventDefault();
    try {
      const data = await request('/resume-book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...resume, skills: csvList(resume.skills), certifications: csvList(resume.certifications), student_email: email }) });
      setResume((current) => ({ ...current, ...data.entry, status: data.entry.status }));
      setNotice('Resume saved. You can keep editing until you submit it.');
    } catch (err) { setError(err.message); }
  }

  async function polishResume() {
    try {
      const data = await request('/resume-book/polish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...resume, student_email: email, skills: csvList(resume.skills), certifications: csvList(resume.certifications) }) });
      setPolished(data.polished_text);
    } catch (err) { setError(err.message); }
  }

  async function orderCard(event) {
    event.preventDefault();
    try { await request('/business-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...card, student_email: email, quantity: Number(card.quantity) }) }); setNotice('Business-card order saved. Admin will confirm payment and production.'); }
    catch (err) { setError(err.message); }
  }

  async function respondToEvent(event) {
    event.preventDefault();
    if (!eventId) { setError('Choose an event first.'); return; }
    try { await request('/event-registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, student_email: email, response: eventResponse }) }); setNotice(`Your response for ${selectedEvent?.title || 'the event'} was saved.`); }
    catch (err) { setError(err.message); }
  }

  async function orderMerch(event) {
    event.preventDefault();
    try { await request('/merchandise/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...merch, student_email: email, quantity: Number(merch.quantity) }) }); setNotice('Merchandise request submitted. Admin will confirm stock and payment.'); }
    catch (err) { setError(err.message); }
  }

  async function importStudents(event) {
    event.preventDefault();
    try { const data = await request(`/resume-book/import?admin_email=${encodeURIComponent(email)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: importText }) }); setNotice(`${data.added} student record(s) added to the resume book.`); setImportText(''); }
    catch (err) { setError(err.message); }
  }

  function handleCvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setResume((current) => ({ ...current, cv_file_name: file.name, cv_text: String(reader.result || '') }));
    reader.readAsText(file);
  }

  return (
    <div className="dashboard-container finance-services-page">
      <header className="dashboard-header"><div className="header-content"><DepartmentBrand subtitle="Finance Student Services" /><div className="user-section"><div className="user-info"><span className="user-name">Finance services</span><span className="user-role">{email}</span></div><button className="logout-btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button></div></div></header>
      <main className="dashboard-main finance-services-main">
        <div className="finance-services-intro"><p className="section-kicker">HKUST FINA · QFIN</p><h1>Student services</h1><p>Build a polished public profile, prepare the Resume Book, and submit your event and merchandise requests in one place.</p></div>
        <nav className="finance-services-tabs" aria-label="Student services">
          {[['resume', 'Resume Book'], ['card', 'Business Cards'], ['events', 'Event response'], ['merch', 'FINA merchandise']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setNotice(''); setError(''); }}>{label}</button>)}
        </nav>
        {notice && <div className="service-notice">{notice}</div>}
        {error && <div className="service-error">{error}</div>}

        {tab === 'resume' && <section className="service-grid"><form className="service-card service-form" onSubmit={saveResume}><div className="service-card-heading"><div><span className="section-kicker">Resume Book</span><h2>Your entry</h2></div><span className={`status-pill status-${resume.status}`}>{resume.status}</span></div><label>Headline<input value={resume.headline} onChange={setField(setResume, 'headline')} placeholder="QFIN student focused on fintech" /></label><label>Education<textarea value={resume.education} onChange={setField(setResume, 'education')} rows="2" placeholder="BSc in ..." /></label><label>Experience<textarea value={resume.experience} onChange={setField(setResume, 'experience')} rows="4" placeholder="Internships, projects, leadership" /></label><label>Skills<input value={resume.skills} onChange={setField(setResume, 'skills')} placeholder="Python, valuation, Bloomberg" /></label><label>Certifications<input value={resume.certifications} onChange={setField(setResume, 'certifications')} placeholder="CFA Level I" /></label><label>Upload a text CV (optional)<input type="file" accept=".txt,.md,.csv" onChange={handleCvFile} /></label>{resume.cv_file_name && <small>Attached: {resume.cv_file_name}</small>}<div className="service-actions"><button type="submit" className="primary-btn">Save draft</button><button type="button" className="secondary-btn" onClick={polishResume}>AI polish preview</button></div></form><div className="service-card resume-preview"><div className="service-card-heading"><div><span className="section-kicker">Preview</span><h2>{resume.headline || 'Your professional headline'}</h2></div></div><p>{resume.education || 'Add your education and programme.'}</p><p>{resume.experience || 'Add your experience, projects, or society roles.'}</p><p><strong>Skills:</strong> {resume.skills || '—'}</p><p><strong>Credentials:</strong> {resume.certifications || '—'}</p>{polished && <div className="polish-preview"><strong>AI suggestion (review before accepting)</strong><p>{polished}</p><button type="button" className="secondary-btn" onClick={() => setResume((current) => ({ ...current, cv_text: polished }))}>Accept suggestion</button><button type="button" className="text-btn" onClick={() => setPolished('')}>Disregard</button></div>}{isAdmin && <div className="admin-service-tools"><h3>Admin intake</h3><p>Paste a CSV with a <code>student_email</code> column to create draft rows.</p><form onSubmit={importStudents}><textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows="4" placeholder="student_email\nstudent@example.com" /><button type="submit" className="secondary-btn">Import list</button></form><a className="text-btn" href={`${API_URL}/resume-book/export.csv?admin_email=${encodeURIComponent(email)}`}>Download CSV export</a></div>}</div></section>}

        {tab === 'card' && <section className="service-grid"><form className="service-card service-form" onSubmit={orderCard}><div className="service-card-heading"><div><span className="section-kicker">Business cards</span><h2>Create an order</h2></div></div><label>Name<input value={card.name} onChange={setField(setCard, 'name')} required /></label><label>Title / role<input value={card.title} onChange={setField(setCard, 'title')} placeholder="Finance Student" /></label><label>Programme<select value={card.programme} onChange={setField(setCard, 'programme')}><option>FINA</option><option>QFIN</option></select></label><label>Card email<input type="email" value={card.email} onChange={setField(setCard, 'email')} required /></label><label>Phone<input value={card.phone} onChange={setField(setCard, 'phone')} /></label><label>LinkedIn URL<input type="url" value={card.linkedin_url} onChange={setField(setCard, 'linkedin_url')} /></label><label>Quantity<input type="number" min="1" max="50" value={card.quantity} onChange={setField(setCard, 'quantity')} /></label><button className="primary-btn" type="submit">Save order</button></form><div className="service-card business-card-preview"><span className="section-kicker">Preview</span><div className="business-card-mark">HKUST<br />FINA</div><h2>{card.name || 'Your name'}</h2><p>{card.title || 'Finance Student'} · {card.programme}</p><p>{card.email || email}</p><p>{card.phone || 'Phone number'}</p><p>{card.linkedin_url || 'LinkedIn URL'}</p><small>Payment link is added by admin after the design is approved.</small></div></section>}

        {tab === 'events' && <section className="service-grid"><form className="service-card service-form" onSubmit={respondToEvent}><div className="service-card-heading"><div><span className="section-kicker">Simple registration</span><h2>Respond to an event</h2></div></div><label>Event<select value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Choose an event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.date} · {event.title}</option>)}</select></label><label>Your response<select value={eventResponse} onChange={(event) => setEventResponse(event.target.value)}><option value="yes">Yes, I will attend</option><option value="no">No, I cannot attend</option><option value="withdraw">Withdraw response</option></select></label><button className="primary-btn" type="submit">Save response</button></form><div className="service-card"><span className="section-kicker">Event details</span><h2>{selectedEvent?.title || 'Choose an event'}</h2><p>{selectedEvent ? `${selectedEvent.date} · ${selectedEvent.time_slot} · ${selectedEvent.location}` : 'Your response is stored as a simple yes/no poll and can be withdrawn at any time.'}</p><button className="secondary-btn" onClick={() => navigate('/classes')}>Browse all events</button></div></section>}

        {tab === 'merch' && <section className="service-grid"><form className="service-card service-form" onSubmit={orderMerch}><div className="service-card-heading"><div><span className="section-kicker">HKUST FINA merchandise</span><h2>Request an item</h2></div></div><label>Item<select value={merch.item} onChange={setField(setMerch, 'item')}><option>FINA hoodie</option><option>FINA jacket</option><option>HKUST mascot item</option><option>Other FINA merchandise</option></select></label><label>Size<select value={merch.size} onChange={setField(setMerch, 'size')}><option>XS</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>One size</option></select></label><label>Quantity<input type="number" min="1" max="20" value={merch.quantity} onChange={setField(setMerch, 'quantity')} /></label><label>Notes<textarea value={merch.notes} onChange={setField(setMerch, 'notes')} rows="3" placeholder="Colour or collection details" /></label><button className="primary-btn" type="submit">Submit request</button></form><div className="service-card"><span className="section-kicker">Next step</span><h2>Payment and collection</h2><p>Your request is saved for the FINA admin team. They will confirm stock, add a payment link, and tell you where to collect it.</p></div></section>}
      </main>
    </div>
  );
}

export default FinanceServices;
