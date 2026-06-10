// The evaluation and release gate (PRD §6). Five checks, all blocking.
// The eval runner is pluggable: the static runner verifies everything
// deterministically derivable from the corpus itself (citation integrity of
// eval expectations, statuses, jurisdictions); the claude runner (EVAL_RUNNER=
// claude) executes each case against the candidate bundle and judges the
// behavioural assertions. A red run blocks publish at the database (FR-9.3).

import type pg from 'pg';
import { lintText } from '@lightsaber/voice-lint';
import { RULE_ID_SCAN_RE } from '../seam/parse.ts';

export interface CheckResult {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
  cases?: { id: string; title: string; passed: boolean; detail?: string }[];
}

export interface GateResult {
  passed: boolean;
  checks: CheckResult[];
}

interface CandidateRule {
  rule_id: string;
  kind: string;
  status_at_version: string;
  jurisdiction_tags: string[];
  fields: Record<string, string>; // lintable / scannable text fields
  rests_on_ids: string[];
  lint_overrides: Set<string>; // `${field}:${word}`
}

async function loadCandidate(client: pg.PoolClient | pg.Pool, version: string) {
  const { rows } = await client.query(
    `SELECT r.rule_id, r.kind, v.id AS version_id, v.status_at_version, v.jurisdiction_tags,
            v.title, v.statement, v.buyer_reading, v.authority_summary, v.applicability,
            v.movement_note, v.kind_fields
       FROM shared.release_rule_version p
       JOIN shared.rule_version v ON v.id = p.rule_version_id
       JOIN shared.rule r ON r.rule_id = v.rule_id
      WHERE p.release_version = $1`,
    [version],
  );
  if (!rows.length) throw new Error(`Candidate ${version} pins no rule versions; assemble it first`);

  const { rows: overrides } = await client.query(
    `SELECT o.rule_version_id, o.field, o.word FROM shared.lint_override o
      WHERE o.rule_version_id = ANY($1)`,
    [rows.map((r) => r.version_id)],
  );
  const overridesByVersion = new Map<string, Set<string>>();
  for (const o of overrides) {
    if (!overridesByVersion.has(o.rule_version_id)) overridesByVersion.set(o.rule_version_id, new Set());
    overridesByVersion.get(o.rule_version_id)!.add(`${o.field}:${o.word}`);
  }

  const rules = new Map<string, CandidateRule>();
  for (const r of rows) {
    const kf = r.kind_fields ?? {};
    const fields: Record<string, string> = {};
    const add = (k: string, v: unknown) => {
      if (typeof v === 'string' && v) fields[k] = v;
    };
    add('title', r.title);
    add('statement', r.statement);
    add('buyer_reading', r.buyer_reading);
    add('authority_summary', r.authority_summary);
    add('applicability', r.applicability);
    add('movement_note', r.movement_note);
    add('substance', kf.substance);
    add('gap_text', kf.gap_text);
    add('test_raw', kf.test_raw);
    add('rationale_raw', kf.rationale_raw);
    add('anchors_raw', kf.anchors_raw);
    add('why_raw', kf.why_raw);
    rules.set(r.rule_id, {
      rule_id: r.rule_id,
      kind: r.kind,
      status_at_version: r.status_at_version,
      jurisdiction_tags: r.jurisdiction_tags ?? [],
      fields,
      rests_on_ids: kf.rests_on_ids ?? [],
      lint_overrides: overridesByVersion.get(r.version_id) ?? new Set(),
    });
  }
  return rules;
}

async function loadEvalCases(client: pg.PoolClient | pg.Pool, version: string) {
  const { rows } = await client.query(
    `SELECT eval_case_id, snapshot FROM shared.release_eval_case WHERE release_version = $1 ORDER BY eval_case_id`,
    [version],
  );
  if (!rows.length) throw new Error(`Candidate ${version} pins no eval cases`);
  return rows.map((r) => r.snapshot);
}

function scanIds(text: string): string[] {
  return [...new Set([...text.matchAll(RULE_ID_SCAN_RE)].map((m) => m[0]))];
}

