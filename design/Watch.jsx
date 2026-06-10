// ──────────────────────────────────────────────────────────────
//  Loom · Screen 02 — Regime Watch
//  Master list of watch items + impact report for the selected one.
// ──────────────────────────────────────────────────────────────

function watchBadge(state) {
  if (state === 'triggered') return <Badge tone="warn">triggered</Badge>;
  if (state === 'overdue') return <Badge tone="block">overdue</Badge>;
  return <Badge tone="neutral">monitoring</Badge>;
}

function WatchItem({ item, active, onClick }) {
  return (
    <button className="watch-item" data-active={active || undefined} data-state={item.state} onClick={onClick}>
      <div className="watch-top">
        <Rid>{item.id}</Rid>
        {watchBadge(item.state)}
        <span className="watch-regime">{item.regime}</span>
      </div>
      <div className="watch-title">{item.title}</div>
      <div className="watch-trigger">
        <span className="ico"><Icn name={item.trigger.startsWith('Event') ? 'flag' : 'calendar'} size={13} /></span>
        <span>{item.trigger}</span>
      </div>
      <div className="watch-meta">
        <span><span className="k">re-verify</span> <span className={item.reverifyState === 'overdue' ? 'rv-over' : ''}>{item.reverify}{item.reverifyNote ? ' · ' + item.reverifyNote : ''}</span></span>
        <span style={{ marginLeft: 'auto' }}><span className="k">dependents</span> {item.deps}</span>
      </div>
    </button>
  );
}

function ImpactReport({ item }) {
  const im = item.impact;
  return (
    <div className="card impact">
      <div className="imp-banner">
        <span className="ib-icn"><Icn name="alertTriangle" size={18} /></span>
        <div>
          <div className="ib-t">Triggered {im.triggeredOn} · impact report</div>
          <div className="ib-d">{im.summary}</div>
        </div>
      </div>

      <div className="imp-sec">
        <div className="imp-h"><span className="t">Rules to stale & re-author</span><span className="c">{im.staled.length}</span></div>
        {im.staled.map(r => (
          <div className="imp-row" key={r.id}>
            <Rid>{r.id}</Rid>
            <div className="grow">
              <div className="r-title">{r.title}</div>
              {r.note && <div className="r-sub">{r.note}</div>}
            </div>
            <Status state={r.from} />
            <span className="imp-arrow"><Icn name="arrowRight" size={14} /></span>
            <Status state={r.to} />
          </div>
        ))}
      </div>

      <div className="imp-sec">
        <div className="imp-h"><span className="t">Tenants on affected versions</span><span className="c">{im.tenants.length}</span></div>
        {im.tenants.map(t => (
          <div className="imp-row" key={t.name}>
            <span style={{ display: 'inline-flex', color: 'var(--text-3)' }}><Icn name="building" size={16} /></span>
            <div className="grow"><div className="r-title">{t.name}</div></div>
            <Badge tone="neutral" mono>seam {t.version}</Badge>
            <span className="r-sub" style={{ marginTop: 0, minWidth: 64, textAlign: 'right' }}>{t.rules} {t.rules === 1 ? 'rule' : 'rules'}</span>
          </div>
        ))}
      </div>

      <div className="imp-sec">
        <div className="imp-h"><span className="t">Artifacts that cited these rules</span><span className="c">{im.artifacts.length}</span></div>
        {im.artifacts.map(a => (
          <div className="imp-row" key={a.id}>
            <span style={{ display: 'inline-flex', color: 'var(--text-3)' }}><Icn name="fileText" size={16} /></span>
            <div className="grow">
              <div className="r-title">{a.kind} · {a.tenant}</div>
              <div className="r-sub">cited <span style={{ fontFamily: 'var(--font-mono)' }}>{a.cited}</span> · {a.date}</div>
            </div>
            <Rid ghost>{a.id}</Rid>
          </div>
        ))}
      </div>

      <div className="imp-sec" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant="primary" icon="edit">Open re-authoring</Button>
        <Button variant="secondary" icon="flag">Mark rules stale</Button>
        <span style={{ marginLeft: 'auto', font: '400 11.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>Re-run affected artifacts after re-author</span>
      </div>
    </div>
  );
}

function WatchDetail({ item }) {
  const isEvent = item.trigger.startsWith('Event');
  return (
    <div className="card">
      <div className="card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Rid size="lg">{item.id}</Rid>
          {watchBadge(item.state)}
        </div>
        <span className="sub">{item.regime}</span>
      </div>
      <div className="imp-sec" style={{ borderTop: 'none' }}>
        <div className="imp-h"><span className="t">{isEvent ? 'Trigger event' : 'Trigger date'}</span></div>
        <p style={{ font: '400 13px/1.6 var(--font-sans)', color: 'var(--text-2)' }}>{item.trigger.replace(/^(Event|Date): /, '')}</p>
      </div>
      <div className="imp-sec">
        <div className="tn-kv" style={{ padding: 0 }}>
          <div className="kv"><div className="k">Re-verify</div><div className={'v mono' + (item.reverifyState === 'overdue' ? '' : '')} style={item.reverifyState === 'overdue' ? { color: 'var(--block-text)' } : null}>{item.reverify}</div></div>
          <div className="kv"><div className="k">Status</div><div className="v">{item.reverifyState === 'overdue' ? <span style={{ color: 'var(--block-text)' }}>{item.reverifyNote}</span> : item.state}</div></div>
          <div className="kv"><div className="k">Dependent rules</div><div className="v mono">{item.deps}</div></div>
        </div>
      </div>
      <div className="imp-sec" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant={item.state === 'overdue' ? 'primary' : 'secondary'} icon="refresh">Re-verify now</Button>
        <Button variant="secondary" icon="flag">Mark triggered</Button>
        {item.state === 'overdue' && <span style={{ marginLeft: 'auto', font: '500 11.5px/1.4 var(--font-sans)', color: 'var(--block-text)' }}>{item.reverifyNote}</span>}
      </div>
    </div>
  );
}

function RegimeWatch() {
  const { watch } = window.LOOM2;
  const [sel, setSel] = React.useState(watch[0].id);
  const item = watch.find(w => w.id === sel);
  const triggered = watch.filter(w => w.state === 'triggered').length;
  const overdue = watch.filter(w => w.state === 'overdue').length;
  return (
    <div className="scr-scroll"><div className="scr scr-wide">
      <ScreenHead title="Regime Watch"
        intro={<span><span className="hl">The maintenance surface.</span> Each watch item ties a regime movement to the rules that depend on it, with a trigger and a re-verify date. When a trigger fires, Loom builds the impact report: what stales, who is exposed, what to re-run.</span>}>
        <Stat n={watch.length} label="Watch items" />
        <Stat n={triggered} label="Triggered" tone="warn" />
        <Stat n={overdue} label="Overdue re-verify" tone="block" />
        <Stat n={watch.reduce((a, w) => a + w.deps, 0)} label="Dependent rules" tone="brand" />
      </ScreenHead>

      <div className="md">
        <div>
          <div className="md-list-h">Watch list</div>
          <div className="md-list">
            {watch.map(w => (
              <WatchItem key={w.id} item={w} active={w.id === sel} onClick={() => setSel(w.id)} />
            ))}
          </div>
        </div>
        <div>
          <div className="md-list-h">{item.impact ? 'Impact report' : 'Detail'}</div>
          {item.impact ? <ImpactReport item={item} /> : <WatchDetail item={item} />}
        </div>
      </div>
    </div></div>
  );
}

window.RegimeWatch = RegimeWatch;
