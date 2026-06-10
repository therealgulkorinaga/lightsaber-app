// Components C, D, H end to end: trigger → stale cascade → impact → tasks →
// re-author → resolve → publish closes the loop (SLA + retainer + gap
// closure); gap ingestion against the bounded schema; ranking; coverage.
// Runs after 40-tenants: Meridian is pinned to a release containing AIA-TML-007.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/api/app.ts';
import { pool } from '../src/db/pool.ts';

const HALE = '00000000-0000-4000-8000-000000000001';
const OKAFOR = '00000000-0000-4000-8000-000000000002';
const BRENNAN = '00000000-0000-4000-8000-000000000003';
const PARK = '00000000-0000-4000-8000-000000000004';

let app: FastifyInstance;
let aiaWatchId: string;
let meridian: string;
let deployKey: string;
let gapA: string;
let gapB: string;

beforeAll(async () => {
  app = await buildApp();
  const { rows } = await pool.query(
    `SELECT wi.id FROM shared.watch_item wi JOIN shared.watch_rule wr ON wr.watch_item_id = wi.id
      WHERE wr.rule_id = 'AIA-TML-007'`,
  );
  aiaWatchId = rows[0].id;
  const { rows: t } = await pool.query(`SELECT id FROM tenant.tenant WHERE name = 'Meridian Pay'`);
  meridian = t[0].id;
  const { rows: d } = await pool.query(`SELECT deploy_key FROM tenant.deployment WHERE tenant_id = $1 AND active`, [meridian]);
  deployKey = d[0].deploy_key;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

async function call(method: string, url: string, user: string | null, body?: unknown, extraHeaders?: Record<string, string>) {
  const res = await app.inject({
    method: method as any,
    url,
    headers: { ...(user ? { 'x-user-id': user } : {}), 'content-type': 'application/json', ...(extraHeaders ?? {}) },
    payload: body as any,
  });
  return { status: res.statusCode, body: res.json() };
}

describe('gap ingestion: the bounded write path (FR-D.1, FR-9.5)', () => {
  it('refuses without, or with a wrong, deployment key', async () => {
    expect((await call('POST', '/api/gaps', null, { gap_kind: 'uncovered_objection', abstention_text: 'x' })).status).toBe(401);
    expect(
      (await call('POST', '/api/gaps', null, { gap_kind: 'uncovered_objection', abstention_text: 'x' }, { 'x-deploy-key': 'f'.repeat(48) })).status,
    ).toBe(401);
  });

  it('rejects any field outside the abstraction schema, naming it', async () => {
    const r1 = await call('POST', '/api/gaps', null, {
      gap_kind: 'uncovered_objection',
      abstention_text: 'x',
      firm_name: 'Acme Capital', // identity-bearing: no such field exists to accept
    }, { 'x-deploy-key': deployKey });
    expect(r1.status).toBe(422);
    expect(r1.body.error).toMatch(/firm_name/);

    const r2 = await call('POST', '/api/gaps', null, {
      gap_kind: 'uncovered_objection',
      abstention_text: 'x',
      prospect_context: { firm_type: 'bank', contact_email: 'a@b.com' },
    }, { 'x-deploy-key': deployKey });
    expect(r2.status).toBe(422);
    expect(r2.body.error).toMatch(/contact_email/);
  });

  it('accepts the bounded payload', async () => {
    const a = await call('POST', '/api/gaps', null, {
      gap_kind: 'uncovered_objection',
      abstention_text: 'Prospect counsel asked for our position under the California DFPI complaint-handling expectations; corpus holds no covering objection.',
      jurisdiction: 'US-CA',
      prospect_context: { firm_type: 'lender', ai_touchpoint: 'complaints' },
      deal_cost_gbp: 40,
    }, { 'x-deploy-key': deployKey });
    expect(a.status).toBe(200);
    gapA = a.body.id;

    const b = await call('POST', '/api/gaps', null, {
      gap_kind: 'uncovered_objection',
      abstention_text: 'Same DFPI complaint-handling question, second prospect.',
      jurisdiction: 'US-CA',
      prospect_context: { firm_type: 'lender' },
      deal_cost_gbp: 25,
    }, { 'x-deploy-key': deployKey });
    gapB = b.body.id;
  });
});

describe('triage and ranking (FR-D.2/D.3)', () => {
  it('an author cannot triage; the analyst can', async () => {
    expect((await call('PATCH', `/api/gaps/${gapA}`, HALE, { triage_status: 'backlog' })).status).toBe(403);
    expect((await call('PATCH', `/api/gaps/${gapA}`, PARK, { triage_status: 'backlog', cost_estimated_gbp: 60 })).status).toBe(200);
  });

  it('duplicates aggregate onto the surviving gap; rejection keeps its reason', async () => {
    expect((await call('PATCH', `/api/gaps/${gapB}`, PARK, { triage_status: 'duplicate' })).status).toBe(422);
    expect((await call('PATCH', `/api/gaps/${gapB}`, PARK, { triage_status: 'duplicate', linked_backlog_id: gapA })).status).toBe(200);
    // terminal stays terminal
    expect((await call('PATCH', `/api/gaps/${gapB}`, PARK, { triage_status: 'backlog' })).status).toBe(409);

    const list = await call('GET', '/api/gaps?status=backlog', PARK);
    const a = list.body.gaps.find((g: any) => g.id === gapA);
    expect(a.frequency).toBe(2); // itself + the duplicate
    expect(a.cost).toBe(60); // max(tenant 40, practice 60)
    expect(a.rank).toBe(120);
  });
});

describe('the reactivation loop (FR-C.2 .. FR-C.5, FR-H.1/H.2)', () => {
  it('an audit pull cites the watched rule before the trigger (for the impact report)', async () => {
    const r = await call('POST', '/api/defensibility', BRENNAN, {
      artifact_ref: 'ART-TIMING-001',
      release_version: '1.4.0',
      artifact_text: 'Timing answer rested on [AIA-TML-007].',
      tenant_id: meridian,
    });
    expect(r.status).toBe(200);
  });

  it('marking the event occurred triggers atomically: stale + tasks + SLA', async () => {
    expect((await call('POST', `/api/watch/${aiaWatchId}/trigger`, PARK, {})).status).toBe(403); // analyst marks nothing
    const r = await call('POST', `/api/watch/${aiaWatchId}/trigger`, HALE, {});
    expect(r.status).toBe(200);
    expect(r.body.staled).toEqual(['AIA-TML-007']);
    expect(r.body.tenants).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(`SELECT status FROM shared.rule WHERE rule_id = 'AIA-TML-007'`);
    expect(rows[0].status).toBe('stale');

    const again = await call('POST', `/api/watch/${aiaWatchId}/trigger`, HALE, {});
    expect(again.status).toBe(409); // never double-triggers

    const { rows: sla } = await pool.query(
      `SELECT * FROM tenant.sla_event WHERE watch_item_id = $1 AND tenant_id = $2`,
      [aiaWatchId, meridian],
    );
    expect(sla).toHaveLength(1);
    expect(sla[0].tier).toBe('priority');
    expect(sla[0].republished_at).toBeNull();
  });

  it('the live export now renders the rule stale (FR-C.4)', async () => {
    const { exportLive } = await import('../src/export/exporter.ts');
    const files = await exportLive(pool);
    expect(files.get('seam/regulatory-rules.md')).toContain(
      'kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: stale | v1.0 | movement note attached',
    );
    // and 1.1.0 stays byte-stable: the overlay never rewrites history
    const r = await call('GET', '/api/releases/1.1.0/export', HALE);
    expect(r.body.files['seam/regulatory-rules.md']).toContain(
      'kind: regulatory | jurisdiction: EU | regime: EU_AI_ACT | scope: shared | status: active | v1.0 | movement note attached',
    );
  });

  it('the impact report names everything (FR-C.3)', async () => {
    const r = await call('GET', `/api/watch/${aiaWatchId}/impact`, BRENNAN);
    expect(r.status).toBe(200);
    expect(r.body.staled_rules.map((s: any) => s.rule_id)).toEqual(['AIA-TML-007']);
    expect(r.body.releases).toContain('1.1.0');
    expect(r.body.tenants.some((t: any) => t.name === 'Meridian Pay')).toBe(true);
    expect(r.body.audit_pulls.some((p: any) => p.artifact_ref === 'ART-TIMING-001')).toBe(true);
  });

  it('a gap pulled into authoring links its rule (FR-D.2)', async () => {
    const r = await call('PATCH', `/api/gaps/${gapA}`, PARK, { triage_status: 'in_authoring', linked_rule_id: 'AIA-TML-007' });
    expect(r.status).toBe(200);
  });

  it('re-authoring closes the task and resolves the item (FR-C.5)', async () => {
    expect((await call('POST', '/api/rules/AIA-TML-007/versions', HALE, {})).status).toBe(200);
    const save = await call('PUT', '/api/rules/AIA-TML-007/draft', HALE, {
      jurisdiction_tags: ['EU'],
      title: 'Application timeline, as adopted',
      statement:
        'In force since 1 August 2024. Prohibitions apply since 2 February 2025; general-purpose model obligations since 2 August 2025. Under the Digital Omnibus on AI as formally adopted, Annex III high-risk obligations defer to 2 December 2027; Annex I embedded high-risk to 2 August 2028; the Art 50(2) synthetic-content marking duty to 2 December 2026; other transparency obligations, deployer duties included, apply from 2 August 2026.',
      buyer_reading:
        'The high-risk wall sits at December 2027 and the adoption question is settled. Urgency framing rests on the August 2026 transparency date and the cost of late preparation.',
      authority_summary: 'Regulation (EU) 2024/1689, Art 113; Digital Omnibus on AI as adopted and published.',
      applicability: 'Any EU prospect where timing shapes the buying decision.',
      inputs_required: ['jurisdiction'],
      change_note: 'Re-authored on Omnibus formal adoption; movement note retired.',
      sources: [{ citation: 'Digital Omnibus on AI, Official Journal publication', source_type: 'regulation' }],
    });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    const sub = await call('POST', '/api/rules/AIA-TML-007/submit', HALE, {});
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
    expect((await call('POST', '/api/rules/AIA-TML-007/approve', OKAFOR, {})).status).toBe(200);

    const tasks = await call('GET', `/api/watch/${aiaWatchId}/tasks`, BRENNAN);
    expect(tasks.body.tasks[0].status).toBe('closed');
    const { rows } = await pool.query(`SELECT status FROM shared.watch_item WHERE id = $1`, [aiaWatchId]);
    expect(rows[0].status).toBe('resolved');
    const { rows: rule } = await pool.query(`SELECT status FROM shared.rule WHERE rule_id = 'AIA-TML-007'`);
    expect(rule[0].status).toBe('approved'); // back on the staging path (5.1)
  });

  it('publishing the re-author closes SLA and gap, and emits the retainer line', async () => {
    const assembled = await call('POST', '/api/releases', PARK, { bump: 'minor' });
    const v = assembled.body.version;
    expect(assembled.body.changelog.reauthored).toContain('AIA-TML-007');
    const gate = await call('POST', `/api/releases/${v}/gate`, PARK, {});
    expect(gate.body.passed, JSON.stringify(gate.body.checks?.filter((c: any) => !c.passed))).toBe(true);
    expect((await call('POST', `/api/releases/${v}/publish`, BRENNAN, {})).status).toBe(200);

    const { rows: sla } = await pool.query(`SELECT * FROM tenant.sla_event WHERE watch_item_id = $1`, [aiaWatchId]);
    expect(sla[0].republished_at).not.toBeNull();
    expect(sla[0].breach).toBe(false); // well inside the priority windows

    const { rows: billing } = await pool.query(
      `SELECT * FROM tenant.billing_event WHERE tenant_id = $1 AND line = 'retainer'`,
      [meridian],
    );
    expect(billing.length).toBeGreaterThanOrEqual(1);

    const { rows: gap } = await pool.query(`SELECT triage_status FROM tenant.gap_log WHERE id = $1`, [gapA]);
    expect(gap[0].triage_status).toBe('closed');
  });
});

describe('the deterministic check pass (FR-C.2/C.6)', () => {
  it('flags an overdue re-verify and fires a date trigger, idempotently', async () => {
    // Two draft rules each arming a watch item: one past its re-verify date,
    // one past its trigger date.
    const mk = async (id: string, watch: any) => {
      const r = await call('POST', '/api/rules', HALE, {
        kind: 'regulatory', rule_id: id, regime: 'GDPR', title: `Probe ${id}`,
        jurisdiction_tags: ['EU'],
        statement: 'Probe statement for watch mechanics.', buyer_reading: 'Probe.',
        authority_summary: 'GDPR Art 5.', applicability: 'Probe.',
        inputs_required: ['jurisdiction'],
        movement_note: 'Probe movement note for the check pass.',
        kind_fields: { watch },
        sources: [{ citation: 'GDPR Art 5', source_type: 'regulation' }],
      });
      expect(r.status).toBe(200);
    };
    await mk('GDPR-PRB-008', { trigger_type: 'event', event_description: 'Probe event', reverify_date: '2020-01-01' });
    await mk('GDPR-PRB-009', { trigger_type: 'date', trigger_date: '2020-01-02' });

    const check = await call('POST', '/api/watch/check', PARK, {});
    expect(check.status).toBe(200);
    expect(check.body.overdue.length).toBeGreaterThanOrEqual(1);
    expect(check.body.triggered.length).toBeGreaterThanOrEqual(1);

    const again = await call('POST', '/api/watch/check', PARK, {});
    expect(again.body.triggered).toHaveLength(0); // idempotent: nothing re-fires

    // checking an overdue item re-arms it
    const overdueId = check.body.overdue[0];
    expect((await call('POST', `/api/watch/${overdueId}/checked`, PARK, {})).status).toBe(200);
    const { rows } = await pool.query(`SELECT status FROM shared.watch_item WHERE id = $1`, [overdueId]);
    expect(rows[0].status).toBe('armed');
  });
});

describe('coverage matrix (FR-D.4)', () => {
  it('reads depth, scope and gap pressure correctly', async () => {
    const r = await call('GET', '/api/coverage', BRENNAN);
    const eu = r.body.rows.find((x: any) => x.tag === 'EU');
    const dora = eu.cells.find((c: any) => c.regime === 'DORA');
    expect(dora.in_scope).toBe(true);
    expect(dora.depth).toBe(7);

    const uk = r.body.rows.find((x: any) => x.tag === 'UK');
    expect(uk.cells.find((c: any) => c.regime === 'DORA').in_scope).toBe(false); // outside the footprint

    // a live (untriaged) gap registers as pressure; the earlier ones closed
    // when the loop delivered their coverage
    await call('POST', '/api/gaps', null, {
      gap_kind: 'uncovered_regime',
      abstention_text: 'Colorado AI Act exposure raised; no US-CO coverage exists.',
      jurisdiction: 'US-CA',
      prospect_context: { firm_type: 'insurer' },
    }, { 'x-deploy-key': deployKey });
    const r2 = await call('GET', '/api/coverage', BRENNAN);
    const ca = r2.body.rows.find((x: any) => x.tag === 'US-CA');
    expect(ca.open_gaps).toBeGreaterThanOrEqual(1);

    // engagement-scoped view for the tenant
    const scoped = await call('GET', `/api/coverage?tenant_id=${meridian}`, BRENNAN);
    expect(scoped.body.rows.map((x: any) => x.tag).sort()).toEqual(['EU', 'IE']);
  });
});