/** A referenced ID must exist in the candidate, not be retired, and a stale
 * target must be staleness-acknowledged by the referencing text (FR-E.3). */
function refProblem(rules: Map<string, CandidateRule>, id: string, context: string): string | null {
  const target = rules.get(id);
  if (!target) return `${id} is not in the candidate (missing or retired)`;
  if (target.status_at_version === 'retired') return `${id} is retired and never citable`;
  if (target.status_at_version === 'stale' && !/stal/i.test(context)) {
    return `${id} is stale and the reference carries no staleness warning`;
  }
  return null;
}

// ── check 1: the eval suite ────────────────────────────────────
async function checkEvalSuite(
  rules: Map<string, CandidateRule>,
  evalCases: any[],
): Promise<CheckResult> {
  const cases: NonNullable<CheckResult['cases']> = [];
  for (const c of evalCases) {
    const failures: string[] = [];
    const scanContext = (text: string) => {
      for (const id of scanIds(text)) {
        const problem = refProblem(rules, id, text);
        if (problem) failures.push(problem);
      }
    };
    scanContext(c.expected_output);
    for (const a of c.assertions ?? []) scanContext(`${a.name} ${a.check}`);
    cases.push({
      id: `eval-${c.id}`,
      title: c.prompt.slice(0, 80),
      passed: failures.length === 0,
      detail: failures.join('; ') || 'all referenced rules resolve in the candidate',
    });
  }
  const failed = cases.filter((c) => !c.passed);
  return {
    id: 'eval',
    title: 'Eval suite',
    passed: failed.length === 0,
    detail: failed.length
      ? `${failed.length} of ${cases.length} cases fail`
      : `${cases.length} cases pass (static runner: referenced-rule resolution; set EVAL_RUNNER=claude for behavioural assertions)`,
    cases,
  };
}

// ── check 2: citation integrity (FR-E.3) ───────────────────────
function checkCitationIntegrity(rules: Map<string, CandidateRule>): CheckResult {
  const failures: string[] = [];
  for (const r of rules.values()) {
    for (const id of r.rests_on_ids) {
      if (id === r.rule_id) continue;
      const problem = refProblem(rules, id, r.fields.substance ?? '');
      if (problem) failures.push(`${r.rule_id} rests on ${problem}`);
    }
    for (const [field, text] of Object.entries(r.fields)) {
      for (const id of scanIds(text)) {
        if (id === r.rule_id) continue;
        const problem = refProblem(rules, id, text);
        if (problem) failures.push(`${r.rule_id}.${field} references ${problem}`);
      }
    }
  }
  return {
    id: 'citation',
    title: 'Citation integrity',
    passed: failures.length === 0,
    detail: failures.length ? failures.join('; ') : 'every cross-reference resolves to an active or staleness-warned rule',
  };
}

