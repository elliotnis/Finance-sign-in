import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

const STARTER_QUESTIONS = [
  'How do I complete my profile?',
  'How do I find a class or tutoring session?',
  'How can I make my biography public?',
];

function SignupAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async (value = question) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/help/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'The assistant is unavailable right now.');
      setAnswer(data.answer || 'I do not have an answer for that yet.');
      setSources(data.sources || []);
    } catch (err) {
      setAnswer('');
      setSources([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className={`signup-assistant ${open ? 'is-open' : ''}`} aria-label="Sign-up assistant">
      {open && (
        <div className="signup-assistant-panel">
          <div className="signup-assistant-heading">
            <div>
              <span className="signup-assistant-kicker">Portal guide</span>
              <h2>Need a hand?</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
          </div>
          <p className="signup-assistant-intro">Ask about sign-up, profiles, sessions, classes, or LinkedIn discovery.</p>
          <div className="signup-assistant-starters">
            {STARTER_QUESTIONS.map((starter) => (
              <button type="button" key={starter} onClick={() => ask(starter)}>{starter}</button>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); ask(); }} className="signup-assistant-form">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question" aria-label="Ask the sign-up assistant" />
            <button type="submit" disabled={loading}>{loading ? '…' : 'Ask'}</button>
          </form>
          {error && <p className="signup-assistant-error">{error}</p>}
          {answer && (
            <div className="signup-assistant-answer">
              <p>{answer}</p>
              {sources.length > 0 && <small>Based on: {sources.map((source) => source.title).join(', ')}</small>}
            </div>
          )}
        </div>
      )}
      {!open && <button type="button" className="signup-assistant-launcher" onClick={() => setOpen(true)}><span aria-hidden="true">✦</span> Help</button>}
    </aside>
  );
}

export default SignupAssistant;
