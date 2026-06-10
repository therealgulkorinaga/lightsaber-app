// ⌘K search (FR-X.3): rules by ID, title, statement, authority. Client-side
// over the rules the actor can see; selecting a hit lands in Authoring.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Rid, Status, KIND_LABEL } from './primitives.tsx';
import { get } from './api.ts';

export function Search({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (ruleId: string) => void }) {
  const [q, setQ] = useState('');
  const [rules, setRules] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    get('/api/rules').then((r) => setRules(r.rules)).catch(console.error);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rules.slice(0, 12);
    return rules
      .filter((r) =>
        [r.rule_id, r.title, r.regime, r.kind].some((f) => f && String(f).toLowerCase().includes(needle)),
      )
      .slice(0, 12);
  }, [q, rules]);

  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
      onClick={onClose}
    >
      <div
        style={{ width: 640, background: 'var(--white)', borderRadius: 'var(--r-lg, 10px)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(15,23,42,0.25)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="fc-input"
          style={{ border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, padding: '14px 18px', font: '400 14px/1.4 var(--font-sans)' }}
          placeholder="Search rules: reference, name, regulation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && hits.length) {
              onPick(hits[0].rule_id);
              onClose();
            }
          }}
        />
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {hits.map((r) => (
            <div
              key={r.rule_id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', cursor: 'pointer', borderBottom: '1px solid var(--slate-50)' }}
              onClick={() => {
                onPick(r.rule_id);
                onClose();
              }}
            >
              <Rid>{r.rule_id}</Rid>
              <span style={{ font: '400 13px/1.4 var(--font-sans)', color: 'var(--text-1)', flex: 1 }}>{r.title}</span>
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--text-3)' }}>{KIND_LABEL[r.kind] ?? r.kind}{r.regime ? ` · ${r.regime}` : ''}</span>
              <Status state={r.status} />
            </div>
          ))}
          {!hits.length && <div style={{ padding: 18, font: '400 13px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}
