// Component C: regime watch and reactivation. Triggering is atomic: dependent
// rules stale, impact report available, re-authoring tasks open, SLA clocks
// start — one transaction (FR-C.2). The check pass is deterministic and
// idempotent: date triggers fire, overdue re-verify flags raise, stale claims
// sweep. No daemon; it runs on demand and on API start.

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { requireRole } from '../lib/auth.ts';

async function slaWindows(client: pg.PoolClient | pg.Pool) {
  const { rows } = await client.query(`SELECT value FROM shared.app_config WHERE key = 'sla_windows'`);
  return rows[0]?.value ?? {};
}

/** Atomic trigger (FR-C.2): stale the dependents, open tasks, start SLA clocks. */
async function triggerItem(client: pg.PoolClient, item: any, actorId: string | null, how: string) {
  const { rows: deps } = await client.query(
    `SELECT wr.rule_id FROM shared.watch_rule wr WHERE wr.watch_item_id = $1 ORDER BY wr.rule_id`,
    [item.id],
  );
  const ruleIds = deps.map((d) => d.rule_id);

  await client.query(
    `UPDATE shared.watch_item SET status = 'triggered', triggered_at = now(), last_checked_at = now() WHERE id = $1`,
    [item.id],
  );
  await client.query(`UPDATE shared.rule SET status = 'stale' WHERE rule_id = ANY($1) AND status IN ('active', 'approved')`, [ruleIds]);

  for (const ruleId of ruleIds) {
    await client.query(
      `INSERT INTO shared.reauthor_task (watch_item_id, rule_id, owner_id) VALUES ($1, $2, $3)
       ON CONFLICT (watch_item_id, rule_id) DO NOTHING`,
      [item.id, ruleId, item.owner_id],
    );
  }
  await client.query(`UPDATE shared.watch_item SET status = 'reauthoring' WHERE id = $1`, [item.id]);

  // SLA clocks per affected tenant (FR-H.1): tenants pinned to releases that
  // contain a staled rule. Stale flag lands in the same transaction.
  const { rows: tenants } = await client.query(
    `SELECT DISTINCT ON (tp.tenant_id) tp.tenant_id, e.sla_tier
       FROM tenant.tenant_pin tp
       LEFT JOIN tenant.engagement e ON e.tenant_id = tp.tenant_id
       JOIN shared.release_rule_version p ON p.release_version = tp.release_version
       JOIN shared.rule_version rv ON rv.id = p.rule_version_id
      WHERE rv.rule_id = ANY($1)
      ORDER BY tp.tenant_id, tp.pinned_at DESC`,
    [ruleIds],
  );
  for (const t of tenants) {
    await client.query(
      `INSERT INTO tenant.sla_event (tenant_id, watch_item_id, triggered_at, stale_flagged_at, tier)
       VALUES ($1, $2, now(), now(), $3)`,
      [t.tenant_id, item.id, t.sla_tier ?? 'standard'],
    );
  }

  await audit(client, {
    object_type: 'watch_item',
    object_id: item.id,
    action: 'triggered',
    actor_id: actorId,
    detail: { how, staled: ruleIds, tenants: tenants.map((t) => t.tenant_id) },
  });
  return { staled: ruleIds, tenants: tenants.length };
}

/** Idempotent maintenance pass: date triggers, overdue flags, stale claims (FR-C.6). */
export async function runWatchCheck(actorId: string | null) {
  return withTx(async (client) => {
    const fired: string[] = [];
    const overdue: string[] = [];

    const { rows: dateDue } = await client.query(
      `SELECT * FROM shared.watch_item WHERE status IN ('armed', 'overdue')
        AND trigger_type = 'date' AND trigger_date <= current_date`,
    );
    for (const item of dateDue) {
      await triggerItem(client, item, actorId, 'date_arrived');
      fired.push(item.id);
    }

    const { rows: reverifyDue } = await client.query(
      `UPDATE shared.watch_item SET status = 'overdue'
        WHERE status = 'armed' AND reverify_date IS NOT NULL AND reverify_date <= current_date
        RETURNING id`,
    );
    for (const r of reverifyDue) {
      overdue.push(r.id);
      await audit(client, { object_type: 'watch_item', object_id: r.id, action: 'reverify_overdue', actor_id: actorId, detail: {} });
    }

    // Claims past their review date go stale (5.5).
    const { rows: staleClaims } = await client.query(
      `UPDATE tenant.claim SET status = 'stale'
        WHERE status = 'active' AND review_date IS NOT NULL AND review_date <= current_date
        RETURNING tenant_id, claim_id`,
    );

    return { triggered: fired, overdue, stale_claims: staleClaims.length };
  });
}

