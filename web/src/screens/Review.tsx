// Screen 02 — Review queue (Component B), wired. A reviewer reads each
// submitted version, then approves it into the next release candidate or
// returns it with notes. Nothing reaches a tenant from here directly.

import { useCallback, useEffect, useState } from 'react';
import { Button, CardHead, Rid, ScreenHead, Stat, Status } from '../primitives.tsx';
import { get, post, type User } from '../api.ts';

export function Review({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [queue, setQueue] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await get('/api/review-queue');
    setQueue(r.queue);
  }, []);

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
    const notes = window.prompt('Return with notes for the author (required):');
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
          title="Review queue"
          intro={
            <span>
              <span className="hl">Rules submitted for review.</span> A reviewer reads each one, then approves it into the next
              release candidate. The author of a version never reviews their own work; substance always takes a second
              qualified pair of eyes.
            </span>
          }
        >
          <Stat n={inReview.length} label="Awaiting review" tone="accent" />
          <Stat n={approved.length} label="Approved, unreleased" tone="ok" />
        </ScreenHead>

        {error && (
          <div className="card" style={{ padding: '12px 20px', marginBottom: 14, color: 'var(--block-text, #B91C1C)', font: '500 12.5px/1.4 var(--font-sans)' }}>
            {error}
          </div>
        )}

        <div className="card">
          <CardHead title="Submitted rules" sub="Newest first" />
          {queue.length === 0 && (
            <div style={{ padding: '18px 20px', font: '400 13px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
              Nothing in review. Approved rules stage here until the next candidate assembles.
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
                        · your submission
                      </span>
                    )}
                  </div>
                  <div className="r-sub">
                    {q.kind}
                    {q.regime ? ` · ${q.regime}` : ''} · v{q.semver_at_author} · {q.author_name}
                    {q.submitted_at ? ` · ${new Date(q.submitted_at).toLocaleString()}` : ''}
                    {q.review_state === 'approved' && q.reviewer_name ? ` · approved by ${q.reviewer_name}` : ''}
                  </div>
                </div>
                <Status state={q.review_state} />
                {q.review_state === 'in_review' && canReview && !own && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => giveBack(q.rule_id)}>
                      Return
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => approve(q.rule_id)}>
                      Approve
                    </Button>
                  </>
                )}
                {q.review_state === 'in_review' && own && (
                  <span style={{ font: '400 11.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>awaits a separate reviewer</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
