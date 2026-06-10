// ──────────────────────────────────────────────────────────────
//  Loom · Primitives — atoms shared across screens
// ──────────────────────────────────────────────────────────────

function Icn({ name, size = 16, ...rest }) {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center' }}
      dangerouslySetInnerHTML={{ __html: Icon(name, { size, ...rest }) }}
    />
  );
}

function Button({ variant = 'secondary', size, icon, iconRight, children, ...rest }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <Icn name={icon} size={14} />}
      {children}
      {iconRight && <Icn name={iconRight} size={14} />}
    </button>
  );
}

function Badge({ tone = 'neutral', mono, children, ...rest }) {
  const cls = ['badge', `badge-${tone}`, mono && 'badge-mono'].filter(Boolean).join(' ');
  return <span className={cls} {...rest}>{children}</span>;
}

function Kbd({ children }) { return <span className="kbd">{children}</span>; }

function Avatar({ initials, variant }) {
  const cls = ['avatar', variant && `avatar-${variant}`].filter(Boolean).join(' ');
  return <span className={cls} style={{ width: 30, height: 30, fontSize: 11 }}>{initials}</span>;
}

// Rule-ID chip — stable monospace identity
function Rid({ children, size, ghost }) {
  const cls = ['rid', size === 'lg' && 'rid-lg', ghost && 'rid-ghost'].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}

// Lifecycle status — colour & label by state, never size
const STATUS_LABEL = {
  draft: 'draft', in_review: 'in review', approved: 'approved',
  active: 'active', stale: 'stale', retired: 'retired',
};
function Status({ state }) {
  return (
    <span className={`status status-${state}`}>
      <span className="sd" />
      <span className="lbl">{STATUS_LABEL[state] || state}</span>
    </span>
  );
}

function IconSvg({ name, size = 16, ...rest }) { return <Icn name={name} size={size} {...rest} />; }

// Screen scaffolding shared by screens 2–5
function ScreenHead({ title, intro, children }) {
  return (
    <div className="scr-head">
      <h1 className="scr-title">{title}</h1>
      {intro && <p className="scr-intro">{intro}</p>}
      {children && <div className="scr-stats">{children}</div>}
    </div>
  );
}
function Stat({ n, label, tone }) {
  return (
    <div className={'stat' + (tone ? ' stat-' + tone : '')}>
      <div className="stat-n">{n}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
function CardHead({ title, sub, right }) {
  return (
    <div className="card-head">
      <div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div>
      {right}
    </div>
  );
}

Object.assign(window, { Icn, Button, Badge, Kbd, Avatar, Rid, Status, STATUS_LABEL, IconSvg, ScreenHead, Stat, CardHead });
