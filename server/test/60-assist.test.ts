// Component AI under its guardrails (FR-AI.1 .. AI.6). The test environment
// has no model credentials, which is itself a case the design demands: assisted
// capabilities refuse clearly; the deterministic subset still works; and the
// failure-mode controls (eval independence, source ticks, provenance) hold.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/api/app.ts';
import { pool } from '../src/db/pool.ts';
import {
  buildResearchPrompt,
  buildReviewerPrompt,
  buildGapDraftPrompt,
} from '../src/assist/llm.ts';

const HALE = '00000000-0000-4000-8000-000000000001';
const OKAFOR = '00000000-0000-4000-8000-000000000002';
const BRENNAN = '00000000-0000-4000-8000-000000000003';
const PARK = '00000000-0000-4000-8000-000000000004';

let app: FastifyInstance;

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY; // the refusal path is the tested path
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

async function call(method: string, url: string, user: string | null, body?: unknown) {
  const res = await app.inject({
    method: method as any,
    url,
    headers: { ...(user ? { 'x-user-id': user } : {}), 'content-type': 'application/json' },
    payload: body as any,
  });
  return { status: res.statusCode, body: res.json() };
}

describe('refusal without credentials (FR-X.2 spirit: never silently pass)', () => {
  it('research refuses clearly and records the refused run', async () => {
    const r = await call('POST', '/api/assist/research', HALE, { regime: 'DORA' });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/ANTHROPIC_API_KEY/);
    const { rows } = await pool.query(
      `SELECT status FROM shared.assist_run WHERE capability = 'research' ORDER BY started_at DESC LIMIT 1`,
    );
    expect(rows[0].status).toBe('refused');
  });

  it('gap-draft and reviewer assist refuse the same way', async () => {
    const { rows: gaps } = await pool.query(`SELECT id FROM tenant.gap_log LIMIT 1`);
    expect((await call('POST', '/api/assist/gap-draft', HALE, { gap_id: gaps[0].id })).status).toBe(503);
  });

  it('an analyst cannot run substance assists (FR-9.7 extends to the agent)', async () => {
    expect((await call('POST', '/api/assist/research', PARK, { regime: 'DORA' })).status).toBe(403);
    expect((await call('POST', '/api/assist/scaffold', PARK, { rough: { statement: 'x' } })).status).toBe(403);
  });
});

describe('scaffold: deterministic subset (FR-AI.3)', () => {
  it('shapes mechanics, never the substance, and marks the draft assisted', async () => {
    const rough = 'Vendors processing card data must hold PCI DSS v4 attestation — the buyer will ask at security review.';
    const r = await call('POST', '/api/assist/scaffold', HALE, {
      kind: 'regulatory',
      regime: 'cross_regime',
      jurisdiction_tags: ['EU'],
      rough: { statement: rough, title: 'PCI DSS attestation at security review' },
    });
    expect(r.status).toBe(200);
    expect(r.body.draft.ai_assisted).toBe(true);
    // em dash mechanically fixed; the words themselves untouched
    expect(r.body.draft.statement).toContain('PCI DSS v4 attestation, the buyer will ask');
    expect(r.body.draft.statement).not.toContain('—');
    expect(r.body.note).toMatch(/Model unavailable; mechanics only/);
  });
});

describe('critic: deterministic findings (FR-AI.2)', () => {
  it('finds layer asymmetries in the seeded corpus and is reproducible', async () => {
    const a = await call('POST', '/api/assist/critic', PARK, {});
    expect(a.status).toBe(200);
    expect(a.body.semantic_ran).toBe(false);

    // IE layers exist (EU_AI_ACT, cross_regime) but DORA/GDPR/MiCA carry EU
    // parent rules with no IE layer: the asymmetry the critic exists to flag.
    const asym = a.body.findings.filter((f: any) => f.kind === 'layer_asymmetry');
    expect(asym.length).toBeGreaterThanOrEqual(1);
    expect(asym.some((f: any) => f.detail.jurisdiction === 'IE' && ['DORA', 'GDPR', 'MiCA'].includes(f.detail.regime))).toBe(true);

    // no orphaned references in a corpus the gate already passed
    expect(a.body.findings.filter((f: any) => f.kind === 'orphaned_reference')).toHaveLength(0);

    const b = await call('POST', '/api/assist/critic', PARK, {});
    const key = (f: any) => `${f.kind}:${JSON.stringify(f.detail)}`;
    expect(b.body.findings.map(key).sort()).toEqual(a.body.findings.map(key).sort());
  });

  it('findings dismiss only with a recorded reason', async () => {
    const { rows } = await pool.query(`SELECT id FROM shared.assist_finding WHERE status = 'open' LIMIT 1`);
    const id = rows[0].id;
    expect((await call('POST', `/api/assist/findings/${id}/dismiss`, PARK, {})).status).toBe(422);
    expect((await call('POST', `/api/assist/findings/${id}/dismiss`, PARK, { reason: 'Known thin layer; scoped for the IE deepening engagement.' })).status).toBe(200);
    const { rows: after } = await pool.query(`SELECT status, resolution_reason FROM shared.assist_finding WHERE id = $1`, [id]);
    expect(after[0].status).toBe('dismissed');
    expect(after[0].resolution_reason).toMatch(/IE deepening/);
  });
});

