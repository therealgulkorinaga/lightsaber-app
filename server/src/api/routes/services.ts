// Component H: configuration of record, the practice operating view, SLA and
// billing streams, and the tenant portal's data surface.

import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { requireRole } from '../lib/auth.ts';

export function servicesRoutes(app: FastifyInstance) {
  // ── configuration of record (FR-X.4) ───────────────────────
  app.get('/api/config', async () => {
    const { rows } = await pool.query(`SELECT key, value, updated_at FROM shared.app_config ORDER BY key`);
    return { config: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  });

  app.put('/api/config/:key', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    const { key } = req.params as { key: string };
    const { value } = req.body as { value: unknown };
    return withTx(async (client) => {
      const { rows } = await client.query(
        `UPDATE shared.app_config SET value = $1, updated_by = $2, updated_at = now() WHERE key = $3 RETURNING key`,
        [JSON.stringify(value), req.actor.id, key],
      );
      if (!rows.length) return reply.code(404).send({ error: `No config key ${key}` });
      await audit(client, { object_type: 'app_config', object_id: key, action: 'updated', actor_id: req.actor.id, detail: { value } });
      return { ok: true };
    });
  });

  // ── SLA and billing streams ─────────────────────────────────
  app.get('/api/sla-events', async (req, reply) => {
    if (req.actor.role === 'tenant_admin') return reply.code(403).send({ error: 'Practice surface' });
    const { rows } = await pool.query(
      `SELECT s.*, t.name AS tenant_name FROM tenant.sla_event s JOIN tenant.tenant t ON t.id = s.tenant_id
        ORDER BY s.triggered_at DESC LIMIT 200`,
    );
    return { events: rows };
  });

  app.get('/api/billing-events', async (req, reply) => {
    if (req.actor.role === 'tenant_admin') return reply.code(403).send({ error: 'Practice surface' });
    const { rows } = await pool.query(
      `SELECT b.*, t.name AS tenant_name FROM tenant.billing_event b JOIN tenant.tenant t ON t.id = b.tenant_id
        ORDER BY b.occurred_at DESC LIMIT 200`,
    );
    return { events: rows };
  });

  // ── the practice operating view (FR-H.4) ────────────────────
  app.get('/api/operating', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead', 'analyst', 'author', 'reviewer'], reply)) return;
    const [fleet, throughput, gate, gaps, breaches, assisted] = await Promise.all([
      pool.query(
        `SELECT count(DISTINCT tp.tenant_id)::int AS tenants,
                count(DISTINCT tp.tenant_id) FILTER (WHERE EXISTS (
                  SELECT 1 FROM shared.release_rule_version p
                    JOIN shared.rule_version rv ON rv.id = p.rule_version_id
                    JOIN shared.rule r ON r.rule_id = rv.rule_id
                   WHERE p.release_version = tp.release_version AND r.status = 'stale'))::int AS with_stale
           FROM (SELECT DISTINCT ON (tenant_id) tenant_id, release_version FROM tenant.tenant_pin
                  ORDER BY tenant_id, pinned_at DESC) tp`,
      ),
      pool.query(
        `SELECT a.name, count(*)::int AS approved_versions
           FROM shared.rule_version v JOIN shared.app_user a ON a.id = v.author_id
          WHERE v.review_state = 'approved' AND v.approved_at > now() - interval '30 days'
          GROUP BY a.name ORDER BY approved_versions DESC`,
      ),
      pool.query(
        `SELECT count(*)::int AS runs, count(*) FILTER (WHERE passed)::int AS green
           FROM shared.eval_run WHERE started_at > now() - interval '90 days'`,
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE triage_status = 'untriaged')::int AS untriaged,
                count(*) FILTER (WHERE triage_status = 'backlog')::int AS backlog
           FROM tenant.gap_log`,
      ),
      pool.query(`SELECT count(*)::int AS n FROM tenant.sla_event WHERE breach`),
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE ai_assisted)::int AS assisted
           FROM shared.rule_version WHERE review_state = 'approved'`,
      ),
    ]);
    return {
      fleet: fleet.rows[0],
      authoring_throughput_30d: throughput.rows,
      gate_pass_rate_90d: gate.rows[0],
      gaps: gaps.rows[0],
      sla_breaches: breaches.rows[0].n,
      // Moat-erosion visibility (FR-AI.6): how much of the approved corpus
      // began as agent drafts.
      ai_assisted_share: {
        approved_versions: assisted.rows[0].total,
        ai_assisted: assisted.rows[0].assisted,
      },
    };
  });

  // ── the tenant portal surface (FR-H.3) ──────────────────────
  app.get('/api/portal', async (req, reply) => {
    if (req.actor.role !== 'tenant_admin' || !req.actor.tenant_id) {
      return reply.code(403).send({ error: 'The portal is the tenant surface' });
    }
    const tid = req.actor.tenant_id;
    const [tenant, pin, claims, gaps, pulls] = await Promise.all([
      pool.query(`SELECT * FROM tenant.tenant WHERE id = $1`, [tid]),
      pool.query(
        `SELECT release_version, pinned_at FROM tenant.tenant_pin WHERE tenant_id = $1 ORDER BY pinned_at DESC LIMIT 1`,
        [tid],
      ),
      pool.query(
        `SELECT c.*, a.name AS author_name, r.name AS reviewer_name FROM tenant.claim c
           LEFT JOIN shared.app_user a ON a.id = c.author_user_id
           LEFT JOIN shared.app_user r ON r.id = c.reviewer_user_id
          WHERE c.tenant_id = $1 ORDER BY c.claim_id, c.version`,
        [tid],
      ),
      pool.query(`SELECT * FROM tenant.gap_log WHERE tenant_id = $1 ORDER BY logged_at DESC LIMIT 50`, [tid]),
      pool.query(`SELECT * FROM tenant.audit_pull WHERE tenant_id = $1 ORDER BY generated_at DESC LIMIT 50`, [tid]),
    ]);
    if (!tenant.rows.length) return reply.code(404).send({ error: 'Tenant gone' });

    const pinned = pin.rows[0]?.release_version ?? null;
    let stale_rules: string[] = [];
    let latest_published: string | null = null;
    if (pinned) {
      const { rows } = await pool.query(
        `SELECT DISTINCT r.rule_id FROM shared.release_rule_version p
           JOIN shared.rule_version rv ON rv.id = p.rule_version_id
           JOIN shared.rule r ON r.rule_id = rv.rule_id
          WHERE p.release_version = $1 AND r.status = 'stale' ORDER BY r.rule_id`,
        [pinned],
      );
      stale_rules = rows.map((r) => r.rule_id);
      const { rows: lp } = await pool.query(
        `SELECT version FROM shared.seam_release WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`,
      );
      latest_published = lp[0]?.version ?? null;
    }
    return {
      tenant: tenant.rows[0],
      pinned_version: pinned,
      latest_published,
      upgrade_available: !!(pinned && latest_published && pinned !== latest_published),
      stale_rules,
      claims: claims.rows,
      gaps: gaps.rows,
      audit_pulls: pulls.rows,
    };
  });
}
