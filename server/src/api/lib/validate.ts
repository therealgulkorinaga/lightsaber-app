// Component A validation: the schema is law (FR-A.1 .. FR-A.6).
// Everything here returns a list of findings; submission is blocked while any
// finding with level 'block' stands (lint findings clear via recorded overrides).

import { lintText } from '@lightsaber/voice-lint';
import type pg from 'pg';

export const PROSPECT_FIELDS = [
  'firm_type',
  'jurisdiction',
  'regulator',
  'buyer_persona',
  'service_sold',
  'ai_touchpoint',
  'data_classes',
  'deployment_model',
  'deal_state',
  'firm',
];

// ID conventions (FR-A.2). Regulatory IDs are REGIME-TOPIC-NNN with layered
// variants (XRG-001, UK-CTP-001, NYC-AEDT-003); the generic shape holds.
const ID_PATTERNS: Record<string, RegExp> = {
  regulatory: /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/,
  icp: /^ICP-(?:DQ-)?\d{3}$/,
  objection: /^OBJ-\d{3}$/,
  messaging: /^MSG-\d{3}$/,
  claim: /^CLM-\d{3}$/,
};

export interface Finding {
  level: 'block' | 'warn';
  code: string;
  field: string | null;
  message: string;
}

export interface DraftInput {
  rule_id: string;
  kind: 'regulatory' | 'icp' | 'objection' | 'messaging';
  regime?: string | null;
  title?: string;
  statement?: string | null;
  buyer_reading?: string | null;
  authority_summary?: string | null;
  applicability?: string | null;
  inputs_required?: string[];
  jurisdiction_tags?: string[];
  kind_fields?: Record<string, any>;
  movement_note?: string | null;
  sources?: { citation: string; source_type: string; url?: string; retrieved_at?: string }[];
}

// Free-text fields linted per kind (FR-A.5).
export function lintableFields(d: DraftInput): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: unknown) => {
    if (typeof v === 'string' && v) out[k] = v;
  };
  add('title', d.title);
  add('statement', d.statement);
  add('buyer_reading', d.buyer_reading);
  add('authority_summary', d.authority_summary);
  add('applicability', d.applicability);
  add('movement_note', d.movement_note);
  const kf = d.kind_fields ?? {};
  add('substance', kf.substance);
  add('gap_text', kf.gap_text);
  add('test_raw', kf.test_raw);
  add('rationale_raw', kf.rationale_raw);
  add('anchors_raw', kf.anchors_raw);
  add('why_raw', kf.why_raw);
  return out;
}