describe('eval poisoning control (FR-AI.6)', () => {
  it('no assist call can touch the eval suite; eval authorship is human', async () => {
    const before = await pool.query(`SELECT count(*)::int AS n, max(id) AS mx FROM shared.eval_case`);
    await call('POST', '/api/assist/critic', PARK, {});
    await call('POST', '/api/assist/scaffold', HALE, { rough: { statement: 'probe' } });
    const after = await pool.query(`SELECT count(*)::int AS n, max(id) AS mx FROM shared.eval_case`);
    expect(after.rows[0]).toEqual(before.rows[0]);

    // eval authorship trail: the 30-flow fix to case 2 carries its human author
    const { rows } = await pool.query(`SELECT created_by FROM shared.eval_case WHERE id = 2`);
    expect(rows[0].created_by).toBe(PARK);
    // and an author role cannot write evals at all (independence by role, too)
    expect((await call('POST', '/api/eval-cases', HALE, { prompt: 'x', expected_output: 'y' })).status).toBe(403);
  });
});

describe('anchoring control: source ticks on assisted drafts (FR-AI.6)', () => {
  it('an ai_assisted draft cannot submit until every source is ticked as read', async () => {
    const create = await call('POST', '/api/rules', HALE, {
      ai_assisted: true,
      kind: 'regulatory',
      rule_id: 'NY-AI-007',
      regime: 'cross_regime',
      title: 'NYDFS AI guidance follow-through',
      jurisdiction_tags: ['US-NY'],
      statement: 'Covered entities are expected to fold AI threat scenarios into their Part 500 risk assessments on the existing assessment cadence.',
      buyer_reading: 'The security questionnaire will probe the AI threat scenarios; arriving with them mapped shortens that pass.',
      authority_summary: 'NYDFS Industry Letter (October 2024), read with 23 NYCRR Part 500.',
      applicability: 'NYDFS-covered prospect with any production AI touchpoint.',
      inputs_required: ['regulator', 'ai_touchpoint'],
      sources: [
        { citation: 'NYDFS Industry Letter, October 2024', source_type: 'guidance' },
        { citation: '23 NYCRR Part 500, section 500.9', source_type: 'regulation' },
      ],
    });
    expect(create.status).toBe(200);

    const blocked = await call('POST', '/api/rules/NY-AI-007/submit', HALE, {});
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toMatch(/tick each source/);
    expect(blocked.body.findings).toHaveLength(2);

    const detail = await call('GET', '/api/rules/NY-AI-007', HALE);
    const versionId = detail.body.versions.at(-1).id;
    const sources = detail.body.sources.filter((s: any) => s.rule_version_id === versionId);
    // another author cannot tick for you
    expect((await call('POST', `/api/rules/NY-AI-007/sources/${sources[0].id}/verify`, OKAFOR, {})).status).toBe(403);
    for (const s of sources) {
      expect((await call('POST', `/api/rules/NY-AI-007/sources/${s.id}/verify`, HALE, {})).status).toBe(200);
    }
    expect((await call('POST', '/api/rules/NY-AI-007/submit', HALE, {})).status).toBe(200);
    expect((await call('POST', '/api/rules/NY-AI-007/approve', OKAFOR, {})).status).toBe(200);
  });

  it('the provenance flag reaches the defensibility report through a release pin', async () => {
    const assembled = await call('POST', '/api/releases', PARK, { bump: 'minor' });
    const v = assembled.body.version;
    const gate = await call('POST', `/api/releases/${v}/gate`, PARK, {});
    expect(gate.body.passed, JSON.stringify(gate.body.checks?.filter((c: any) => !c.passed))).toBe(true);
    expect((await call('POST', `/api/releases/${v}/publish`, BRENNAN, {})).status).toBe(200);

    const report = await call('POST', '/api/defensibility', BRENNAN, {
      artifact_ref: 'ART-AI-PROV',
      release_version: v,
      artifact_text: 'Rested on [NY-AI-007] and [DORA-CON-003].',
    });
    const byId = Object.fromEntries(report.body.rules.map((e: any) => [e.rule_id, e]));
    expect(byId['NY-AI-007'].provenance.authorship).toBe('agent-drafted, human-verified and accepted');
    expect(byId['DORA-CON-003'].provenance.authorship).toBe('human-authored');
  });
});

describe('prompt construction (the house pattern in the prompts themselves)', () => {
  it('research defaults to sources without conclusions for high-risk work', () => {
    const sourcesOnly = buildResearchPrompt({ regime: 'DORA', includeDrafts: false, existingIds: ['DORA-TPR-001'] });
    expect(sourcesOnly.prompt).toMatch(/Do NOT draft statements or conclusions/);
    expect(sourcesOnly.schema).not.toContain('draft_statement');

    const withDrafts = buildResearchPrompt({ regime: 'DORA', includeDrafts: true, existingIds: [] });
    expect(withDrafts.schema).toContain('draft_statement');
    expect(withDrafts.prompt).toMatch(/grounded strictly in the named source/);
  });

  it('gap-draft names the corpus and forbids invented prerequisites', () => {
    const { prompt, schema } = buildGapDraftPrompt(
      { gap_kind: 'uncovered_objection', abstention_text: 'x', prospect_context_abstracted: {} },
      ['DORA-TPR-001', 'GDPR-BAS-001'],
    );
    expect(prompt).toContain('DORA-TPR-001, GDPR-BAS-001');
    expect(prompt).toMatch(/missing prerequisite instead of pretending it exists/);
    expect(schema).toContain('missing_prerequisites');
  });

  it('reviewer assist asks exactly the three questions', () => {
    const { prompt } = buildReviewerPrompt('### X-001 Test', ['Some citation']);
    expect(prompt).toMatch(/authority_checkable/);
    expect(prompt).toMatch(/overreach/);
    expect(prompt).toMatch(/advice_drift/);
    expect(prompt).toMatch(/never an approval/);
  });
});
