// Parses the shipped seam markdown into structured rules + ordered blocks.
// The contract: for every parsed rule, renderRuleBlock(fields) reproduces the
// source bytes exactly, and renderFile(blocks) reproduces the whole file.
// The seed asserts both before anything is written to the database.

import type { Block, RuleKind, RuleRender, SectionMeta } from './render.ts';
import { renderRuleBlock, renderFile } from './render.ts';

export interface ParsedFile {
  blocks: Block[];
  sections: SectionMeta[];
  rules: RuleRender[];
}

const RULE_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/;
// Rule IDs as they appear inside prose / rests-on text.
export const RULE_ID_SCAN_RE = /\b[A-Z][A-Z0-9]{1,8}(?:-[A-Z0-9]{1,6}){0,2}-\d{3}\b/g;

interface MetaParts {
  semver: string;
  annotation: string;
}

function parseVersionToken(tok: string): MetaParts {
  const m = tok.match(/^v(\d+\.\d+)(.*)$/);
  if (!m) throw new Error(`Unparseable version token: ${tok}`);
  return { semver: m[1], annotation: m[2] };
}

/** Strip parentheticals and trailing punctuation from an inputs list. */
export function parseInputNames(raw: string): string[] {
  return raw
    .replace(/\([^)]*\)/g, '')
    .split(',')
    .map((s) => s.trim().replace(/\.$/, '').trim())
    .filter(Boolean);
}

function takeRuleLines(lines: string[], start: number): number {
  // A rule block runs from its '### ' heading to the last consecutive non-blank line.
  let end = start;
  while (end < lines.length && lines[end].trim() !== '') end++;
  return end; // exclusive
}

function bulletFields(lines: string[], ruleId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^- \*\*([^*]+):\*\* (.*)$/s);
    if (!m) {
      // ICP signal anchors line: '- **0:** ... **1:** ... **2:** ...'
      if (line.startsWith('- **0:**')) {
        map.set('__anchors__', line.slice(2));
        continue;
      }
      throw new Error(`${ruleId}: unexpected body line: ${line}`);
    }
    if (m[1] === '0') {
      map.set('__anchors__', line.slice(2));
    } else {
      map.set(m[1], m[2]);
    }
  }
  return map;
}

