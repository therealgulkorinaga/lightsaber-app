// The Phase 1 definition-of-done, exercised end to end through the API:
// author a rule through lint and validation (A), two-person review (B),
// candidate assembly and the blocking gate (E), publish with checksummed
// export, lossless reproduction and the defensibility report (G).
// Runs last: it mutates the working state.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/api/app.ts';
import { pool } from '../src/db/pool.ts';
import { readBundleFile, RULES_FILES, DOCUMENT_FILES, EVALS_FILE } from '../src/seam/bundle.ts';

const HALE = '00000000-0000-4000-8000-000000000001'; // author
const OKAFOR = '00000000-0000-4000-8000-000000000002'; // reviewer
const BRENNAN = '00000000-0000-4000-8000-000000000003'; // practice lead
const PARK = '00000000-0000-4000-8000-000000000004'; // analyst

let app: FastifyInstance;

beforeAll(async () => {
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
    headers: user ? { 'x-user-id': user, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    payload: body as any,
  });
  return { status: res.statusCode, body: res.json() };
}

const CLEAN_RULE = {
  kind: 'regulatory',
  rule_id: 'NY-AI-005',
  regime: 'cross_regime',
  title: 'NYDFS expectations for AI in financial services',
  jurisdiction_tags: ['US-NY'],
  statement:
    'NYDFS guidance directs covered entities to address AI-driven risks within their cybersecurity programmes under Part 500, including risk assessments that account for AI-enabled threats and controls over third-party AI services.',
  buyer_reading:
    'A New York supervised buyer reads an AI vendor through its Part 500 programme. Expect the security questionnaire to probe AI-enabled attack surface and third-party controls before legal review begins.',
  authority_summary: 'NYDFS Industry Letter on cybersecurity risks from artificial intelligence (October 2024), read with 23 NYCRR Part 500.',
  applicability: 'Prospect is an NYDFS-supervised entity and the AI touchpoint reaches production workflows.',
  inputs_required: ['firm_type', 'regulator', 'ai_touchpoint'],
  sources: [
    {
      citation: 'NYDFS Industry Letter, Cybersecurity Risks Arising from Artificial Intelligence (16 October 2024)',
      source_type: 'guidance',
    },
  ],
};

