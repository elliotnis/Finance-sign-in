import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/signupAssistant.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '/api');
const STORAGE_KEY = 'portal_assistant_state_v2';
const DEFAULT_POSITION = { right: 24, bottom: 24 };
const DEFAULT_SIZE = { width: 440, height: 560 };

const STARTER_QUESTIONS = [
  'How do I complete my profile?',
  'Find tutoring sessions this week',
  'What classes are available?',
];

const DEFAULT_STATE = {
  open: false,
  position: DEFAULT_POSITION,
  size: DEFAULT_SIZE,
  messages: [],
};

function readStoredState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...DEFAULT_STATE,
      ...parsed,
      position: { ...DEFAULT_POSITION, ...(parsed.position || {}) },
      size: { ...DEFAULT_SIZE, ...(parsed.size || {}) },
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

function getSizeLimits() {
  const viewport = getViewportSize();
  return {
    widthMin: 280,
    widthMax: Math.max(280, Math.min(560, viewport.width - 16)),
    heightMin: 320,
    heightMax: Math.max(320, Math.min(760, viewport.height - 32)),
  };
}

function clampSize(size) {
  const limits = getSizeLimits();
  return {
    width: Math.round(clamp(Number(size?.width) || DEFAULT_SIZE.width, limits.widthMin, limits.widthMax)),
    height: Math.round(clamp(Number(size?.height) || DEFAULT_SIZE.height, limits.heightMin, limits.heightMax)),
  };
}

function splitTableCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableCells(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

function isTableRow(line) {
  return line.includes('|') && splitTableCells(line).length >= 2;
}

function renderInline(text, keyPrefix) {
  return String(text).split(/(\*\*.*?\*\*|`.*?`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-bold-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${keyPrefix}-code-${index}`}>{part.slice(1, -1)}</code>;
    }
    return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
  });
}

function AssistantRichContent({ content }) {
  const lines = String(content || '').split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (isTableRow(line) && isTableSeparator(lines[index + 1] || '')) {
      const header = splitTableCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(splitTableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="signup-assistant-table-wrap" key={`table-${index}`}>
          <table className="signup-assistant-table">
            <thead>
              <tr>{header.map((cell, cellIndex) => <th key={`head-${cellIndex}`}>{renderInline(cell, `head-${cellIndex}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {header.map((_, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`}>{renderInline(row[cellIndex] || '—', `cell-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul className="signup-assistant-list" key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`item-${itemIndex}`}>{renderInline(item, `item-${itemIndex}`)}</li>)}
        </ul>,
      );
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isTableRow(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join('\n'), `paragraph-${index}`)}</p>);
  }

  return <div className="signup-assistant-rich-text">{blocks}</div>;
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
  const resizeRef = useRef(null);
  const logRef = useRef(null);
  const assistantRef = useRef(null);
  const panelRef = useRef(null);

  const { open, position, size, messages } = state;
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
      const nextSize = clampSize(size);
      const rect = assistantRef.current?.getBoundingClientRect();
      const width = rect?.width || 368;
      const height = rect?.height || 580;
      const limits = getPositionLimits(width, height);
      setState((current) => {
        const nextPosition = {
          right: clamp(current.position.right, limits.rightMin, limits.rightMax),
          bottom: clamp(current.position.bottom, limits.bottomMin, limits.bottomMax),
        };
        if (
          current.size.width === nextSize.width
          && current.size.height === nextSize.height
          && current.position.right === nextPosition.right
          && current.position.bottom === nextPosition.bottom
        ) return current;
        return { ...current, size: nextSize, position: nextPosition };
      });
    };
    keepOnScreen();
    window.addEventListener('resize', keepOnScreen);
    return () => window.removeEventListener('resize', keepOnScreen);
  }, [open, size]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const nextSize = clampSize({ width: panel.offsetWidth, height: panel.offsetHeight });
      setState((current) => {
        if (current.size.width === nextSize.width && current.size.height === nextSize.height) return current;
        return { ...current, size: nextSize };
      });
    });
    observer.observe(panel);
    return () => observer.disconnect();
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

  const startResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveResize = (event) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextSize = clampSize({
      width: resize.startWidth + (event.clientX - resize.startX),
      height: resize.startHeight + (event.clientY - resize.startY),
    });
    setState((current) => ({ ...current, size: nextSize }));
  };

  const endResize = (event) => {
    if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    resizeRef.current = null;
  };

  const resizeWithKeyboard = (event) => {
    const step = event.shiftKey ? 40 : 16;
    let widthDelta = 0;
    let heightDelta = 0;
    if (event.key === 'ArrowRight') widthDelta = step;
    if (event.key === 'ArrowLeft') widthDelta = -step;
    if (event.key === 'ArrowDown') heightDelta = step;
    if (event.key === 'ArrowUp') heightDelta = -step;
    if (!widthDelta && !heightDelta) return;
    event.preventDefault();
    setState((current) => ({
      ...current,
      size: clampSize({ width: current.size.width + widthDelta, height: current.size.height + heightDelta }),
    }));
  };

  const toggleFromLauncher = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen(!open);
  };

  const handleAction = (action) => {
    if (!action?.path) return;
    const params = new URLSearchParams(action.query || {});
    if (action.type === 'highlight' && action.target) {
      params.set('assistant_highlight', action.target);
    }
    const query = params.toString();
    navigate(`${action.path}${query ? `?${query}` : ''}`);
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
        <section
          ref={panelRef}
          className="signup-assistant-panel"
          aria-label="FINA portal assistant panel"
          style={{ width: `${size.width}px`, height: `${size.height}px` }}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        >
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
                <AssistantRichContent content={message.content} />
                {message.sources?.length > 0 && (
                  <small>Guide: {message.sources.map((source) => source.title).join(' · ')}</small>
                )}
                {message.actions?.map((action) => (
                  <button
                    type="button"
                    className="signup-assistant-action"
                    key={`${message.id}-${action.path}`}
                    onClick={() => handleAction(action)}
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
            Drag the header or launcher to move me. Resize from the lower-right grip.
          </p>
          <button
            type="button"
            className="signup-assistant-resize-handle"
            aria-label="Resize portal assistant"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onKeyDown={resizeWithKeyboard}
          />
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
