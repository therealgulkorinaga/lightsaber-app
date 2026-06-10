// Screen 04 — Evaluation & Release Gate (Component E), wired. Five checks,
// all blocking; no publish path exists for a red candidate (FR-9.3).

import { useCallback, useEffect, useState } from 'react';
import { Icn } from '../icons.tsx';
import { Button, Rid, ScreenHead, Stat } from '../primitives.tsx';
import { get, post, type User } from '../api.ts';

function GateCheck({ check, open, onToggle }: { check: any; open: boolean; onToggle: () => void }) {
  const fail = !check.passed;
  const hasCases = !!check.cases?.length;
  return (
    <div className={'gck ' + (fail ? 'fail' : 'pass')}>
      <div className="gck-head" onClick={hasCases ? onToggle : undefined} style={hasCases ? undefined : { cursor: 'default' }}>
        <span className="gck-icn">
          <Icn name={fail ? 'alertCircle' : 'checkCircle'} size={18} />
        </span>
        <div>
          <div className="gck-title">{check.title}</div>
          <div className="gck-sub">{check.detail}</div>
        </div>
        <span className="gck-meta">
          {hasCases ? `${check.cases.filter((c: any) => c.passed).length}/${check.cases.length}` : fail ? 'fail' : 'pass'}
        </span>
        {hasCases && (
          <span style={{ color: 'var(--text-4)', marginLeft: 8 }}>
            <Icn name={open ? 'chevronDown' : 'chevronRight'} size={15} />
          </span>
        )}
      </div>
      {hasCases && open && (
        <div className="gck-cases">
          {check.cases.map((c: any) => (
            <div className={'gck-case ' + (c.passed ? 'pass' : 'fail')} key={c.id}>
              <span className={'cc-icn ' + (c.passed ? 'pass' : 'fail')}>
                <Icn name={c.passed ? 'check' : 'x'} size={14} />
              </span>
              <span className="cc-id">{c.id}</span>
              <span className="cc-t">{c.passed ? c.title : `${c.title} — ${c.detail}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Changelog({ release }: { release: any }) {
  const groups = [
    { key: 'added', label: 'Added', tone: 'var(--ok)' },
    { key: 'changed', label: 'Changed', tone: 'var(--accent)' },
    { key: 'staled', label: 'Staled', tone: 'var(--warn)' },
    { key: 'reauthored', label: 'Re-authored', tone: 'var(--brand)' },
    { key: 'retired', label: 'Retired', tone: 'var(--slate-300)' },
  ];
  const cl = release.changelog ?? {};
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ font: '600 14px/1.2 var(--font-sans)', color: 'var(--text-1)', letterSpacing: '-0.01em' }}>Changelog</h3>
        <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--text-3)' }}>
          {release.base_version ?? '∅'} → {release.version}
        </span>
      </div>
      {groups.map((g) => {
        const items: string[] = cl[g.key] ?? [];
        if (!items.length) return null;
        return (
          <div className="chl-group" key={g.key}>
            <div className="chl-h">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: g.tone }} />
              <span className="lbl">{g.label}</span>
              <span className="ct">{items.length}</span>
            </div>
            {items.map((id) => (
              <div className="chl-item" key={id}>
                <Rid ghost>{id}</Rid>
              </div>
            ))}
          </div>
        );
      })}
      {groups.every((g) => !(cl[g.key] ?? []).length) && (
        <div style={{ font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>No changes recorded.</div>
      )}
    </div>
  );
}

export function Releases({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [releases, setReleases] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [checks, setChecks] = useState<any[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ eval: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await get('/api/releases');
    setReleases(r.releases);
    if (!selected && r.releases.length) setSelected(r.releases[0].version);
  }, [selected]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const d = await get(`/api/releases/${selected}`);
      setDetail(d);
      const latest = d.eval_runs?.[0];
      setChecks(latest?.results ?? null);
    })().catch(console.error);
  }, [selected, releases]);

  const release = detail?.release;
  const isLead = actor?.role === 'practice_lead';
  const canAssemble = actor && ['practice_lead', 'analyst'].includes(actor.role);
  const failing = (checks ?? []).filter((c) => !c.passed).length;
  const blocked = !release || release.status !== 'eval_passed';

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onMutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const assemble = () =>
    run(async () => {
      const r = await post('/api/releases', { bump: 'minor' });
      setSelected(r.version);
    });
  const gate = () => run(() => post(`/api/releases/${selected}/gate`));
  const publish = () => run(() => post(`/api/releases/${selected}/publish`));

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title="Evaluation & Release Gate"
          intro={
            <span>
              <span className="hl">Nothing ships without a passing gate.</span> A candidate assembles the approved rules since the
              last release. All five checks must be green before publish — every check, every case. The block is enforced in the
              record itself, not the interface.
            </span>
          }
        >
          <Stat n={release?.version ?? '—'} label={release ? release.status.replace('_', ' ') : 'no release'} tone="brand" />
          <Stat n={detail?.pins?.length ?? 0} label="Rules pinned" />
          <Stat n={checks ? `${(checks ?? []).filter((c: any) => c.passed).length}/${checks.length}` : '—'} label="Checks passing" tone={failing ? 'warn' : 'ok'} />
          <Stat n={failing} label="Checks failing" tone="block" />
        </ScreenHead>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <select className="fc-input" style={{ width: 'auto', padding: '6px 10px', font: '500 12px/1 var(--font-mono)' }} value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {releases.map((r) => (
              <option key={r.version} value={r.version}>
                {r.version} · {r.status}
              </option>
            ))}
          </select>
          {canAssemble && (
            <Button variant="secondary" icon="layers" disabled={busy} onClick={assemble}>
              Assemble candidate
            </Button>
          )}
          {error && <span style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--block-text, #B91C1C)' }}>{error}</span>}
        </div>

        {release && (
          <>
            <div className={'publish-bar ' + (release.status === 'published' || release.status === 'eval_passed' ? 'ok' : 'block')}>
              <Icn
                name={release.status === 'published' || release.status === 'eval_passed' ? 'checkCircle' : 'alertCircle'}
                size={22}
                color={release.status === 'published' || release.status === 'eval_passed' ? 'var(--ok)' : 'var(--block)'}
              />
              <div>
                <div className="pb-t">
                  {release.status === 'published'
                    ? `Published — checksum ${detail?.exports?.[0]?.checksum?.slice(0, 16) ?? ''}…`
                    : release.status === 'eval_passed'
                      ? 'Gate clear — ready to publish'
                      : release.status === 'eval_failed'
                        ? `Publish blocked — ${failing || 'a'} check failing`
                        : `Candidate ${release.status.replace('_', ' ')}`}
                </div>
                <div className="pb-d">
                  {release.status === 'published'
                    ? `Seam ${release.version} is pinned, immutable and exported. Re-export reproduces the identical bundle.`
                    : release.status === 'eval_failed'
                      ? 'Fix the failing case and re-run the gate, or pull the offending rule from the next candidate.'
                      : release.status === 'eval_passed'
                        ? `Seam ${release.version} can be published to the bundle.`
                        : 'Run the gate to evaluate this candidate.'}
                </div>
              </div>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                {['staged', 'eval_failed', 'eval_passed'].includes(release.status) && (
                  <Button variant="secondary" icon="refresh" disabled={busy} onClick={gate}>
                    {checks ? 'Re-run gate' : 'Run gate'}
                  </Button>
                )}
                {release.status !== 'published' && (
                  <Button
                    variant="primary"
                    icon="send"
                    disabled={blocked || busy || !isLead}
                    title={!isLead ? 'Practice Lead publishes' : undefined}
                    style={blocked || !isLead ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                    onClick={publish}
                  >
                    Publish {release.version}
                  </Button>
                )}
              </span>
            </div>

            <div className="rel-grid">
              <div>
                <div className="md-list-h">Gate checks</div>
                {(checks ?? []).map((c: any) => (
                  <GateCheck key={c.id} check={c} open={!!open[c.id]} onToggle={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} />
                ))}
                {!checks && (
                  <div className="card" style={{ padding: '16px 20px', font: '400 13px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                    The gate has not run on this candidate yet.
                  </div>
                )}
              </div>
              <div>
                <div className="md-list-h">Release contents</div>
                <Changelog release={release} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
