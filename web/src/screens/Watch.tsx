// Screen 03 — Regime Watch. Phase 1 ships the read surface: the armed watch
// items seeded from the corpus movement notes (FR-C.1) and any armed by
// authoring (FR-A.9). Triggering and the impact report are Phase 3.

import { useEffect, useState } from 'react';
import { Icn } from '../icons.tsx';
import { Badge, Rid, ScreenHead, Stat } from '../primitives.tsx';
import { get } from '../api.ts';

function watchBadge(state: string) {
  if (state === 'triggered') return <Badge tone="warn">triggered</Badge>;
  if (state === 'overdue') return <Badge tone="block">overdue</Badge>;
  return <Badge tone="neutral">{state === 'armed' ? 'monitoring' : state}</Badge>;
}

export function Watch() {
  const [items, setItems] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    get('/api/watch')
      .then((r) => {
        setItems(r.items);
        if (r.items.length) setSel(r.items[0].id);
      })
      .catch(console.error);
  }, []);

  const item = items.find((i) => i.id === sel);

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title="Regime Watch"
          intro={
            <span>
              <span className="hl">The maintenance surface.</span> Each watch item ties a regime movement to the rules that depend
              on it, with a trigger and a re-verify date. Today this lists what is being watched; triggering, staleness flags and
              the impact report arrive in a later phase.
            </span>
          }
        >
          <Stat n={items.length} label="Watch items" />
          <Stat n={items.filter((i) => i.status === 'armed').length} label="Armed" tone="brand" />
          <Stat n={items.reduce((a, i) => a + (i.rule_ids?.length ?? 0), 0)} label="Dependent rules" />
        </ScreenHead>

        <div className="md">
          <div>
            <div className="md-list-h">Watch list</div>
            <div className="md-list">
              {items.map((w) => (
                <button key={w.id} className="watch-item" data-active={w.id === sel || undefined} data-state={w.status} onClick={() => setSel(w.id)}>
                  <div className="watch-top">
                    <Rid>{w.rule_ids?.[0] ?? '—'}</Rid>
                    {watchBadge(w.status)}
                  </div>
                  <div className="watch-title">
                    {w.trigger_type === 'event' ? w.event_description : `Date trigger: ${w.trigger_date}`}
                  </div>
                  <div className="watch-trigger">
                    <span className="ico">
                      <Icn name={w.trigger_type === 'event' ? 'flag' : 'calendar'} size={13} />
                    </span>
                    <span>
                      {w.trigger_type === 'event' ? 'Event' : 'Date'}: {w.trigger_type === 'event' ? w.event_description : w.trigger_date}
                    </span>
                  </div>
                  <div className="watch-meta">
                    <span>
                      <span className="k">re-verify</span> {w.reverify_date ?? '—'}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      <span className="k">dependents</span> {w.rule_ids?.length ?? 0}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="md-list-h">Detail</div>
            {item && (
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
                    {item.trigger_type === 'event' ? item.event_description : item.trigger_date}
                  </p>
                </div>
                <div className="imp-sec">
                  <div className="imp-h">
                    <span className="t">Re-verify action (the movement note)</span>
                  </div>
                  <p style={{ font: '400 13px/1.6 var(--font-sans)', color: 'var(--text-2)' }}>{item.reverify_action}</p>
                </div>
                <div className="imp-sec">
                  <div className="imp-h">
                    <span className="t">Dependent rules</span>
                    <span className="c">{item.rule_ids?.length ?? 0}</span>
                  </div>
                  {(item.rule_ids ?? []).map((id: string) => (
                    <div className="imp-row" key={id}>
                      <Rid>{id}</Rid>
                    </div>
                  ))}
                </div>
                <div className="imp-sec" style={{ font: '400 11.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                  Triggering, the impact report and re-authoring tasks ship in a later phase.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
