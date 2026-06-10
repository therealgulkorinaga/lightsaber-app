// Screen 04 — Coverage & Gap Ledger (Component D) + the consistency critic
// (Component AI). Matrix wired to /api/coverage; backlog to /api/gaps with
// triage; critic findings flagged, dismissed with reasons, never authored.

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, CardHead, Rid, ScreenHead, Stat } from '../primitives.tsx';
import { get, post, api, type User } from '../api.ts';

function depthBg(count: number) {
  if (count >= 6) return '#D7E1EE';
  if (count >= 3) return 'var(--brand-100)';
  if (count >= 1) return 'var(--brand-50)';
  return 'transparent';
}

export function Coverage({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [matrix, setMatrix] = useState<any>(null);
  const [gaps, setGaps] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canTriage = actor && ['analyst', 'practice_lead'].includes(actor.role);

  const load = useCallback(async () => {
    const [m, g, f] = await Promise.all([
      get('/api/coverage'),
      get('/api/gaps'),
      get('/api/assist/findings?status=open'),
    ]);
    setMatrix(m);
    setGaps(g.gaps);
    setFindings(f.findings.filter((x: any) => x.kind !== 'research_candidate'));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const triage = async (id: string, body: any) => {
    try {
      await api('PATCH', `/api/gaps/${id}`, body);
      await load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runCritic = async () => {
    try {
      const r = await post('/api/assist/critic');
      await load();
      if (!r.semantic_ran) setError('Critic ran its deterministic checks; semantic checks need the assist model configured.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const open = gaps.filter((g) => ['untriaged', 'backlog', 'in_authoring'].includes(g.triage_status));
  const atRisk = open.reduce((a, g) => a + (g.cost ?? 0), 0);

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title="Coverage & Gap Ledger"
          intro={
            <span>
              <span className="hl">Where the seam is deep, where it is thin, and what it is costing.</span> The matrix reads
              depth and freshness per jurisdiction and regime; the backlog ranks what live deals are abstaining on; the critic
              flags inconsistencies and never authors a word.
            </span>
          }
        >
          <Stat n={matrix ? matrix.rows.reduce((a: number, r: any) => a + r.cells.reduce((b: number, c: any) => b + (c.depth ?? 0), 0), 0) : '—'} label="Rules mapped" tone="brand" />
          <Stat n={open.length} label="Open gaps" tone="accent" />
          <Stat n={`£${atRisk}k`} label="Deal-value at risk" tone="block" />
          <Stat n={findings.length} label="Critic flags open" tone="warn" />
        </ScreenHead>

        {error && (
          <div className="card" style={{ padding: '12px 20px', marginBottom: 14, color: 'var(--warn-text)', font: '500 12.5px/1.4 var(--font-sans)' }}>
            {error}{' '}
            <a href="#" style={{ color: 'inherit' }} onClick={(e) => { e.preventDefault(); setError(null); }}>
              dismiss
            </a>
          </div>
        )}

        <div className="cov-stack">
          <div className="card" data-tour="matrix">
            <CardHead title="Coverage matrix" sub="Depth (rule count), freshness and gap pressure per jurisdiction × regime" />
            {matrix && (
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th className="rowhdr">Jurisdiction</th>
                      {matrix.regimes.map((r: string) => (
                        <th key={r}>{r}</th>
                      ))}
                      <th>open gaps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row: any) => (
                      <tr key={row.tag}>
                        <th>{row.tag}</th>
                        {row.cells.map((cell: any, i: number) => (
                          <td key={i}>
                            {!cell.in_scope ? (
                              <div className="mcell none">—</div>
                            ) : (
                              <div className="mcell" style={{ background: depthBg(cell.depth) }}>
                                <span className="depth">{cell.depth}</span>
                                <span className={'fresh' + (cell.stale > 0 ? ' stale' : '')} title={cell.stale > 0 ? `${cell.stale} stale` : 'fresh'} />
                              </div>
                            )}
                          </td>
                        ))}
                        <td>
                          <div className="mcell" style={{ background: row.open_gaps ? 'var(--warn-50)' : 'transparent' }}>
                            <span className="depth">{row.open_gaps || ''}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="cov-legend">
              <span className="lg"><span className="sw" style={{ background: 'var(--brand-50)' }} />1–2 rules</span>
              <span className="lg"><span className="sw" style={{ background: 'var(--brand-100)' }} />3–5</span>
              <span className="lg"><span className="sw" style={{ background: '#D7E1EE' }} />6+</span>
              <span className="lg" style={{ color: 'var(--text-4)' }}>— outside the regime's footprint</span>
            </div>
          </div>

          <div className="card" data-tour="backlog">
            <CardHead title="Gap backlog" sub="Fed from live-deal abstentions through the bounded ingestion schema; ranked by frequency × deal-cost" />
            {gaps.map((g) => (
              <div className="gap-row" key={g.id}>
                <span className="gap-rank">{g.rank || '·'}</span>
                <div>
                  <div className="gap-title">{g.abstention_text.slice(0, 110)}</div>
                  <div className="gap-sub">{g.tenant_name} · seen {new Date(g.logged_at).toLocaleDateString()}</div>
                  <div className="gap-tags">
                    <Badge tone={g.gap_kind === 'uncovered_objection' ? 'accent' : 'brand'}>{g.gap_kind.replace(/_/g, ' ')}</Badge>
                    {g.jurisdiction && <Badge tone="neutral" mono>{g.jurisdiction}</Badge>}
                    <Badge tone={g.triage_status === 'backlog' ? 'warn' : 'neutral'}>{g.triage_status.replace('_', ' ')}</Badge>
                    {g.linked_rule_id && <Rid ghost>{g.linked_rule_id}</Rid>}
                  </div>
                </div>
                <div className="gap-metrics">
                  <div className="gap-metric">
                    <div className="m-n">{g.frequency}</div>
                    <div className="m-l">deals</div>
                  </div>
                  <div className="gap-metric">
                    <div className="m-n cost">£{g.cost ?? 0}k</div>
                    <div className="m-l">at risk</div>
                  </div>
                  {canTriage && g.triage_status === 'untriaged' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => triage(g.id, { triage_status: 'backlog' })}>
                        Backlog
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { const reason = prompt('Rejection reason:'); if (reason) triage(g.id, { triage_status: 'rejected', triage_reason: reason }); }}>
                        Reject
                      </Button>
                    </>
                  )}
                  {canTriage && g.triage_status === 'backlog' && (
                    <Button size="sm" variant="ghost" onClick={() => { const cost = prompt('Practice cost estimate (£k):'); if (cost) triage(g.id, { cost_estimated_gbp: Number(cost) }); }}>
                      Estimate
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!gaps.length && (
              <div style={{ padding: '16px 20px', font: '400 13px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                No gaps logged. Deployed skills write here through their deployment key when they abstain in live deals.
              </div>
            )}
          </div>

          <div className="card" data-tour="critic">
            <CardHead
              title="Consistency & coverage critic"
              sub="Flags only; it authors nothing. Deterministic checks always run; semantic checks need the assist model."
              right={<Button size="sm" variant="secondary" icon="refresh" onClick={runCritic}>Run critic</Button>}
            />
            {findings.map((f) => (
              <div className="imp-row" key={f.id} style={{ padding: '12px 20px' }}>
                <Badge tone={f.kind === 'orphaned_reference' ? 'block' : 'warn'}>{f.kind.replace(/_/g, ' ')}</Badge>
                <div className="grow">
                  <div className="r-title">{f.detail?.note ?? f.kind}</div>
                  <div className="r-sub">
                    {(f.rule_ids ?? []).join(', ')}
                    {f.detail?.jurisdiction ? ` · ${f.detail.jurisdiction} × ${f.detail.regime}` : ''} · {f.detail?.source ?? 'deterministic'}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { const reason = prompt('Dismiss with reason:'); if (reason) post(`/api/assist/findings/${f.id}/dismiss`, { reason }).then(load).catch((e) => setError(e.message)); }}>
                  Dismiss
                </Button>
              </div>
            ))}
            {!findings.length && (
              <div style={{ padding: '16px 20px', font: '400 13px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                No open flags. Run the critic after a batch of authoring.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