export async function validateDraft(
  client: pg.PoolClient | pg.Pool,
  d: DraftInput,
  opts: { isNewRule: boolean; overrides?: { field: string; word: string }[]; armedWatch?: boolean } = {
    isNewRule: true,
  },
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const overrides = new Set((opts.overrides ?? []).map((o) => `${o.field}:${o.word}`));

  // FR-A.2: ID convention + uniqueness including retired IDs.
  const pattern = ID_PATTERNS[d.kind];
  if (!pattern.test(d.rule_id)) {
    findings.push({
      level: 'block',
      code: 'id_convention',
      field: 'rule_id',
      message: `${d.rule_id} does not match the ${d.kind} ID convention`,
    });
  }
  if (opts.isNewRule) {
    const { rows } = await client.query(`SELECT rule_id, status FROM shared.rule WHERE rule_id = $1`, [
      d.rule_id,
    ]);
    if (rows.length) {
      findings.push({
        level: 'block',
        code: 'id_taken',
        field: 'rule_id',
        message: `${d.rule_id} already exists (status: ${rows[0].status}); IDs are never reused, retired included`,
      });
    }
  }

  // FR-A.1: required fields per kind.
  const require = (field: string, value: unknown, label: string) => {
    if (value == null || (typeof value === 'string' && !value.trim())) {
      findings.push({ level: 'block', code: 'required', field, message: `${label} is required for ${d.kind} rules` });
    }
  };
  require('title', d.title, 'Title');
  if (d.kind === 'regulatory') {
    require('statement', d.statement, 'Statement');
    require('buyer_reading', d.buyer_reading, 'Buyer reading');
    require('applicability', d.applicability, 'Applicability');
    require('regime', d.regime, 'Regime');
    if (!d.jurisdiction_tags?.length) {
      findings.push({ level: 'block', code: 'required', field: 'jurisdiction_tags', message: 'A regulatory rule carries at least one jurisdiction tag' });
    }
    if (!d.inputs_required?.length) {
      findings.push({ level: 'block', code: 'required', field: 'inputs_required', message: 'Inputs required drive the coverage gate and cannot be empty' });
    }
  }
  if (d.kind === 'objection') {
    require('substance', d.kind_fields?.substance, 'Substance');
    if (!d.kind_fields?.rests_on_ids?.length) {
      findings.push({ level: 'block', code: 'required', field: 'rests_on_ids', message: 'An objection rests on at least one regulatory rule' });
    }
  }
  if (d.kind === 'messaging') require('substance', d.kind_fields?.substance, 'Substance');
  if (d.kind === 'icp') {
    if (d.kind_fields?.is_disqualifier) {
      require('test_raw', d.kind_fields?.test_raw, 'Test');
      require('rationale_raw', d.kind_fields?.rationale_raw, 'Rationale');
    } else {
      require('anchors_raw', d.kind_fields?.anchors_raw, 'Anchors');
      require('why_raw', d.kind_fields?.why_raw, 'Why');
      if (d.kind_fields?.weight == null) {
        findings.push({ level: 'block', code: 'required', field: 'weight', message: 'An ICP signal carries a weight' });
      }
    }
  }

  // FR-A.3: jurisdiction tags resolve to known nodes.
  const tagRoot = new Map<string, string>();
  if (d.jurisdiction_tags?.length) {
    const { rows } = await client.query(
      `WITH RECURSIVE up AS (
         SELECT tag, parent_tag, tag AS leaf FROM shared.jurisdiction WHERE tag = ANY($1)
         UNION ALL
         SELECT j.tag, j.parent_tag, up.leaf FROM shared.jurisdiction j JOIN up ON j.tag = up.parent_tag
       )
       SELECT leaf, tag AS root FROM up WHERE parent_tag IS NULL`,
      [d.jurisdiction_tags],
    );
    for (const r of rows) tagRoot.set(r.leaf, r.root);
    for (const t of d.jurisdiction_tags) {
      if (!tagRoot.has(t)) {
        findings.push({ level: 'block', code: 'unknown_tag', field: 'jurisdiction_tags', message: `${t} is not in the jurisdiction registry` });
      }
    }
  }

  // A regime has a jurisdictional footprint; every tag must layer under it.
  // FCA cannot fire for an EU-only prospect, DORA cannot fire in Texas.
  if (d.kind === 'regulatory' && d.regime && d.jurisdiction_tags?.length) {
    const { rows } = await client.query(`SELECT jurisdictions FROM shared.regime WHERE code = $1`, [d.regime]);
    const footprint: string[] = rows[0]?.jurisdictions ?? [];
    if (footprint.length) {
      for (const t of d.jurisdiction_tags) {
        const root = tagRoot.get(t);
        if (root && !footprint.includes(root)) {
          findings.push({
            level: 'block',
            code: 'regime_scope',
            field: 'jurisdiction_tags',
            message: `${t} lies outside ${d.regime}'s footprint (${footprint.join(', ')}); use a layered regime such as cross_regime, or correct the tag`,
          });
        }
      }
    }
  }

  // FR-A.4: inputs-required name real prospect fields.
  for (const f of d.inputs_required ?? []) {
    if (!PROSPECT_FIELDS.includes(f)) {
      findings.push({ level: 'block', code: 'unknown_input', field: 'inputs_required', message: `${f} is not a prospect-object field` });
    }
  }

  // FR-A.6: regulatory (and claim) rules carry at least one authority source.
  if (d.kind === 'regulatory') {
    if (!d.authority_summary?.trim()) {
      findings.push({ level: 'block', code: 'authority_missing', field: 'authority_summary', message: 'Every regulatory rule carries an authority; the grounding guarantee rests on it' });
    }
    if (!d.sources?.length) {
      findings.push({ level: 'block', code: 'source_missing', field: 'sources', message: 'A regulatory rule with no authority source cannot be submitted (FR-A.6)' });
    }
  }

  // FR-A.5: voice lint, overridable per finding with a recorded reason.
  for (const [field, text] of Object.entries(lintableFields(d))) {
    for (const hit of lintText(text)) {
      const key = `${field}:${hit.type === 'em_dash' ? 'em_dash' : hit.word}`;
      if (overrides.has(key)) continue;
      findings.push({
        level: 'block',
        code: hit.type,
        field,
        message: hit.type === 'em_dash' ? `Em dash in ${field}; the seam voice allows none` : `Kill-list word "${hit.word}" in ${field}`,
      });
    }
  }

  // FR-A.9: a movement note arms a watch item and needs its trigger. An
  // already-armed watch item for the rule satisfies this (the config is
  // consumed at save time; the armed item is the durable record).
  if (d.movement_note && d.kind_fields?.watch) {
    const w = d.kind_fields.watch;
    if (w.trigger_type === 'date' ? !w.trigger_date : !w.event_description) {
      findings.push({ level: 'block', code: 'watch_trigger', field: 'movement_note', message: 'A movement note requires a trigger (date or named event)' });
    }
  } else if (d.movement_note && !opts.armedWatch) {
    findings.push({ level: 'block', code: 'watch_missing', field: 'movement_note', message: 'A movement note must arm a watch item: supply trigger and re-verify action (FR-A.9)' });
  }

  return findings;
}