export function watchRoutes(app: FastifyInstance) {
  app.get('/api/watch', async () => {
    const { rows } = await pool.query(
      `SELECT wi.*, u.name AS owner_name,
              (SELECT array_agg(wr.rule_id ORDER BY wr.rule_id) FROM shared.watch_rule wr WHERE wr.watch_item_id = wi.id) AS rule_ids,
              (SELECT count(*)::int FROM shared.reauthor_task t WHERE t.watch_item_id = wi.id AND t.status = 'open') AS open_tasks
         FROM shared.watch_item wi LEFT JOIN shared.app_user u ON u.id = wi.owner_id
        ORDER BY wi.created_at`,
    );
    return { items: rows };
  });

  // Mark a named event as occurred (FR-C.2).
  app.post('/api/watch/:id/trigger', async (req, reply) => {
    if (!requireRole(req.actor, ['author', 'reviewer', 'practice_lead'], reply)) return;
    const { id } = req.params as { id: string };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM shared.watch_item WHERE id = $1`, [id]);
      const item = rows[0];
      if (!item) return reply.code(404).send({ error: 'No such watch item' });
      if (!['armed', 'overdue'].includes(item.status)) {
        return reply.code(409).send({ error: `Watch item is ${item.status}; only armed or overdue items trigger` });
      }
      const result = await triggerItem(client, item, req.actor.id, 'event_marked');
      return { ok: true, ...result };
    });
  });

  // Re-verify an armed/overdue item: checked, nothing moved (FR-C.6).
  app.post('/api/watch/:id/checked', async (req, reply) => {
    if (!requireRole(req.actor, ['author', 'reviewer', 'practice_lead', 'analyst'], reply)) return;
    const { id } = req.params as { id: string };
    return withTx(async (client) => {
      const { rows } = await client.query(
        `UPDATE shared.watch_item SET status = 'armed', last_checked_at = now()
          WHERE id = $1 AND status IN ('armed', 'overdue') RETURNING id`,
        [id],
      );
      if (!rows.length) return reply.code(409).send({ error: 'Only an armed or overdue item is checkable' });
      await audit(client, { object_type: 'watch_item', object_id: id, action: 'reverified', actor_id: req.actor.id, detail: {} });
      return { ok: true };
    });
  });

  // The deterministic check pass (FR-C.2/C.6), idempotent.
  app.post('/api/watch/check', async (req, reply) => {
    if (!requireRole(req.actor, ['author', 'reviewer', 'practice_lead', 'analyst'], reply)) return;
    return runWatchCheck(req.actor.id);
  });

  // Impact report (FR-C.3).
  app.get('/api/watch/:id/impact', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows: items } = await pool.query(`SELECT * FROM shared.watch_item WHERE id = $1`, [id]);
    const item = items[0];
    if (!item) return reply.code(404).send({ error: 'No such watch item' });

    const { rows: staled } = await pool.query(
      `SELECT t.rule_id, t.status AS task_status, t.closed_by_version_id, r.status AS rule_status,
              v.title FROM shared.reauthor_task t
         JOIN shared.rule r ON r.rule_id = t.rule_id
         LEFT JOIN shared.rule_version v ON v.id = r.current_version_id
        WHERE t.watch_item_id = $1 ORDER BY t.rule_id`,
      [id],
    );
    const ruleIds = staled.map((s) => s.rule_id);

    const { rows: releases } = await pool.query(
      `SELECT DISTINCT p.release_version FROM shared.release_rule_version p
         JOIN shared.rule_version rv ON rv.id = p.rule_version_id
         JOIN shared.seam_release sr ON sr.version = p.release_version
        WHERE rv.rule_id = ANY($1) AND sr.status IN ('published', 'deprecated')
        ORDER BY p.release_version`,
      [ruleIds],
    );
    const releaseVersions = releases.map((r) => r.release_version);

    const { rows: tenants } = await pool.query(
      `SELECT DISTINCT ON (tp.tenant_id) t.id, t.name, tp.release_version
         FROM tenant.tenant_pin tp JOIN tenant.tenant t ON t.id = tp.tenant_id
        WHERE tp.release_version = ANY($1)
        ORDER BY tp.tenant_id, tp.pinned_at DESC`,
      [releaseVersions],
    );

    const { rows: pulls } = await pool.query(
      `SELECT ap.artifact_ref, ap.cited_release_version, ap.generated_at, ap.rule_ids, t.name AS tenant_name
         FROM tenant.audit_pull ap LEFT JOIN tenant.tenant t ON t.id = ap.tenant_id
        WHERE ap.rule_ids && $1 ORDER BY ap.generated_at DESC`,
      [ruleIds],
    );

    return {
      watch_item: item,
      staled_rules: staled,
      releases: releaseVersions,
      tenants,
      audit_pulls: pulls,
    };
  });

  // Re-authoring tasks (FR-C.5).
  app.get('/api/watch/:id/tasks', async (req) => {
    const { id } = req.params as { id: string };
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS owner_name FROM shared.reauthor_task t
         LEFT JOIN shared.app_user u ON u.id = t.owner_id
        WHERE t.watch_item_id = $1 ORDER BY t.rule_id`,
      [id],
    );
    return { tasks: rows };
  });
}

/**
 * Called from the approval path: an approved version superseding a stale rule
 * closes its re-authoring task; the last closure resolves the watch item and
 * returns the rule to the staging path (FR-C.5).
 */
export async function closeReauthorTasks(client: pg.PoolClient, ruleId: string, versionId: string, actorId: string) {
  const { rows: closed } = await client.query(
    `UPDATE shared.reauthor_task SET status = 'closed', closed_by_version_id = $1, closed_at = now()
      WHERE rule_id = $2 AND status = 'open' RETURNING watch_item_id`,
    [versionId, ruleId],
  );
  for (const c of closed) {
    await audit(client, { object_type: 'reauthor_task', object_id: `${c.watch_item_id}:${ruleId}`, action: 'closed', actor_id: actorId, detail: { version_id: versionId } });
    const { rows: open } = await client.query(
      `SELECT count(*)::int AS n FROM shared.reauthor_task WHERE watch_item_id = $1 AND status = 'open'`,
      [c.watch_item_id],
    );
    if (open[0].n === 0) {
      await client.query(`UPDATE shared.watch_item SET status = 'resolved' WHERE id = $1`, [c.watch_item_id]);
      await audit(client, { object_type: 'watch_item', object_id: c.watch_item_id, action: 'resolved', actor_id: actorId, detail: {} });
    }
  }
  return closed.length;
}
