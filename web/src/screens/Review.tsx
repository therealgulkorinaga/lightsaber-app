// Screen 02 — Review queue (Component B), wired. A reviewer reads each
// submitted version, then approves it into the next release candidate or
// returns it with notes. Nothing reaches a tenant from here directly.

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, CardHead, Rid, ScreenHead, Stat, Status, KIND_LABEL } from '../primitives.tsx';
import { get, post, type User } from '../api.ts';

export function Review({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [queue, setQueue] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [advisories, setAdvisories] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await get('/api/review-queue');
    setQueue(r.queue);
    setClaims(r.claims ?? []);
  }, []);

  // FR-AI.5: a third advisory input, never one of the two approvals.
  const preScreen = async (ruleId: string) => {
    setError(null);
    try {
      const r = await post(`/api/assist/review/${ruleId}`);
      setAdvisories((a) => ({ ...a, [ruleId]: r.advisory }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const canReview = actor && ['author', 'reviewer', 'practice_lead'].includes(actor.role);

  const approve = async (ruleId: string) => {
    setError(null);
    try {
      await post(`/api/rules/${ruleId}/approve`);
      await load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const giveBack = async (ruleId: string) => {
    const notes = window.prompt('What should the author fix? Your notes go back with it:');
    if (!notes) return;
    setError(null);
    try {
      await post(`/api/rules/${ruleId}/return`, { notes });
      await load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const inReview = queue.filter((q) => q.review_state === 'in_review');
  const approved = queue.filter((q) => q.review_state === 'approved');

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title="Approvals"
          intro={
            <span>
              <span className="hl">Everything waiting for a second pair of eyes.</span> An approver reads each item, then approves it into the next release or sends it back with notes. Nobody can approve their own work.
            </span>
          }
        >
          <Stat n={inReview.length} label="Waiting for approval" tone="accent" />
          <Stat n={approved.length} label="Approved, not yet released" tone="ok" />
        </ScreenHead>

        {error && (
          <div className="card" style={{ padding: '12px 20px', marginBottom: 14, color: 'var(--block-text, #B91C1C)', font: '500 12.5px/1.4 var(--font-sans)' }}>
            {error}
          </div>
        )}

        <div className="card" data-tour="queue-card">
          <CardHead title="Rules waiting" sub="Newest first" />
          {queue.length === 0 && (
            <div style={{ padding: '18px 20px', font: '400 13px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
              Nothing waiting. Approved rules sit here until the next release is prepared.
            </div>
          )}
          {queue.map((q) => {
            const own = q.author_id === actor?.id;
            return (
              <div className="imp-row" key={q.version_id} style={{ padding: '14px 20px' }}>
                <Rid>{q.rule_id}</Rid>
                <div className="grow">
                  <div className="r-title">
                    {q.title}{' '}
                    {own && (
                      <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--accent-700)', marginLeft: 6 }}>
                        · yours
                      </span>
                    )}
                  </div>
                  <div className="r-sub">
                    {KIND_LABEL[q.kind] ?? q.kind}
                    {q.regime ? ` · ${q.regime}` : ''} · v{q.semver_at_author} · {q.author_name}
                    {q.submitted_at ? ` · ${new Date(q.submitted_at).toLocaleString()}` : ''}
                    {q.review_state === 'approved' && q.reviewer_name ? ` · approved by ${q.reviewer_name}` : ''}
                  </div>
                </div>
                <Status state={q.review_state} />
                {q.review_state === 'in_review' && canReview && !own && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => giveBack(q.rule_id)}>
                      Send back
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => approve(q.rule_id)}>
                      Approve
                    </Button>
                  </>
                )}
                {q.review_state === 'in_review' && canReview && !own && (
                  <Button variant="ghost" size="sm" onClick={() => preScreen(q.rule_id)}>
                    Ask the assistant
                  </Button>
                )}
                {q.review_state === 'in_review' && own && (
                  <span style={{ font: '400 11.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>needs someone other than you</span>
                )}
              </div>
            );
          })}
          {Object.entries(advisories).map(([ruleId, adv]: [string, any]) => (
            <div key={ruleId} style={{ margin: '0 20px 14px', padding: '12px 14px', background: 'var(--slate-50)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
              <div style={{ font: '600 12px/1.4 var(--font-sans)', marginBottom: 6 }}>
                The assistant's read on {ruleId} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>· advice only; the decision is yours and goes on the record</span>
              </div>
              {['authority_checkable', 'overreach', 'advice_drift'].map((k) => (
                <div key={k} style={{ font: '400 12px/1.6 var(--font-sans)', color: 'var(--text-2)' }}>
                  <Badge tone={adv[k]?.verdict === (k === 'authority_checkable' ? 'yes' : 'no') ? 'ok' : adv[k]?.verdict === 'uncertain' ? 'warn' : 'block'}>
                    {k.replace(/_/g, ' ')}: {adv[k]?.verdict}
                  </Badge>{' '}
                  {adv[k]?.note}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <CardHead title="Client product facts waiting" sub="Facts a client wants the sales engine to say about their product: same second-approver rule, same style checks" />
          {claims.map((c: any) => {
            const own = c.author_id === actor?.id;
            const act = async (verb: string, body?: any) => {
              try {
                await post(`/api/tenants/${c.tenant_id}/claims/${c.rule_id}/${verb}`, body);
                await load();
                onMutate();
              } catch (e) {
                setError((e as Error).message);
              }
            };
            return (
              <div className="imp-row" key={`${c.tenant_id}:${c.rule_id}`} style={{ padding: '14px 20px' }}>
                <Rid>{c.rule_id}</Rid>
                <div className="grow">
                  <div className="r-title">{c.title}</div>
                  <div className="r-sub">claim · {c.regime} · v{c.semver_at_author} · {c.author_name}</div>
                </div>
                <Status state="in_review" />
                {canReview && !own && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => { const notes = window.prompt('What should the author fix? Your notes go back with it:'); if (notes) act('return', { notes }); }}>
                      Send back
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => act('approve')}>
                      Approve
                    </Button>
                  </>
                )}
              </div>
            );
          })}
          {!claims.length && (
            <div style={{ padding: '14px 20px', font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
              No product facts waiting.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