// ── check 3: grounding (FR-E.4) ────────────────────────────────
async function checkGrounding(
  client: pg.PoolClient | pg.Pool,
  version: string,
  rules: Map<string, CandidateRule>,
): Promise<CheckResult> {
  const failures: string[] = [];

  // The tenant claims template ships empty: any active CLM rule in the shared
  // template would let the engine assert traction nothing approved (the
  // premise of the traction-abstention evals).
  const { rows: docs } = await client.query(
    `SELECT blocks FROM shared.release_document WHERE release_version = $1 AND file_path = 'seam/_tenant/_template/approved-claims.md'`,
    [version],
  );
  if (docs.length) {
    const text = (docs[0].blocks.blocks as any[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const uncommented = text.replace(/<!--[\s\S]*?-->/g, '');
    if (/^### CLM-/m.test(uncommented)) {
      failures.push('the shared claims template carries an active claim; templates ship empty');
    }
  }

  // Every jurisdiction tag on a candidate rule resolves in the registry,
  // so the engine's layered resolution cannot dangle.
  const { rows: registry } = await client.query(`SELECT tag FROM shared.jurisdiction`);
  const known = new Set(registry.map((r) => r.tag));
  for (const r of rules.values()) {
    for (const t of r.jurisdiction_tags) {
      if (!known.has(t)) failures.push(`${r.rule_id} carries unknown jurisdiction tag ${t}`);
    }
  }

  return {
    id: 'grounding',
    title: 'Grounding',
    passed: failures.length === 0,
    detail: failures.length
      ? failures.join('; ')
      : 'claims template empty; all jurisdiction tags resolve (full behavioural grounding under EVAL_RUNNER=claude)',
  };
}

// ── check 4: voice lint (FR-E.5) ───────────────────────────────
function checkVoiceLint(rules: Map<string, CandidateRule>): CheckResult {
  const failures: string[] = [];
  for (const r of rules.values()) {
    for (const [field, text] of Object.entries(r.fields)) {
      for (const hit of lintText(text)) {
        const key = `${field}:${hit.type === 'em_dash' ? 'em_dash' : hit.word}`;
        if (r.lint_overrides.has(key)) continue;
        failures.push(
          hit.type === 'em_dash'
            ? `${r.rule_id}.${field}: em dash`
            : `${r.rule_id}.${field}: kill-list word "${hit.word}"`,
        );
      }
    }
  }
  return {
    id: 'voice',
    title: 'Voice lint',
    passed: failures.length === 0,
    detail: failures.length ? failures.join('; ') : 'no em dashes, no kill-list words outside recorded overrides',
  };
}

// ── check 5: coverage-paired evals (FR-E.6) ────────────────────
async function checkCoveragePairing(
  client: pg.PoolClient | pg.Pool,
  version: string,
  baseVersion: string | null,
  rules: Map<string, CandidateRule>,
  evalCases: any[],
): Promise<CheckResult> {
  const candidateJurisdictions = new Set<string>();
  for (const r of rules.values()) for (const t of r.jurisdiction_tags) candidateJurisdictions.add(t);

  // Jurisdictions exercised by the eval suite: tags of every rule an eval references.
  const exercised = new Set<string>();
  for (const c of evalCases) {
    const text = `${c.prompt} ${c.expected_output} ${(c.assertions ?? []).map((a: any) => a.check).join(' ')}`;
    for (const id of scanIds(text)) {
      const r = rules.get(id);
      if (r) for (const t of r.jurisdiction_tags) exercised.add(t);
    }
    for (const t of c.jurisdiction_scope ?? []) exercised.add(t);
  }

  // New layers (vs the base release) must be exercised; existing coverage is
  // grandfathered with a named backlog [A].
  let baseJurisdictions = new Set<string>();
  if (baseVersion) {
    const { rows } = await client.query(
      `SELECT DISTINCT unnest(v.jurisdiction_tags) AS tag
         FROM shared.release_rule_version p JOIN shared.rule_version v ON v.id = p.rule_version_id
        WHERE p.release_version = $1`,
      [baseVersion],
    );
    baseJurisdictions = new Set(rows.map((r) => r.tag));
  }

  const newLayers = [...candidateJurisdictions].filter((t) => !baseJurisdictions.has(t));
  const unpairedNew = newLayers.filter((t) => !exercised.has(t));
  const grandfathered = [...candidateJurisdictions].filter(
    (t) => baseJurisdictions.has(t) && !exercised.has(t),
  );

  return {
    id: 'coverage',
    title: 'Coverage-paired evals',
    passed: unpairedNew.length === 0,
    detail: unpairedNew.length
      ? `new jurisdiction layer(s) with no eval exercising them: ${unpairedNew.join(', ')}`
      : grandfathered.length
        ? `new layers paired; grandfathered backlog (pre-existing, no eval): ${grandfathered.join(', ')}`
        : 'every jurisdiction layer is exercised by the eval suite',
  };
}

export async function runGate(
  client: pg.PoolClient | pg.Pool,
  version: string,
  baseVersion: string | null,
): Promise<GateResult> {
  const rules = await loadCandidate(client, version);
  const evalCases = await loadEvalCases(client, version);

  const checks: CheckResult[] = [
    await checkEvalSuite(rules, evalCases),
    checkCitationIntegrity(rules),
    await checkGrounding(client, version, rules),
    checkVoiceLint(rules),
    await checkCoveragePairing(client, version, baseVersion, rules, evalCases),
  ];
  return { passed: checks.every((c) => c.passed), checks };
}
