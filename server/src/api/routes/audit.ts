// Component G: provenance, audit and defensibility.

import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { renderRuleBlock } from '../../seam/render.ts';
import { RULE_ID_SCAN_RE } from '../../seam/parse.ts';

const NOT_LEGAL_ADVICE =
  'This report frames how a buyer’s compliance function reads the named regimes in a buying decision. It is not legal advice.';

export function auditRoutes(app: FastifyInstance) {
  // FR-9.1: who did what and when, for any object.
  app.get('/api/audit/log', async (req) => {
    const q = req.query as { object_type?: string; object_id?: string; limit?: string };
    const { rows } = await pool.query(
      `SELECT l.*, u.name AS actor_name FROM shared.audit_log l
         LEFT JOIN shared.app_user u ON u.id = l.actor_id
        WHERE ($1::text IS NULL OR l.object_type = $1)
          AND ($2::text IS NULL OR l.object_id = $2)
        ORDER BY l.at DESC LIMIT $3`,
      [q.object_type ?? null, q.object_id ?? null, Math.min(Number(q.limit ?? 200), 1000)],
    );
    return { log: rows };
  });

  // FR-G.1/G.2: full immutable history of a rule with provenance.
  app.get('/api/rules/:ruleId/history', async (req, reply) => {
    const { ruleId } = req.params as { ruleId: string };
    const { rows } = await pool.query(
      `SELECT v.*, a.name AS author_name, r2.name AS reviewer_name,
              (SELECT array_agg(p.release_version ORDER BY p.release_version)
                 FROM shared.release_rule_version p WHERE p.rule_version_id = v.id) AS in_releases
         FROM shared.rule_version v
         LEFT JOIN shared.app_user a ON a.id = v.author_id
         LEFT JOIN shared.app_user r2 ON r2.id = v.reviewer_id
        WHERE v.rule_id = $1 ORDER BY v.created_at`,
      [ruleId],
    );
    if (!rows.length) return reply.code(404).send({ error: `No rule ${ruleId}` });
    return { rule_id: ruleId, versions: rows };
  });

  // FR-G.4: the defensibility report. Given an artifact reference and the
  // seam version it cited, reconstruct the exact rule text, authority and
  // status live in that version, reading the release pins, never live rules.
  app.post('/api/defensibility', async (req, reply) => {
    const body = req.body as {
      artifact_ref: string;
      release_version: string;
      artifact_text?: string;
      rule_ids?: string[];
      tenant_id?: string;
      deal_closed?: boolean;
    };
    if (!body?.artifact_ref || !body?.release_version) {
      return reply.code(422).send({ error: 'artifact_ref and release_version are required' });
    }
    return withTx(async (client) => {
      const { rows: rel } = await client.query(
        `SELECT version, status, published_at FROM shared.seam_release WHERE version = $1`,
        [body.release_version],
      );
      if (!rel.length) return reply.code(404).send({ error: `No release ${body.release_version}` });
      if (!['published', 'deprecated'].includes(rel[0].status)) {
        return reply.code(422).send({ error: `Release ${body.release_version} was never published; an artifact cannot have cited it` });
      }

      // Rule IDs the artifact relied on: supplied explicitly, or scanned from its text.
      const ruleIds = body.rule_ids?.length
        ? [...new Set(body.rule_ids)]
        : [...new Set([...(body.artifact_text ?? '').matchAll(RULE_ID_SCAN_RE)].map((m) => m[0]))];
      if (!ruleIds.length) {
        return reply.code(422).send({ error: 'Supply rule_ids or artifact_text carrying the cited rule IDs' });
      }

      const { rows: pinned } = await client.query(
        `SELECT r.rule_id, r.kind, r.regime, r.scope, v.*, a.name AS author_name, rv.name AS reviewer_name,
                COALESCE(p.status_override, v.status_at_version) AS status_at_version
           FROM shared.release_rule_version p
           JOIN shared.rule_version v ON v.id = p.rule_version_id
           JOIN shared.rule r ON r.rule_id = v.rule_id
           LEFT JOIN shared.app_user a ON a.id = v.author_id
           LEFT JOIN shared.app_user rv ON rv.id = v.reviewer_id
          WHERE p.release_version = $1 AND v.rule_id = ANY($2)`,
        [body.release_version, ruleIds],
      );
      const byId = new Map(pinned.map((p) => [p.rule_id, p]));

      const entries = ruleIds.map((id) => {
        const p = byId.get(id);
        if (!p) {
          return {
            rule_id: id,
            resolved: false,
            note: `${id} was not part of seam ${body.release_version}; if the artifact asserted on it, that assertion was ungrounded`,
          };
        }
        return {
          rule_id: id,
          resolved: true,
          status_at_version: p.status_at_version,
          staleness_warning:
            p.status_at_version === 'stale'
              ? 'This rule was stale in the cited version; the engine may cite it only with an explicit staleness warning.'
              : null,
          title: p.title,
          rule_text: renderRuleBlock({
            rule_id: p.rule_id, kind: p.kind, regime: p.regime, scope: p.scope, title: p.title,
            semver_at_author: p.semver_at_author, version_annotation: p.version_annotation,
            status_at_version: p.status_at_version, jurisdiction_tags: p.jurisdiction_tags,
            statement: p.statement, buyer_reading: p.buyer_reading, authority_summary: p.authority_summary,
            applicability: p.applicability, movement_note: p.movement_note, kind_fields: p.kind_fields,
          }),
          authority: p.authority_summary,
          provenance: {
            semver: p.semver_at_author,
            author: p.author_name,
            reviewer: p.reviewer_name,
            approved_at: p.approved_at,
            change_note: p.change_note,
            content_hash: p.content_hash,
            // FR-AI.6: a human wrote this from scratch, or a human accepted it
            // from an assistant draft. The report shows which.
            authorship: p.ai_assisted ? 'agent-drafted, human-verified and accepted' : 'human-authored',
          },
        };
      });

      const report = {
        artifact_ref: body.artifact_ref,
        cited_release: {
          version: rel[0].version,
          status: rel[0].status,
          published_at: rel[0].published_at,
        },
        generated_at: new Date().toISOString(),
        rules: entries,
        boundary: NOT_LEGAL_ADVICE,
      };
      // FR-X.1: every report records an audit pull. Tenant-scoped when pulled
      // by a tenant admin or for a named tenant; practice-scoped otherwise.
      const tenantId = req.actor.role === 'tenant_admin' ? (req.actor as any).tenant_id : (body.tenant_id ?? null);
      const dealClosed = body.deal_closed === true;
      await client.query(
        `INSERT INTO tenant.audit_pull (tenant_id, artifact_ref, cited_release_version, requested_by, rule_ids, deal_closed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, body.artifact_ref, body.release_version, req.actor.id, ruleIds, dealClosed],
      );
      // Success line (FR-H.2): the tenant reports the close.
      if (tenantId && dealClosed) {
        await client.query(
          `INSERT INTO tenant.billing_event (tenant_id, line, trigger_ref) VALUES ($1, 'success', $2)`,
          [tenantId, `audit pull ${body.artifact_ref} @ ${body.release_version}`],
        );
      }
      await audit(pool, {
        object_type: 'defensibility_report',
        object_id: body.artifact_ref,
        action: 'generated',
        actor_id: req.actor.id,
        detail: { release_version: body.release_version, rule_ids: ruleIds, tenant_id: tenantId, deal_closed: dealClosed },
      });
      return report;
    });
  });

}
