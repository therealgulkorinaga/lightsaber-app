// Screen 03 — Regime Watch (Component C), fully operable: mark events
// occurred, run the check pass, read the impact report, follow re-authoring
// tasks to resolution. Ported from the design's master/detail + impact layout.

import { useCallback, useEffect, useState } from 'react';
import { Icn } from '../icons.tsx';
import { Badge, Button, Rid, ScreenHead, Stat, Status } from '../primitives.tsx';
import { get, post, type User } from '../api.ts';

function watchBadge(state: string) {
  if (state === 'triggered' || state === 'reauthoring') return <Badge tone="warn">{state}</Badge>;
  if (state === 'overdue') return <Badge tone="block">overdue</Badge>;
  if (state === 'resolved') return <Badge tone="ok">resolved</Badge>;
  return <Badge tone="neutral">monitoring</Badge>;
}

export function Watch({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [impact, setImpact] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canMark = actor && ['author', 'reviewer', 'practice_lead'].includes(actor.role);
  const canCheck = actor && actor.role !== 'tenant_admin';

  const load = useCallback(async () => {
    const r = await get('/api/watch');
    setItems(r.items);
    if (!sel && r.items.length) setSel(r.items[0].id);
  }, [sel]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!sel) return;
    (async () => {
      const item = items.find((i) => i.id === sel);
      setTasks((await get(`/api/watch/${sel}/tasks`)).tasks);
      if (item && item.status !== 'armed' && item.status !== 'overdue') {
        setImpact(await get(`/api/watch/${sel}/impact`));
      } else {
        setImpact(null);
      }
    })().catch(console.error);
  }, [sel, items]);

  const act = async (fn: () => Promise<any>) => {
    setError(null);
    try {
      await fn();
      await load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const item = items.find((i) => i.id === sel);
  const triggered = items.filter((i) => ['triggered', 'reauthoring'].includes(i.status)).length;
  const overdue = items.filter((i) => i.status === 'overdue').length;

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title="Regime Watch"
          intro={
            <span>
              <span className="hl">The maintenance surface.</span> A watch item ties a regime movement to the rules that depend
              on it. When it triggers, the dependents stale, the impact report names who is exposed, re-authoring tasks open and
              the SLA clocks start — one atomic act.
            </span>
          }
        >
          <Stat n={items.length} label="Watch items" />
          <Stat n={triggered} label="In re-authoring" tone="warn" />
          <Stat n={overdue} label="Overdue re-verify" tone="block" />
          <Stat n={items.reduce((a, w) => a + (w.rule_ids?.length ?? 0), 0)} label="Dependent rules" tone="brand" />
        </ScreenHead>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          {canCheck && (
            <Button variant="secondary" icon="refresh" onClick={() => act(() => post('/api/watch/check'))}>
              Run check pass
            </Button>
          )}
          <span style={{ font: '400 11.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>
            Date triggers fire, overdue re-verifies flag, aged claims stale. Idempotent; also runs when the API starts.
          </span>
          {error && <span style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--block-text, #B91C1C)' }}>{error}</span>}
        </div>

        <div className="md">
          <div data-tour="watch-list">
            <div className="md-list-h">Watch list</div>
            <div className="md-list">
              {items.map((w) => (
                <button key={w.id} className="watch-item" data-active={w.id === sel || undefined} data-state={w.status} onClick={() => setSel(w.id)}>
                  <div className="watch-top">
                    <Rid>{w.rule_ids?.[0] ?? '—'}</Rid>
                    {watchBadge(w.status)}
                  </div>
                  <div className="watch-title">{w.trigger_type === 'event' ? w.event_description : `Date: ${w.trigger_date?.slice(0, 10)}`}</div>
                  <div className="watch-meta">
                    <span>
                      <span className="k">re-verify</span> {w.reverify_date?.slice(0, 10) ?? '—'}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      <span className="k">open tasks</span> {w.open_tasks}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div data-tour="watch-detail">
            <div className="md-list-h">{impact ? 'Impact report' : 'Detail'}</div>
            {item && !impact && (
              <div className="card">
                <div className="card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Rid size="lg">{item.rule_ids?.[0]}</Rid>
                    {watchBadge(item.status)}
                  </div>
                  <span className="sub">owner {item.owner_name ?? '—'}</span>
                </div>
                <div className="imp-sec" style={{ borderTop: 'none' }}>
                  <div className="imp-h">
                    <span className="t">{item.trigger_type === 'event' ? 'Trigger event' : 'Trigger date'}</span>
                  </div>
                  <p style={{ font: '400 13px/1.6 var(--font-sans)', color: 'var(--text-2)' }}>
                    {item.trigger_type === 'event' ? item.event_description : item.trigger_date?.slice(0, 10)}
                  </p>
                </div>
                <div className="imp-sec">
                  <div className="imp-h">
                    <span className="t">Re-verify action (the movement note)</span>
                  </div>
                  <p style={{ font: '400 13px/1.6 var(--font-sans)', color: 'var(--text-2)' }}>{item.reverify_action}</p>
                </div>
                <div className="imp-sec" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {canMark && ['armed', 'overdue'].includes(item.status) && (
                    <Button variant="primary" icon="flag" onClick={() => { if (confirm('Mark the event as occurred? Dependent rules stale and SLA clocks start.')) act(() => post(`/api/watch/${item.id}/trigger`)); }}>
                      Mark triggered
                    </Button>
                  )}
                  {canCheck && ['armed', 'overdue'].includes(item.status) && (
                    <Button variant="secondary" icon="check" onClick={() => act(() => post(`/api/watch/${item.id}/checked`))}>
                      Checked, no movement
                    </Button>
                  )}
                  {item.status === 'overdue' && (
                    <span style={{ marginLeft: 'auto', font: '500 11.5px/1.4 var(--font-sans)', color: 'var(--block-text, #B91C1C)' }}>
                      Re-verify date passed with no action
                    </span>
                  )}
                </div>
              </div>
            )}

            {impact && (
              <div className="card impact">
                <div className="imp-banner">
                  <span className="ib-icn">
                    <Icn name="alertTriangle" size={18} />
                  </span>
                  <div>
                    <div className="ib-t">
                      Triggered {impact.watch_item.triggered_at?.slice(0, 16).replace('T', ' ')} · impact report
                    </div>
                    <div className="ib-d">{impact.watch_item.reverify_action}</div>
                  </div>
                </div>

                <div className="imp-sec">
                  <div className="imp-h">
                    <span className="t">Rules staled & re-authoring</span>
                    <span className="c">{impact.staled_rules.length}</span>
                  </div>
                  {impact.staled_rules.map((r: any) => (
                    <div className="imp-row" key={r.rule_id}>
                      <Rid>{r.rule_id}</Rid>
                      <div className="grow">
                        <div className="r-title">{r.title}</div>
                        <div className="r-sub">task {r.task_status}</div>
                      </div>
                      <Status state={r.rule_status} />
                    </div>
                  ))}
                </div>

                <div className="imp-sec">
                  <div className="imp-h">
                    <span className="t">Tenants on affected versions</span>
                    <span className="c">{impact.tenants.length}</span>
                  </div>
                  {impact.tenants.length ? (
                    impact.tenants.map((t: any) => (
                      <div className="imp-row" key={t.id}>
                        <span style={{ display: 'inline-flex', color: 'var(--text-3)' }}>
                          <Icn name="building" size={16} />
                        </span>
                        <div className="grow">
                          <div className="r-title">{t.name}</div>
                        </div>
                        <Badge tone="neutral" mono>seam {t.release_version}</Badge>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '8px 0', font: '400 12.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>none</div>
                  )}
                </div>

                <div className="imp-sec">
                  <div className="imp-h">
                    <span className="t">Artifacts that cited these rules</span>
                    <span className="c">{impact.audit_pulls.length}</span>
                  </div>
                  {impact.audit_pulls.length ? (
                    impact.audit_pulls.map((a: any, i: number) => (
                      <div className="imp-row" key={i}>
                        <span style={{ display: 'inline-flex', color: 'var(--text-3)' }}>
                          <Icn name="fileText" size={16} />
                        </span>
                        <div className="grow">
                          <div className="r-title">{a.artifact_ref}{a.tenant_name ? ` · ${a.tenant_name}` : ''}</div>
                          <div className="r-sub">cited @ seam {a.cited_release_version} · {a.generated_at?.slice(0, 10)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '8px 0', font: '400 12.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>none</div>
                  )}
                </div>

                <div className="imp-sec" style={{ font: '400 12px/1.6 var(--font-sans)', color: 'var(--text-3)' }}>
                  Re-author each staled rule in Authoring; approval closes its task, the last closure resolves this item, and the
                  next published release carries the re-authored text to the fleet.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
