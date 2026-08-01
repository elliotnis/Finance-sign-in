import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import LoginForm from './components/LoginForm'
import SignupForm from './components/SignupForm'
import ProfileCompletion from './components/ProfileCompletion'
import ProfileUpdate from './components/ProfileUpdate'
import Dashboard from './components/dashboard'
import MySessions from './components/MySessions';
import TutorCalendar from './components/TutorCalendar';
import RegisterSession from './components/RegisterSession';
import ClassesCalendar from './components/ClassesCalendar';
import Verification from './components/Verification';
import DatabaseManager from './components/DatabaseManager';
import YouthFinancetopiaPortal, { YouthFinancetopiaGamemasterPortal } from './components/YouthFinancetopiaPortal';
import BookingsCalendar from './components/BookingsCalendar';
import PeopleDirectory from './components/PeopleDirectory';
import SignupAssistant from './components/SignupAssistant';
import { AuthProvider } from './contexts/authcontext';
import './App.css'
import './styles/mobile.css'
import './styles/portalDesign.css'

const isYouthFinancetopiaBuild = import.meta.env.VITE_APP_AUDIENCE === 'youth-financetopia';

function AssistantHighlight() {
  const location = useLocation();

  useEffect(() => {
    const target = new URLSearchParams(location.search).get('assistant_highlight')?.trim().toLowerCase();
    if (!target) return undefined;

    let timeoutId;
    let attempts = 0;
    const findAndHighlight = () => {
      attempts += 1;
      const candidates = document.querySelectorAll(
        'main button, main a, main h1, main h2, main h3, main [role="button"], main [data-assistant-anchor]',
      );
      const match = Array.from(candidates).find((element) => {
        const text = (element.textContent || '').trim().toLowerCase();
        return text === target || text.includes(target);
      });
      if (match) {
        match.classList.add('assistant-highlight-target');
        match.scrollIntoView({ behavior: 'smooth', block: 'center' });
        timeoutId = window.setTimeout(() => match.classList.remove('assistant-highlight-target'), 4200);
        return;
      }
      if (attempts < 8) timeoutId = window.setTimeout(findAndHighlight, 250);
    };

    findAndHighlight();
    return () => window.clearTimeout(timeoutId);
  }, [location.pathname, location.search]);

  return null;
}

function YouthFinancetopiaApp() {
  return (
    <Router>
      <Routes>
        <Route path="/youth-financetopia" element={<YouthFinancetopiaPortal />} />
        <Route path="/youth-financetopia/player" element={<YouthFinancetopiaPortal />} />
        <Route path="/youth-financetopia/gamemaster" element={<YouthFinancetopiaGamemasterPortal />} />
        <Route path="*" element={<Navigate to="/youth-financetopia" replace />} />
      </Routes>
      <AssistantHighlight />
      <SignupAssistant />
    </Router>
  );
}

function StudentPortalApp() {
  return (
  <AuthProvider>
    <Router>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/signup" element={<SignupForm />} />
        <Route path="/complete-profile" element={<ProfileCompletion />} />
        <Route path="/profile" element={<ProfileUpdate />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sessions" element={< MySessions />} />
        <Route path="/tutor-calendar" element={<TutorCalendar />} />
        <Route path="/register-session" element={<RegisterSession />} />
        <Route path="/calendar" element={<BookingsCalendar />} />
        <Route path="/classes" element={<ClassesCalendar />} />
        <Route path="/directory" element={<PeopleDirectory />} />
        <Route path="/verification" element={<Verification />} />
        <Route path="/database" element={<DatabaseManager />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <AssistantHighlight />
      <SignupAssistant />
    </Router>
  </AuthProvider>
  )
}

function App() {
  return isYouthFinancetopiaBuild ? <YouthFinancetopiaApp /> : <StudentPortalApp />;
}

export default App
