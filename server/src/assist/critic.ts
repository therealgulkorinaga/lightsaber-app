// The deterministic half of the consistency and coverage critic (FR-AI.2).
// Flags only; reproducible run over run; no model required.

import type pg from 'pg';
import { RULE_ID_SCAN_RE } from '../seam/parse.ts';

export interface CriticFinding {
  kind: string;
  rule_ids: string[];
  detail: Record<string, unknown>;
}

export async function deterministicCritic(client: pg.PoolClient | pg.Pool): Promise<CriticFinding[]> {
  const findings: CriticFinding[] = [];

  const { rows: rules } = await client.query(
    `SELECT r.rule_id, r.kind, r.regime, r.status, v.statement, v.buyer_reading, v.authority_summary,
            v.applicability, v.movement_note, v.kind_fields, v.jurisdiction_tags
       FROM shared.rule r JOIN shared.rule_version v ON v.id = r.current_version_id
      WHERE r.status <> 'retired'`,
  );
  const byId = new Map(rules.map((r) => [r.rule_id, r]));

  // 1. Orphaned cross-references, corpus-wide.
  for (const r of rules) {
    const texts = [
      r.statement, r.buyer_reading, r.authority_summary, r.applicability, r.movement_note,
      r.kind_fields?.substance, r.kind_fields?.gap_text, r.kind_fields?.why_raw,
      ...(r.kind_fields?.rests_on_ids ?? []).map((id: string) => `[${id}]`),
    ].filter(Boolean);
    for (const text of texts) {
      for (const m of String(text).matchAll(RULE_ID_SCAN_RE)) {
        const target = m[0];
        if (target === r.rule_id) continue;
        const t = byId.get(target);
        if (!t) {
          findings.push({ kind: 'orphaned_reference', rule_ids: [r.rule_id, target], detail: { note: `${r.rule_id} references ${target}, which does not exist or is retired` } });
        }
      }
    }
  }

  // 2. Jurisdiction layer asymmetry: a local layer (IE, US-NY, ...) exists for
  // some regimes; parallel regimes with parent-level coverage lack it.
  const { rows: jurs } = await client.query(`SELECT tag, parent_tag FROM shared.jurisdiction WHERE parent_tag IS NOT NULL`);
  const { rows: regimes } = await client.query(`SELECT code, jurisdictions FROM shared.regime`);
  const rootOf = (tag: string): string => {
    let cur = tag;
    for (;;) {
      const j = jurs.find((x) => x.tag === cur);
      if (!j) return cur;
      cur = j.parent_tag;
    }
  };
  for (const j of jurs) {
    const localRules = rules.filter((r) => r.kind === 'regulatory' && (r.jurisdiction_tags ?? []).includes(j.tag));
    if (!localRules.length) continue; // the layer has never been authored; not an asymmetry
    const coveredRegimes = new Set(localRules.map((r) => r.regime));
    const root = rootOf(j.tag);
    for (const reg of regimes) {
      if (!reg.jurisdictions?.includes(root)) continue;
      if (coveredRegimes.has(reg.code)) continue;
      const parentDepth = rules.filter(
        (r) => r.kind === 'regulatory' && r.regime === reg.code && (r.jurisdiction_tags ?? []).some((t: string) => rootOf(t) === root),
      ).length;
      if (parentDepth > 0) {
        findings.push({
          kind: 'layer_asymmetry',
          rule_ids: [],
          detail: {
            jurisdiction: j.tag,
            regime: reg.code,
            note: `${j.tag} layers exist for ${[...coveredRegimes].sort().join(', ')} but not for ${reg.code}, which carries ${parentDepth} parent-layer rules`,
          },
        });
      }
    }
  }

  // 3. Two-assertable-units heuristic: long statements stacking obligations.
  for (const r of rules) {
    if (r.kind !== 'regulatory' || !r.statement) continue;
    const sentences = String(r.statement).split(/(?<=\.)\s+/);
    const obligated = sentences.filter((s) => /\b(must|shall|required to|carries? .* dut)/i.test(s));
    if (obligated.length >= 3 && String(r.statement).length > 450) {
      findings.push({
        kind: 'bundled_units_heuristic',
        rule_ids: [r.rule_id],
        detail: { note: `${obligated.length} obligation-bearing sentences in one Statement; candidate split (heuristic, judge it yourself)` },
      });
    }
  }

  return findings;
}
