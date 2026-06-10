// ──────────────────────────────────────────────────────────────
//  Loom · Chrome — topbar + persistent left rail
// ──────────────────────────────────────────────────────────────

function Topbar() {
  const { SEAM } = window.LOOM;
  return (
    <React.Fragment>
      <div className="lm-brand">
        <span className="wordmark">Loom<span className="wordmark-stop">.</span></span>
        <span className="mark-sub">Seam authoring</span>
      </div>
      <div className="lm-top">
        <div className="lm-search">
          <Icn name="search" size={14} />
          <span>Search rules, regimes, authorities…</span>
          <span style={{ display: 'inline-flex', gap: 3 }}><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </div>
        <span className="spacer" />
        <span className="lm-vpill"><span className="led" /> seam {SEAM.version}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
          <Icn name="bell" size={17} />
          <Avatar initials="RH" variant="brand" />
        </span>
      </div>
    </React.Fragment>
  );
}

const RAIL = [
  { num: '01', key: 'authoring', label: 'Authoring', icon: 'edit' },
  { num: '02', key: 'review', label: 'Review queue', icon: 'fileText', count: 4 },
  { num: '03', key: 'watch', label: 'Regime Watch', icon: 'bell', count: 3, alert: true },
  { num: '04', key: 'coverage', label: 'Coverage', icon: 'pie' },
  { num: '05', key: 'releases', label: 'Releases', icon: 'layers', count: 1 },
  { num: '06', key: 'tenants', label: 'Tenants', icon: 'building' },
];

function Rail({ route, onRoute }) {
  const { SEAM } = window.LOOM;
  return (
    <nav className="lm-rail">
      <div className="lm-rail-section">Seam</div>
      {RAIL.map((it) => (
        <a
          key={it.key}
          className="lm-nav"
          data-active={route === it.key || undefined}
          onClick={(e) => { e.preventDefault(); onRoute(it.key); }}
          href="#"
        >
          <span className="num">{it.num}</span>
          <Icn name={it.icon} size={15} />
          <span>{it.label}</span>
          {it.count != null && (
            <span className="count" style={it.alert ? { background: 'var(--warn-50)', color: 'var(--warn-text)', borderColor: 'var(--warn-100)' } : null}>{it.count}</span>
          )}
        </a>
      ))}

      <div className="lm-rail-foot">
        <div className="row"><span className="k">Active rules</span><span className="v">{SEAM.counts.regulatory}</span></div>
        <div className="row"><span className="k">ICP · OBJ · MSG</span><span className="v">{SEAM.counts.icp}·{SEAM.counts.objection}·{SEAM.counts.messaging}</span></div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="k">Candidate</span>
          <span className="v" style={{ color: 'var(--accent-700)' }}>1.2.0</span>
        </div>
      </div>
    </nav>
  );
}

window.Topbar = Topbar;
window.Rail = Rail;
window.RAIL = RAIL;
