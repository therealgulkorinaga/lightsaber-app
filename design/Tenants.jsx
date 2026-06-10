// ──────────────────────────────────────────────────────────────
//  Loom · Screen 05 — Tenant Fleet
//  Adopter tenants, pinned versions, freshness, claims + upgrade diff.
// ──────────────────────────────────────────────────────────────

function TenantItem({ t, active, onClick }) {
  const stale = t.stale > 0;
  return (
    <button className="tn-item" data-active={active || undefined} onClick={onClick}>
      <div className="tn-top">
        <div>
          <div className="tn-name">{t.name}</div>
          <div className="tn-type">{t.type} · {t.juris}</div>
        </div>
        <span className="tn-fresh">
          <span className={'fd ' + (stale ? 'stale' : 'ok')} />
          {stale ? `${t.stale} stale` : 'fresh'}
        </span>
      </div>
      <div className="tn-meta">
        <span><span className="k">pinned</span> seam {t.version}</span>
        <span><span className="k">claims</span> {t.claimsPending ? 'pending' : t.claims + ' active'}</span>
        {t.upgrade && <span style={{ marginLeft: 'auto' }}><Badge tone="brand">upgrade ready</Badge></span>}
      </div>
    </button>
  );
}

function TenantDetail({ t }) {
  const { published } = window.LOOM2;
  const stale = t.stale > 0;
  const dot = { ok: 'var(--ok)', accent: 'var(--accent)', warn: 'var(--warn)' };
  return (
    <div className="card">
      <div className="tn-detail-head">
        <div className="dh-top">
          <span style={{ display: 'inline-flex', color: 'var(--brand)' }}><Icn name="building" size={20} /></span>
          <h2>{t.name}</h2>
          <span style={{ marginLeft: 'auto' }}>
            {t.claimsPending ? <Badge tone="warn">claims pending</Badge> : <Badge tone="ok">claims approved</Badge>}
          </span>
        </div>
      </div>

      <div className="tn-kv">
        <div className="kv"><div className="k">Firm type</div><div className="v">{t.type}</div></div>
        <div className="kv"><div className="k">Jurisdiction</div><div className="v mono">{t.juris}</div></div>
        <div className="kv"><div className="k">Pinned seam</div><div className="v mono">{t.version}</div></div>
        <div className="kv"><div className="k">Freshness</div><div className="v" style={stale ? { color: 'var(--warn-text)' } : { color: 'var(--ok)' }}>{stale ? `${t.stale} stale rule${t.stale > 1 ? 's' : ''}` : 'all fresh'}</div></div>
        <div className="kv"><div className="k">Approved claims</div><div className="v">{t.claimsPending ? 'pending' : t.claims}</div></div>
        <div className="kv"><div className="k">Latest published</div><div className="v mono">{published}</div></div>
      </div>

      {t.upgrade ? (
        <div className="upg">
          <div className="upg-head">
            <Icn name="trendingUp" size={17} color="var(--brand)" />
            <span className="uh-t">Upgrade available</span>
            <span className="uh-v"><Rid ghost>{t.version}</Rid><Icn name="arrowRight" size={13} /><Rid>{published}</Rid></span>
          </div>
          <div className="upg-body">
            {t.upgradeDiff.map((d, i) => (
              <div className="upg-row" key={i}>
                <span className="u-db" style={{ background: dot[d.tone] }} />
                <span className="u-t" dangerouslySetInnerHTML={{ __html: d.t }} />
              </div>
            ))}
          </div>
          <div className="upg-foot">
            <Button variant="primary" icon="arrowUpRight">Preview & upgrade</Button>
            <Button variant="secondary" icon="fileText">Diff report</Button>
            <span style={{ marginLeft: 'auto', font: '400 11.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>Pin holds until the tenant accepts</span>
          </div>
        </div>
      ) : (
        <div className="upg" style={{ borderColor: 'var(--border)' }}>
          <div className="upg-head" style={{ background: 'var(--ok-100)' }}>
            <Icn name="checkCircle" size={17} color="var(--ok)" />
            <span className="uh-t" style={{ color: '#065F46' }}>On the latest published seam</span>
            <span className="uh-v" style={{ color: '#065F46' }}><Rid>{t.version}</Rid></span>
          </div>
          <div className="upg-body">
            <div className="upg-row"><span className="u-db" style={{ background: 'var(--ok)' }} /><span className="u-t">No pending upgrade. Next change arrives when seam <b>{window.LOOM2.release.version}</b> publishes.</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tenants() {
  const { tenants, published } = window.LOOM2;
  const [sel, setSel] = React.useState(tenants[1].name);
  const t = tenants.find(x => x.name === sel);
  const onLatest = tenants.filter(x => x.version === published).length;
  const needsUpgrade = tenants.filter(x => x.upgrade).length;
  const staleTenants = tenants.filter(x => x.stale > 0).length;
  return (
    <div className="scr-scroll"><div className="scr scr-wide">
      <ScreenHead title="Tenant Fleet"
        intro={<span><span className="hl">Who is running what.</span> Each adopter pins a seam version. Track freshness and claims status across the fleet, and run the upgrade when a newer version publishes.</span>}>
        <Stat n={tenants.length} label="Tenants" tone="brand" />
        <Stat n={onLatest} label={`On seam ${published}`} tone="ok" />
        <Stat n={needsUpgrade} label="Upgrade ready" tone="accent" />
        <Stat n={staleTenants} label="Carrying stale rules" tone="warn" />
      </ScreenHead>

      <div className="md">
        <div>
          <div className="md-list-h">Adopter tenants</div>
          <div className="md-list">
            {tenants.map(x => (
              <TenantItem key={x.name} t={x} active={x.name === sel} onClick={() => setSel(x.name)} />
            ))}
          </div>
        </div>
        <div>
          <div className="md-list-h">{t.name}</div>
          <TenantDetail t={t} />
        </div>
      </div>
    </div></div>
  );
}

window.Tenants = Tenants;
