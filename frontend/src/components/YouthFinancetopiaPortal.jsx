import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../styles/youthFinancetopiaPortal.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PLAYER_SESSION_TOKEN_KEY = 'yf_player_session_token';
const PLAYER_SESSION_EMAIL_KEY = 'yf_player_session_email';
const GAMEMASTER_SESSION_TOKEN_KEY = 'yf_gamemaster_session_token';
const GAMEMASTER_SESSION_EMAIL_KEY = 'yf_gamemaster_session_email';

function money(value, digits = 0) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  });
}

function number(value, digits = 2) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function pct(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? '+' : ''}${number(amount)}%`;
}

function classForReturn(value) {
  return Number(value || 0) >= 0 ? 'positive' : 'negative';
}

function maskEmail(email, ownEmail = '') {
  if (!email) return 'Participant';
  if (email === ownEmail) return 'You';
  const [name, domain] = email.split('@');
  if (!domain) return 'Participant';
  return `${name.slice(0, 1)}***@${domain}`;
}

function previousPrice(asset) {
  const series = asset?.series || [];
  return series.length > 1 ? Number(series[series.length - 2].price) : null;
}

function assetMove(asset) {
  const before = previousPrice(asset);
  if (!before) return null;
  return ((Number(asset.price) / before) - 1) * 100;
}

function Sparkline({ series, color }) {
  const points = (series || []).map((item) => Number(item.price));
  if (points.length < 2) {
    return <div className="yf-sparkline-empty">First market mark</div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 42 - ((value - min) / range) * 34;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg className="yf-sparkline" viewBox="0 0 100 48" preserveAspectRatio="none" aria-label="Price history through the current quarter">
      <path d={path} style={{ stroke: color }} />
    </svg>
  );
}

function YouthFinancetopiaPortal() {
  const [sessionToken, setSessionToken] = useState(localStorage.getItem(PLAYER_SESSION_TOKEN_KEY) || '');
  const [sessionEmail, setSessionEmail] = useState(localStorage.getItem(PLAYER_SESSION_EMAIL_KEY) || '');
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(Boolean(sessionToken));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('market');
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [orderAsset, setOrderAsset] = useState('stock_a');
  const [orderSide, setOrderSide] = useState('buy');
  const [orderQuantity, setOrderQuantity] = useState('10');
  const [decisions, setDecisions] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [actionBusy, setActionBusy] = useState('');
  const [evidenceIds, setEvidenceIds] = useState([]);
  const [stance, setStance] = useState('unsure');
  const [confidence, setConfidence] = useState('medium');
  const [thesis, setThesis] = useState('');
  const [notebookReady, setNotebookReady] = useState(false);
  const decisionPeriodRef = useRef(null);

  const isAuthenticated = Boolean(sessionToken && sessionEmail);
  const isLeader = Boolean(state?.team?.is_leader);
  const isRoundOpen = Boolean(state?.game?.is_round_open && secondsLeft > 0);
  const notebookOwner = state?.team?.team_code || sessionEmail || 'guest';

  const clearChallengeSession = useCallback((message = '') => {
    localStorage.removeItem(PLAYER_SESSION_TOKEN_KEY);
    localStorage.removeItem(PLAYER_SESSION_EMAIL_KEY);
    setSessionToken('');
    setSessionEmail('');
    setState(null);
    setActiveTab('market');
    setLoading(false);
    setRefreshing(false);
    setActionBusy('');
    if (message) setAuthError(message);
  }, []);

  const apiRequest = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${sessionToken}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearChallengeSession(data.detail || 'Your challenge session expired. Sign in again.');
      throw new Error(data.detail || 'Your challenge session expired.');
    }
    if (!response.ok) throw new Error(data.detail || 'Request failed.');
    return data;
  }, [clearChallengeSession, sessionToken]);

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!sessionToken) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [stateData, sessionData] = await Promise.all([
        apiRequest('/trading/state'),
        apiRequest('/trading/session'),
      ]);
      if (sessionData.audience !== 'player') {
        throw new Error('This browser session is not a participant session. Use the gamemaster sign-in instead.');
      }
      setState(stateData);
      setSessionEmail(sessionData.email);
      localStorage.setItem(PLAYER_SESSION_EMAIL_KEY, sessionData.email);
      setSecondsLeft(stateData.game?.seconds_left || 0);
      setOrderAsset((current) => (
        stateData.assets?.some((asset) => asset.id === current)
          ? current
          : stateData.assets?.find((asset) => asset.tradable)?.id || 'stock_a'
      ));
      setError('');
    } catch (err) {
      if (sessionToken) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiRequest, sessionToken]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return undefined;
    }
    loadAll();
    return undefined;
  }, [isAuthenticated, loadAll]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadAll({ quiet: true });
    }, 8000);
    return () => window.clearInterval(poll);
  }, [isAuthenticated, loadAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setNotebookReady(false);
    try {
      const saved = JSON.parse(localStorage.getItem(`yf_notebook_${notebookOwner}`) || '{}');
      setEvidenceIds(Array.isArray(saved.evidenceIds) ? saved.evidenceIds : []);
      setStance(saved.stance || 'unsure');
      setConfidence(saved.confidence || 'medium');
      setThesis(saved.thesis || '');
    } catch {
      setEvidenceIds([]);
      setStance('unsure');
      setConfidence('medium');
      setThesis('');
    }
    setNotebookReady(true);
  }, [notebookOwner]);

  useEffect(() => {
    if (!state) return;
    if (decisionPeriodRef.current === state.game?.current_period_index) return;
    decisionPeriodRef.current = state.game?.current_period_index;
    const submitted = new Map((state.submitted_decisions || []).map((decision) => [decision.asset_id, decision]));
    const next = {};
    (state.assets || []).filter((asset) => asset.tradable).forEach((asset) => {
      const decision = submitted.get(asset.id);
      next[asset.id] = decision
        ? { side: decision.side, quantity: decision.quantity ? String(decision.quantity) : '' }
        : { side: 'hold', quantity: '' };
    });
    setDecisions(next);
  }, [state]);

  useEffect(() => {
    if (!notebookReady) return;
    localStorage.setItem(`yf_notebook_${notebookOwner}`, JSON.stringify({
      evidenceIds,
      stance,
      confidence,
      thesis,
    }));
  }, [confidence, evidenceIds, notebookOwner, notebookReady, stance, thesis]);

  async function requestChallengeCode(event) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setAuthError('Enter a valid participant email.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await fetch(`${API_URL}/auth/trading/player/email-code/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not send the sign-in code.');
      setCodeSentTo(data.email || email);
      setLoginEmail(data.email || email);
      setLoginCode('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyChallengeCode(event) {
    event.preventDefault();
    const code = loginCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your email.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await fetch(`${API_URL}/auth/trading/player/email-code/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: codeSentTo || loginEmail.trim().toLowerCase(), code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'This code is invalid or expired.');
      if (!data.trading_session?.token || data.trading_session.audience !== 'player') {
        throw new Error('This code was not issued for the participant portal.');
      }
      localStorage.setItem(PLAYER_SESSION_TOKEN_KEY, data.trading_session.token);
      localStorage.setItem(PLAYER_SESSION_EMAIL_KEY, data.trading_session.email);
      setSessionToken(data.trading_session.token);
      setSessionEmail(data.trading_session.email);
      setCodeSentTo('');
      setLoginCode('');
      setLoading(true);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      await fetch(`${API_URL}/trading/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
    } catch {
      // The local session is cleared even when the network is unavailable.
    }
    clearChallengeSession();
    setNotice('');
    setError('');
    setAuthError('');
  }

  async function postJson(path, body = {}) {
    setError('');
    setNotice('');
    return apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function createNewTeam(event) {
    event.preventDefault();
    setActionBusy('team');
    try {
      await postJson('/trading/teams', { team_name: teamName });
      setTeamName('');
      setNotice('Team created. You are the team captain.');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  }

  async function joinExistingTeam(event) {
    event.preventDefault();
    setActionBusy('team');
    try {
      await postJson('/trading/teams/join', { team_code: teamCode });
      setTeamCode('');
      setNotice('You joined the team.');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  }

  function updateDecision(assetId, patch) {
    setDecisions((current) => ({ ...current, [assetId]: { ...(current[assetId] || { side: 'hold', quantity: '' }), ...patch } }));
  }

  async function submitDecisionBoard() {
    if (actionBusy) return;
    const rows = (state?.assets || []).filter((asset) => asset.tradable).map((asset) => ({
      asset_id: asset.id,
      side: decisions[asset.id]?.side || 'hold',
      quantity: Number(decisions[asset.id]?.quantity || 0),
    }));
    setActionBusy('decision');
    try {
      await postJson('/trading/decisions/submit', { decisions: rows });
      setNotice('Decision board submitted. It is locked until you unsubmit it or the timer ends.');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  }

  async function unsubmitDecisionBoard() {
    if (actionBusy) return;
    setActionBusy('decision');
    try {
      await postJson('/trading/decisions/unsubmit');
      setNotice('Decision board unlocked. Make changes, then submit again before time runs out.');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  }

  async function submitContinuousOrder(event) {
    event.preventDefault();
    setActionBusy('continuous');
    try {
      await postJson('/trading/orders', {
        asset_id: orderAsset,
        side: orderSide,
        quantity: Number(orderQuantity),
        mode: 'continuous',
      });
      setNotice('Continuous test order accepted at the live simulated price.');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  }

  function toggleEvidence(id) {
    setEvidenceIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  const tabs = [
    ['market', 'Market mission', 'fa-newspaper'],
    ['portfolio', 'Team results', 'fa-chart-line'],
    ['lab', 'Code lab', 'fa-code'],
  ];

  if (loading) {
    return (
      <div className="yf-page yf-loading" role="status">
        <div className="yf-loading-mark"><i className="fa-solid fa-chart-simple" /></div>
        <strong>Opening the market lab...</strong>
        <span>Checking your team and the latest round.</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ChallengeLogin
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginCode={loginCode}
        setLoginCode={setLoginCode}
        codeSentTo={codeSentTo}
        setCodeSentTo={setCodeSentTo}
        authBusy={authBusy}
        authError={authError}
        requestChallengeCode={requestChallengeCode}
        verifyChallengeCode={verifyChallengeCode}
        mode="player"
      />
    );
  }

  return (
    <div className="yf-page">
      <header className="yf-topbar">
        <div className="yf-brand-lockup">
          <div className="yf-brand-mark" aria-hidden="true">YF</div>
          <div>
            <span>HKUST Youth Challenge</span>
            <strong>FINANCETOPIA</strong>
          </div>
        </div>
        <div className="yf-top-status">
          <span className={`yf-live-dot ${isRoundOpen ? 'open' : ''}`} />
          <div>
            <b>{state?.game?.current_period?.label || 'Round setup'}</b>
            <small>{isRoundOpen ? 'Market open' : 'Research time'}</small>
          </div>
        </div>
        <div className="yf-account-menu">
          <span className="yf-account-email">{sessionEmail}</span>
          <button type="button" onClick={signOut} aria-label="Sign out">
            <i className="fa-solid fa-arrow-right-from-bracket" />
          </button>
        </div>
      </header>

      <div className="yf-announcer" aria-live="polite" aria-atomic="true">
        {error && <div className="yf-message error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}
        {!error && notice && <div className="yf-message success" role="status"><i className="fa-solid fa-circle-check" /> {notice}</div>}
      </div>

      <RoundHero
        game={state?.game}
        secondsLeft={secondsLeft}
        isRoundOpen={isRoundOpen}
        refreshing={refreshing}
        onRefresh={() => loadAll({ quiet: true })}
      />

      <main className="yf-shell">
        <aside className="yf-sidebar">
          <nav className="yf-tabs" aria-label="Challenge sections">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? 'active' : ''}
                onClick={() => setActiveTab(key)}
                aria-current={activeTab === key ? 'page' : undefined}
              >
                <i className={`fa-solid ${icon}`} />
                <span>{label}</span>
                <i className="fa-solid fa-arrow-right yf-tab-arrow" />
              </button>
            ))}
          </nav>
          <TeamPanel
            team={state?.team}
            ownEmail={sessionEmail}
            createNewTeam={createNewTeam}
            joinExistingTeam={joinExistingTeam}
            teamName={teamName}
            setTeamName={setTeamName}
            teamCode={teamCode}
            setTeamCode={setTeamCode}
            busy={actionBusy === 'team'}
          />
          <Glossary />
        </aside>

        <section className="yf-workspace">
          <RoundStrip periods={state?.periods || []} currentIndex={state?.game?.current_period_index || 0} />

          {activeTab === 'market' && (
            <MarketMission
              state={state}
              decisions={decisions}
              updateDecision={updateDecision}
              submitDecisionBoard={submitDecisionBoard}
              unsubmitDecisionBoard={unsubmitDecisionBoard}
              decisionBusy={actionBusy === 'decision'}
              isLeader={isLeader}
              isRoundOpen={isRoundOpen}
              evidenceIds={evidenceIds}
              toggleEvidence={toggleEvidence}
            />
          )}

          {activeTab === 'portfolio' && (
            <PerformanceDesk
              portfolio={state?.portfolio}
              leaderboard={state?.leaderboard || []}
              assets={state?.assets || []}
              evidenceCount={evidenceIds.length}
              stance={stance}
              confidence={confidence}
              thesis={thesis}
            />
          )}

          {activeTab === 'lab' && (
            <CodeLab
              state={state}
              orderAsset={orderAsset}
              setOrderAsset={setOrderAsset}
              orderSide={orderSide}
              setOrderSide={setOrderSide}
              orderQuantity={orderQuantity}
              setOrderQuantity={setOrderQuantity}
              submitOrder={submitContinuousOrder}
              isLeader={isLeader}
              isRoundOpen={isRoundOpen}
              busy={actionBusy === 'continuous'}
              setNotice={setNotice}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function ChallengeLogin({
  loginEmail,
  setLoginEmail,
  loginCode,
  setLoginCode,
  codeSentTo,
  setCodeSentTo,
  authBusy,
  authError,
  requestChallengeCode,
  verifyChallengeCode,
  mode = 'player',
}) {
  const isGamemaster = mode === 'gamemaster';
  const audienceLabel = isGamemaster ? 'GAMEMASTER CHECK-IN' : 'PLAYER CHECK-IN';
  return (
    <div className={`yf-page yf-auth-shell ${isGamemaster ? 'yf-auth-gamemaster' : ''}`}>
      <div className="yf-auth-masthead" aria-hidden="true">
        <span className="yf-auth-stamp">{isGamemaster ? 'CONTROL ROOM / 2018-2022' : 'MARKET LAB / 2018-2022'}</span>
        <div className="yf-auth-chart">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <p>{isGamemaster ? <>Set the pace.<br />Run the room.<br />Keep it fair.</> : <>Read the room.<br />Build your case.<br />Make the call.</>}</p>
      </div>
      <section className="yf-auth-card">
        <div className="yf-brand-lockup">
          <div className="yf-brand-mark">YF</div>
          <div>
            <span>HKUST Youth Challenge</span>
            <strong>FINANCETOPIA</strong>
          </div>
        </div>
        <div className="yf-auth-heading">
          <span>{codeSentTo ? 'CHECK YOUR INBOX' : audienceLabel}</span>
          <h1>{codeSentTo ? 'Enter your market pass.' : isGamemaster ? 'Your control room is ready.' : 'Your team desk is waiting.'}</h1>
          <p>
            {codeSentTo
              ? `We sent a one-time code to ${codeSentTo}. It expires soon and works once.`
              : isGamemaster
                ? 'Use the event-host email approved for the gamemaster console. This is separate from participant access.'
                : 'Use the email registered by your teacher or challenge host. No password needed.'}
          </p>
        </div>

        {authError && <div className="yf-message error" role="alert">{authError}</div>}

        {!codeSentTo ? (
          <form className="yf-auth-form" onSubmit={requestChallengeCode}>
            <label htmlFor="yf-email">{isGamemaster ? 'Gamemaster email' : 'Participant email'}</label>
            <input
              id="yf-email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder={isGamemaster ? 'host@example.edu' : 'student@example.edu'}
              required
            />
            <button className="yf-primary" disabled={authBusy} type="submit">
              <span>{authBusy ? 'Sending your pass...' : 'Email my access code'}</span>
              <i className={`fa-solid ${authBusy ? 'fa-circle-notch fa-spin' : 'fa-arrow-right'}`} />
            </button>
          </form>
        ) : (
          <form className="yf-auth-form" onSubmit={verifyChallengeCode}>
            <label htmlFor="yf-code">6-digit access code</label>
            <input
              id="yf-code"
              className="yf-code-input"
              value={loginCode}
              onChange={(event) => setLoginCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
              autoFocus
            />
            <button className="yf-primary" disabled={authBusy} type="submit">
              <span>{authBusy ? 'Checking...' : isGamemaster ? 'Enter the control room' : 'Enter the market lab'}</span>
              <i className={`fa-solid ${authBusy ? 'fa-circle-notch fa-spin' : 'fa-door-open'}`} />
            </button>
            <button
              className="yf-text-button"
              disabled={authBusy}
              onClick={() => {
                setCodeSentTo('');
                setLoginCode('');
              }}
              type="button"
            >
              Use a different email
            </button>
          </form>
        )}
        <div className="yf-auth-footer">
          <i className="fa-solid fa-lock" />
          {isGamemaster ? (
            <>This opens a gamemaster-only session. <Link to="/youth-financetopia">Go to participant sign-in.</Link></>
          ) : (
            <>Participant access only. <Link to="/youth-financetopia/gamemaster">Gamemaster sign-in</Link> is separate.</>
          )}
        </div>
      </section>
    </div>
  );
}

function RoundHero({ game, secondsLeft, isRoundOpen, refreshing, onRefresh }) {
  const totalSeconds = game?.round_duration_seconds || 180;
  const progress = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  return (
    <section className={`yf-round-hero ${isRoundOpen ? 'open' : ''}`}>
      <div className="yf-round-kicker">
        <span>{isRoundOpen ? 'DECISION WINDOW' : 'BRIEFING MODE'}</span>
        <i className={`fa-solid ${isRoundOpen ? 'fa-bolt' : 'fa-magnifying-glass'}`} />
      </div>
      <div className="yf-round-copy">
        <span>Current market</span>
        <h1>{game?.current_period?.label || 'Waiting for host'}</h1>
        <p>
          {isRoundOpen
            ? 'Talk it through, check the numbers, then let your team captain submit one careful decision.'
            : 'Open the latest briefings and build your team view. Your host controls when trading begins.'}
        </p>
      </div>
      <div className="yf-round-timer" aria-label={`${Math.floor(secondsLeft / 60)} minutes ${secondsLeft % 60} seconds remaining`}>
        <span>TIME LEFT</span>
        <strong>{String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}</strong>
        <div><span style={{ width: `${progress}%` }} /></div>
      </div>
      <button className="yf-refresh" type="button" onClick={onRefresh} disabled={refreshing}>
        <i className={`fa-solid fa-rotate ${refreshing ? 'fa-spin' : ''}`} />
        {refreshing ? 'Syncing' : 'Sync now'}
      </button>
    </section>
  );
}

function TeamPanel({
  team,
  ownEmail,
  createNewTeam,
  joinExistingTeam,
  teamName,
  setTeamName,
  teamCode,
  setTeamCode,
  busy,
}) {
  if (team) {
    return (
      <section className="yf-side-card yf-team-card">
        <div className="yf-side-label"><i className="fa-solid fa-people-group" /> YOUR TEAM</div>
        <h2>{team.team_name}</h2>
        <button
          className="yf-team-code"
          type="button"
          onClick={() => navigator.clipboard?.writeText(team.team_code)}
          title="Copy team code"
        >
          <span>{team.team_code}</span>
          <i className="fa-regular fa-copy" />
        </button>
        <ul className="yf-member-list">
          {team.members.map((member) => {
            const isLegacyMember = typeof member === 'string';
            const displayEmail = isLegacyMember
              ? maskEmail(member, ownEmail)
              : member.display_email;
            const isCaptain = isLegacyMember
              ? member === team.leader_email
              : member.is_leader;
            return (
              <li key={isLegacyMember ? member : `member-${member.slot}`}>
                <span>{member.is_self ? `You · ${displayEmail}` : displayEmail}</span>
                {isCaptain && <b>Captain</b>}
              </li>
            );
          })}
        </ul>
        <p className="yf-side-note">
          {team.is_leader
            ? 'You are the captain. Your account submits the final team decision.'
            : 'Explore the evidence together. Your captain submits the final order.'}
        </p>
      </section>
    );
  }

  return (
    <section className="yf-side-card yf-team-card">
      <div className="yf-side-label"><i className="fa-solid fa-ticket" /> TEAM CHECK-IN</div>
      <h2>Find your crew</h2>
      <p className="yf-side-note">Create a team or enter the code your captain shares. Teams hold up to three players.</p>
      <form onSubmit={createNewTeam}>
        <label htmlFor="yf-team-name">Create a new team</label>
        <div className="yf-inline-field">
          <input
            id="yf-team-name"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="The Market Makers"
            maxLength="80"
            required
          />
          <button type="submit" disabled={busy} aria-label="Create team"><i className="fa-solid fa-plus" /></button>
        </div>
      </form>
      <div className="yf-or"><span>OR</span></div>
      <form onSubmit={joinExistingTeam}>
        <label htmlFor="yf-team-code">Join with a team code</label>
        <div className="yf-inline-field">
          <input
            id="yf-team-code"
            value={teamCode}
            onChange={(event) => setTeamCode(event.target.value.toUpperCase())}
            placeholder="FD-ABC123"
            maxLength="12"
            required
          />
          <button type="submit" disabled={busy} aria-label="Join team"><i className="fa-solid fa-arrow-right" /></button>
        </div>
      </form>
    </section>
  );
}

function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <section className="yf-side-card yf-glossary">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span><i className="fa-solid fa-book-open" /> QUICK GLOSSARY</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} />
      </button>
      {open && (
        <dl>
          <div><dt>Asset</dt><dd>Something the team can buy or sell.</dd></div>
          <div><dt>Equity</dt><dd>Your cash plus the current value of your holdings.</dd></div>
          <div><dt>Return</dt><dd>How much the portfolio gained or lost, as a percentage.</dd></div>
          <div><dt>Rumor</dt><dd>An unverified clue. Useful, but less reliable than a confirmed brief.</dd></div>
        </dl>
      )}
    </section>
  );
}

function RoundStrip({ periods, currentIndex }) {
  return (
    <div className="yf-round-strip" aria-label="Challenge timeline from 2018 to 2022">
      {periods.map((period, index) => (
        <div
          className={`yf-period ${index === currentIndex ? 'current' : ''} ${index < currentIndex ? 'past' : ''}`}
          key={period.id}
          title={period.label}
        >
          <span>{period.year}</span>
          <small>Q{period.quarter}</small>
        </div>
      ))}
    </div>
  );
}

function MarketMission({
  state,
  decisions,
  updateDecision,
  submitDecisionBoard,
  unsubmitDecisionBoard,
  decisionBusy,
  isLeader,
  isRoundOpen,
  evidenceIds,
  toggleEvidence,
}) {
  return (
    <div className="yf-stack">
      <section className="yf-mission-steps">
        <div><span>1</span><p><b>Scan the briefings</b>Separate confirmed facts from desk chatter.</p></div>
        <i className="fa-solid fa-arrow-right" />
        <div><span>2</span><p><b>Build a team view</b>Pin evidence and write one clear reason.</p></div>
        <i className="fa-solid fa-arrow-right" />
        <div><span>3</span><p><b>Review the numbers</b>Your captain confirms the final order.</p></div>
      </section>

      <MarketTape
        news={state?.news || []}
        currentPeriodId={state?.game?.current_period?.id}
        assets={state?.assets || []}
        evidenceIds={evidenceIds}
        toggleEvidence={toggleEvidence}
      />

      <section className="yf-market-board">
        <SectionHeading eyebrow="PRICE BOARD" title="What the market has shown so far" note="Charts stop at the current quarter - future prices stay hidden." />
        <AssetGrid
          assets={state?.assets || []}
          team={state?.team}
          portfolio={state?.portfolio}
          decisions={decisions}
          submittedDecisions={state?.submitted_decisions || []}
          updateDecision={updateDecision}
          isLeader={isLeader}
          isRoundOpen={isRoundOpen}
        />
        <DecisionSubmitBar
          team={state?.team}
          submittedDecisions={state?.submitted_decisions || []}
          submitDecisionBoard={submitDecisionBoard}
          unsubmitDecisionBoard={unsubmitDecisionBoard}
          decisionBusy={decisionBusy}
          isLeader={isLeader}
          isRoundOpen={isRoundOpen}
        />
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title, note }) {
  return (
    <div className="yf-section-heading">
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
      {note && <p>{note}</p>}
    </div>
  );
}

function MarketTape({ news, currentPeriodId, assets, evidenceIds, toggleEvidence }) {
  const [filter, setFilter] = useState('latest');
  const [expanded, setExpanded] = useState([]);
  const [rumors, setRumors] = useState([]);
  const filteredNews = news.filter((item) => {
    if (filter === 'latest') return item.period_id === currentPeriodId;
    if (filter === 'all') return true;
    return item.asset_id === filter;
  }).slice().reverse();

  function toggle(listSetter, id) {
    listSetter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section className="yf-newsroom">
      <div className="yf-newsroom-head">
        <div className="yf-news-title">
          <span className="yf-news-flag"><i className="fa-solid fa-satellite-dish" /> LIVE BRIEFING</span>
          <h2>Clues, not answers.</h2>
          <p>Open a card, question the source, and pin only the evidence your team actually trusts.</p>
        </div>
        <div className="yf-evidence-counter">
          <strong>{evidenceIds.length}</strong>
          <span>clues pinned</span>
        </div>
      </div>
      <div className="yf-filter-row" aria-label="Filter market briefings">
        <button type="button" className={filter === 'latest' ? 'active' : ''} onClick={() => setFilter('latest')}>New this quarter</button>
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All unlocked</button>
        {assets.filter((asset) => news.some((item) => item.asset_id === asset.id)).map((asset) => (
          <button key={asset.id} type="button" className={filter === asset.id ? 'active' : ''} onClick={() => setFilter(asset.id)}>
            {asset.fake_name}
          </button>
        ))}
      </div>
      {filteredNews.length ? (
        <div className="yf-news-grid">
          {filteredNews.map((item, index) => {
            const isOpen = expanded.includes(item.id);
            const rumorOpen = rumors.includes(item.id);
            const isPinned = evidenceIds.includes(item.id);
            return (
              <article className={`yf-news-card ${isOpen ? 'open' : ''}`} key={item.id} style={{ '--asset-color': item.asset_color, '--delay': `${index * 55}ms` }}>
                <button className="yf-news-card-toggle" type="button" onClick={() => toggle(setExpanded, item.id)} aria-expanded={isOpen}>
                  <span className="yf-news-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="yf-news-card-title">
                    <small>{item.period_label} / {item.asset_name}</small>
                    <strong>{item.headline}</strong>
                  </span>
                  <i className={`fa-solid fa-${isOpen ? 'minus' : 'plus'}`} />
                </button>
                {isOpen && (
                  <div className="yf-news-body">
                    <div className="yf-source-line"><span><i className="fa-solid fa-circle-check" /> CONFIRMED BRIEF</span><b>Medium detail</b></div>
                    <p>{item.brief}</p>
                    <blockquote>{item.question}</blockquote>
                    <div className="yf-news-actions">
                      <button type="button" className={isPinned ? 'pinned' : ''} onClick={() => toggleEvidence(item.id)}>
                        <i className={`fa-${isPinned ? 'solid' : 'regular'} fa-bookmark`} />
                        {isPinned ? 'Pinned to notebook' : 'Pin as evidence'}
                      </button>
                      <button type="button" onClick={() => toggle(setRumors, item.id)} aria-expanded={rumorOpen}>
                        <i className="fa-solid fa-comment-dots" />
                        {rumorOpen ? 'Hide desk chatter' : 'Check desk chatter'}
                      </button>
                    </div>
                    {rumorOpen && (
                      <div className="yf-rumor"><span>UNVERIFIED</span><p>{item.rumor}</p></div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="yf-empty-state"><i className="fa-solid fa-radio" /><b>No new briefing on this channel.</b><span>Try “All unlocked” or another asset.</span></div>
      )}
    </section>
  );
}

function AssetGrid({ assets, team, portfolio, decisions, submittedDecisions, updateDecision, isLeader, isRoundOpen }) {
  const submittedByAsset = new Map(submittedDecisions.map((decision) => [decision.asset_id, decision]));
  const submitted = submittedDecisions.length > 0;
  const locked = !team || !isLeader || !isRoundOpen || submitted;
  return (
    <div className="yf-asset-grid">
      {assets.map((asset) => {
        const move = assetMove(asset);
        return (
          <article key={asset.id} className={`yf-asset-card ${asset.tradable ? '' : 'indicator'}`}>
            <div className="yf-asset-bar" style={{ background: asset.color }} />
            <div className="yf-asset-head">
              <div><span>{asset.kind}</span><h3>{asset.fake_name}</h3></div>
              {move === null ? <small>NEW</small> : <b className={classForReturn(move)}>{pct(move)}</b>}
            </div>
            <Sparkline series={asset.series} color={asset.color} />
            <p>{asset.profile}</p>
            <div className="yf-asset-price">
              <span>Current mark</span>
              <strong>{asset.kind === 'FX' ? number(asset.price, 4) : money(asset.price, asset.price < 10 ? 4 : 0)}</strong>
            </div>
            {asset.tradable ? (
              <div className="yf-card-decision">
                {(() => {
                  const decision = submittedByAsset.get(asset.id) || decisions[asset.id] || { side: 'hold', quantity: '' };
                  const owned = Number(portfolio?.holdings?.find((item) => item.asset_id === asset.id)?.quantity || 0);
                  return <>
                    <div className="yf-card-side-toggle" role="group" aria-label={`Decision for ${asset.fake_name}`}>
                      {['sell', 'hold', 'buy'].map((side) => <button key={side} type="button" disabled={locked} className={`${side} ${decision.side === side ? 'active' : ''}`} onClick={() => updateDecision(asset.id, { side, quantity: side === 'hold' ? '' : decision.quantity })}>{side}</button>)}
                    </div>
                    <label>Amount
                      <input disabled={locked || decision.side === 'hold'} type="number" min="0.0001" step="0.0001" value={decision.quantity} onChange={(event) => updateDecision(asset.id, { quantity: event.target.value })} placeholder={decision.side === 'sell' ? `${number(owned, 4)} owned` : 'Units'} />
                    </label>
                  </>;
                })()}
              </div>
            ) : (
              <div className="yf-indicator-note"><i className="fa-solid fa-eye" /> Watch only - not tradable</div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function DecisionSubmitBar({
  team,
  submittedDecisions,
  submitDecisionBoard,
  unsubmitDecisionBoard,
  decisionBusy,
  isLeader,
  isRoundOpen,
}) {
  const submitted = submittedDecisions.length > 0;
  const disabled = !team || !isLeader || !isRoundOpen || submitted;
  let disabledReason = '';
  if (!team) disabledReason = 'Join a team to unlock the ticket.';
  else if (!isLeader) disabledReason = 'Only your team captain can submit. You can still help build the decision.';
  else if (!isRoundOpen) disabledReason = 'Trading is closed. Prepare your view while the host gets the next round ready.';
  else if (submitted) disabledReason = 'Your board is locked. Unsubmit it before the timer ends to make changes.';

  return (
    <section className={`yf-decision-submit-bar ${submitted ? 'submitted' : ''}`}>
      <div>
        <b>{submitted ? 'DECISIONS LOCKED' : 'READY TO SUBMIT?'}</b>
        <span>{submitted ? 'Unsubmit before the timer ends to edit the stock cards.' : 'Your choices above lock once submitted.'}</span>
      </div>
      <div className="yf-decision-board-actions">
        {submitted ? <button type="button" className="yf-secondary" disabled={!isRoundOpen || !isLeader || decisionBusy} onClick={unsubmitDecisionBoard}>{decisionBusy ? 'Unlocking...' : 'Unsubmit & change'}</button> : <button type="button" className="yf-primary" disabled={disabled || decisionBusy} onClick={submitDecisionBoard}>{decisionBusy ? 'Submitting...' : 'Submit team decisions'} <i className="fa-solid fa-lock" /></button>}
      </div>
      {disabledReason && <p className="yf-disabled-note"><i className="fa-solid fa-circle-info" /> {disabledReason}</p>}
    </section>
  );
}

function PortfolioPanel({ portfolio, assets }) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  return (
    <section className="yf-panel yf-portfolio-panel">
      <SectionHeading eyebrow="TEAM BOOK" title="Holdings and cash" note="Your current position at this quarter's market marks." />
      {!portfolio ? (
        <div className="yf-empty-state"><i className="fa-solid fa-people-group" /><b>No team portfolio yet.</b><span>Create or join a team from the left panel.</span></div>
      ) : (
        <>
          <div className="yf-metrics">
            <Metric label="Cash ready" value={money(portfolio.available_cash ?? portfolio.cash)} icon="fa-wallet" />
            <Metric label="Portfolio equity" value={money(portfolio.equity)} icon="fa-chart-pie" />
            <Metric label="Total return" value={pct(portfolio.return_pct)} className={classForReturn(portfolio.return_pct)} icon="fa-arrow-trend-up" />
          </div>
          <div className="yf-table-wrap" tabIndex="0" aria-label="Scrollable holdings table">
            <table>
              <thead><tr><th>Asset</th><th>Quantity</th><th>Current price</th><th>Current value</th></tr></thead>
              <tbody>
                {portfolio.holdings.length === 0 && <tr><td colSpan="4">No positions yet - the team is holding cash.</td></tr>}
                {portfolio.holdings.map((holding) => {
                  const asset = assetMap.get(holding.asset_id);
                  return (
                    <tr key={holding.asset_id}>
                      <td><span className="yf-table-asset" style={{ '--row-color': asset?.color }}>{asset?.fake_name || holding.asset_id}</span></td>
                      <td>{number(holding.quantity, 4)}</td>
                      <td>{asset?.kind === 'FX' ? number(holding.price, 4) : money(holding.price, holding.price < 10 ? 4 : 0)}</td>
                      <td>{money(holding.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, className = '', icon }) {
  return (
    <div className="yf-metric">
      <i className={`fa-solid ${icon}`} />
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

function PerformanceChart({ portfolio, assets }) {
  const portfolioRows = portfolio?.history || [];
  const series = [
    { label: 'Total assets', color: '#13231f', values: portfolioRows.map((row) => row.equity) },
    { label: 'Cash', color: '#256fdd', values: portfolioRows.map((row) => row.cash) },
    ...assets.filter((asset) => asset.tradable).map((asset) => ({ label: asset.fake_name, color: asset.color, values: asset.series.map((point) => point.price) })),
  ].filter((line) => line.values.length > 1);
  const all = series.flatMap((line) => line.values);
  if (!all.length) return <div className="yf-empty-state"><b>Your performance graph will appear after the next quarter.</b></div>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const pathFor = (values) => values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 92 - ((value - min) / range) * 84;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  return <section className="yf-panel yf-performance-chart">
    <SectionHeading eyebrow="TEAM PERFORMANCE" title="Cash, assets, and market marks" note="Follow your total assets and cash alongside each tradable stock." />
    <div className="yf-chart-legend">{series.map((line) => <span key={line.label}><i style={{ background: line.color }} />{line.label}</span>)}</div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Team performance chart">
      {[20, 50, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} />)}
      {series.map((line) => <path key={line.label} d={pathFor(line.values)} style={{ stroke: line.color }} />)}
    </svg>
    <div className="yf-chart-labels">{portfolioRows.map((row) => <span key={row.period.id}>{row.period.label}</span>)}</div>
  </section>;
}

function PerformanceDesk({ portfolio, leaderboard, assets, evidenceCount, stance, confidence, thesis }) {
  return (
    <div className="yf-stack">
      <section className="yf-results-intro">
        <span>TEAM RESULTS</span>
        <h2>Track the outcome. Keep the reasoning.</h2>
        <p>Winning one quarter can be luck. The real challenge is making choices your team can explain.</p>
      </section>
      <PortfolioPanel portfolio={portfolio} assets={assets} />
      <PerformanceChart portfolio={portfolio} assets={assets} />
      <section className="yf-panel yf-decision-recap">
        <SectionHeading eyebrow="DECISION RECAP" title="Your current team view" />
        <div className="yf-recap-grid">
          <div><span>Pinned clues</span><strong>{evidenceCount}</strong></div>
          <div><span>View</span><strong>{stance === 'unsure' ? 'Not sure yet' : stance}</strong></div>
          <div><span>Confidence</span><strong>{confidence}</strong></div>
          <blockquote>{thesis || 'Your one-sentence reason will appear here after you write it in the Market mission.'}</blockquote>
        </div>
      </section>
      <section className="yf-panel yf-history-panel">
        <SectionHeading eyebrow="QUARTERLY MARKS" title="How your decisions changed the portfolio" />
        <div className="yf-history-grid">
          {(portfolio?.history || []).map((item) => (
            <div key={item.period.id} className="yf-history-cell">
              <span>{item.period.label}</span>
              <strong>{money(item.equity)}</strong>
              <em className={classForReturn(item.return_pct)}>{pct(item.return_pct)}</em>
            </div>
          ))}
          {!portfolio?.history?.length && <div className="yf-empty-state"><b>No history yet.</b><span>Join a team to begin.</span></div>}
        </div>
      </section>
      <Leaderboard leaderboard={leaderboard} />
    </div>
  );
}

function Leaderboard({ leaderboard }) {
  return (
    <section className="yf-panel yf-leaderboard">
      <SectionHeading eyebrow="THE FIELD" title="Current team ranking" note="Only team names and results are shared - participant emails stay private." />
      <div className="yf-table-wrap" tabIndex="0" aria-label="Scrollable team ranking table">
        <table>
          <thead><tr><th>Rank</th><th>Team</th><th>Players</th><th>Equity</th><th>Return</th></tr></thead>
          <tbody>
            {leaderboard.length === 0 && <tr><td colSpan="5">No teams have checked in yet.</td></tr>}
            {leaderboard.map((team) => (
              <tr key={`${team.rank}-${team.team_name}`}>
                <td><span className="yf-rank">{team.rank}</span></td>
                <td><b>{team.team_name}</b></td>
                <td>{team.member_count}/3</td>
                <td>{money(team.equity)}</td>
                <td className={classForReturn(team.return_pct)}>{pct(team.return_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CodeLab({
  state,
  orderAsset,
  setOrderAsset,
  orderSide,
  setOrderSide,
  orderQuantity,
  setOrderQuantity,
  submitOrder,
  isLeader,
  isRoundOpen,
  busy,
  setNotice,
}) {
  const [showKey, setShowKey] = useState(false);
  const apiKey = state?.team?.api_key;
  const canTest = Boolean(state?.team && isLeader && isRoundOpen);

  async function copyKey() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setNotice('Team API key copied. Keep it private.');
    } catch {
      setNotice('Select and copy the key manually.');
    }
  }

  return (
    <div className="yf-stack">
      <section className="yf-lab-hero">
        <span>OPTIONAL ADVANCED TRACK</span>
        <h2>Teach a small program to watch the market.</h2>
        <p>The code lab is extra. Your team can complete the full challenge without it.</p>
      </section>
      <section className="yf-panel yf-code-board">
        <SectionHeading eyebrow="API STARTER" title="Two requests, one private key" note="The key belongs to your team captain. Never paste it into a public chat or repository." />
        <div className="yf-code-grid">
          <div className="yf-code-block">
            <span>1 / GET A SNAPSHOT</span>
            <code>{state?.continuous_api?.snapshot}</code>
            <small>{state?.continuous_api?.auth_header}</small>
            <span>2 / SEND AN ORDER</span>
            <code>{state?.continuous_api?.order}</code>
            <pre>{JSON.stringify(state?.continuous_api?.order_body, null, 2)}</pre>
          </div>
          <div className="yf-key-card">
            <span>CAPTAIN&apos;S PRIVATE KEY</span>
            <strong>{apiKey ? (showKey ? apiKey : '••••••••••••••••••••••••') : 'Available to the team captain'}</strong>
            <div>
              <button type="button" onClick={() => setShowKey((value) => !value)} disabled={!apiKey}><i className={`fa-solid fa-${showKey ? 'eye-slash' : 'eye'}`} /> {showKey ? 'Hide' : 'Reveal'}</button>
              <button type="button" onClick={copyKey} disabled={!apiKey}><i className="fa-regular fa-copy" /> Copy</button>
            </div>
          </div>
        </div>
      </section>
      <section className="yf-panel yf-api-test">
        <SectionHeading eyebrow="SAFE SANDBOX" title="Try one live simulated order" note="This uses the same team portfolio and only works while the host's timer is open." />
        <form onSubmit={submitOrder}>
          <label htmlFor="yf-api-asset">Asset</label>
          <select id="yf-api-asset" value={orderAsset} onChange={(event) => setOrderAsset(event.target.value)}>
            {(state?.assets || []).filter((asset) => asset.tradable).map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.fake_name} - {money(asset.continuous_price, asset.continuous_price < 10 ? 4 : 0)}</option>
            ))}
          </select>
          <label htmlFor="yf-api-side">Action</label>
          <select id="yf-api-side" value={orderSide} onChange={(event) => setOrderSide(event.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option></select>
          <label htmlFor="yf-api-quantity">Quantity</label>
          <input id="yf-api-quantity" type="number" min="0.0001" step="0.0001" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} />
          <button className="yf-primary" disabled={!canTest || busy} type="submit">{busy ? 'Sending...' : 'Run test order'} <i className="fa-solid fa-terminal" /></button>
        </form>
        {!canTest && <p className="yf-disabled-note">The captain can test orders while the decision window is open.</p>}
      </section>
    </div>
  );
}

export function YouthFinancetopiaGamemasterPortal() {
  const [sessionToken, setSessionToken] = useState(localStorage.getItem(GAMEMASTER_SESSION_TOKEN_KEY) || '');
  const [sessionEmail, setSessionEmail] = useState(localStorage.getItem(GAMEMASTER_SESSION_EMAIL_KEY) || '');
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(Boolean(sessionToken));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [actionBusy, setActionBusy] = useState('');

  const isAuthenticated = Boolean(sessionToken && sessionEmail);
  const isRoundOpen = Boolean(state?.game?.is_round_open && secondsLeft > 0);

  const clearGamemasterSession = useCallback((message = '') => {
    localStorage.removeItem(GAMEMASTER_SESSION_TOKEN_KEY);
    localStorage.removeItem(GAMEMASTER_SESSION_EMAIL_KEY);
    setSessionToken('');
    setSessionEmail('');
    setState(null);
    setLoading(false);
    setRefreshing(false);
    setActionBusy('');
    if (message) setAuthError(message);
  }, []);

  const apiRequest = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${sessionToken}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearGamemasterSession(data.detail || 'Your gamemaster session expired. Sign in again.');
      throw new Error(data.detail || 'Your gamemaster session expired.');
    }
    if (!response.ok) throw new Error(data.detail || 'Request failed.');
    return data;
  }, [clearGamemasterSession, sessionToken]);

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!sessionToken) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [sessionData, gameData] = await Promise.all([
        apiRequest('/trading/gamemaster/session'),
        apiRequest('/trading/gamemaster'),
      ]);
      if (sessionData.audience !== 'gamemaster') {
        throw new Error('This browser session is not a gamemaster session.');
      }
      setSessionEmail(sessionData.email);
      localStorage.setItem(GAMEMASTER_SESSION_EMAIL_KEY, sessionData.email);
      setState(gameData);
      setSecondsLeft(gameData.game?.seconds_left || 0);
      setError('');
    } catch (err) {
      if (sessionToken) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiRequest, sessionToken]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return undefined;
    }
    loadAll();
    return undefined;
  }, [isAuthenticated, loadAll]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadAll({ quiet: true });
    }, 8000);
    return () => window.clearInterval(poll);
  }, [isAuthenticated, loadAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function requestGamemasterCode(event) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setAuthError('Enter a valid gamemaster email.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await fetch(`${API_URL}/auth/trading/gamemaster/email-code/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not send the gamemaster sign-in code.');
      setCodeSentTo(data.email || email);
      setLoginEmail(data.email || email);
      setLoginCode('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyGamemasterCode(event) {
    event.preventDefault();
    const code = loginCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your email.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await fetch(`${API_URL}/auth/trading/gamemaster/email-code/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: codeSentTo || loginEmail.trim().toLowerCase(), code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'This code is invalid or expired.');
      if (!data.trading_session?.token || data.trading_session.audience !== 'gamemaster') {
        throw new Error('This code was not issued for the gamemaster console.');
      }
      localStorage.setItem(GAMEMASTER_SESSION_TOKEN_KEY, data.trading_session.token);
      localStorage.setItem(GAMEMASTER_SESSION_EMAIL_KEY, data.trading_session.email);
      setSessionToken(data.trading_session.token);
      setSessionEmail(data.trading_session.email);
      setCodeSentTo('');
      setLoginCode('');
      setLoading(true);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      await fetch(`${API_URL}/trading/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
    } catch {
      // Clearing the local session is still the safest action when the network is unavailable.
    }
    clearGamemasterSession();
    setNotice('');
    setError('');
    setAuthError('');
  }

  async function runGameAction(path, message, confirmation = '') {
    if (actionBusy) return;
    if (confirmation && !window.confirm(confirmation)) return;
    setActionBusy(path);
    setError('');
    setNotice('');
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify({}) });
      setNotice(message);
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy('');
    }
  }

  if (loading) {
    return (
      <div className="yf-page yf-loading" role="status">
        <div className="yf-loading-mark"><i className="fa-solid fa-shield-halved" /></div>
        <strong>Opening the control room...</strong>
        <span>Checking gamemaster access and the live round.</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ChallengeLogin
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginCode={loginCode}
        setLoginCode={setLoginCode}
        codeSentTo={codeSentTo}
        setCodeSentTo={setCodeSentTo}
        authBusy={authBusy}
        authError={authError}
        requestChallengeCode={requestGamemasterCode}
        verifyChallengeCode={verifyGamemasterCode}
        mode="gamemaster"
      />
    );
  }

  return (
    <div className="yf-page yf-gamemaster-page">
      <header className="yf-topbar">
        <div className="yf-brand-lockup">
          <div className="yf-brand-mark" aria-hidden="true">YF</div>
          <div>
            <span>HKUST Youth Challenge</span>
            <strong>FINANCETOPIA</strong>
          </div>
        </div>
        <div className="yf-top-status">
          <span className={`yf-live-dot ${isRoundOpen ? 'open' : ''}`} />
          <div>
            <b>{state?.game?.current_period?.label || 'Round setup'}</b>
            <small>{isRoundOpen ? 'Market open' : 'Research time'}</small>
          </div>
        </div>
        <div className="yf-account-menu">
          <span className="yf-role-badge"><i className="fa-solid fa-shield-halved" /> Gamemaster</span>
          <span className="yf-account-email">{sessionEmail}</span>
          <button type="button" onClick={signOut} aria-label="Sign out">
            <i className="fa-solid fa-arrow-right-from-bracket" />
          </button>
        </div>
      </header>

      <div className="yf-announcer" aria-live="polite" aria-atomic="true">
        {error && <div className="yf-message error" role="alert"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}
        {!error && notice && <div className="yf-message success" role="status"><i className="fa-solid fa-circle-check" /> {notice}</div>}
      </div>

      <RoundHero
        game={state?.game}
        secondsLeft={secondsLeft}
        isRoundOpen={isRoundOpen}
        refreshing={refreshing}
        onRefresh={() => loadAll({ quiet: true })}
      />

      <main className="yf-shell yf-gamemaster-shell">
        <section className="yf-workspace">
          <GamemasterDesk
            state={state}
            busy={Boolean(actionBusy)}
            startRound={() => runGameAction('/trading/round/start', 'The 3-minute decision window is open.')}
            advanceRound={() => runGameAction(
              '/trading/round/advance',
              'Results are marked and the next briefing is ready.',
              'Close this round and move every team to the next quarter? Trading will stay closed until you start the timer.'
            )}
            resetGame={() => runGameAction(
              '/trading/round/reset',
              'The competition was reset to 2018 Q1. Teams were kept and all orders were cleared.',
              'Reset the entire competition? This clears every order and cannot be undone.'
            )}
          />
        </section>
      </main>
    </div>
  );
}

function GamemasterDesk({ state, busy, startRound, advanceRound, resetGame }) {
  const teams = state?.teams || [];
  const game = state?.game;
  return (
    <div className="yf-stack yf-host-stack">
      <section className="yf-host-hero">
        <div><span>GAMEMASTER-ONLY SPACE</span><h2>Host console</h2><p>This view and every control are verified by the server. Player sessions cannot load or call them.</p></div>
        <i className="fa-solid fa-shield-halved" />
      </section>
      <section className="yf-panel yf-host-controls">
        <SectionHeading eyebrow="ROUND CONTROL" title={`${game?.current_period?.label || 'Round'} is ${game?.is_round_open ? 'open' : 'paused'}`} note="Advancing reveals the next quarter but leaves trading closed until you start the timer." />
        <div className="yf-control-row">
          <button type="button" className="start" onClick={startRound} disabled={busy || game?.is_round_open}>
            <i className="fa-solid fa-play" /><span><b>Start 3-minute timer</b><small>Open decisions for all teams</small></span>
          </button>
          <button type="button" onClick={advanceRound} disabled={busy || game?.is_complete}>
            <i className="fa-solid fa-forward-step" /><span><b>Close & advance</b><small>Mark results, reveal next brief</small></span>
          </button>
          <button type="button" className="danger" onClick={resetGame} disabled={busy}>
            <i className="fa-solid fa-rotate-left" /><span><b>Reset competition</b><small>Keep teams, clear every order</small></span>
          </button>
        </div>
      </section>
      <section className="yf-panel yf-team-monitor">
        <SectionHeading eyebrow="ROOM CHECK" title={`${teams.length} team${teams.length === 1 ? '' : 's'} connected`} note="Private details are visible here only for event operations." />
        <div className="yf-team-monitor-grid">
          {teams.map(({ team, portfolio, orders }) => (
            <article key={team.team_code}>
              <div><span>{team.team_code}</span><b>{team.team_name}</b></div>
              <dl>
                <div><dt>Players</dt><dd>{team.member_count}/3</dd></div>
                <div><dt>Orders</dt><dd>{orders.length}</dd></div>
                <div><dt>Equity</dt><dd>{money(portfolio.equity)}</dd></div>
                <div><dt>Return</dt><dd className={classForReturn(portfolio.return_pct)}>{pct(portfolio.return_pct)}</dd></div>
              </dl>
            </article>
          ))}
          {!teams.length && <div className="yf-empty-state"><b>No teams connected yet.</b><span>Players will appear after they create or join a team.</span></div>}
        </div>
      </section>
      <Leaderboard leaderboard={state?.leaderboard || []} />
    </div>
  );
}

export default YouthFinancetopiaPortal;
