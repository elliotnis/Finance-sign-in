import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/financeDevelopmentPortal.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

function Sparkline({ series, color }) {
  const points = (series || []).map((item) => Number(item.price));
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 42 - ((value - min) / range) * 34;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg className="fd-sparkline" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} style={{ stroke: color }} />
    </svg>
  );
}

function FinanceDevelopmentPortal() {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('user_email') || '';
  const [state, setState] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState('discrete');
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [orderAsset, setOrderAsset] = useState('stock_a');
  const [orderSide, setOrderSide] = useState('buy');
  const [orderQuantity, setOrderQuantity] = useState('10');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const selectedAsset = useMemo(
    () => (state?.assets || []).find((asset) => asset.id === orderAsset) || state?.assets?.[0],
    [orderAsset, state]
  );

  const currentYear = state?.game?.current_period?.year;
  const interestRate = currentYear ? state?.interest_rates?.[currentYear] || 0 : 0;
  const isLeader = Boolean(state?.team?.is_leader);
  const isRoundOpen = Boolean(state?.game?.is_round_open && secondsLeft > 0);

  useEffect(() => {
    if (!localStorage.getItem('user_id')) {
      navigate('/login');
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    setSecondsLeft(state?.game?.seconds_left || 0);
  }, [state?.game?.seconds_left]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadAll() {
    if (!userEmail) {
      navigate('/login');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [stateResponse, roleResponse] = await Promise.all([
        fetch(`${API_URL}/trading/state?email=${encodeURIComponent(userEmail)}`),
        fetch(`${API_URL}/me/role?email=${encodeURIComponent(userEmail)}`),
      ]);
      const stateData = await stateResponse.json().catch(() => ({}));
      if (!stateResponse.ok) throw new Error(stateData.detail || 'Could not load trading portal.');
      const roleData = roleResponse.ok ? await roleResponse.json() : {};
      setState(stateData);
      setIsAdmin(Boolean(roleData.is_admin));
      if (stateData.assets?.[0] && !stateData.assets.find((asset) => asset.id === orderAsset)) {
        setOrderAsset(stateData.assets[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function postJson(path, body) {
    setError('');
    setNotice('');
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Request failed.');
    return data;
  }

  async function createNewTeam(event) {
    event.preventDefault();
    try {
      await postJson('/trading/teams', { team_name: teamName, leader_email: userEmail });
      setTeamName('');
      setNotice('Team created. You are the team leader.');
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function joinExistingTeam(event) {
    event.preventDefault();
    try {
      await postJson('/trading/teams/join', { team_code: teamCode, email: userEmail });
      setTeamCode('');
      setNotice('Joined team.');
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitOrder(event, mode = 'discrete') {
    event.preventDefault();
    try {
      await postJson('/trading/orders', {
        email: userEmail,
        asset_id: orderAsset,
        side: orderSide,
        quantity: Number(orderQuantity),
        mode,
      });
      setNotice(`${orderSide === 'buy' ? 'Buy' : 'Sell'} order placed for ${selectedAsset?.fake_name}.`);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function runGameAction(path, message) {
    try {
      await postJson(path, { admin_email: userEmail });
      setNotice(message);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyEmailDraft() {
    try {
      await navigator.clipboard.writeText(state?.miki_email_draft || '');
      setNotice('Email draft copied.');
    } catch {
      setError('Could not copy automatically.');
    }
  }

  const tabs = [
    ['discrete', 'Discrete Desk', 'fa-clock'],
    ['continuous', 'Continuous API', 'fa-code'],
    ['performance', 'Performance', 'fa-chart-line'],
    ['email', 'Miki Email', 'fa-envelope'],
  ];
  if (isAdmin) tabs.splice(3, 0, ['gamemaster', 'Gamemaster', 'fa-chess-king']);

  if (loading) {
    return (
      <div className="fd-page fd-loading">
        <i className="fas fa-circle-notch fa-spin"></i>
        <span>Loading finance development desk...</span>
      </div>
    );
  }

  return (
    <div className="fd-page">
      <header className="fd-topbar">
        <button className="fd-back" onClick={() => navigate('/dashboard')} type="button">
          <i className="fas fa-arrow-left"></i>
          Dashboard
        </button>
        <div className="fd-title-block">
          <span>FINA development portal</span>
          <h1>Trading Year Control Room</h1>
        </div>
        <div className="fd-session-chip">
          <i className="fas fa-user-shield"></i>
          <span>{userEmail}</span>
        </div>
      </header>

      {(error || notice) && (
        <div className={`fd-message ${error ? 'error' : 'success'}`}>
          {error || notice}
        </div>
      )}

      <main className="fd-shell">
        <aside className="fd-rail">
          <div className="fd-market-clock">
            <span>Current round</span>
            <strong>{state?.game?.current_period?.label}</strong>
            <div className={`fd-timer ${isRoundOpen ? 'live' : ''}`}>
              {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
            </div>
            <small>{isRoundOpen ? 'Decision window open' : 'Holding by default'}</small>
          </div>

          <nav className="fd-nav" aria-label="Finance development sections">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? 'active' : ''}
                onClick={() => setActiveTab(key)}
              >
                <i className={`fas ${icon}`}></i>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <TeamPanel
            team={state?.team}
            createNewTeam={createNewTeam}
            joinExistingTeam={joinExistingTeam}
            teamName={teamName}
            setTeamName={setTeamName}
            teamCode={teamCode}
            setTeamCode={setTeamCode}
          />
        </aside>

        <section className="fd-workspace">
          <RoundStrip periods={state?.periods || []} currentIndex={state?.game?.current_period_index || 0} />

          {activeTab === 'discrete' && (
            <DiscreteDesk
              state={state}
              orderAsset={orderAsset}
              setOrderAsset={setOrderAsset}
              orderSide={orderSide}
              setOrderSide={setOrderSide}
              orderQuantity={orderQuantity}
              setOrderQuantity={setOrderQuantity}
              selectedAsset={selectedAsset}
              submitOrder={submitOrder}
              isLeader={isLeader}
              isRoundOpen={isRoundOpen}
              interestRate={interestRate}
            />
          )}

          {activeTab === 'continuous' && (
            <ContinuousDesk
              state={state}
              orderAsset={orderAsset}
              setOrderAsset={setOrderAsset}
              orderSide={orderSide}
              setOrderSide={setOrderSide}
              orderQuantity={orderQuantity}
              setOrderQuantity={setOrderQuantity}
              submitOrder={submitOrder}
              isLeader={isLeader}
            />
          )}

          {activeTab === 'gamemaster' && isAdmin && (
            <GamemasterDesk
              state={state}
              startRound={() => runGameAction('/trading/round/start', 'Round started.')}
              advanceRound={() => runGameAction('/trading/round/advance', 'Advanced to next quarter.')}
              resetGame={() => runGameAction('/trading/round/reset', 'Game reset to 2018 Q1.')}
            />
          )}

          {activeTab === 'performance' && (
            <PerformanceDesk portfolio={state?.portfolio} leaderboard={state?.leaderboard || []} assets={state?.assets || []} />
          )}

          {activeTab === 'email' && (
            <EmailDraft text={state?.miki_email_draft || ''} copyEmailDraft={copyEmailDraft} />
          )}
        </section>
      </main>
    </div>
  );
}

function TeamPanel({
  team,
  createNewTeam,
  joinExistingTeam,
  teamName,
  setTeamName,
  teamCode,
  setTeamCode,
}) {
  if (team) {
    return (
      <section className="fd-team-panel">
        <span>Team link</span>
        <h2>{team.team_name}</h2>
        <div className="fd-team-code">{team.team_code}</div>
        <dl>
          <div>
            <dt>Leader</dt>
            <dd>{team.leader_email}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{team.member_count}/3</dd>
          </div>
        </dl>
        <ul>
          {team.members.map((member) => (
            <li key={member}>{member}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="fd-team-panel">
      <span>No team linked</span>
      <h2>Join the desk</h2>
      <form onSubmit={createNewTeam}>
        <label>
          Team name
          <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team Delta" required />
        </label>
        <button type="submit">Create team</button>
      </form>
      <form onSubmit={joinExistingTeam}>
        <label>
          Team code
          <input value={teamCode} onChange={(event) => setTeamCode(event.target.value.toUpperCase())} placeholder="FD-ABC123" required />
        </label>
        <button type="submit">Join team</button>
      </form>
    </section>
  );
}

function RoundStrip({ periods, currentIndex }) {
  return (
    <div className="fd-round-strip" aria-label="Trading periods from 2018 to 2022">
      {periods.map((period, index) => (
        <div
          className={`fd-period ${index === currentIndex ? 'current' : ''} ${index < currentIndex ? 'past' : ''}`}
          key={period.id}
        >
          <span>{period.label}</span>
          <small>{period.months}</small>
        </div>
      ))}
    </div>
  );
}

function AssetGrid({ assets }) {
  return (
    <div className="fd-asset-grid">
      {assets.map((asset) => (
        <article key={asset.id} className={`fd-asset-card ${asset.tradable ? '' : 'muted'}`}>
          <div className="fd-asset-head">
            <span style={{ background: asset.color }}></span>
            <div>
              <h3>{asset.fake_name}</h3>
              <small>{asset.kind}{asset.tradable ? '' : ' · info only'}</small>
            </div>
          </div>
          <Sparkline series={asset.series} color={asset.color} />
          <p>{asset.profile}</p>
          <strong>{asset.kind === 'FX' ? number(asset.price, 4) : money(asset.price, asset.price < 10 ? 4 : 0)}</strong>
        </article>
      ))}
    </div>
  );
}

function DiscreteDesk({
  state,
  orderAsset,
  setOrderAsset,
  orderSide,
  setOrderSide,
  orderQuantity,
  setOrderQuantity,
  selectedAsset,
  submitOrder,
  isLeader,
  isRoundOpen,
  interestRate,
}) {
  const disabled = !state?.team || !isLeader || !isRoundOpen;
  return (
    <div className="fd-stack">
      <section className="fd-trade-desk">
        <div className="fd-section-heading">
          <span>Discrete version</span>
          <h2>Quarterly order ticket</h2>
        </div>
        <div className="fd-desk-grid">
          <form className="fd-order-ticket" onSubmit={(event) => submitOrder(event, 'discrete')}>
            <label>
              Asset
              <select value={orderAsset} onChange={(event) => setOrderAsset(event.target.value)}>
                {(state?.assets || []).filter((asset) => asset.tradable).map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.fake_name}</option>
                ))}
              </select>
            </label>
            <div className="fd-side-toggle">
              <button type="button" className={orderSide === 'buy' ? 'active' : ''} onClick={() => setOrderSide('buy')}>
                <i className="fas fa-arrow-trend-up"></i>
                Buy
              </button>
              <button type="button" className={orderSide === 'sell' ? 'active sell' : 'sell'} onClick={() => setOrderSide('sell')}>
                <i className="fas fa-arrow-trend-down"></i>
                Sell
              </button>
            </div>
            <label>
              Quantity
              <input type="number" min="0.0001" step="0.0001" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} />
            </label>
            <button className="fd-primary" disabled={disabled} type="submit">
              <i className="fas fa-bolt"></i>
              Place quarterly order
            </button>
            <p className="fd-form-note">
              {!state?.team ? 'Create or join a team first.' : !isLeader ? 'Only the team leader can submit orders.' : !isRoundOpen ? 'Round is closed; no action means hold.' : 'The order uses the current quarter price.'}
            </p>
          </form>

          <div className="fd-price-slab">
            <span>Selected asset</span>
            <h3>{selectedAsset?.fake_name}</h3>
            <strong>{selectedAsset?.kind === 'FX' ? number(selectedAsset?.price, 4) : money(selectedAsset?.price, selectedAsset?.price < 10 ? 4 : 0)}</strong>
            <p>{selectedAsset?.profile}</p>
            <div className="fd-rate-box">
              <span>Cash earns annualized interest</span>
              <b>{pct((interestRate || 0) * 100)}</b>
            </div>
          </div>
        </div>
      </section>

      <MarketTape news={state?.news || []} />
      <section className="fd-asset-roster">
        <div className="fd-section-heading">
          <span>Fake names</span>
          <h2>Tradable universe</h2>
        </div>
        <AssetGrid assets={state?.assets || []} />
      </section>
      <PortfolioPanel portfolio={state?.portfolio} assets={state?.assets || []} />
    </div>
  );
}

function MarketTape({ news }) {
  return (
    <section className="fd-news-board">
      <div className="fd-section-heading">
        <span>Market tape</span>
        <h2>Signals and rumors</h2>
      </div>
      <div className="fd-news-grid">
        {news.slice(-10).reverse().map((item) => (
          <article key={`${item.year}-${item.asset_id}-${item.summary}`} className="fd-news-item">
            <div>
              <span>{item.year}</span>
              <strong>{item.asset_name}</strong>
            </div>
            <p>{item.summary}</p>
            <em>{item.rumor}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContinuousDesk({
  state,
  orderAsset,
  setOrderAsset,
  orderSide,
  setOrderSide,
  orderQuantity,
  setOrderQuantity,
  submitOrder,
  isLeader,
}) {
  return (
    <div className="fd-stack">
      <section className="fd-api-board">
        <div className="fd-section-heading">
          <span>Continuous version</span>
          <h2>Algorithm API</h2>
        </div>
        <div className="fd-api-grid">
          <div className="fd-code-block">
            <span>Snapshot</span>
            <code>{state?.continuous_api?.snapshot}</code>
            <span>Order</span>
            <code>{state?.continuous_api?.order}</code>
            <pre>{JSON.stringify(state?.continuous_api?.order_body, null, 2)}</pre>
          </div>
          <div className="fd-key-panel">
            <span>Team API key</span>
            <strong>{state?.team?.api_key || 'Visible to team leader after team creation'}</strong>
            <p>Algorithms can poll the snapshot endpoint and place continuous buy/sell orders with this key.</p>
          </div>
        </div>
      </section>

      <section className="fd-trade-desk compact">
        <div className="fd-section-heading">
          <span>Manual continuous test</span>
          <h2>Live order ticket</h2>
        </div>
        <form className="fd-order-ticket inline" onSubmit={(event) => submitOrder(event, 'continuous')}>
          <select value={orderAsset} onChange={(event) => setOrderAsset(event.target.value)}>
            {(state?.assets || []).filter((asset) => asset.tradable).map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.fake_name} · {asset.kind === 'FX' ? number(asset.continuous_price, 4) : money(asset.continuous_price, asset.continuous_price < 10 ? 4 : 0)}</option>
            ))}
          </select>
          <select value={orderSide} onChange={(event) => setOrderSide(event.target.value)}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <input type="number" min="0.0001" step="0.0001" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} />
          <button className="fd-primary" disabled={!state?.team || !isLeader} type="submit">Submit</button>
        </form>
      </section>

      <AssetGrid assets={state?.assets || []} />
    </div>
  );
}

function PortfolioPanel({ portfolio, assets }) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  return (
    <section className="fd-portfolio-panel">
      <div className="fd-section-heading">
        <span>Team book</span>
        <h2>Holdings and cash</h2>
      </div>
      {!portfolio ? (
        <div className="fd-empty">No portfolio yet. Link a team to begin.</div>
      ) : (
        <>
          <div className="fd-metrics">
            <Metric label="Cash" value={money(portfolio.cash)} />
            <Metric label="Equity" value={money(portfolio.equity)} />
            <Metric label="Return" value={pct(portfolio.return_pct)} className={classForReturn(portfolio.return_pct)} />
          </div>
          <div className="fd-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.length === 0 && (
                  <tr><td colSpan="4">Cash only.</td></tr>
                )}
                {portfolio.holdings.map((holding) => {
                  const asset = assetMap.get(holding.asset_id);
                  return (
                    <tr key={holding.asset_id}>
                      <td>{asset?.fake_name || holding.asset_id}</td>
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

function Metric({ label, value, className = '' }) {
  return (
    <div className="fd-metric">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

function GamemasterDesk({ state, startRound, advanceRound, resetGame }) {
  return (
    <div className="fd-stack">
      <section className="fd-gm-panel">
        <div className="fd-section-heading">
          <span>Gamemaster</span>
          <h2>Round control</h2>
        </div>
        <div className="fd-control-row">
          <button type="button" onClick={startRound}><i className="fas fa-play"></i> Start 3-minute cycle</button>
          <button type="button" onClick={advanceRound}><i className="fas fa-forward-step"></i> Present winner and advance</button>
          <button type="button" className="danger" onClick={resetGame}><i className="fas fa-rotate-left"></i> Reset game</button>
        </div>
      </section>
      <Leaderboard leaderboard={state?.leaderboard || []} />
    </div>
  );
}

function PerformanceDesk({ portfolio, leaderboard, assets }) {
  return (
    <div className="fd-stack">
      <PortfolioPanel portfolio={portfolio} assets={assets} />
      <section className="fd-history-panel">
        <div className="fd-section-heading">
          <span>Quarterly marks</span>
          <h2>Performance over the years</h2>
        </div>
        <div className="fd-history-grid">
          {(portfolio?.history || []).map((item) => (
            <div key={item.period.id} className="fd-history-cell">
              <span>{item.period.label}</span>
              <strong>{money(item.equity)}</strong>
              <em className={classForReturn(item.return_pct)}>{pct(item.return_pct)}</em>
            </div>
          ))}
        </div>
      </section>
      <Leaderboard leaderboard={leaderboard} />
    </div>
  );
}

function Leaderboard({ leaderboard }) {
  return (
    <section className="fd-leaderboard">
      <div className="fd-section-heading">
        <span>Every three months</span>
        <h2>Current ranking</h2>
      </div>
      <div className="fd-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Members</th>
              <th>Equity</th>
              <th>Return</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 && (
              <tr><td colSpan="5">No teams yet.</td></tr>
            )}
            {leaderboard.map((team) => (
              <tr key={team.team_code}>
                <td>{team.rank}</td>
                <td>{team.team_name}</td>
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

function EmailDraft({ text, copyEmailDraft }) {
  return (
    <section className="fd-email-panel">
      <div className="fd-section-heading">
        <span>Email draft</span>
        <h2>Message for Miki</h2>
      </div>
      <pre>{text}</pre>
      <button className="fd-primary" type="button" onClick={copyEmailDraft}>
        <i className="fas fa-copy"></i>
        Copy draft
      </button>
    </section>
  );
}

export default FinanceDevelopmentPortal;
