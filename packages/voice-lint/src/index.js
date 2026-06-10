// Voice and banned-word lint, shared between the editor (FR-A.5) and the
// release gate (FR-E.5). The list is the seam voice kill-list from SKILL.md;
// the Practice Lead can extend it per FR-A.5 AC (passed in as `extraWords`).

export const BANNED_WORDS = [
  'Actually',
  'Really',
  'Quietly',
  'Genuine',
  'Interesting',
  'Specific',
  'Significant',
  'Essentially',
  'Straightforward',
  'Just',
  'Momentum',
];

// Em dash, or a spaced double-hyphen used as one.
export const EM_DASH_RE = /—|\s--\s/;

function escapeRe(w) {
  return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lint a single text value.
 * Returns an array of findings: { type: 'em_dash' | 'banned_word', word?, index }.
 */
export function lintText(text, { extraWords = [] } = {}) {
  const findings = [];
  if (typeof text !== 'string' || text.length === 0) return findings;

  const dash = text.match(EM_DASH_RE);
  if (dash) findings.push({ type: 'em_dash', index: dash.index });

  for (const word of [...BANNED_WORDS, ...extraWords]) {
    const re = new RegExp(`\\b${escapeRe(word)}\\b`, 'i');
    const m = text.match(re);
    if (m) findings.push({ type: 'banned_word', word, index: m.index });
  }
  return findings;
}

/**
 * Lint a set of named fields. Returns [{ field, findings }] for fields with hits.
 */
export function lintFields(fields, opts = {}) {
  const out = [];
  for (const [field, value] of Object.entries(fields)) {
    const findings = lintText(value, opts);
    if (findings.length) out.push({ field, findings });
  }
  return out;
}