describe('Component A: authoring through the schema and lint', () => {
  it('an analyst cannot author (FR-9.7)', async () => {
    const r = await call('POST', '/api/rules', PARK, CLEAN_RULE);
    expect(r.status).toBe(403);
  });

  it('rejects an ID that already exists, retired included (FR-A.2)', async () => {
    const r = await call('POST', '/api/rules', HALE, { ...CLEAN_RULE, rule_id: 'ICP-DQ-001', kind: 'icp', kind_fields: { is_disqualifier: true, test_raw: 'x', rationale_raw: 'y', weight_raw: 'n/a' } });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.findings)).toMatch(/never reused/);
  });

  it('rejects unknown jurisdiction tags (FR-A.3)', async () => {
    const r = await call('POST', '/api/rules', HALE, { ...CLEAN_RULE, jurisdiction_tags: ['US-FL'] });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.findings)).toMatch(/US-FL/);
  });

  it('creates the draft, then blocks submission on lint and missing source (FR-A.5, FR-A.6)', async () => {
    const dirty = {
      ...CLEAN_RULE,
      statement: CLEAN_RULE.statement + ' This is a Significant obligation — vendors should note it.',
      sources: [],
    };
    const created = await call('POST', '/api/rules', HALE, dirty);
    expect(created.status).toBe(200);

    const submit = await call('POST', '/api/rules/NY-AI-005/submit', HALE, {});
    expect(submit.status).toBe(422);
    const codes = submit.body.findings.map((f: any) => f.code);
    expect(codes).toContain('em_dash');
    expect(codes).toContain('banned_word');
    expect(codes).toContain('source_missing');
  });

  it('a jurisdiction tag outside the regime footprint blocks submission', async () => {
    // FCA is a UK supervisor; an EU-only tag cannot layer under it.
    const created = await call('POST', '/api/rules', HALE, {
      ...CLEAN_RULE,
      rule_id: 'FCA-XX-001',
      regime: 'FCA',
      jurisdiction_tags: ['EU'],
    });
    expect(created.status).toBe(200); // drafts may carry issues; submission may not
    const submit = await call('POST', '/api/rules/FCA-XX-001/submit', HALE, {});
    expect(submit.status).toBe(422);
    expect(submit.body.findings.some((f: any) => f.code === 'regime_scope' && /outside FCA's footprint/.test(f.message))).toBe(true);
  });

  it('the seeded corpus sits entirely inside its regime footprints', async () => {
    const { rows } = await pool.query(
      `WITH RECURSIVE up AS (
         SELECT tag, parent_tag, tag AS leaf FROM shared.jurisdiction
         UNION ALL
         SELECT j.tag, j.parent_tag, up.leaf FROM shared.jurisdiction j JOIN up ON j.tag = up.parent_tag
       ), roots AS (SELECT leaf, tag AS root FROM up WHERE parent_tag IS NULL)
       SELECT r.rule_id, t.jurisdiction_tag, g.code
         FROM shared.rule r
         JOIN shared.rule_jurisdiction t ON t.rule_id = r.rule_id
         JOIN shared.regime g ON g.code = r.regime
         JOIN roots ON roots.leaf = t.jurisdiction_tag
        WHERE r.kind = 'regulatory' AND cardinality(g.jurisdictions) > 0
          AND NOT roots.root = ANY(g.jurisdictions)`,
    );
    expect(rows).toEqual([]); // no seeded rule pairs a tag with a foreign regime
  });

  it('an unknown prospect field is flagged before submission (FR-A.4)', async () => {
    const r = await call('PUT', '/api/rules/NY-AI-005/draft', HALE, { ...CLEAN_RULE, inputs_required: ['firm_type', 'made_up_field'] });
    expect(r.status).toBe(200);
    expect(r.body.findings.some((f: any) => f.code === 'unknown_input' && f.message.includes('made_up_field'))).toBe(true);
  });

  it('draft privacy: invisible to the analyst, visible to a reviewer (FR-A.8)', async () => {
    const asAnalyst = await call('GET', '/api/rules?status=draft', PARK);
    expect(asAnalyst.body.rules.some((r: any) => r.rule_id === 'NY-AI-005')).toBe(false);
    const asReviewer = await call('GET', '/api/rules?status=draft', OKAFOR);
    expect(asReviewer.body.rules.some((r: any) => r.rule_id === 'NY-AI-005')).toBe(true);
    const detail = await call('GET', '/api/rules/NY-AI-005', PARK);
    expect(detail.status).toBe(404);
  });

  it('cleared draft submits (FR-B.1), and only its author may submit it', async () => {
    const save = await call('PUT', '/api/rules/NY-AI-005/draft', HALE, CLEAN_RULE);
    expect(save.status).toBe(200);
    expect(save.body.findings).toHaveLength(0);

    const wrongUser = await call('POST', '/api/rules/NY-AI-005/submit', OKAFOR, {});
    expect(wrongUser.status).toBe(403);

    const submit = await call('POST', '/api/rules/NY-AI-005/submit', HALE, {});
    expect(submit.status).toBe(200);
    expect(submit.body.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Component B: two-person review', () => {
  it('the author cannot approve their own version (FR-B.1)', async () => {
    const r = await call('POST', '/api/rules/NY-AI-005/approve', HALE, {});
    expect(r.status).toBe(403);
  });

  it('an analyst cannot approve substance (FR-9.7)', async () => {
    const r = await call('POST', '/api/rules/NY-AI-005/approve', PARK, {});
    expect(r.status).toBe(403);
  });

  it('a return requires notes; the notes travel with the version (FR-B.2)', async () => {
    const noNotes = await call('POST', '/api/rules/NY-AI-005/return', OKAFOR, {});
    expect(noNotes.status).toBe(422);
    const returned = await call('POST', '/api/rules/NY-AI-005/return', OKAFOR, { notes: 'Tighten the applicability to NYDFS-covered entities only.' });
    expect(returned.status).toBe(200);
    const detail = await call('GET', '/api/rules/NY-AI-005', HALE);
    const v = detail.body.versions.at(-1);
    expect(v.review_state).toBe('returned');
    expect(v.review_notes).toMatch(/Tighten the applicability/);
  });

  it('the author revises and resubmits; a separate reviewer approves (FR-B.2/B.3)', async () => {
    const save = await call('PUT', '/api/rules/NY-AI-005/draft', HALE, {
      ...CLEAN_RULE,
      applicability: 'Prospect is an NYDFS-covered entity under 23 NYCRR Part 500 and the AI touchpoint reaches production workflows.',
    });
    expect(save.status).toBe(200);
    expect((await call('POST', '/api/rules/NY-AI-005/submit', HALE, {})).status).toBe(200);
    const approve = await call('POST', '/api/rules/NY-AI-005/approve', OKAFOR, {});
    expect(approve.status).toBe(200);

    const detail = await call('GET', '/api/rules/NY-AI-005', HALE);
    expect(detail.body.rule.status).toBe('approved');
    const v = detail.body.versions.at(-1);
    expect(v.review_state).toBe('approved');
    expect(v.reviewer_id).toBe(OKAFOR);
    expect(v.approved_at).toBeTruthy();
  });

  it('an unchanged re-submission is rejected as a no-op (FR-A.7)', async () => {
    const open = await call('POST', '/api/rules/NY-AI-005/versions', HALE, {});
    expect(open.status).toBe(200);
    const submit = await call('POST', '/api/rules/NY-AI-005/submit', HALE, {});
    expect(submit.status).toBe(422);
    expect(submit.body.error).toMatch(/No change against the current active version/);
  });

  it('a movement note arms a watch item on save (FR-A.9)', async () => {
    const r = await call('PUT', '/api/rules/NY-AI-005/draft', HALE, {
      ...CLEAN_RULE,
      statement: CLEAN_RULE.statement + ' A proposed NYDFS circular would extend these expectations.',
      movement_note: 'Re-verify on publication of the proposed NYDFS AI circular; re-author on adoption.',
      kind_fields: {
        watch: { trigger_type: 'event', event_description: 'NYDFS publishes the proposed AI circular in final form', reverify_date: '2026-12-01' },
      },
    });
    expect(r.status).toBe(200);
    const watch = await call('GET', '/api/watch', HALE);
    const mine = watch.body.items.filter((i: any) => (i.rule_ids ?? []).includes('NY-AI-005'));
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe('armed');
    // submit + approve the revision so the staging set carries it
    expect((await call('POST', '/api/rules/NY-AI-005/submit', HALE, {})).status).toBe(200);
    expect((await call('POST', '/api/rules/NY-AI-005/approve', OKAFOR, {})).status).toBe(200);
  });
});

describe('Component E: candidate, gate, publish', () => {
  let redCandidate: string;
  let greenCandidate: string;

  it('assembles a candidate from the staging set (FR-E.1)', async () => {
    const r = await call('POST', '/api/releases', PARK, { bump: 'minor' });
    expect(r.status).toBe(200);
    redCandidate = r.body.version;
    expect(redCandidate).toBe('1.2.0');
    expect(r.body.changelog.added).toContain('NY-AI-005');
    expect(r.body.pinned).toBe(91); // 90 non-retired seeded rules + NY-AI-005
  });

  it('the gate runs red on the genuine 1.1.0 defect: eval 2 cites retired ICP-DQ-001 (FR-E.2/E.3)', async () => {
    const r = await call('POST', `/api/releases/${redCandidate}/gate`, PARK, {});
    expect(r.status).toBe(200);
    expect(r.body.passed).toBe(false);
    const evalCheck = r.body.checks.find((c: any) => c.id === 'eval');
    expect(evalCheck.passed).toBe(false);
    const failing = evalCheck.cases.find((c: any) => !c.passed);
    expect(failing.id).toBe('eval-2');
    expect(failing.detail).toMatch(/ICP-DQ-001/);
    // the other four checks hold on the seeded corpus
    for (const c of r.body.checks.filter((c: any) => c.id !== 'eval')) {
      expect(c.passed, `${c.id}: ${c.detail}`).toBe(true);
    }
  });

  it('no publish path exists for the red candidate (FR-9.3, FR-E.8)', async () => {
    const r = await call('POST', `/api/releases/${redCandidate}/publish`, BRENNAN, {});
    expect(r.status).toBe(409);
    const { rows } = await pool.query(`SELECT 1 FROM shared.bundle_export WHERE release_version = $1`, [redCandidate]);
    expect(rows).toHaveLength(0); // no bundle for a red run
  });

  it('fixing the eval is an authored, audited change; the next candidate gates green', async () => {
    const { body: evals } = await call('GET', '/api/eval-cases', PARK);
    const two = evals.cases.find((c: any) => c.id === 2);
    const fix = (s: string) => s.replaceAll('ICP-DQ-001', 'ICP-DQ-003');
    const upd = await call('PUT', '/api/eval-cases/2', PARK, {
      expected_output: fix(two.expected_output),
      assertions: two.assertions.map((a: any) => ({ ...a, check: fix(a.check) })),
    });
    expect(upd.status).toBe(200);

    const assembled = await call('POST', '/api/releases', PARK, { bump: 'minor' });
    expect(assembled.status).toBe(200);
    greenCandidate = assembled.body.version;
    expect(greenCandidate).toBe('1.3.0'); // 1.2.0 burned by the red run

    const gate = await call('POST', `/api/releases/${greenCandidate}/gate`, PARK, {});
    expect(gate.body.passed, JSON.stringify(gate.body.checks, null, 2)).toBe(true);
    expect(gate.body.checks).toHaveLength(5);
  });

  it('only the practice lead publishes; the bundle is checksummed (FR-E.7)', async () => {
    expect((await call('POST', `/api/releases/${greenCandidate}/publish`, PARK, {})).status).toBe(403);
    const r = await call('POST', `/api/releases/${greenCandidate}/publish`, BRENNAN, {});
    expect(r.status).toBe(200);
    expect(r.body.checksum).toMatch(/^[0-9a-f]{64}$/);

    const detail = await call('GET', '/api/rules/NY-AI-005', HALE);
    expect(detail.body.rule.status).toBe('active'); // approved -> active on entering a published release (5.1)
  });

  it('the published bundle carries the new rule in place, Contents updated', async () => {
    const r = await call('GET', `/api/releases/${greenCandidate}/export`, HALE);
    const reg = r.body.files['seam/regulatory-rules.md'];
    expect(reg).toContain('### NY-AI-005 NYDFS expectations for AI in financial services');
    expect(reg).toContain('- New York, state and city (US-NY, US-NYC): NY-DFS-001, NY-INS-002, NYC-AEDT-003, NY-AI-004, NY-AI-005');
    // the rule sits inside the New York section, before the California heading
    expect(reg.indexOf('### NY-AI-005')).toBeGreaterThan(reg.indexOf('## New York (state and city)'));
    expect(reg.indexOf('### NY-AI-005')).toBeLessThan(reg.indexOf('## California'));
    // and the fixed eval ships in the bundle
    expect(r.body.files[EVALS_FILE]).toContain('ICP-DQ-003');
    expect(r.body.files[EVALS_FILE].includes('ICP-DQ-001')).toBe(false);
  });

  it('re-export of the published release is deterministic (FR-9.6)', async () => {
    const a = await call('GET', `/api/releases/${greenCandidate}/export`, HALE);
    const b = await call('GET', `/api/releases/${greenCandidate}/export`, HALE);
    expect(a.body.checksum).toBe(b.body.checksum);
  });

  it('release 1.1.0 still reproduces byte-identically after all of this (FR-G.3)', async () => {
    const r = await call('GET', '/api/releases/1.1.0/export', HALE);
    for (const p of [...RULES_FILES.map((f) => f.path), ...DOCUMENT_FILES, EVALS_FILE]) {
      expect(r.body.files[p], p).toBe(await readBundleFile(p));
    }
  });
});

describe('Component G: audit and defensibility', () => {
  it('the audit log reconstructs the chain (FR-9.1)', async () => {
    const r = await call('GET', '/api/audit/log?object_type=rule&object_id=NY-AI-005', BRENNAN);
    const actions = r.body.log.map((l: any) => l.action);
    for (const expected of ['draft_created', 'draft_saved', 'submitted_for_review', 'returned_with_notes', 'approved']) {
      expect(actions).toContain(expected);
    }
    // every entry carries actor and timestamp
    for (const l of r.body.log) {
      expect(l.actor_id).toBeTruthy();
      expect(l.at).toBeTruthy();
    }
  });

  it('produces a defensibility report from the pinned release, not live rules (FR-G.4)', async () => {
    const r = await call('POST', '/api/defensibility', BRENNAN, {
      artifact_ref: 'ART-2026-0610-001',
      release_version: '1.3.0',
      artifact_text: 'The objection response rested on [DORA-CON-003] and [NY-AI-005].',
    });
    expect(r.status).toBe(200);
    expect(r.body.boundary).toMatch(/not legal advice/);
    const byId = Object.fromEntries(r.body.rules.map((e: any) => [e.rule_id, e]));
    expect(byId['DORA-CON-003'].resolved).toBe(true);
    expect(byId['DORA-CON-003'].rule_text).toContain('### DORA-CON-003 Mandatory contractual provisions');
    expect(byId['DORA-CON-003'].provenance.author).toBeTruthy();
    expect(byId['DORA-CON-003'].provenance.reviewer).toBeTruthy();
    expect(byId['NY-AI-005'].resolved).toBe(true);
    expect(byId['NY-AI-005'].rule_text).toContain('NYDFS');
  });

  it('the same artifact against seam 1.1.0 shows NY-AI-005 was not part of that version', async () => {
    const r = await call('POST', '/api/defensibility', BRENNAN, {
      artifact_ref: 'ART-2026-0610-002',
      release_version: '1.1.0',
      artifact_text: 'Cited [DORA-CON-003] and [NY-AI-005].',
    });
    const byId = Object.fromEntries(r.body.rules.map((e: any) => [e.rule_id, e]));
    expect(byId['DORA-CON-003'].resolved).toBe(true);
    expect(byId['NY-AI-005'].resolved).toBe(false);
    expect(byId['NY-AI-005'].note).toMatch(/not part of seam 1.1.0/);
  });

  it('an unpublished version cannot be cited by an artifact', async () => {
    const r = await call('POST', '/api/defensibility', BRENNAN, {
      artifact_ref: 'ART-X',
      release_version: '1.2.0',
      artifact_text: '[DORA-CON-003]',
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/never published/);
  });
});
