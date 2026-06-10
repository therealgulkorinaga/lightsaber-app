// Component F end to end: provisioning, engagement, claims under the
// two-person rule, deploy with claims slotted (FR-7.3), isolation under RLS
// (FR-7.1/7.2), upgrade with reproducibility across it (FR-7.4), billing.
// Runs after 30-api-flow: releases 1.1.0 and 1.3.0 exist, 1.3.0 published.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/api/app.ts';
import { pool } from '../src/db/pool.ts';

const HALE = '00000000-0000-4000-8000-000000000001';
const OKAFOR = '00000000-0000-4000-8000-000000000002';
const BRENNAN = '00000000-0000-4000-8000-000000000003';
const PARK = '00000000-0000-4000-8000-000000000004';

let app: FastifyInstance;
let meridian: string; // tenant id
let meridianAdmin: string; // user id
let apex: string;
let apexAdmin: string;

beforeAll(async () => {
  app = await buildApp();
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

describe('provisioning and engagement (FR-F.1/F.2)', () => {
  it('an analyst cannot provision; the practice lead can, with a scoped admin', async () => {
    expect((await call('POST', '/api/tenants', PARK, { name: 'X' })).status).toBe(403);
    const r = await call('POST', '/api/tenants', BRENNAN, { name: 'Meridian Pay', admin_name: 'D. Osei' });
    expect(r.status).toBe(200);
    meridian = r.body.tenant.id;
    meridianAdmin = r.body.admin.id;
    expect(r.body.admin.role).toBe('tenant_admin');
    expect(r.body.admin.tenant_id).toBe(meridian);

    const r2 = await call('POST', '/api/tenants', BRENNAN, { name: 'Apex Lending', admin_name: 'K. Varga' });
    apex = r2.body.tenant.id;
    apexAdmin = r2.body.admin.id;
  });

  it('a fresh tenant has nothing', async () => {
    const d = await call('GET', `/api/tenants/${meridian}`, BRENNAN);
    expect(d.body.claims).toHaveLength(0);
    expect(d.body.pinned_version).toBeNull();
    expect(d.body.deployments).toHaveLength(0);
  });

  it('engagement scope is practice-lead only and validated', async () => {
    expect((await call('PUT', `/api/tenants/${meridian}/engagement`, PARK, {})).status).toBe(403);
    expect((await call('PUT', `/api/tenants/${meridian}/engagement`, BRENNAN, { sla_tier: 'gold' })).status).toBe(422);
    const r = await call('PUT', `/api/tenants/${meridian}/engagement`, BRENNAN, {
      jurisdictions: ['EU', 'IE'],
      regimes: ['DORA', 'GDPR', 'EU_AI_ACT'],
      sla_tier: 'priority',
      line_flags: { retainer: true, scoped: true, success: true },
    });
    expect(r.status).toBe(200);
  });
});

describe('claims: substance under the two-person rule (FR-F.3)', () => {
  it('allocates CLM IDs inside category blocks', async () => {
    const cap = await call('POST', `/api/tenants/${meridian}/claims`, meridianAdmin, {
      title: 'EEA-only processing',
      statement: 'All customer data is processed in EEA regions on named infrastructure.',
      category: 'security_cert_residency',
      evidence: 'Architecture document v4, section 2; hosting contract schedule B.',
    });
    expect(cap.status).toBe(200);
    expect(cap.body.claim.claim_id).toBe('CLM-101');

    const cap2 = await call('POST', `/api/tenants/${meridian}/claims`, meridianAdmin, {
      title: 'Named human escalation path',
      statement: 'Every automated decision carries a named human escalation route inside the product.',
      category: 'capability',
      evidence: 'Product documentation, escalation chapter.',
    });
    expect(cap2.body.claim.claim_id).toBe('CLM-001');
  });

  it('voice lint blocks a claim at submission', async () => {
    const c = await call('POST', `/api/tenants/${meridian}/claims`, meridianAdmin, {
      title: 'Throughput figure',
      statement: 'The pipeline delivers a Significant uplift in review speed.',
      category: 'figure',
      evidence: 'Internal benchmark, May 2026.',
    });
    expect(c.body.claim.claim_id).toBe('CLM-301');
    const submit = await call('POST', `/api/tenants/${meridian}/claims/CLM-301/submit`, meridianAdmin, {});
    expect(submit.status).toBe(422);
    expect(JSON.stringify(submit.body.findings)).toMatch(/Significant/);
  });

  it('the author of a claim cannot approve it; a separate reviewer can (FR-B.3 for claims)', async () => {
    expect((await call('POST', `/api/tenants/${meridian}/claims/CLM-101/submit`, meridianAdmin, {})).status).toBe(200);
    expect((await call('POST', `/api/tenants/${meridian}/claims/CLM-101/approve`, meridianAdmin, {})).status).toBe(403);
    expect((await call('POST', `/api/tenants/${meridian}/claims/CLM-101/approve`, PARK, {})).status).toBe(403); // analyst never approves substance
    const ok = await call('POST', `/api/tenants/${meridian}/claims/CLM-101/approve`, OKAFOR, {});
    expect(ok.status).toBe(200);

    expect((await call('POST', `/api/tenants/${meridian}/claims/CLM-001/submit`, meridianAdmin, {})).status).toBe(200);
    expect((await call('POST', `/api/tenants/${meridian}/claims/CLM-001/approve`, OKAFOR, {})).status).toBe(200);
  });

  it("Apex's claim lives in Apex's space", async () => {
    const c = await call('POST', `/api/tenants/${apex}/claims`, apexAdmin, {
      title: 'SOC 2 Type II',
      statement: 'SOC 2 Type II report issued March 2026 covering the production platform.',
      category: 'security_cert_residency',
      evidence: 'Report on file with auditors.',
    });
    expect(c.body.claim.claim_id).toBe('CLM-101'); // same ID, different tenant: isolated keyspaces
    expect((await call('POST', `/api/tenants/${apex}/claims/CLM-101/submit`, apexAdmin, {})).status).toBe(200);
    expect((await call('POST', `/api/tenants/${apex}/claims/CLM-101/approve`, OKAFOR, {})).status).toBe(200);
  });
});

describe('deploy: the bundle carries exactly this tenant (FR-F.4, FR-7.3)', () => {
  it('refuses an unpublished release', async () => {
    const r = await call('POST', `/api/tenants/${meridian}/deploy`, BRENNAN, { release: '1.2.0' });
    expect(r.status).toBe(422);
  });

  it('deploys the published release with claims slotted, checksummed, keyed', async () => {
    const r = await call('POST', `/api/tenants/${meridian}/deploy`, BRENNAN, { release: '1.3.0' });
    expect(r.status).toBe(200);
    expect(r.body.deploy_key).toMatch(/^[0-9a-f]{48}$/);
    expect(r.body.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.files).toContain('seam/_tenant/meridian-pay/approved-claims.md');
    expect(r.body.files.filter((f: string) => f.startsWith('seam/_tenant/') && !f.includes('_template'))).toHaveLength(1);

    const { rows } = await pool.query(`SELECT bundle_uri FROM tenant.deployment WHERE tenant_id = $1 AND active`, [meridian]);
    const file = await readFile(path.join(rows[0].bundle_uri, 'seam/_tenant/meridian-pay/approved-claims.md'), 'utf8');
    expect(file).toContain('**Tenant:** Meridian Pay.');
    expect(file).toContain('### CLM-101 EEA-only processing');
    expect(file).toContain('approved by: A. Okafor, reviewer');
    expect(file).not.toContain('SOC 2'); // never another tenant's claim
  });

  it('records the pin', async () => {
    const d = await call('GET', `/api/tenants/${meridian}`, BRENNAN);
    expect(d.body.pinned_version).toBe('1.3.0');
  });
});

describe('isolation (FR-7.1/7.2, FR-H.3 scope)', () => {
  it('tenant admins reach only their own tenant and the portal', async () => {
    expect((await call('GET', '/api/tenants', meridianAdmin)).status).toBe(403);
    expect((await call('GET', `/api/tenants/${apex}`, meridianAdmin)).status).toBe(403);
    expect((await call('GET', '/api/operating', meridianAdmin)).status).toBe(403);
    const portal = await call('GET', '/api/portal', meridianAdmin);
    expect(portal.status).toBe(200);
    expect(portal.body.tenant.id).toBe(meridian);
    expect(portal.body.pinned_version).toBe('1.3.0');
    expect(portal.body.claims.every((c: any) => c.tenant_id === meridian)).toBe(true);
  });

  it('a tenant database session sees zero rows of the other tenant', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE lsb_tenant`);
      await client.query(`SELECT set_config('app.is_practice', '', true)`);
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [meridian]);
      const { rows } = await client.query(`SELECT DISTINCT tenant_id FROM tenant.claim`);
      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(meridian);
      await expect(client.query(`SELECT * FROM shared.rule LIMIT 1`)).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('upgrade (FR-F.6, FR-7.4) and the scoped billing line (FR-H.2)', () => {
  it('ships a new release carrying an added rule', async () => {
    // NY-AI-006: a clean added rule so the upgrade delivers added coverage.
    const create = await call('POST', '/api/rules', HALE, {
      kind: 'regulatory',
      rule_id: 'NY-AI-006',
      regime: 'cross_regime',
      title: 'NYC AEDT audit cadence for employment-adjacent tools',
      jurisdiction_tags: ['US-NY'],
      statement: 'Covered tools require an annual independent bias audit and published results under the AEDT regime, read with state guidance.',
      buyer_reading: 'A New York buyer whose workflow touches hiring screens will ask for the audit cadence before procurement opens the file.',
      authority_summary: 'NYC Local Law 144 of 2021, read with DCWP rules.',
      applicability: 'Prospect operates an employment-adjacent automated decision tool reaching New York City candidates.',
      inputs_required: ['ai_touchpoint', 'jurisdiction'],
      sources: [{ citation: 'NYC Local Law 144 of 2021; DCWP final rules (2023)', source_type: 'statute' }],
    });
    expect(create.status).toBe(200);
    expect((await call('POST', '/api/rules/NY-AI-006/submit', HALE, {})).status).toBe(200);
    expect((await call('POST', '/api/rules/NY-AI-006/approve', OKAFOR, {})).status).toBe(200);

    const assembled = await call('POST', '/api/releases', PARK, { bump: 'minor' });
    expect(assembled.status).toBe(200);
    const v = assembled.body.version;
    expect(assembled.body.changelog.added).toContain('NY-AI-006');
    const gate = await call('POST', `/api/releases/${v}/gate`, PARK, {});
    expect(gate.body.passed, JSON.stringify(gate.body.checks?.filter((c: any) => !c.passed))).toBe(true);
    expect((await call('POST', `/api/releases/${v}/publish`, BRENNAN, {})).status).toBe(200);
  });

  it('shows the diff, upgrades, and emits the scoped line', async () => {
    const diff = await call('GET', `/api/tenants/${meridian}/upgrade-diff`, BRENNAN);
    expect(diff.status).toBe(200);
    expect(diff.body.diff.added).toContain('NY-AI-006');

    expect((await call('POST', `/api/tenants/${meridian}/upgrade`, PARK, {})).status).toBe(403);
    const up = await call('POST', `/api/tenants/${meridian}/upgrade`, BRENNAN, {});
    expect(up.status).toBe(200);
    expect(up.body.from).toBe('1.3.0');

    const d = await call('GET', `/api/tenants/${meridian}`, BRENNAN);
    expect(d.body.pinned_version).toBe(up.body.to);

    const { rows } = await pool.query(
      `SELECT * FROM tenant.billing_event WHERE tenant_id = $1 AND line = 'scoped'`,
      [meridian],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('the superseded pin still reproduces (FR-7.4)', async () => {
    const r = await call('POST', '/api/defensibility', BRENNAN, {
      artifact_ref: 'ART-PRIOR-PIN',
      release_version: '1.3.0',
      artifact_text: 'Cited [NY-AI-005] and [DORA-CON-003].',
      tenant_id: meridian,
    });
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.body.rules.map((e: any) => [e.rule_id, e]));
    expect(byId['NY-AI-005'].resolved).toBe(true);
    expect(byId['DORA-CON-003'].resolved).toBe(true);
    // and the export of 1.3.0 is still deterministic
    const a = await call('GET', '/api/releases/1.3.0/export', BRENNAN);
    const b = await call('GET', '/api/releases/1.3.0/export', BRENNAN);
    expect(a.body.checksum).toBe(b.body.checksum);
  });
});
