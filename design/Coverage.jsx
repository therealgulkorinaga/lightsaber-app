// ──────────────────────────────────────────────────────────────
//  Loom · Screen 03 — Coverage & Gap Ledger
//  Jurisdiction × regime depth/freshness matrix + ranked backlog.
// ──────────────────────────────────────────────────────────────

function depthBg(count) {
  if (count == null) return 'transparent';
  if (count >= 6) return '#D7E1EE';
  if (count >= 3) return 'var(--brand-100)';
  return 'var(--brand-50)';
}

function CoverageMatrix() {
  const { coverage } = window.LOOM2;
  return (
    <div className="card">
      <CardHead title="Coverage matrix" sub="Depth (rule count) and freshness per jurisdiction × regime" />
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="rowhdr">Jurisdiction</th>
              {coverage.regimes.map(r => <th key={r}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {coverage.rows.map(row => (
              <tr key={row}>
                <th>{row}</th>
                {coverage.cells[row].map((cell, i) => (
                  <td key={i}>
                    {cell == null
                      ? <div className="mcell none">—</div>
                      : (
                        <div className="mcell" style={{ background: depthBg(cell[0]) }}>
                          <span className="depth">{cell[0]}</span>
                          <span className={'fresh' + (cell[1] > 0 ? ' stale' : '')} title={cell[1] > 0 ? cell[1] + ' stale' : 'fresh'} />
                        </div>
                      )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cov-legend">
        <span className="lg"><span className="sw" style={{ background: 'var(--brand-50)' }} />1–2 rules</span>
        <span className="lg"><span className="sw" style={{ background: 'var(--brand-100)' }} />3–5 rules</span>
        <span className="lg"><span className="sw" style={{ background: '#D7E1EE' }} />6+ rules</span>
        <span className="lg"><span className="fresh" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />fresh</span>
        <span className="lg"><span className="fresh stale" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block' }} />has stale</span>
        <span className="lg" style={{ color: 'var(--text-4)' }}>— out of scope</span>
      </div>
    </div>
  );
}

function GapLedger() {
  const { gaps } = window.LOOM2;
  const [sort, setSort] = React.useState('rank');
  const sorted = [...gaps].sort((a, b) => {
    if (sort === 'freq') return b.freq - a.freq;
    if (sort === 'cost') return b.cost - a.cost;
    return (b.freq * b.cost) - (a.freq * a.cost);
  });
  return (
    <div className="card">
      <CardHead title="Gap backlog" sub="Fed from live-deal abstentions"
        right={
          <div className="gap-toolbar">
            <div className="gap-sort">
              <button data-on={sort === 'rank' || undefined} onClick={() => setSort('rank')}>Rank</button>
              <button data-on={sort === 'freq' || undefined} onClick={() => setSort('freq')}>Frequency</button>
              <button data-on={sort === 'cost' || undefined} onClick={() => setSort('cost')}>Deal-cost</button>
            </div>
          </div>
        } />
      {sorted.map((g, i) => (
        <div className="gap-row" key={g.id}>
          <span className="gap-rank">{i + 1}</span>
          <div>
            <div className="gap-title">{g.title}</div>
            <div className="gap-sub">{g.sub}</div>
            <div className="gap-tags">
              <Badge tone={g.type === 'objection' ? 'accent' : 'brand'}>{g.type}</Badge>
              <Badge tone="neutral" mono>{g.juris}</Badge>
              <Badge tone="neutral">{g.regime}</Badge>
              <span style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--text-4)', alignSelf: 'center' }}>seen {g.lastSeen}</span>
            </div>
          </div>
          <div className="gap-metrics">
            <div className="gap-metric"><div className="m-n">{g.freq}</div><div className="m-l">deals</div></div>
            <div className="gap-metric"><div className="m-n cost">£{g.cost}k</div><div className="m-l">at risk</div></div>
            <Button variant="secondary" size="sm" icon="plus">Author</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Coverage() {
  const { coverage, gaps } = window.LOOM2;
  let total = 0, staleCells = 0, scoped = 0, empty = 0;
  coverage.rows.forEach(r => coverage.cells[r].forEach(c => {
    if (c == null) return;
    scoped++; total += c[0]; if (c[1] > 0) staleCells++;
  }));
  const atRisk = gaps.reduce((a, g) => a + g.cost, 0);
  return (
    <div className="scr-scroll"><div className="scr scr-wide">
      <ScreenHead title="Coverage & Gap Ledger"
        intro={<span><span className="hl">Where the seam is deep, where it is thin, and what it is costing.</span> The matrix reads depth and freshness across jurisdictions and regimes. The backlog ranks the gaps that live deals are abstaining on, by frequency and deal-cost.</span>}>
        <Stat n={total} label="Rules mapped" tone="brand" />
        <Stat n={scoped} label="Cells covered" />
        <Stat n={staleCells} label="Cells with stale" tone="warn" />
        <Stat n={gaps.length} label="Open gaps" tone="accent" />
        <Stat n={'£' + atRisk + 'k'} label="Deal-value at risk" tone="block" />
      </ScreenHead>

      <div className="cov-stack">
        <CoverageMatrix />
        <GapLedger />
      </div>
    </div></div>
  );
}

window.Coverage = Coverage;
