// Canonical renderers: rule fields -> the exact markdown block the bundle
// carries. Shared by the seed (which asserts parse->render is byte-identical
// to the source), the exporter (FR-E.9) and content hashing (FR-B.4).

import { createHash } from 'node:crypto';

export type RuleKind = 'regulatory' | 'icp' | 'objection' | 'messaging';

export interface RuleRender {
  rule_id: string;
  kind: RuleKind;
  regime: string | null;
  scope: string;
  title: string;
  semver_at_author: string;       // '1.0'
  version_annotation: string;     // '' or ' (added in seam 1.1.0)' etc.
  status_at_version: string;      // active | stale | retired
  jurisdiction_tags: string[];    // ordered
  statement: string | null;
  buyer_reading: string | null;
  authority_summary: string | null;
  applicability: string | null;
  movement_note: string | null;
  kind_fields: Record<string, any>;
}

export function renderRuleBlock(r: RuleRender): string {
  switch (r.kind) {
    case 'regulatory':
      return renderRegulatory(r);
    case 'icp':
      return renderIcp(r);
    case 'objection':
      return renderObjection(r);
    case 'messaging':
      return renderMessaging(r);
  }
}

function renderRegulatory(r: RuleRender): string {
  const move = r.kind_fields.movement_flag ? ' | movement note attached' : '';
  const lines = [
    `### ${r.rule_id} ${r.title}`,
    `kind: regulatory | jurisdiction: ${r.jurisdiction_tags.join(', ')} | regime: ${r.regime} | ` +
      `scope: ${r.scope} | status: ${r.status_at_version} | v${r.semver_at_author}${r.version_annotation}${move}`,
    `- **Statement:** ${r.statement}`,
    `- **Buyer reading:** ${r.buyer_reading}`,
    `- **Authority:** ${r.authority_summary}`,
    `- **Applicability:** ${r.applicability}`,
    `- **Inputs required:** ${r.kind_fields.inputs_raw}`,
  ];
  if (r.movement_note != null) lines.push(`- **Movement note:** ${r.movement_note}`);
  return lines.join('\n');
}

function renderIcp(r: RuleRender): string {
  const kf = r.kind_fields;
  const lines = [
    `### ${r.rule_id} ${r.title}`,
    `weight: ${kf.weight_raw} | status: ${r.status_at_version} | v${r.semver_at_author}${r.version_annotation}`,
  ];
  if (kf.is_disqualifier) {
    lines.push(`- **Test:** ${kf.test_raw}`);
    lines.push(`- **Rationale:** ${kf.rationale_raw}`);
  } else {
    lines.push(`- ${kf.anchors_raw}`);
    lines.push(`- **${kf.why_label}:** ${kf.why_raw}`);
  }
  return lines.join('\n');
}

function renderObjection(r: RuleRender): string {
  const kf = r.kind_fields;
  const lines = [
    `### ${r.rule_id} ${r.title}`,
    `status: ${r.status_at_version} | v${r.semver_at_author}${r.version_annotation} | rests on: ${kf.rests_on_raw}`,
    `- **Substance:** ${kf.substance}`,
  ];
  if (kf.gap_label != null) lines.push(`- **${kf.gap_label}:** ${kf.gap_text}`);
  return lines.join('\n');
}

function renderMessaging(r: RuleRender): string {
  return [
    `### ${r.rule_id} ${r.title}`,
    `status: ${r.status_at_version} | v${r.semver_at_author}${r.version_annotation}`,
    `- **Substance:** ${r.kind_fields.substance}`,
  ].join('\n');
}

export function contentHash(r: RuleRender): string {
  return createHash('sha256').update(renderRuleBlock(r), 'utf8').digest('hex');
}

// ── file assembly ──────────────────────────────────────────────

export type Block =
  | { type: 'text'; text: string }
  | { type: 'rule'; rule_id: string; section: number | null }
  | { type: 'contents' };

export interface SectionMeta {
  heading: string | null;        // verbatim heading line
  contents_label: string | null; // label for the generated Contents index
}

/**
 * Render a whole seam file from its block list. `resolve` returns the render
 * fields for a rule_id (live current version, or the release-pinned version).
 * The Contents index is regenerated from section labels + rule order, which is
 * what keeps it true as rules are added (and byte-identical for 1.1.0).
 */
export function renderFile(
  blocks: Block[],
  sections: SectionMeta[],
  resolve: (ruleId: string) => RuleRender,
): string {
  let out = '';
  for (const b of blocks) {
    if (b.type === 'text') {
      out += b.text;
    } else if (b.type === 'rule') {
      out += renderRuleBlock(resolve(b.rule_id));
    } else {
      out += renderContents(blocks, sections);
    }
  }
  return out;
}

export function renderContents(blocks: Block[], sections: SectionMeta[]): string {
  const bySection = new Map<number, string[]>();
  for (const b of blocks) {
    if (b.type === 'rule' && b.section != null) {
      if (!bySection.has(b.section)) bySection.set(b.section, []);
      bySection.get(b.section)!.push(b.rule_id);
    }
  }
  const lines: string[] = [];
  sections.forEach((s, i) => {
    if (s.contents_label == null) return;
    const ids = bySection.get(i) ?? [];
    lines.push(`- ${s.contents_label}: ${ids.join(', ')}`);
  });
  return lines.join('\n');
}

/** Deterministic checksum over a bundle: sorted path -> content manifest (FR-9.6). */
export function bundleChecksum(files: Map<string, string>): string {
  const h = createHash('sha256');
  for (const p of [...files.keys()].sort()) {
    h.update(p, 'utf8');
    h.update('\0');
    h.update(files.get(p)!, 'utf8');
    h.update('\0');
  }
  return h.digest('hex');
}
