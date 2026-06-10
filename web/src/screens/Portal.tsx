// The tenant portal (FR-H.3): the adopter admin's whole world. Pinned version
// and freshness, their claims, their gap log, and the defensibility pull.

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, CardHead, Rid, ScreenHead, Stat, Status } from '../primitives.tsx';
import { get, post, type User } from '../api.ts';

export function Portal({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [data, setData] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setData(await get('/api/portal')), []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const pull = async () => {
    const artifact_ref = prompt('Artifact reference (e.g. the proposal or response ID):');
    if (!artifact_ref) return;
    const artifact_text = prompt('Paste the artifact text or the rule IDs it cited:') ?? '';
    const deal_closed = confirm('Is this pull tied to a closed deal? (OK = yes)');
    try {
      setReport(await post('/api/defensibility', { artifact_ref, release_version: data.pinned_version, artifact_text, deal_closed }));
      await load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data)
    return (
      <div className="scr-scroll">
        <div className="scr scr-wide">{error ?? 'Loading…'}</div>
      </div>
    );

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title={`${data.tenant.name} — your seam`}
          intro={
            <span>
              <span className="hl">Current, grounded, defensible selling.</span> This portal shows the seam version your
              deployment runs, its freshness, your approved claims, and the audit trail. Your claims are yours alone; the shared
              corpus reaches you only through your deployed bundle.
            </span>
          }
        >
          <Stat n={data.pinned_version ?? '—'} label="Pinned seam" tone="brand" />
          <Stat n={data.stale_rules.length} label="Stale rules in your bundle" tone={data.stale_rules.length ? 'warn' : 'ok'} />
          <Stat n={data.claims.filter((c: any) => c.status === 'active').length} label="Active claims" tone="ok" />
          <Stat n={data.gaps.length} label="Gaps your deployment logged" />
        </ScreenHead>

        {error && (
          <div className="card" style={{ padding: '12px 20px', marginBottom: 14, color: 'var(--block-text, #B91C1C)', font: '500 12.5px/1.4 var(--font-sans)' }}>
            {error}
          </div>
        )}

        {data.upgrade_available && (
          <div className="publish-bar ok" style={{ marginBottom: 16 }}>
            <div>
              <div className="pb-t">Seam {data.latest_published} is published</div>
              <div className="pb-d">Your practice contact runs the upgrade; your pin holds until then, and past artifacts stay reproducible.</div>
            </div>
          </div>
        )}

        {data.stale_rules.length > 0 && (
          <div className="card" style={{ padding: '14px 20px', marginBottom: 16 }}>
            <span style={{ font: '500 12.5px/1.5 var(--font-sans)', color: 'var(--warn-text)' }}>
              The regime moved under {data.stale_rules.join(', ')}. Your engine cites them only with a staleness warning until the
              re-authored release reaches you.
            </span>
          </div>
        )}

        <div className="cov-stack">
          <div className="card" data-tour="portal-claims">
            <CardHead title="Your approved claims" sub="The only source the engine may assert your product facts from" />
            {data.claims.map((c: any) => (
              <div className="imp-row" key={`${c.claim_id}:${c.version}`} style={{ padding: '12px 20px' }}>
                <Rid>{c.claim_id}</Rid>
                <div className="grow">
                  <div className="r-title">{c.title}</div>
                  <div className="r-sub">v{c.version} · {c.category}{c.review_date ? ` · review by ${String(c.review_date).slice(0, 10)}` : ''}</div>
                </div>
                <Status state={c.status === 'active' ? 'active' : c.review_state} />
              </div>
            ))}
            {!data.claims.length && (
              <div style={{ padding: '14px 20px', font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                No claims yet: the engine abstains on every capability, certification, reference and figure. Author claims with
                your practice contact; each one needs evidence and a second pair of eyes.
              </div>
            )}
          </div>

          <div className="card" data-tour="portal-defensibility">
            <CardHead
              title="Defensibility"
              sub="Reconstruct the exact rule text and authority an artifact rested on, as of the version it cited"
              right={<Button size="sm" variant="primary" icon="fileText" onClick={pull}>Pull a report</Button>}
            />
            {report && (
              <div style={{ padding: '14px 20px' }}>
                <div style={{ font: '600 12.5px/1.4 var(--font-sans)', marginBottom: 8 }}>
                  {report.artifact_ref} · seam {report.cited_release.version}
                </div>
                {report.rules.map((r: any) => (
                  <div key={r.rule_id} style={{ marginBottom: 10 }}>
                    <Rid>{r.rule_id}</Rid>{' '}
                    <span style={{ font: '400 12px/1.5 var(--font-sans)', color: r.resolved ? 'var(--text-2)' : 'var(--block-text, #B91C1C)' }}>
                      {r.resolved ? `${r.title} · ${r.provenance.authorship}` : r.note}
                    </span>
                  </div>
                ))}
                <div style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--text-4)', marginTop: 10 }}>{report.boundary}</div>
              </div>
            )}
            {data.audit_pulls.length > 0 && (
              <div style={{ padding: '8px 20px 14px' }}>
                {data.audit_pulls.map((p: any) => (
                  <div key={p.id} style={{ font: '400 12px/1.8 var(--font-sans)', color: 'var(--text-3)' }}>
                    {p.artifact_ref} · seam {p.cited_release_version} · {p.generated_at?.slice(0, 10)}
                    {p.deal_closed && <Badge tone="ok"> closed deal</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" data-tour="portal-gaps">
            <CardHead title="What your deployment abstained on" sub="Each abstention is a candidate for new coverage; the practice triages these into the authoring backlog" />
            {data.gaps.map((g: any) => (
              <div className="imp-row" key={g.id} style={{ padding: '12px 20px' }}>
                <Badge tone="accent">{g.gap_kind.replace(/_/g, ' ')}</Badge>
                <div className="grow">
                  <div className="r-title">{g.abstention_text.slice(0, 120)}</div>
                  <div className="r-sub">{g.jurisdiction ?? ''} · {g.logged_at?.slice(0, 10)} · {g.triage_status.replace('_', ' ')}</div>
                </div>
              </div>
            ))}
            {!data.gaps.length && (
              <div style={{ padding: '14px 20px', font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                Nothing logged yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
