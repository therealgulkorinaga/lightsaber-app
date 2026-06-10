// ──────────────────────────────────────────────────────────────
//  Loom · Screen 04 — Evaluation & Release Gate
//  Candidate 1.2.0: five gate checks (blocking) + changelog.
// ──────────────────────────────────────────────────────────────

function GateCheck({ check, open, onToggle }) {
  const fail = check.state === 'fail';
  const hasCases = !!check.cases;
  return (
    <div className={'gck ' + check.state}>
      <div className="gck-head" onClick={hasCases ? onToggle : undefined} style={hasCases ? null : { cursor: 'default' }}>
        <span className="gck-icn"><Icn name={fail ? 'alertCircle' : 'checkCircle'} size={18} /></span>
        <div>
          <div className="gck-title">{check.title}</div>
          <div className="gck-sub">{check.sub}</div>
        </div>
        <span className="gck-meta">
          {check.total ? `${check.pass}/${check.total}` : (fail ? 'fail' : 'pass')}
        </span>
        {hasCases && <span style={{ color: 'var(--text-4)', marginLeft: 8 }}><Icn name={open ? 'chevronDown' : 'chevronRight'} size={15} /></span>}
      </div>
      {hasCases && open && (
        <div className="gck-cases">
          {check.cases.map(c => (
            <div className={'gck-case ' + c.state} key={c.id}>
              <span className={'cc-icn ' + c.state}><Icn name={c.state === 'fail' ? 'x' : 'check'} size={14} /></span>
              <span className="cc-id">{c.id}</span>
              <span className="cc-t">{c.t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Changelog() {
  const { release } = window.LOOM2;
  const dotColor = { ok: 'var(--ok)', accent: 'var(--accent)', warn: 'var(--warn)', brand: 'var(--brand)', neutral: 'var(--slate-300)' };
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ font: '600 14px/1.2 var(--font-sans)', color: 'var(--text-1)', letterSpacing: '-0.01em' }}>Changelog</h3>
        <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--text-3)' }}>{release.base} → {release.version}</span>
      </div>
      {release.changelog.map(grp => (
        <div className="chl-group" key={grp.group}>
          <div className="chl-h">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: dotColor[grp.tone] }} />
            <span className="lbl">{grp.group}</span>
            <span className="ct">{grp.items.length}</span>
          </div>
          {grp.items.map(it => (
            <div className="chl-item" key={it.id}>
              <Rid ghost>{it.id}</Rid>
              <span className="ci-note">{it.note}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Releases() {
  const { release } = window.LOOM2;
  const [open, setOpen] = React.useState({ eval: true });
  const failing = release.checks.filter(c => c.state === 'fail').length;
  const blocked = failing > 0;
  return (
    <div className="scr-scroll"><div className="scr scr-wide">
      <ScreenHead title="Evaluation & Release Gate"
        intro={<span><span className="hl">Nothing ships without a passing gate.</span> Candidate seam {release.version} assembles the approved rules since {release.base}. All five checks must be green before publish — every check, every case.</span>}>
        <Stat n={release.version} label="Candidate" tone="brand" />
        <Stat n={release.assembled} label="Rules assembled" />
        <Stat n={`${release.checks.filter(c => c.state === 'pass').length}/${release.checks.length}`} label="Checks passing" tone={blocked ? 'warn' : 'ok'} />
        <Stat n={failing} label="Checks failing" tone="block" />
      </ScreenHead>

      <div className={'publish-bar ' + (blocked ? 'block' : 'ok')}>
        <Icn name={blocked ? 'alertCircle' : 'checkCircle'} size={22} color={blocked ? 'var(--block)' : 'var(--ok)'} />
        <div>
          <div className="pb-t">{blocked ? `Publish blocked — ${failing} check failing` : 'Gate clear — ready to publish'}</div>
          <div className="pb-d">{blocked ? 'Fix the failing eval case and re-run the suite, or pull the rule that fails it from the candidate.' : `Seam ${release.version} can be published to the tenant fleet.`}</div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Button variant="secondary" icon="refresh">Re-run gate</Button>
          <Button variant="primary" icon="send" disabled={blocked}
            style={blocked ? { opacity: 0.45, cursor: 'not-allowed' } : null}>Publish {release.version}</Button>
        </span>
      </div>

      <div className="rel-grid">
        <div>
          <div className="md-list-h">Gate checks</div>
          {release.checks.map(c => (
            <GateCheck key={c.id} check={c} open={!!open[c.id]} onToggle={() => setOpen(o => Object.assign({}, o, { [c.id]: !o[c.id] }))} />
          ))}
        </div>
        <div>
          <div className="md-list-h">Release contents</div>
          <Changelog />
        </div>
      </div>
    </div></div>
  );
}

window.Releases = Releases;