function parseRegulatoryRule(block: string[]): RuleRender {
  const heading = block[0].match(/^### (\S+) (.*)$/);
  if (!heading) throw new Error(`Bad rule heading: ${block[0]}`);
  const [, rule_id, title] = heading;
  if (!RULE_ID_RE.test(rule_id)) throw new Error(`Bad rule id: ${rule_id}`);

  const meta = block[1].split(' | ');
  const get = (prefix: string) => {
    const part = meta.find((p) => p.startsWith(prefix));
    if (part === undefined) throw new Error(`${rule_id}: missing meta ${prefix}`);
    return part.slice(prefix.length);
  };
  const vTok = meta.find((p) => p.startsWith('v'));
  if (!vTok) throw new Error(`${rule_id}: missing version token`);
  const { semver, annotation } = parseVersionToken(vTok);
  const movement_flag = meta.includes('movement note attached');

  const fields = bulletFields(block.slice(2), rule_id);
  const req = (k: string) => {
    const v = fields.get(k);
    if (v === undefined) throw new Error(`${rule_id}: missing field ${k}`);
    return v;
  };

  const inputs_raw = req('Inputs required');
  return {
    rule_id,
    kind: 'regulatory',
    regime: get('regime: '),
    scope: get('scope: '),
    title,
    semver_at_author: semver,
    version_annotation: annotation,
    status_at_version: get('status: '),
    jurisdiction_tags: get('jurisdiction: ').split(', '),
    statement: req('Statement'),
    buyer_reading: req('Buyer reading'),
    authority_summary: req('Authority'),
    applicability: req('Applicability'),
    movement_note: fields.get('Movement note') ?? null,
    kind_fields: { inputs_raw, movement_flag },
  };
}

function parseIcpRule(block: string[]): RuleRender {
  const heading = block[0].match(/^### (\S+) (.*)$/);
  if (!heading) throw new Error(`Bad rule heading: ${block[0]}`);
  const [, rule_id, title] = heading;

  const meta = block[1].split(' | ');
  const weight_raw = meta[0].replace(/^weight: /, '');
  const status = meta[1].replace(/^status: /, '');
  const { semver, annotation } = parseVersionToken(meta[2]);
  const is_disqualifier = rule_id.startsWith('ICP-DQ-');

  const fields = bulletFields(block.slice(2), rule_id);
  const kind_fields: Record<string, any> = { weight_raw, is_disqualifier };
  let inputs_required: string[] = [];

  if (is_disqualifier) {
    kind_fields.test_raw = fields.get('Test');
    kind_fields.rationale_raw = fields.get('Rationale');
  } else {
    kind_fields.anchors_raw = fields.get('__anchors__');
    const whyKey = fields.has('Why weighted high') ? 'Why weighted high' : 'Why it matters';
    kind_fields.why_label = whyKey;
    kind_fields.why_raw = fields.get(whyKey);
    const inputsMatch = (kind_fields.why_raw as string).match(/Inputs: (.*)$/);
    if (inputsMatch) inputs_required = parseInputNames(inputsMatch[1]);
    kind_fields.weight = weight_raw === 'n/a' ? null : Number(weight_raw);
  }

  return {
    rule_id,
    kind: 'icp',
    regime: null,
    scope: 'shared',
    title,
    semver_at_author: semver,
    version_annotation: annotation,
    status_at_version: status,
    jurisdiction_tags: [],
    statement: null,
    buyer_reading: null,
    authority_summary: null,
    applicability: null,
    movement_note: null,
    kind_fields: { ...kind_fields, inputs_required },
  };
}

function parseObjectionRule(block: string[]): RuleRender {
  const heading = block[0].match(/^### (\S+) (.*)$/);
  if (!heading) throw new Error(`Bad rule heading: ${block[0]}`);
  const [, rule_id, title] = heading;

  const metaMatch = block[1].match(/^status: ([^|]+) \| (v\S+) \| rests on: (.*)$/);
  if (!metaMatch) throw new Error(`${rule_id}: bad objection meta: ${block[1]}`);
  const status = metaMatch[1];
  const { semver, annotation } = parseVersionToken(metaMatch[2]);
  const rests_on_raw = metaMatch[3];
  const rests_on_ids = [...rests_on_raw.matchAll(RULE_ID_SCAN_RE)].map((m) => m[0]);

  const fields = bulletFields(block.slice(2), rule_id);
  const substance = fields.get('Substance');
  let gap_label: string | null = null;
  let gap_text: string | null = null;
  for (const label of ['Claims gap', 'Abstention required']) {
    if (fields.has(label)) {
      gap_label = label;
      gap_text = fields.get(label)!;
    }
  }

  return {
    rule_id,
    kind: 'objection',
    regime: null,
    scope: 'shared',
    title,
    semver_at_author: semver,
    version_annotation: annotation,
    status_at_version: status,
    jurisdiction_tags: [],
    statement: null,
    buyer_reading: null,
    authority_summary: null,
    applicability: null,
    movement_note: null,
    kind_fields: { rests_on_raw, rests_on_ids, substance, gap_label, gap_text },
  };
}

function parseMessagingRule(block: string[]): RuleRender {
  const heading = block[0].match(/^### (\S+) (.*)$/);
  if (!heading) throw new Error(`Bad rule heading: ${block[0]}`);
  const [, rule_id, title] = heading;
  const metaMatch = block[1].match(/^status: ([^|]+) \| (v\S+)$/);
  if (!metaMatch) throw new Error(`${rule_id}: bad messaging meta: ${block[1]}`);
  const { semver, annotation } = parseVersionToken(metaMatch[2]);
  const fields = bulletFields(block.slice(2), rule_id);

  return {
    rule_id,
    kind: 'messaging',
    regime: null,
    scope: 'shared',
    title,
    semver_at_author: semver,
    version_annotation: annotation,
    status_at_version: metaMatch[1],
    jurisdiction_tags: [],
    statement: null,
    buyer_reading: null,
    authority_summary: null,
    applicability: null,
    movement_note: null,
    kind_fields: { substance: fields.get('Substance') },
  };
}

const RULE_PARSERS: Record<RuleKind, (block: string[]) => RuleRender> = {
  regulatory: parseRegulatoryRule,
  icp: parseIcpRule,
  objection: parseObjectionRule,
  messaging: parseMessagingRule,
};

/**
 * Parse a rules-bearing seam file into blocks/sections/rules.
 * `kind` selects the per-rule grammar. `rulesSections` restricts rule parsing
 * to the named sections (icp file has editorial sections whose '###' content,
 * if any, must not be treated as rules); null means rules may appear anywhere.
 */
export function parseRulesFile(
  source: string,
  kind: RuleKind,
  opts: { hasContents?: boolean; ruleSections?: string[] | null } = {},
): ParsedFile {
  const { hasContents = false, ruleSections = null } = opts;
  const lines = source.split('\n');
  // Char offset of each line start, so text blocks are exact source slices.
  const lineStarts: number[] = new Array(lines.length);
  let off = 0;
  for (let n = 0; n < lines.length; n++) {
    lineStarts[n] = off;
    off += lines[n].length + 1; // '\n'
  }

  const blocks: Block[] = [];
  const sections: SectionMeta[] = [];
  const rules: RuleRender[] = [];
  const contentsLines: string[] = [];

  let currentSection: number | null = null;
  let inRuleSection = ruleSections == null;
  let inContentsRegion = false;
  let textStart = 0; // char offset where the pending text block began
  let i = 0;

  const flushTextUpTo = (charOffset: number) => {
    if (charOffset > textStart) {
      blocks.push({ type: 'text', text: source.slice(textStart, charOffset) });
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      inContentsRegion = hasContents && line === '## Contents';
      if (!inContentsRegion) {
        sections.push({ heading: line, contents_label: null });
        currentSection = sections.length - 1;
        if (ruleSections != null) {
          inRuleSection = ruleSections.includes(line.replace(/^## /, ''));
        }
      }
      i++;
      continue;
    }

    if (inContentsRegion && line.startsWith('- ')) {
      // The contiguous list under '## Contents' becomes the generated block.
      flushTextUpTo(lineStarts[i]);
      let end = i;
      while (end < lines.length && lines[end].startsWith('- ')) {
        contentsLines.push(lines[end]);
        end++;
      }
      blocks.push({ type: 'contents' });
      const blockLen = contentsLines.join('\n').length;
      textStart = lineStarts[i] + blockLen; // the '\n' after the list opens the next text block
      inContentsRegion = false;
      i = end;
      continue;
    }

    if (line.startsWith('### ') && inRuleSection) {
      const end = takeRuleLines(lines, i);
      const blockLines = lines.slice(i, end);
      flushTextUpTo(lineStarts[i]);
      const rule = RULE_PARSERS[kind](blockLines);

      // The fidelity contract, enforced at parse time.
      const rendered = renderRuleBlock(rule);
      const original = blockLines.join('\n');
      if (rendered !== original) {
        throw new Error(
          `Round-trip failure on ${rule.rule_id}:\n--- original ---\n${original}\n--- rendered ---\n${rendered}`,
        );
      }

      rules.push(rule);
      blocks.push({ type: 'rule', rule_id: rule.rule_id, section: currentSection });
      textStart = lineStarts[i] + original.length; // the '\n' after the rule opens the next text block
      i = end;
      continue;
    }

    i++;
  }
  flushTextUpTo(source.length);

  // Map contents lines to sections by their first rule ID.
  if (contentsLines.length) {
    const sectionOfRule = new Map<string, number>();
    for (const b of blocks) {
      if (b.type === 'rule' && b.section != null) sectionOfRule.set(b.rule_id, b.section);
    }
    for (const cl of contentsLines) {
      const m = cl.match(/^- (.*?): (.*)$/);
      if (!m) throw new Error(`Bad contents line: ${cl}`);
      const firstId = m[2].split(', ')[0];
      const sec = sectionOfRule.get(firstId);
      if (sec === undefined) throw new Error(`Contents line names unknown rule ${firstId}`);
      sections[sec].contents_label = m[1];
    }
  }

  // Whole-file fidelity check.
  const byId = new Map(rules.map((r) => [r.rule_id, r]));
  const rendered = renderFile(blocks, sections, (id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`Unknown rule ${id}`);
    return r;
  });
  if (rendered !== source) {
    let at = 0;
    while (at < Math.min(rendered.length, source.length) && rendered[at] === source[at]) at++;
    throw new Error(
      `Whole-file round-trip failure (${kind}); lengths ${rendered.length} vs ${source.length}; ` +
        `first divergence at ${at}:\n--- rendered ---\n${JSON.stringify(rendered.slice(Math.max(0, at - 60), at + 80))}\n` +
        `--- source ---\n${JSON.stringify(source.slice(Math.max(0, at - 60), at + 80))}`,
    );
  }

  return { blocks, sections, rules };
}
