// The assist model wrapper. The agent runs on the house pattern: constrained
// to cite, abstaining where it cannot, never free-generating an authority
// (FR-AI.6). Without credentials, assisted capabilities refuse clearly.

import { pool } from '../db/pool.ts';

export class AssistUnavailable extends Error {
  statusCode = 503;
  constructor() {
    super('The assist model is not configured; set ANTHROPIC_API_KEY. Deterministic checks still run.');
  }
}

const HOUSE_PATTERN = `You operate inside a legal-authoring system whose entire product is grounding.
Hard rules, identical to the skill this system ships:
- Cite or abstain. Never assert a regulatory proposition without naming the instrument it rests on.
- If you cannot find or recall a checkable source, output an abstention that says "no source found, human input needed" for that item. An abstention is good output; an invented authority is the exact failure this system exists to stop.
- You draft and you flag. You never approve. A human lawyer verifies every source before anything you produce is accepted.
- Voice: terse declarative British English. No em dashes. Never use: Actually, Really, Quietly, Genuine, Interesting, Specific, Significant, Essentially, Straightforward, Just, Momentum.
Respond with valid JSON only, matching the schema you are given. No prose outside the JSON.`;

export async function assistModel(): Promise<string> {
  const { rows } = await pool.query(`SELECT value FROM shared.app_config WHERE key = 'assist_model'`);
  return rows[0]?.value ?? 'claude-sonnet-4-6';
}

export function assistAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** One JSON-shaped call. Throws AssistUnavailable without credentials. */
export async function callAssist(prompt: string, schemaHint: string, maxTokens = 4000): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AssistUnavailable();
  const model = await assistModel();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: HOUSE_PATTERN,
      messages: [{ role: 'user', content: `${prompt}\n\nJSON schema to follow exactly:\n${schemaHint}` }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Assist model call failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const text = data.content?.find((c: any) => c.type === 'text')?.text ?? '';
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(jsonText);
}

/** Exposed for tests: the exact prompt construction per capability. */
export function buildResearchPrompt(params: {
  regime: string;
  jurisdiction?: string;
  topic?: string;
  includeDrafts: boolean;
  existingIds: string[];
}): { prompt: string; schema: string } {
  const draftsNote = params.includeDrafts
    ? 'For each candidate also draft a Statement (the legal proposition as it operates, one assertable unit) and a Buyer reading (how a compliance buyer reads it in a buying decision), each grounded strictly in the named source.'
    : 'Do NOT draft statements or conclusions. Surface the source, its location and a one-line relevance note only; the lawyer reaches the conclusion themselves.';
  return {
    prompt:
      `Deepen regime coverage for a seam of regulatory selling rules.\n` +
      `Regime: ${params.regime}. Jurisdiction layer: ${params.jurisdiction ?? 'as the regime applies'}. Topic focus: ${params.topic ?? 'any high-value gap'}.\n` +
      `Rules already covering this ground (do not duplicate): ${params.existingIds.join(', ') || 'none'}.\n` +
      `Return candidate authorities a lawyer should read: instrument, article/section, guidance documents. ${draftsNote}\n` +
      `Where you cannot name a checkable source for something worth covering, return it as an abstention.`,
    schema: `{"candidates":[{"authority":"string, instrument + article level","url":"string or null","source_type":"statute|regulation|guidance|RTS|circular|case|other","relevance":"one line: why this matters to a compliance-led sale"${params.includeDrafts ? ',"draft_statement":"string","draft_buyer_reading":"string"' : ''}}],"abstentions":["no source found, human input needed: <what>"]}`,
  };
}

export function buildReviewerPrompt(block: string, sources: string[]): { prompt: string; schema: string } {
  return {
    prompt:
      `Pre-screen this submitted seam rule for a human reviewer. You are an advisory input, never an approval.\n` +
      `Assess three things only:\n` +
      `1. authority_checkable: is the Authority checkable as cited (instrument and article exist and plausibly say this)?\n` +
      `2. overreach: does the Statement assert more than the cited source supports?\n` +
      `3. advice_drift: has the Buyer reading drifted from buyer-behaviour into advising on the law itself?\n\n` +
      `Rule:\n${block}\n\nAttached sources:\n${sources.join('\n') || 'none'}`,
    schema: `{"authority_checkable":{"verdict":"yes|no|uncertain","note":"string"},"overreach":{"verdict":"yes|no|uncertain","note":"string"},"advice_drift":{"verdict":"yes|no|uncertain","note":"string"},"summary":"two sentences for the reviewer"}`,
  };
}

export function buildGapDraftPrompt(gap: any, corpusIds: string[]): { prompt: string; schema: string } {
  return {
    prompt:
      `A deployed sales skill abstained on a live deal and logged this gap. Draft the candidate objection rule that would cover it.\n` +
      `Gap kind: ${gap.gap_kind}. Jurisdiction: ${gap.jurisdiction ?? 'unknown'}.\n` +
      `Abstention text (verbatim from the deal): ${gap.abstention_text}\n` +
      `Prospect context (abstraction level): ${JSON.stringify(gap.prospect_context_abstracted)}\n\n` +
      `The objection corpus format: a Substance paragraph (the grounded response strategy, citing regulatory rule IDs inline in square brackets) and a Claims gap line (what must come from a tenant claims file rather than the shared corpus).\n` +
      `Regulatory rules that exist and may be rested on: ${corpusIds.join(', ')}.\n` +
      `Name every regulatory rule the response would rest on. If the response needs a regulatory rule that does not exist in the list, name it as a missing prerequisite instead of pretending it exists.`,
    schema: `{"title":"objection phrasing in quotes","substance":"string citing [RULE-IDS] inline","claims_gap":"string","rests_on":["RULE-ID"],"missing_prerequisites":[{"would_cover":"string","suggested_regime":"string"}]}`,
  };
}

export function buildScaffoldPrompt(rough: any, prospectFields: string[]): { prompt: string; schema: string } {
  return {
    prompt:
      `Shape the mechanical fields of a seam rule from a lawyer's rough substance. Do not alter the substance semantically; it is the lawyer's.\n` +
      `Rough statement: ${rough.statement}\n` +
      `Rough buyer reading: ${rough.buyer_reading ?? '(none yet)'}\n` +
      `Draft only: an Applicability line (the conditions under which the rule fires for a prospect) and the needed prospect facts, chosen strictly from: ${prospectFields.join(', ')}.`,
    schema: `{"applicability":"string","inputs_required":["field"],"suggested_title":"short label"}`,
  };
}

export function buildCriticPrompt(corpus: { rule_id: string; statement: string }[]): { prompt: string; schema: string } {
  return {
    prompt:
      `Read this corpus of regulatory selling rules (ID and Statement only) and flag, never author:\n` +
      `- contradictions: two rules asserting incompatible propositions\n` +
      `- bundled_units: a Statement carrying two independent assertable obligations that should split\n` +
      `Flag only what you are confident of; silence beats noise.\n\n` +
      corpus.map((c) => `${c.rule_id}: ${c.statement}`).join('\n'),
    schema: `{"findings":[{"kind":"contradiction|bundled_units","rule_ids":["ID"],"reason":"string"}]}`,
  };
}
