import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/signupAssistant.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');
const STORAGE_KEY = 'portal_assistant_state_v2';
const DEFAULT_POSITION = { right: 24, bottom: 24 };

const STARTER_QUESTIONS = [
  'How do I complete my profile?',
  'Find tutoring sessions this week',
  'What classes are available?',
];

const DEFAULT_STATE = {
  open: false,
  position: DEFAULT_POSITION,
  messages: [],
};

function readStoredState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...DEFAULT_STATE,
      ...parsed,
      position: { ...DEFAULT_POSITION, ...(parsed.position || {}) },
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-20) : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function getViewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

function getPositionLimits(width, height) {
  const viewport = getViewportSize();
  const rightMax = Math.max(0, viewport.width - width - 8);
  const bottomMax = Math.max(0, viewport.height - height - 8);
  return {
    rightMin: Math.min(8, rightMax),
    rightMax,
    bottomMin: Math.min(8, bottomMax),
    bottomMax,
  };
}

function getApiUrl(path) {
  return new URL(`${API_URL}${path}`, window.location.origin).toString();
}

function SignupAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState(readStoredState);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const logRef = useRef(null);
  const assistantRef = useRef(null);

  const { open, position, messages } = state;
  const currentPath = useMemo(() => location.pathname, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The assistant remains usable when browser storage is unavailable.
    }
  }, [state]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const keepOnScreen = () => {
      const rect = assistantRef.current?.getBoundingClientRect();
      const width = rect?.width || 368;
      const height = rect?.height || 580;
      const limits = getPositionLimits(width, height);
      setState((current) => ({
        ...current,
        position: {
          right: clamp(current.position.right, limits.rightMin, limits.rightMax),
          bottom: clamp(current.position.bottom, limits.bottomMin, limits.bottomMax),
        },
      }));
    };
    keepOnScreen();
    window.addEventListener('resize', keepOnScreen);
    return () => window.removeEventListener('resize', keepOnScreen);
  }, [open]);

  const setOpen = (nextOpen) => setState((current) => ({ ...current, open: nextOpen }));

  const startDrag = (event) => {
    if (event.button !== 0) return;
    const rect = assistantRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: position.right,
      startBottom: position.bottom,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.moved = true;
    if (!drag.moved) return;
    const rect = assistantRef.current?.getBoundingClientRect();
    const width = rect?.width || 368;
    const height = rect?.height || 580;
    const limits = getPositionLimits(width, height);
    setState((current) => ({
      ...current,
      position: {
        right: clamp(drag.startRight - deltaX, limits.rightMin, limits.rightMax),
        bottom: clamp(drag.startBottom - deltaY, limits.bottomMin, limits.bottomMax),
      },
    }));
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
  };

  const toggleFromLauncher = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen(!open);
  };

  const ask = async (value = question) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    const userMessage = { role: 'user', content: trimmed, id: `user-${Date.now()}` };
    setQuestion('');
    setError('');
    setLoading(true);
    setState((current) => ({ ...current, open: true, messages: [...current.messages, userMessage].slice(-20) }));
    try {
      let userEmail = null;
      try {
        userEmail = localStorage.getItem('user_email') || null;
      } catch {
        // Continue without optional identity context when storage is unavailable.
      }
      const response = await fetch(getApiUrl('/help/ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          history,
          user_email: userEmail,
          context_path: currentPath,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'The assistant is unavailable right now.');
      const assistantMessage = {
        role: 'assistant',
        content: data.answer || 'I do not have an answer for that yet.',
        sources: data.sources || [],
        actions: data.actions || [],
        provider: data.provider,
        id: `assistant-${Date.now()}`,
      };
      setState((current) => ({ ...current, messages: [...current.messages, assistantMessage].slice(-20) }));
    } catch (err) {
      setError(err.message || 'The assistant is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      ref={assistantRef}
      className={`signup-assistant ${open ? 'is-open' : 'is-minimized'}`}
      aria-label="FINA portal assistant"
      data-testid="signup-assistant"
      style={{ right: `${position.right}px`, bottom: `${position.bottom}px` }}
    >
      {open && (
        <section className="signup-assistant-panel" aria-label="FINA portal assistant panel">
          <div
            className="signup-assistant-heading"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="signup-assistant-brand">
              <span className="signup-assistant-mark" aria-hidden="true">✦</span>
              <div>
                <span className="signup-assistant-kicker">FINA portal guide</span>
                <h2>Ask for a hand</h2>
              </div>
            </div>
            <button
              type="button"
              className="signup-assistant-minimize"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setOpen(false)}
              aria-label="Minimize assistant"
            >
              <span aria-hidden="true">—</span>
            </button>
          </div>

          <p className="signup-assistant-intro">Ask about profiles, classes, tutoring, or finding public credentials.</p>

          <div className="signup-assistant-log" ref={logRef} role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="signup-assistant-empty">
                <strong>What can I help you arrange?</strong>
                <span>I can look up real classes and open tutoring slots from the portal.</span>
              </div>
            )}
            {messages.map((message) => (
              <div className={`signup-assistant-message is-${message.role}`} key={message.id}>
                <p>{message.content}</p>
                {message.sources?.length > 0 && (
                  <small>Guide: {message.sources.map((source) => source.title).join(' · ')}</small>
                )}
                {message.actions?.map((action) => (
                  <button
                    type="button"
                    className="signup-assistant-action"
                    key={`${message.id}-${action.path}`}
                    onClick={() => navigate(action.path)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ))}
            {loading && <div className="signup-assistant-message is-assistant is-loading"><span>Checking the portal…</span></div>}
          </div>

          <div className="signup-assistant-starters">
            {STARTER_QUESTIONS.map((starter) => (
              <button type="button" key={starter} onClick={() => ask(starter)} disabled={loading}>{starter}</button>
            ))}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); ask(); }} className="signup-assistant-form">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask the portal guide"
              aria-label="Ask the portal assistant"
            />
            <button type="submit" disabled={loading || !question.trim()}>{loading ? '…' : 'Ask'}</button>
          </form>
          {error && <p className="signup-assistant-error" role="alert">{error}</p>}

          <p
            className="signup-assistant-drag-hint"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            Drag this header or the launcher to move me.
          </p>
        </section>
      )}
      <button
        type="button"
        className="signup-assistant-launcher"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={toggleFromLauncher}
        aria-expanded={open}
        aria-label={open ? 'Minimize portal assistant' : 'Open portal assistant'}
      >
        <span className="signup-assistant-launcher-icon" aria-hidden="true">✦</span>
        <span>Portal guide</span>
      </button>
    </aside>
  );
}

export default SignupAssistant;
