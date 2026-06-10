// Screen 06 — Tenant Fleet (Component F), wired: provisioning, engagement,
// claims under review, deploy, upgrade with diff. Ported from the design.

import { useCallback, useEffect, useState } from 'react';
import { Icn } from '../icons.tsx';
import { Badge, Button, CardHead, Rid, ScreenHead, Stat, Status } from '../primitives.tsx';
import { get, post, put, type User } from '../api.ts';

const CATEGORIES = [
  { key: 'capability', label: 'Capability' },
  { key: 'security_cert_residency', label: 'Security / certification / residency' },
  { key: 'deployment_reference', label: 'Deployment / reference' },
  { key: 'figure', label: 'Figure' },
];

function ClaimRow({ c, actor, tenantId, onMutate }: { c: any; actor: User | null; tenantId: string; onMutate: () => void }) {
  const canReview = actor && ['author', 'reviewer', 'practice_lead'].includes(actor.role);
  const own = c.author_user_id === actor?.id;
  const act = async (verb: string, body?: any) => {
    try {
      await post(`/api/tenants/${tenantId}/claims/${c.claim_id}/${verb}`, body);
      onMutate();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <div className="imp-row" style={{ padding: '12px 20px' }}>
      <Rid>{c.claim_id}</Rid>
      <div className="grow">
        <div className="r-title">{c.title}</div>
        <div className="r-sub">
          v{c.version} · {c.category} · {c.author_name ?? '—'}
          {c.reviewer_name ? ` · reviewed by ${c.reviewer_name}` : ''}
          {c.review_notes ? ` · returned: ${c.review_notes}` : ''}
        </div>
      </div>
      <Status state={c.status === 'active' ? 'active' : c.review_state} />
      {c.review_state === 'draft' && own && (
        <Button size="sm" variant="secondary" onClick={() => act('submit')}>
          Submit
        </Button>
      )}
      {c.review_state === 'in_review' && canReview && !own && (
        <>
          <Button size="sm" variant="secondary" onClick={() => { const notes = prompt('Return with notes:'); if (notes) act('return', { notes }); }}>
            Return
          </Button>
          <Button size="sm" variant="primary" onClick={() => act('approve')}>
            Approve
          </Button>
        </>
      )}
    </div>
  );
}

function NewClaim({ tenantId, onMutate }: { tenantId: string; onMutate: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', statement: '', category: 'capability', evidence: '', review_date: '' });
  if (!open)
    return (
      <div style={{ padding: '12px 20px' }}>
        <Button size="sm" variant="ghost" icon="plus" onClick={() => setOpen(true)}>
          New claim
        </Button>
      </div>
    );
  return (
    <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'grid', gap: 8 }}>
      <input className="fc-input" placeholder="Title (one checkable sentence's label)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className="fc-area" rows={2} placeholder="Statement — one checkable sentence" value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} />
      <textarea className="fc-area" rows={2} placeholder="Evidence — what proves it" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="fc-input" style={{ width: 'auto' }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input className="fc-input" style={{ width: 160 }} type="date" title="Review date (claims that age)" value={form.review_date} onChange={(e) => setForm({ ...form, review_date: e.target.value })} />
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            try {
              await post(`/api/tenants/${tenantId}/claims`, { ...form, review_date: form.review_date || undefined });
              setOpen(false);
              setForm({ title: '', statement: '', category: 'capability', evidence: '', review_date: '' });
              onMutate();
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          Create draft
        </Button>
      </div>
    </div>
  );
}

export function Tenants({ actor, onMutate }: { actor: User | null; onMutate: () => void }) {
  const [fleet, setFleet] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const isLead = actor?.role === 'practice_lead';
  const canDeploy = actor && ['practice_lead', 'analyst'].includes(actor.role);

  const load = useCallback(async () => {
    const r = await get('/api/tenants');
    setFleet(r.tenants);
    if (!sel && r.tenants.length) setSel(r.tenants[0].id);
  }, [sel]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const loadDetail = useCallback(async () => {
    if (!sel) return;
    setDetail(await get(`/api/tenants/${sel}`));
  }, [sel]);

  useEffect(() => {
    loadDetail().catch((e) => setError(e.message));
  }, [loadDetail]);

  const refresh = () => {
    load().catch(console.error);
    loadDetail().catch(console.error);
    onMutate();
  };

  const provision = async () => {
    const name = prompt('Tenant name:');
    if (!name) return;
    const admin_name = prompt('Adopter admin name (optional):') ?? undefined;
    try {
      const r = await post('/api/tenants', { name, admin_name });
      setSel(r.tenant.id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deploy = async (release: string) => {
    try {
      const r = await post(`/api/tenants/${sel}/deploy`, { release });
      alert(`Deployed ${release}.\nDeploy key (give it to the skill deployment, shown once):\n${r.deploy_key}`);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const upgrade = async () => {
    try {
      const r = await post(`/api/tenants/${sel}/upgrade`);
      alert(`Upgraded ${r.from} → ${r.to}.\nNew deploy key:\n${r.deploy_key}`);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const t = detail;
  const row = fleet.find((f) => f.id === sel);

  return (
    <div className="scr-scroll">
      <div className="scr scr-wide">
        <ScreenHead
          title="Tenant Fleet"
          intro={
            <span>
              <span className="hl">Who is running what.</span> Each adopter pins a published seam version; claims are isolated
              behind row-level security and a deployed bundle carries exactly one tenant's claims, asserted on every deploy.
            </span>
          }
        >
          <Stat n={fleet.length} label="Tenants" tone="brand" />
          <Stat n={fleet.filter((f) => f.pinned_version && f.pinned_version === f.latest_published).length} label="On latest" tone="ok" />
          <Stat n={fleet.filter((f) => f.upgrade_available).length} label="Upgrade ready" tone="accent" />
          <Stat n={fleet.filter((f) => f.stale_rules > 0).length} label="Carrying stale rules" tone="warn" />
        </ScreenHead>

        {error && (
          <div className="card" style={{ padding: '12px 20px', marginBottom: 14, color: 'var(--block-text, #B91C1C)', font: '500 12.5px/1.4 var(--font-sans)' }}>
            {error}{' '}
            <a href="#" style={{ color: 'inherit' }} onClick={(e) => { e.preventDefault(); setError(null); }}>
              dismiss
            </a>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          {isLead && (
            <Button variant="secondary" icon="plus" onClick={provision}>
              Provision tenant
            </Button>
          )}
        </div>

        <div className="md">
          <div>
            <div className="md-list-h">Adopter tenants</div>
            <div className="md-list">
              {fleet.map((f) => (
                <button key={f.id} className="tn-item" data-active={f.id === sel || undefined} onClick={() => setSel(f.id)}>
                  <div className="tn-top">
                    <div>
                      <div className="tn-name">{f.name}</div>
                      <div className="tn-type">onboarded {f.onboarded_at?.slice(0, 10)}</div>
                    </div>
                    <span className="tn-fresh">
                      <span className={'fd ' + (f.stale_rules > 0 ? 'stale' : 'ok')} />
                      {f.stale_rules > 0 ? `${f.stale_rules} stale` : 'fresh'}
                    </span>
                  </div>
                  <div className="tn-meta">
                    <span>
                      <span className="k">pinned</span> {f.pinned_version ? `seam ${f.pinned_version}` : 'not deployed'}
                    </span>
                    <span>
                      <span className="k">claims</span> {f.claims_pending ? `${f.claims_pending} pending` : `${f.claims_active} active`}
                    </span>
                    {f.upgrade_available && (
                      <span style={{ marginLeft: 'auto' }}>
                        <Badge tone="brand">upgrade ready</Badge>
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {!fleet.length && (
                <div className="card" style={{ padding: 18, font: '400 13px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                  No tenants yet. Provision the first adopter.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="md-list-h">{t?.tenant?.name ?? 'Detail'}</div>
            {t && (
              <>
                <div className="card" style={{ marginBottom: 14 }}>
                  <div className="tn-kv">
                    <div className="kv">
                      <div className="k">Pinned seam</div>
                      <div className="v mono">{t.pinned_version ?? '—'}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Latest published</div>
                      <div className="v mono">{t.latest_published ?? '—'}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Freshness</div>
                      <div className="v" style={t.stale_rules.length ? { color: 'var(--warn-text)' } : { color: 'var(--ok)' }}>
                        {t.stale_rules.length ? `${t.stale_rules.length} stale: ${t.stale_rules.join(', ')}` : 'all fresh'}
                      </div>
                    </div>
                    <div className="kv">
                      <div className="k">SLA tier</div>
                      <div className="v">{t.engagement?.sla_tier ?? 'standard'}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Engagement</div>
                      <div className="v mono">{(t.engagement?.jurisdictions ?? []).join(', ') || '—'}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Last deploy</div>
                      <div className="v mono">{t.deployments[0]?.deployed_at?.slice(0, 16).replace('T', ' ') ?? 'never'}</div>
                    </div>
                  </div>

                  {row?.upgrade_available && t.upgrade_diff ? (
                    <div className="upg">
                      <div className="upg-head">
                        <Icn name="trendingUp" size={17} color="var(--brand)" />
                        <span className="uh-t">Upgrade available</span>
                        <span className="uh-v">
                          <Rid ghost>{t.pinned_version}</Rid>
                          <Icn name="arrowRight" size={13} />
                          <Rid>{t.latest_published}</Rid>
                        </span>
                      </div>
                      <div className="upg-body">
                        {Object.entries(t.upgrade_diff).map(([k, ids]: [string, any]) =>
                          ids.length ? (
                            <div className="upg-row" key={k}>
                              <span className="u-db" style={{ background: k === 'added' ? 'var(--ok)' : k === 'staled' ? 'var(--warn)' : 'var(--accent)' }} />
                              <span className="u-t">
                                <b>{k}</b>: {ids.join(', ')}
                              </span>
                            </div>
                          ) : null,
                        )}
                      </div>
                      <div className="upg-foot">
                        <Button variant="primary" icon="arrowUpRight" disabled={!isLead} title={!isLead ? 'Practice Lead upgrades' : undefined} onClick={upgrade}>
                          Upgrade & redeploy
                        </Button>
                        <span style={{ marginLeft: 'auto', font: '400 11.5px/1.4 var(--font-sans)', color: 'var(--text-3)' }}>
                          The pin holds until the practice runs the upgrade
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
                      {canDeploy && t.latest_published && (
                        <Button variant="secondary" icon="send" onClick={() => deploy(t.latest_published)}>
                          {t.pinned_version ? `Redeploy ${t.latest_published}` : `Deploy ${t.latest_published}`}
                        </Button>
                      )}
                      {t.pinned_version === t.latest_published && t.pinned_version && (
                        <span style={{ font: '400 12px/1.4 var(--font-sans)', color: 'var(--ok)' }}>On the latest published seam.</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="card">
                  <CardHead title="Approved claims" sub="The only source the engine may assert this tenant's facts from; empty means the engine abstains on all traction" />
                  {t.claims.map((c: any) => (
                    <ClaimRow key={`${c.claim_id}:${c.version}`} c={c} actor={actor} tenantId={t.tenant.id} onMutate={refresh} />
                  ))}
                  {!t.claims.length && (
                    <div style={{ padding: '14px 20px', font: '400 12.5px/1.5 var(--font-sans)', color: 'var(--text-3)' }}>
                      No claims. The deployed engine abstains on every capability, certification, reference and figure — which is
                      correct behaviour, not a defect.
                    </div>
                  )}
                  <NewClaim tenantId={t.tenant.id} onMutate={refresh} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
