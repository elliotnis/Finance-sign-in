const STAGES = [
  { key: 'access', number: '01', label: 'Access' },
  { key: 'profile', number: '02', label: 'Student record' },
  { key: 'portal', number: '03', label: 'Portal' },
];

function PortalAuthShell({ currentStage = 'access', children }) {
  const currentIndex = Math.max(0, STAGES.findIndex((stage) => stage.key === currentStage));

  return (
    <div className="container portal-auth-shell">
      <aside className="portal-auth-aside">
        <div className="portal-auth-brand">
          <img
            className="portal-auth-brand-logo"
            src="https://bm.hkust.edu.hk/themes/custom/sbm/images/logo-sbm-white.svg"
            alt="HKUST Business School"
          />
        </div>

        <div className="portal-auth-statement">
          <span>FINA / QFIN / SGFN</span>
          <h1>Student services, arranged around your week.</h1>
        </div>

        <ol className="portal-auth-progress" aria-label="Account setup progress">
          {STAGES.map((stage, index) => {
            const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
            return (
              <li className={state} key={stage.key} aria-current={state === 'current' ? 'step' : undefined}>
                <span>{state === 'complete' ? <i className="fas fa-check" aria-hidden="true"></i> : stage.number}</span>
                <strong>{stage.label}</strong>
              </li>
            );
          })}
        </ol>

        <div className="portal-auth-footer">
          <span>HKUST Business School</span>
          <i className="fas fa-arrow-trend-up" aria-hidden="true"></i>
        </div>
      </aside>

      <main className="portal-auth-main">{children}</main>
    </div>
  );
}

export default PortalAuthShell;
