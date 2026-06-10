// Demo seed: populates every surface by driving the real API, so every
// invariant (two-person rule, gate, RLS, source ticks) is exercised, not
// bypassed. Run AFTER the canonical seed:  npm run db:reset && npm run db:demo
// Never used by tests; the canonical byte-identity seed stays pure.

import { buildApp } from '../api/app.ts';
import { pool } from '../db/pool.ts';

const HALE = '00000000-0000-4000-8000-000000000001'; // author
const OKAFOR = '00000000-0000-4000-8000-000000000002'; // reviewer
const BRENNAN = '00000000-0000-4000-8000-000000000003'; // practice lead
const PARK = '00000000-0000-4000-8000-000000000004'; // analyst

const app = await buildApp();

async function call(method: string, url: string, user: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({
    method: method as any,
    url,
    headers: { ...(user ? { 'x-user-id': user } : {}), 'content-type': 'application/json', ...headers },
    payload: body as any,
  });
  const json = res.json();
  if (res.statusCode >= 400) {
    throw new Error(`${method} ${url} -> ${res.statusCode}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

const { rows: guard } = await pool.query(`SELECT count(*)::int AS n FROM tenant.tenant`);
if (guard[0].n > 0) {
  console.error('Demo data already present; run npm run db:reset first.');
  process.exit(1);
}

console.log('— a candidate that fails the gate (the shipped eval-2 defect) —');
const red = await call('POST', '/api/releases', PARK, { bump: 'minor' }); // 1.2.0
const redGate = await call('POST', `/api/releases/${red.version}/gate`, PARK, {});
console.log(`  ${red.version} gate: ${redGate.passed ? 'green (unexpected)' : 'red — eval 2 cites retired ICP-DQ-001'}`);

console.log('— fix the eval as an audited change —');
const evals = await call('GET', '/api/eval-cases', PARK);
const two = evals.cases.find((c: any) => c.id === 2);
const fix = (s: string) => s.replaceAll('ICP-DQ-001', 'ICP-DQ-003');
await call('PUT', '/api/eval-cases/2', PARK, {
  expected_output: fix(two.expected_output),
  assertions: two.assertions.map((a: any) => ({ ...a, check: fix(a.check) })),
});

console.log('— author NY-AI-005 (human) and TX-AI-004 (assistant draft, source-ticked) —');
await call('POST', '/api/rules', HALE, {
  kind: 'regulatory',
  rule_id: 'NY-AI-005',
  regime: 'cross_regime',
  title: 'NYDFS cybersecurity expectations reach AI vendors',
  jurisdiction_tags: ['US-NY'],
  statement:
    'NYDFS guidance directs covered entities to address AI-driven risks within their Part 500 cybersecurity programmes, including risk assessments that account for AI-enabled threats and controls over third-party AI services.',
  buyer_reading:
    'A New York supervised buyer reads an AI vendor through its Part 500 programme. Expect the security questionnaire to probe AI-enabled attack surface and third-party controls before legal review begins.',
  authority_summary: 'NYDFS Industry Letter on cybersecurity risks from artificial intelligence (October 2024), read with 23 NYCRR Part 500.',
  applicability: 'Prospect is an NYDFS-covered entity and the AI touchpoint reaches production workflows.',
  inputs_required: ['firm_type', 'regulator', 'ai_touchpoint'],
  sources: [{ citation: 'NYDFS Industry Letter, Cybersecurity Risks Arising from Artificial Intelligence (16 October 2024)', source_type: 'guidance' }],
});
await call('POST', '/api/rules/NY-AI-005/submit', HALE, {});
await call('POST', '/api/rules/NY-AI-005/approve', OKAFOR, {});

await call('POST', '/api/rules', HALE, {
  ai_assisted: true, // began as an assistant draft; the ticks below are the acceptance act
  kind: 'regulatory',
  rule_id: 'TX-AI-004',
  regime: 'cross_regime',
  title: 'Texas DOB examination posture on AI in lending operations',
  jurisdiction_tags: ['US-TX'],
  statement:
    'Texas-licensed lenders should expect examination questions on AI use in lending operations under existing safety-and-soundness authority, with TRAIGA intent standards raised where consumer-facing AI is in scope.',
  buyer_reading:
    'A Texas-licensed buyer maps AI vendor diligence to its examination file. A vendor pack that answers the examiner question directly shortens the diligence pass.',
  authority_summary: 'Texas Finance Code examination authority, read with TRAIGA (HB 149, 2025) intent standards.',
  applicability: 'Prospect is a Texas-licensed lender and the AI touchpoint reaches lending operations.',
  inputs_required: ['firm_type', 'regulator', 'ai_touchpoint'],
  sources: [
    { citation: 'Texas Finance Code, examination provisions', source_type: 'statute' },
    { citation: 'TRAIGA, HB 149 (2025)', source_type: 'statute' },
  ],
});
const txDetail = await call('GET', '/api/rules/TX-AI-004', HALE);
const txVersion = txDetail.versions.at(-1);
for (const s of txDetail.sources.filter((x: any) => x.rule_version_id === txVersion.id)) {
  await call('POST', `/api/rules/TX-AI-004/sources/${s.id}/verify`, HALE, {});
}
await call('POST', '/api/rules/TX-AI-004/submit', HALE, {});
await call('POST', '/api/rules/TX-AI-004/approve', OKAFOR, {});

console.log('— publish the green release —');
const green = await call('POST', '/api/releases', PARK, { bump: 'minor' }); // 1.3.0
const greenGate = await call('POST', `/api/releases/${green.version}/gate`, PARK, {});
if (!greenGate.passed) throw new Error('demo: expected a green gate');
await call('POST', `/api/releases/${green.version}/publish`, BRENNAN, {});
console.log(`  published ${green.version} (added: ${green.changelog.added.join(', ')})`);

console.log('— provision the fleet —');
const meridian = await call('POST', '/api/tenants', BRENNAN, { name: 'Meridian Pay', admin_name: 'D. Osei' });
const apex = await call('POST', '/api/tenants', BRENNAN, { name: 'Apex Lending', admin_name: 'K. Varga' });
const volta = await call('POST', '/api/tenants', BRENNAN, { name: 'Volta Insure' });
const M = meridian.tenant.id, A = apex.tenant.id, V = volta.tenant.id;
const OSEI = meridian.admin.id, VARGA = apex.admin.id;

await call('PUT', `/api/tenants/${M}/engagement`, BRENNAN, {
  jurisdictions: ['EU', 'IE'], regimes: ['DORA', 'GDPR', 'EU_AI_ACT'], sla_tier: 'priority',
  line_flags: { retainer: true, scoped: true, success: true }, start_date: '2026-03-01',
});
await call('PUT', `/api/tenants/${A}/engagement`, BRENNAN, {
  jurisdictions: ['US', 'US-NY', 'US-CA', 'US-TX'], regimes: ['cross_regime'], sla_tier: 'standard',
  line_flags: { retainer: true, scoped: true, success: false }, start_date: '2026-05-12',
});
await call('PUT', `/api/tenants/${V}/engagement`, BRENNAN, {
  jurisdictions: ['UK'], regimes: ['FCA', 'GDPR'], sla_tier: 'critical',
  line_flags: { retainer: false, scoped: true, success: false }, start_date: '2026-06-02',
});

console.log('— claims: every category, one aging, one left in review —');
const claim = async (tenant: string, author: string, body: any, approve = true) => {
  const c = await call('POST', `/api/tenants/${tenant}/claims`, author, body);
  await call('POST', `/api/tenants/${tenant}/claims/${c.claim.claim_id}/submit`, author, {});
  if (approve) await call('POST', `/api/tenants/${tenant}/claims/${c.claim.claim_id}/approve`, OKAFOR, {});
  return c.claim.claim_id;
};
await claim(M, OSEI, {
  title: 'Named human escalation on every automated decision',
  statement: 'Every automated decision in the product carries a named human escalation route with a four-hour response commitment.',
  category: 'capability',
  evidence: 'Product documentation v3, escalation chapter; ops rota.',
});
await claim(M, OSEI, {
  title: 'EEA-only processing',
  statement: 'All customer data is processed in EEA regions on named infrastructure with no third-country transfer in the default configuration.',
  category: 'security_cert_residency',
  evidence: 'Architecture document v4 section 2; hosting contract schedule B.',
});
await claim(M, OSEI, {
  title: 'Design-partner deployment at a CBI-authorised payments institution',
  statement: 'One CBI-authorised payments institution runs the product in production as a named design partner with written reference permission.',
  category: 'deployment_reference',
  evidence: 'Signed reference permission letter, February 2026.',
});
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
await claim(M, OSEI, {
  title: 'Review throughput figure',
  statement: 'Median compliance review pack preparation time of 3.2 days across production tenants, measured January to March 2026.',
  category: 'figure',
  evidence: 'Internal measurement note 2026-Q1.',
  review_date: yesterday, // ages out: the check pass marks it stale
});
await claim(A, VARGA, {
  title: 'SOC 2 Type II',
  statement: 'SOC 2 Type II report issued March 2026 covering the production platform.',
  category: 'security_cert_residency',
  evidence: 'Report on file with auditors.',
}, /* approve */ false); // left in review: shows in the queue

console.log('— deploy: Meridian at the new release, Apex at 1.1.0 (upgrade fodder) —');
const mDeploy = await call('POST', `/api/tenants/${M}/deploy`, BRENNAN, { release: green.version });
const aDeploy = await call('POST', `/api/tenants/${A}/deploy`, BRENNAN, { release: '1.1.0' });

console.log('— live-deal gaps through the real ingestion path —');
const gap = (key: string, body: any) => call('POST', '/api/gaps', null, body, { 'x-deploy-key': key });
const g1 = await gap(mDeploy.deploy_key, {
  gap_kind: 'uncovered_objection',
  abstention_text: 'Prospect counsel asked for our position under the California DFPI complaint-handling expectations; the corpus holds no covering objection.',
  jurisdiction: 'US-CA',
  prospect_context: { firm_type: 'lender', ai_touchpoint: 'complaints' },
  deal_cost_gbp: 40,
});
const g2 = await gap(mDeploy.deploy_key, {
  gap_kind: 'uncovered_objection',
  abstention_text: 'Same DFPI complaint-handling question raised by a second prospect.',
  jurisdiction: 'US-CA',
  prospect_context: { firm_type: 'lender' },
  deal_cost_gbp: 25,
});
await gap(aDeploy.deploy_key, {
  gap_kind: 'missing_jurisdiction',
  abstention_text: 'Colorado AI Act exposure raised on a multi-state lender; no US-CO layer exists.',
  prospect_context: { firm_type: 'lender', ai_touchpoint: 'credit' },
});
const g4 = await gap(aDeploy.deploy_key, {
  gap_kind: 'uncovered_regime',
  abstention_text: 'Prospect asked for a position under the EU Cyber Resilience Act product requirements; out of current regime scope.',
  jurisdiction: 'EU',
  prospect_context: { firm_type: 'payments_institution' },
});
const g5 = await gap(mDeploy.deploy_key, {
  gap_kind: 'uncovered_objection',
  abstention_text: 'UK buyer objected that Consumer Duty board reporting cannot absorb a vendor model without a defined outcomes pack.',
  jurisdiction: 'UK',
  prospect_context: { firm_type: 'bank', buyer_persona: 'CCO' },
  deal_cost_gbp: 55,
});
await call('PATCH', `/api/gaps/${g1.id}`, PARK, { triage_status: 'backlog', cost_estimated_gbp: 60 });
await call('PATCH', `/api/gaps/${g2.id}`, PARK, { triage_status: 'duplicate', linked_backlog_id: g1.id });
await call('PATCH', `/api/gaps/${g4.id}`, PARK, { triage_status: 'rejected', triage_reason: 'CRA is product law, out of the seam scope boundary; route to product counsel.' });
await call('PATCH', `/api/gaps/${g5.id}`, PARK, { triage_status: 'in_authoring', linked_rule_id: 'FCA-CD-003' });
// the Colorado gap stays untriaged: the rail badge has something to count

console.log('— audit pulls before any trigger (they feed the impact reports) —');
await call('POST', '/api/defensibility', BRENNAN, {
  artifact_ref: 'ART-2026-0608-MERIDIAN-01',
  release_version: green.version,
  artifact_text: 'Review-navigation checklist rested on [IE-AI-006], [AIA-TML-007] and [DORA-CON-003].',
  tenant_id: M,
  deal_closed: true, // the success billing line
});
await call('POST', '/api/defensibility', BRENNAN, {
  artifact_ref: 'ART-2026-0609-APEX-01',
  release_version: '1.1.0',
  artifact_text: 'Dallas lender qualification cited [US-AI-009] and [US-ECOA-004].',
  tenant_id: A,
});

console.log('— the full reactivation loop on IE-AI-006: trigger, re-author, publish —');
const watch = await call('GET', '/api/watch', HALE);
const ieItem = watch.items.find((w: any) => (w.rule_ids ?? []).includes('IE-AI-006'));
await call('POST', `/api/watch/${ieItem.id}/trigger`, HALE, {});
await call('POST', '/api/rules/IE-AI-006/versions', HALE, {});
const ieCur = await call('GET', '/api/rules/IE-AI-006', HALE);
const ieV = ieCur.versions.find((v: any) => v.review_state === 'draft');
await call('PUT', '/api/rules/IE-AI-006/draft', HALE, {
  jurisdiction_tags: ieV.jurisdiction_tags,
  title: ieV.title,
  statement: ieV.statement.replace('movement note attached', '').trim() + ' The designation list is confirmed and the National AI Office is operating.',
  buyer_reading: ieV.buyer_reading,
  authority_summary: ieV.authority_summary + '; designation list as confirmed at the August 2026 milestone.',
  applicability: ieV.applicability,
  inputs_required: ieV.inputs_required,
  change_note: 'Re-authored on confirmation of the designation list and National AI Office stand-up.',
  sources: [{ citation: 'Irish competent-authority designation list, confirmed August 2026', source_type: 'regulation' }],
});
await call('POST', '/api/rules/IE-AI-006/submit', HALE, {});
await call('POST', '/api/rules/IE-AI-006/approve', OKAFOR, {});
const reauth = await call('POST', '/api/releases', PARK, { bump: 'minor' }); // 1.4.0
const reauthGate = await call('POST', `/api/releases/${reauth.version}/gate`, PARK, {});
if (!reauthGate.passed) throw new Error('demo: expected the re-author release to gate green');
await call('POST', `/api/releases/${reauth.version}/publish`, BRENNAN, {});
console.log(`  published ${reauth.version} (reauthored: ${reauth.changelog.reauthored.join(', ')}) — SLA closed, retainer emitted`);

console.log('— upgrade Apex (delivers added coverage: the scoped line) — Meridian left upgrade-ready —');
await call('POST', `/api/tenants/${A}/upgrade`, BRENNAN, {});

console.log('— a second movement, mid-loop: US-AI-009 triggered and not yet re-authored —');
const watch2 = await call('GET', '/api/watch', HALE);
const usItem = watch2.items.find((w: any) => (w.rule_ids ?? []).includes('US-AI-009'));
await call('POST', `/api/watch/${usItem.id}/trigger`, HALE, {});

console.log('— an overdue re-verify and the aging-claim sweep —');
const aiaItem = watch2.items.find((w: any) => (w.rule_ids ?? []).includes('AIA-TML-007'));
await pool.query(`UPDATE shared.watch_item SET reverify_date = current_date - 1 WHERE id = $1`, [aiaItem.id]);
const check = await call('POST', '/api/watch/check', PARK, {});
console.log(`  check pass: ${check.overdue.length} overdue, ${check.stale_claims} claim(s) staled`);

console.log('— critic findings + one dismissal with a reason —');
const critic = await call('POST', '/api/assist/critic', PARK, {});
const dismissable = critic.findings.find((f: any) => f.kind === 'layer_asymmetry');
if (dismissable) {
  await call('POST', `/api/assist/findings/${dismissable.finding_id}/dismiss`, PARK, {
    reason: 'Known thin layer; scoped into the Meridian IE deepening engagement for Q3.',
  });
}

console.log('— one rule left in review, so the queue is never empty —');
await call('POST', '/api/rules', HALE, {
  kind: 'regulatory',
  rule_id: 'MICA-STB-004',
  regime: 'MiCA',
  title: 'Reserve attestation cadence reaches vendor diligence',
  jurisdiction_tags: ['EU'],
  statement:
    'CASPs handling asset-referenced tokens face reserve attestation obligations on a defined cadence, and vendor systems touching reserve reporting inherit evidence demands at diligence.',
  buyer_reading: 'A CASP buyer will ask how the vendor supports the attestation evidence trail before procurement engages.',
  authority_summary: 'Regulation (EU) 2023/1114 (MiCA), reserve of assets provisions.',
  applicability: 'Prospect is a CASP touching asset-referenced token reserves and the AI touchpoint reaches reporting.',
  inputs_required: ['firm_type', 'ai_touchpoint'],
  sources: [{ citation: 'Regulation (EU) 2023/1114, Title III', source_type: 'regulation' }],
});
await call('POST', '/api/rules/MICA-STB-004/submit', HALE, {});

const summary = {
  releases: ['1.1.0 published (seed)', `${red.version} eval_failed (the shipped defect)`, `${green.version} published`, `${reauth.version} published (re-author)`],
  tenants: { 'Meridian Pay': `pinned ${green.version}, upgrade ready, 1 stale rule, 4 claims (1 stale)`, 'Apex Lending': `upgraded to ${reauth.version}, claim in review`, 'Volta Insure': 'provisioned, not deployed' },
  deploy_keys: { meridian: mDeploy.deploy_key, apex_superseded: aDeploy.deploy_key },
  in_review: ['MICA-STB-004 (rule)', 'Apex CLM-101 (claim)'],
  watch: { 'IE-AI-006': 'resolved (full loop)', 'US-AI-009': 'reauthoring (mid-loop, task open)', 'AIA-TML-007': 'overdue re-verify' },
};
console.log('\nDemo data in place:\n' + JSON.stringify(summary, null, 2));
console.log('\nNote: the Meridian deploy key above still ingests gaps (POST /api/gaps with X-Deploy-Key).');
await app.close();
await pool.end();
