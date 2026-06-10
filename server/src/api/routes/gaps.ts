// Component D: gap ingestion (the deployed skill's only write path), triage,
// the ranked backlog, and the coverage matrix. Data minimisation is the wall:
// the ingestion schema is bounded and anything outside it rejects (FR-9.5).

import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { requireRole } from '../lib/auth.ts';

const GAP_KINDS = ['uncovered_objection', 'missing_jurisdiction', 'missing_input_pattern', 'uncovered_regime'];
const TOP_LEVEL_FIELDS = new Set(['gap_kind', 'abstention_text', 'jurisdiction', 'prospect_context', 'deal_cost_gbp', 'occurred_at']);
const CONTEXT_FIELDS = new Set(['firm_type', 'ai_touchpoint', 'data_classes', 'deployment_model', 'buyer_persona', 'regulator']);

export function gapsRoutes(app: FastifyInstance) {
  // ── ingestion: deploy-key authenticated, write-only (FR-D.1) ──
  app.post('/api/gaps', { config: { skipUserAuth: true } }, async (req, reply) => {
    const key = req.headers['x-deploy-key'];
    if (!key || typeof key !== 'string') return reply.code(401).send({ error: 'X-Deploy-Key required' });
    const { rows: deps } = await pool.query(
      `SELECT id, tenant_id FROM tenant.deployment WHERE deploy_key = $1 AND active AND NOT revoked`,
      [key],
    );
    if (!deps.length) return reply.code(401).send({ error: 'Unknown or revoked deployment key' });
    const dep = deps[0];

    const b = (req.body ?? {}) as Record<string, any>;
    // The bounded abstraction schema: reject anything outside it, naming the field.
    for (const k of Object.keys(b)) {
      if (!TOP_LEVEL_FIELDS.has(k)) {
        return reply.code(422).send({ error: `Field outside the abstraction schema: ${k}` });
      }
    }
    for (const k of Object.keys(b.prospect_context ?? {})) {
      if (!CONTEXT_FIELDS.has(k)) {
        return reply.code(422).send({ error: `Prospect-context field outside the abstraction schema: ${k}` });
      }
    }
    if (!GAP_KINDS.includes(b.gap_kind)) return reply.code(422).send({ error: `gap_kind is one of: ${GAP_KINDS.join(', ')}` });
    if (!b.abstention_text?.trim()) return reply.code(422).send({ error: 'abstention_text is required' });

    const {
      rows: [g],
    } = await pool.query(
      `INSERT INTO tenant.gap_log (tenant_id, gap_kind, abstention_text, prospect_context_abstracted,
                                   jurisdiction, deal_cost_gbp, deployment_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        dep.tenant_id, b.gap_kind, b.abstention_text.trim(), JSON.stringify(b.prospect_context ?? {}),
        b.jurisdiction ?? null, b.deal_cost_gbp ?? null, dep.id, b.occurred_at ?? null,
      ],
    );
    return { id: g.id };
  });

  // ── listing + triage (FR-D.2) ──────────────────────────────
  app.get('/api/gaps', async (req) => {
    const q = req.query as { status?: string };
    const { rows } = await pool.query(
      `SELECT g.*, t.name AS tenant_name,
              (SELECT count(*)::int FROM tenant.gap_log d WHERE d.linked_backlog_id = g.id) + 1 AS frequency
         FROM tenant.gap_log g JOIN tenant.tenant t ON t.id = g.tenant_id
        WHERE ($1::text IS NULL OR g.triage_status = $1)
        ORDER BY g.logged_at DESC`,
      [q.status ?? null],
    );
    // Rank = frequency × max(tenant-reported, practice-estimated) cost (FR-D.3).
    const ranked = rows.map((g) => ({
      ...g,
      cost: Math.max(g.deal_cost_gbp ?? 0, g.cost_estimated_gbp ?? 0),
      rank: ((g.frequency ?? 1) * Math.max(g.deal_cost_gbp ?? 0, g.cost_estimated_gbp ?? 0)) || g.frequency,
    }));
    ranked.sort((a, b) => b.rank - a.rank);
    return { gaps: ranked };
  });

  app.patch('/api/gaps/:id', async (req, reply) => {
    if (!requireRole(req.actor, ['analyst', 'practice_lead'], reply)) return;
    const { id } = req.params as { id: string };
    const b = req.body as {
      triage_status?: 'duplicate' | 'backlog' | 'rejected' | 'in_authoring';
      triage_reason?: string;
      linked_backlog_id?: string;
      cost_estimated_gbp?: number;
      linked_rule_id?: string;
    };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM tenant.gap_log WHERE id = $1`, [id]);
      const g = rows[0];
      if (!g) return reply.code(404).send({ error: 'No such gap' });
      if (['duplicate', 'rejected', 'closed'].includes(g.triage_status) && b.triage_status) {
        return reply.code(409).send({ error: `${g.triage_status} is terminal` });
      }
      if (b.triage_status === 'rejected' && !b.triage_reason?.trim()) {
        return reply.code(422).send({ error: 'Rejection keeps its reason' });
      }
      if (b.triage_status === 'duplicate' && !b.linked_backlog_id) {
        return reply.code(422).send({ error: 'A duplicate links to the gap it duplicates' });
      }
      if (b.triage_status === 'in_authoring' && !b.linked_rule_id) {
        return reply.code(422).send({ error: 'Pulling into authoring links the rule being authored' });
      }
      await client.query(
        `UPDATE tenant.gap_log SET
           triage_status = COALESCE($1, triage_status),
           triage_reason = COALESCE($2, triage_reason),
           linked_backlog_id = COALESCE($3, linked_backlog_id),
           cost_estimated_gbp = COALESCE($4, cost_estimated_gbp),
           linked_rule_id = COALESCE($5, linked_rule_id)
         WHERE id = $6`,
        [b.triage_status ?? null, b.triage_reason ?? null, b.linked_backlog_id ?? null,
         b.cost_estimated_gbp ?? null, b.linked_rule_id ?? null, id],
      );
      await audit(client, { object_type: 'gap', object_id: id, action: b.triage_status ? `triaged_${b.triage_status}` : 'updated', actor_id: req.actor.id, detail: b as any });
      return { ok: true };
    });
  });

  // ── coverage matrix (FR-D.4) ───────────────────────────────
  app.get('/api/coverage', async (req) => {
    const q = req.query as { tenant_id?: string };
    const [{ rows: jurisdictions }, { rows: regimes }] = await Promise.all([
      pool.query(`SELECT tag, parent_tag, layer_depth FROM shared.jurisdiction ORDER BY layer_depth, tag`),
      pool.query(`SELECT code, jurisdictions FROM shared.regime ORDER BY code`),
    ]);

    let scope: { jurisdictions: string[]; regimes: string[] } | null = null;
    if (q.tenant_id) {
      const { rows } = await pool.query(`SELECT jurisdictions, regimes FROM tenant.engagement WHERE tenant_id = $1`, [q.tenant_id]);
      if (rows.length) scope = rows[0];
    }

    const { rows: ruleCells } = await pool.query(
      `SELECT rj.jurisdiction_tag AS tag, r.regime,
              count(*) FILTER (WHERE r.status IN ('active', 'approved'))::int AS depth,
              count(*) FILTER (WHERE r.status = 'stale')::int AS stale
         FROM shared.rule r JOIN shared.rule_jurisdiction rj ON rj.rule_id = r.rule_id
        WHERE r.kind = 'regulatory' AND r.status <> 'retired'
        GROUP BY rj.jurisdiction_tag, r.regime`,
    );
    const { rows: gapCells } = await pool.query(
      `SELECT jurisdiction AS tag, count(*)::int AS open_gaps FROM tenant.gap_log
        WHERE triage_status IN ('untriaged', 'backlog', 'in_authoring') AND jurisdiction IS NOT NULL
        GROUP BY jurisdiction`,
    );

    const rootOf = new Map<string, string>();
    for (const j of jurisdictions) {
      let cur = j;
      while (cur.parent_tag) cur = jurisdictions.find((x) => x.tag === cur.parent_tag)!;
      rootOf.set(j.tag, cur.tag);
    }

    const rows = jurisdictions
      .filter((j) => !scope || scope.jurisdictions.includes(j.tag))
      .map((j) => ({
        tag: j.tag,
        cells: regimes
          .filter((r) => !scope || scope.regimes.length === 0 || scope.regimes.includes(r.code))
          .map((r) => {
            const inScope = !r.jurisdictions?.length || r.jurisdictions.includes(rootOf.get(j.tag)!);
            if (!inScope) return { regime: r.code, in_scope: false };
            const cell = ruleCells.find((c) => c.tag === j.tag && c.regime === r.code);
            return { regime: r.code, in_scope: true, depth: cell?.depth ?? 0, stale: cell?.stale ?? 0 };
          }),
        open_gaps: gapCells.find((g) => g.tag === j.tag)?.open_gaps ?? 0,
      }));

    return { regimes: regimes.map((r) => r.code), rows };
  });
}
