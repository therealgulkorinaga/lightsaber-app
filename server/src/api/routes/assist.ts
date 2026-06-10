// Component AI: assisted authoring and review, inside the guardrails of
// FR-AI.6. Drafts and flags only; the assistant approves nothing, writes no
// evals, and a source-less research candidate is discarded server-side.

import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { requireRole } from '../lib/auth.ts';
import { PROSPECT_FIELDS } from '../lib/validate.ts';
import { renderRuleBlock } from '../../seam/render.ts';
import {
  AssistUnavailable,
  assistAvailable,
  assistModel,
  callAssist,
  buildCriticPrompt,
  buildGapDraftPrompt,
  buildResearchPrompt,
  buildReviewerPrompt,
  buildScaffoldPrompt,
} from '../../assist/llm.ts';
import { deterministicCritic } from '../../assist/critic.ts';

const SUBSTANCE_ROLES = ['author', 'reviewer', 'practice_lead'] as const;

async function recordRun(
  client: any,
  capability: string,
  actorId: string,
  params: any,
  status: 'complete' | 'refused' | 'failed',
  result: any,
) {
  const {
    rows: [run],
  } = await client.query(
    `INSERT INTO shared.assist_run (capability, requested_by, params, model, status, result, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
    [capability, actorId, JSON.stringify(params ?? {}), assistAvailable() ? await assistModel() : null, status, JSON.stringify(result ?? {})],
  );
  return run.id;
}

export function assistRoutes(app: FastifyInstance) {
  // ── FR-AI.1 research and sourcing ───────────────────────────
  app.post('/api/assist/research', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES], reply)) return;
    const b = req.body as { regime: string; jurisdiction?: string; topic?: string; include_drafts?: boolean };
    if (!b?.regime) return reply.code(422).send({ error: 'Name the regime to deepen' });

    // High-risk kinds get sources without pre-written conclusions by default;
    // drafted text is an explicit, recorded opt-in (FR-AI.6 anchoring).
    const includeDrafts = b.include_drafts === true;

    return withTx(async (client) => {
      const { rows: existing } = await client.query(
        `SELECT r.rule_id FROM shared.rule r WHERE r.regime = $1 AND r.status <> 'retired' ORDER BY r.rule_id`,
        [b.regime],
      );
      const { prompt, schema } = buildResearchPrompt({
        regime: b.regime,
        jurisdiction: b.jurisdiction,
        topic: b.topic,
        includeDrafts,
        existingIds: existing.map((r) => r.rule_id),
      });

      let out: any;
      try {
        out = await callAssist(prompt, schema, 6000);
      } catch (err) {
        if (err instanceof AssistUnavailable) {
          await recordRun(client, 'research', req.actor.id, b, 'refused', { reason: 'no credentials' });
          return reply.code(503).send({ error: err.message });
        }
        await recordRun(client, 'research', req.actor.id, b, 'failed', { error: (err as Error).message });
        throw err;
      }

      // House pattern, enforced server-side: a candidate without a source is
      // discarded and logged, never shown (FR-AI.6).
      const candidates = (out.candidates ?? []).filter((c: any) => c.authority?.trim());
      const dropped = (out.candidates ?? []).length - candidates.length;
      const abstentions: string[] = out.abstentions ?? [];

      const runId = await recordRun(client, 'research', req.actor.id, { ...b, include_drafts: includeDrafts }, 'complete', {
        candidates: candidates.length,
        dropped_sourceless: dropped,
        abstentions: abstentions.length,
      });

      const stored = [];
      for (const c of candidates) {
        const {
          rows: [f],
        } = await client.query(
          `INSERT INTO shared.assist_finding (run_id, kind, detail) VALUES ($1, 'research_candidate', $2) RETURNING id`,
          [runId, JSON.stringify(c)],
        );
        stored.push({ finding_id: f.id, ...c });
      }
      if (dropped > 0) {
        await audit(client, { object_type: 'assist_run', object_id: runId, action: 'sourceless_candidates_dropped', actor_id: req.actor.id, detail: { dropped } });
      }
      return { run_id: runId, candidates: stored, abstentions, include_drafts: includeDrafts, dropped_sourceless: dropped };
    });
  });

  // Accept: marks the finding and hands back a prefill for the NORMAL
  // authoring path (the draft is created via POST /api/rules, ai_assisted).
  app.post('/api/assist/findings/:id/accept', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES], reply)) return;
    const { id } = req.params as { id: string };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM shared.assist_finding WHERE id = $1`, [id]);
      const f = rows[0];
      if (!f) return reply.code(404).send({ error: 'No such finding' });
      await client.query(`UPDATE shared.assist_finding SET status = 'accepted', resolved_by = $1 WHERE id = $2`, [req.actor.id, id]);
      await audit(client, { object_type: 'assist_finding', object_id: id, action: 'accepted', actor_id: req.actor.id, detail: {} });
      const c = f.detail;
      return {
        prefill: {
          ai_assisted: true,
          statement: c.draft_statement ?? '',
          buyer_reading: c.draft_buyer_reading ?? '',
          authority_summary: c.authority,
          sources: [{ citation: c.authority, source_type: c.source_type ?? 'other', url: c.url ?? undefined }],
        },
        note: 'Opens as a normal draft. Tick each source as read before submission; that is the acceptance act.',
      };
    });
  });

  app.post('/api/assist/findings/:id/dismiss', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES, 'analyst'], reply)) return;
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    if (!reason?.trim()) return reply.code(422).send({ error: 'Dismissal keeps its reason' });
    return withTx(async (client) => {
      const { rows } = await client.query(
        `UPDATE shared.assist_finding SET status = 'dismissed', resolution_reason = $1, resolved_by = $2
          WHERE id = $3 AND status = 'open' RETURNING id`,
        [reason, req.actor.id, id],
      );
      if (!rows.length) return reply.code(409).send({ error: 'Finding is not open' });
      await audit(client, { object_type: 'assist_finding', object_id: id, action: 'dismissed', actor_id: req.actor.id, detail: { reason } });
      return { ok: true };
    });
  });

  app.get('/api/assist/findings', async (req) => {
    const q = req.query as { status?: string; kind?: string };
    const { rows } = await pool.query(
      `SELECT f.*, r.capability, r.started_at AS run_at FROM shared.assist_finding f
         JOIN shared.assist_run r ON r.id = f.run_id
        WHERE ($1::text IS NULL OR f.status = $1) AND ($2::text IS NULL OR f.kind = $2)
        ORDER BY f.created_at DESC LIMIT 500`,
      [q.status ?? null, q.kind ?? null],
    );
    return { findings: rows };
  });

  // ── FR-AI.2 consistency and coverage critic ─────────────────
  app.post('/api/assist/critic', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES, 'analyst'], reply)) return;
    return withTx(async (client) => {
      const deterministic = await deterministicCritic(client);

      let semantic: any[] = [];
      let semanticRan = false;
      if (assistAvailable()) {
        const { rows: corpus } = await client.query(
          `SELECT r.rule_id, v.statement FROM shared.rule r JOIN shared.rule_version v ON v.id = r.current_version_id
            WHERE r.kind = 'regulatory' AND r.status <> 'retired' AND v.statement IS NOT NULL ORDER BY r.rule_id`,
        );
        const { prompt, schema } = buildCriticPrompt(corpus);
        try {
          const out = await callAssist(prompt, schema, 6000);
          semantic = out.findings ?? [];
          semanticRan = true;
        } catch {
          semanticRan = false; // deterministic findings still stand
        }
      }

      const runId = await recordRun(client, 'critic', req.actor.id, {}, 'complete', {
        deterministic: deterministic.length,
        semantic: semantic.length,
        semantic_ran: semanticRan,
      });
      const all = [
        ...deterministic.map((d) => ({ ...d, source: 'deterministic' })),
        ...semantic.map((s: any) => ({ kind: s.kind, rule_ids: s.rule_ids ?? [], detail: { note: s.reason }, source: 'model' })),
      ];
      const stored = [];
      for (const f of all) {
        const {
          rows: [row],
        } = await client.query(
          `INSERT INTO shared.assist_finding (run_id, kind, rule_ids, detail) VALUES ($1, $2, $3, $4) RETURNING id`,
          [runId, f.kind, f.rule_ids, JSON.stringify({ ...f.detail, source: f.source })],
        );
        stored.push({ finding_id: row.id, ...f });
      }
      return { run_id: runId, findings: stored, semantic_ran: semanticRan };
    });
  });

  // ── FR-AI.3 schema scaffolding ──────────────────────────────
  app.post('/api/assist/scaffold', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES], reply)) return;
    const b = req.body as { kind?: string; regime?: string; jurisdiction_tags?: string[]; rough: { title?: string; statement: string; buyer_reading?: string } };
    if (!b?.rough?.statement?.trim()) return reply.code(422).send({ error: 'Give the substance rough; the scaffold shapes the rest' });

    return withTx(async (client) => {
      // Deterministic part: em-dash fix only (the lawyer's words are theirs).
      const cleaned = {
        ...b.rough,
        statement: b.rough.statement.replace(/\s*—\s*/g, ', ').replace(/\s--\s/g, ', '),
        buyer_reading: (b.rough.buyer_reading ?? '').replace(/\s*—\s*/g, ', ').replace(/\s--\s/g, ', '),
      };

      let modelOut: any = null;
      if (assistAvailable()) {
        const { prompt, schema } = buildScaffoldPrompt(cleaned, PROSPECT_FIELDS);
        try {
          modelOut = await callAssist(prompt, schema, 1500);
          modelOut.inputs_required = (modelOut.inputs_required ?? []).filter((f: string) => PROSPECT_FIELDS.includes(f));
        } catch (err) {
          if (!(err instanceof AssistUnavailable)) throw err;
        }
      }

      const runId = await recordRun(client, 'scaffold', req.actor.id, { kind: b.kind, regime: b.regime }, 'complete', {
        model_used: !!modelOut,
      });
      return {
        run_id: runId,
        draft: {
          ai_assisted: true,
          kind: b.kind ?? 'regulatory',
          regime: b.regime,
          jurisdiction_tags: b.jurisdiction_tags ?? [],
          title: b.rough.title ?? modelOut?.suggested_title ?? '',
          statement: cleaned.statement, // semantically untouched (FR-AI.6 moat control)
          buyer_reading: cleaned.buyer_reading,
          applicability: modelOut?.applicability ?? '',
          inputs_required: modelOut?.inputs_required ?? [],
        },
        note: modelOut ? 'Applicability and needed facts are drafted; everything else is yours.' : 'Model unavailable; mechanics only (em-dash pass).',
      };
    });
  });

  // ── FR-AI.4 gap to draft ────────────────────────────────────
  app.post('/api/assist/gap-draft', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES], reply)) return;
    const { gap_id } = req.body as { gap_id: string };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM tenant.gap_log WHERE id = $1`, [gap_id]);
      const gap = rows[0];
      if (!gap) return reply.code(404).send({ error: 'No such gap' });

      const { rows: corpus } = await client.query(
        `SELECT rule_id FROM shared.rule WHERE kind = 'regulatory' AND status <> 'retired' ORDER BY rule_id`,
      );
      const corpusIds = corpus.map((c) => c.rule_id);
      const { prompt, schema } = buildGapDraftPrompt(gap, corpusIds);

      let out: any;
      try {
        out = await callAssist(prompt, schema, 3000);
      } catch (err) {
        if (err instanceof AssistUnavailable) {
          await recordRun(client, 'gap_draft', req.actor.id, { gap_id }, 'refused', {});
          return reply.code(503).send({ error: err.message });
        }
        throw err;
      }

      // rests_on never silently invents a rule (FR-AI.4 AC): partition by existence.
      const known = new Set(corpusIds);
      const restsOn: { rule_id: string; exists: boolean; status?: string }[] = [];
      for (const id of out.rests_on ?? []) {
        if (known.has(id)) {
          const { rows: st } = await client.query(`SELECT status FROM shared.rule WHERE rule_id = $1`, [id]);
          restsOn.push({ rule_id: id, exists: true, status: st[0].status });
        } else {
          restsOn.push({ rule_id: id, exists: false });
        }
      }
      const blocking = restsOn.filter((r) => !r.exists);

      const runId = await recordRun(client, 'gap_draft', req.actor.id, { gap_id }, 'complete', {
        rests_on: restsOn.length,
        blocking: blocking.length,
      });
      return {
        run_id: runId,
        draft: {
          ai_assisted: true,
          kind: 'objection',
          title: out.title ?? `"${gap.abstention_text.slice(0, 60)}"`,
          kind_fields: {
            substance: out.substance ?? '',
            gap_label: 'Claims gap',
            gap_text: out.claims_gap ?? '',
            rests_on_ids: restsOn.filter((r) => r.exists).map((r) => r.rule_id),
            rests_on_raw: restsOn.filter((r) => r.exists).map((r) => r.rule_id).join(', '),
          },
        },
        rests_on: restsOn,
        blocking_prerequisites: [...blocking.map((b2) => b2.rule_id), ...(out.missing_prerequisites ?? []).map((m: any) => m.would_cover)],
        gap_id,
        note: blocking.length
          ? 'Blocking prerequisites: author the missing regulatory rules first; the assistant will not pretend they exist.'
          : 'All rested-on rules exist. Take the draft through the normal authoring path.',
      };
    });
  });

  // ── FR-AI.5 reviewer assist ─────────────────────────────────
  app.post('/api/assist/review/:ruleId', async (req, reply) => {
    if (!requireRole(req.actor, [...SUBSTANCE_ROLES], reply)) return;
    const { ruleId } = req.params as { ruleId: string };
    return withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT v.*, r.kind, r.regime, r.scope FROM shared.rule_version v JOIN shared.rule r ON r.rule_id = v.rule_id
          WHERE v.rule_id = $1 AND v.review_state = 'in_review' ORDER BY v.created_at DESC LIMIT 1`,
        [ruleId],
      );
      const v = rows[0];
      if (!v) return reply.code(409).send({ error: 'No version in review' });

      const block = renderRuleBlock({
        rule_id: ruleId, kind: v.kind, regime: v.regime, scope: v.scope, title: v.title,
        semver_at_author: v.semver_at_author, version_annotation: v.version_annotation,
        status_at_version: v.status_at_version, jurisdiction_tags: v.jurisdiction_tags,
        statement: v.statement, buyer_reading: v.buyer_reading, authority_summary: v.authority_summary,
        applicability: v.applicability, movement_note: v.movement_note, kind_fields: v.kind_fields,
      });
      const { rows: sources } = await client.query(`SELECT citation FROM shared.source WHERE rule_version_id = $1`, [v.id]);
      const { prompt, schema } = buildReviewerPrompt(block, sources.map((s) => s.citation));

      let advisory: any;
      try {
        advisory = await callAssist(prompt, schema, 1500);
      } catch (err) {
        if (err instanceof AssistUnavailable) {
          await recordRun(client, 'reviewer', req.actor.id, { rule_id: ruleId }, 'refused', {});
          return reply.code(503).send({ error: err.message });
        }
        throw err;
      }

      const runId = await recordRun(client, 'reviewer', req.actor.id, { rule_id: ruleId, version_id: v.id }, 'complete', advisory);
      // Stored with the review record: the approval trail shows what the
      // reviewer saw (FR-AI.5). This column is system metadata, allowed on an
      // in_review version (the immutability trigger freezes approved ones).
      await client.query(`UPDATE shared.rule_version SET review_advisory = $1 WHERE id = $2`, [JSON.stringify({ ...advisory, run_id: runId }), v.id]);
      return { run_id: runId, advisory };
    });
  });
}
