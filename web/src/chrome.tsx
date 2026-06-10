// Topbar + persistent left rail, ported from design/Chrome.jsx and wired:
// live seam version, live rule counts, review-queue count, and the Phase 1
// dev user-switcher in place of the static avatar.

import { useEffect, useState } from 'react';
import { Icn } from './icons.tsx';
import { Kbd } from './primitives.tsx';
import { get, currentUserId, setCurrentUserId, type User } from './api.ts';

export interface ChromeData {
  users: User[];
  actor: User | null;
  seamVersion: string;
  candidate: string | null;
  counts: { regulatory: number; icp: number; objection: number; messaging: number };
  queueCount: number;
  watchCount: number;
}

export function useChromeData(refreshKey: number): ChromeData {
  const [data, setData] = useState<ChromeData>({
    users: [],
    actor: null,
    seamVersion: '…',
    candidate: null,
    counts: { regulatory: 0, icp: 0, objection: 0, messaging: 0 },
    queueCount: 0,
    watchCount: 0,
  });

  useEffect(() => {
    (async () => {
      const { users } = await get<{ users: User[] }>('/api/users');
      let uid = currentUserId();
      if (!uid || !users.some((u) => u.id === uid)) {
        uid = users.find((u) => u.role === 'author')?.id ?? users[0]?.id ?? null;
        if (uid) setCurrentUserId(uid);
      }
      const actor = users.find((u) => u.id === uid) ?? null;

      const [rules, releases, queue, watch] = await Promise.all([
        get('/api/rules'),
        get('/api/releases'),
        get('/api/review-queue'),
        get('/api/watch'),
      ]);
      const counts = { regulatory: 0, icp: 0, objection: 0, messaging: 0 };
      for (const r of rules.rules) {
        if (r.status !== 'retired' && counts[r.kind as keyof typeof counts] !== undefined) {
          counts[r.kind as keyof typeof counts]++;
        }
      }
      const published = releases.releases.find((r: any) => r.status === 'published');
      const candidate = releases.releases.find((r: any) =>
        ['draft', 'staged', 'eval_running', 'eval_passed', 'eval_failed'].includes(r.status),
      );
      setData({
        users,
        actor,
        seamVersion: published?.version ?? '—',
        candidate: candidate?.version ?? null,
        counts,
        queueCount: queue.queue.filter((q: any) => q.review_state === 'in_review').length,
        watchCount: watch.items.filter((w: any) => w.status !== 'resolved').length,
      });
    })().catch(console.error);
  }, [refreshKey]);

  return data;
}

export function Topbar({ data, onUserChange }: { data: ChromeData; onUserChange: () => void }) {
  return (
    <>
      <div className="lm-brand">
        <span className="wordmark">
          Lightsaber<span className="wordmark-stop">.</span>
        </span>
        <span className="mark-sub">Backoffice</span>
      </div>
      <div className="lm-top">
        <div className="lm-search">
          <Icn name="search" size={14} />
          <span>Search rules, regimes, authorities…</span>
          <span style={{ display: 'inline-flex', gap: 3 }}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
        <span className="spacer" />
        <span className="lm-vpill">
          <span className="led" /> seam {data.seamVersion}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
          <Icn name="bell" size={17} />
          <select
            className="fc-input"
            style={{ width: 'auto', padding: '5px 8px', font: '500 12px/1 var(--font-sans)' }}
            value={data.actor?.id ?? ''}
            onChange={(e) => {
              setCurrentUserId(e.target.value);
              onUserChange();
            }}
            title="Dev user-switcher (Phase 1 auth)"
          >
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role.replace('_', ' ')}
              </option>
            ))}
          </select>
        </span>
      </div>
    </>
  );
}

const RAIL = [
  { num: '01', key: 'authoring', label: 'Authoring', icon: 'edit' },
  { num: '02', key: 'review', label: 'Review queue', icon: 'fileText' },
  { num: '03', key: 'watch', label: 'Regime Watch', icon: 'bell' },
  { num: '04', key: 'coverage', label: 'Coverage', icon: 'pie' },
  { num: '05', key: 'releases', label: 'Releases', icon: 'layers' },
  { num: '06', key: 'tenants', label: 'Tenants', icon: 'building' },
];

export function Rail({
  route,
  onRoute,
  data,
}: {
  route: string;
  onRoute: (r: string) => void;
  data: ChromeData;
}) {
  const count = (key: string) =>
    key === 'review' ? data.queueCount || null : key === 'watch' ? data.watchCount || null : null;
  return (
    <nav className="lm-rail">
      <div className="lm-rail-section">Seam</div>
      {RAIL.map((it) => (
        <a
          key={it.key}
          className="lm-nav"
          data-active={route === it.key || undefined}
          onClick={(e) => {
            e.preventDefault();
            onRoute(it.key);
          }}
          href="#"
        >
          <span className="num">{it.num}</span>
          <Icn name={it.icon} size={15} />
          <span>{it.label}</span>
          {count(it.key) != null && <span className="count">{count(it.key)}</span>}
        </a>
      ))}

      <div className="lm-rail-foot">
        <div className="row">
          <span className="k">Active rules</span>
          <span className="v">{data.counts.regulatory}</span>
        </div>
        <div className="row">
          <span className="k">ICP · OBJ · MSG</span>
          <span className="v">
            {data.counts.icp}·{data.counts.objection}·{data.counts.messaging}
          </span>
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="k">Candidate</span>
          <span className="v" style={{ color: 'var(--accent-700)' }}>
            {data.candidate ?? 'none'}
          </span>
        </div>
      </div>
    </nav>
  );
}
