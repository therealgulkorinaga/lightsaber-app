// Component F: tenant and deployment manager, plus the claim review flow
// (claims are substance: two-person rule, lint, provenance) and the portal
// data surface. Bundles compose at deploy: pinned release + the tenant's
// claims file, never anyone else's (FR-7.3).

import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import type pg from 'pg';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { canApproveSubstance, requireRole } from '../lib/auth.ts';
import { lintFields } from '@lightsaber/voice-lint';
import { exportRelease } from '../../export/exporter.ts';
import { bundleChecksum } from '../../seam/render.ts';
import {
  allocateClaimId,
  renderClaimsFile,
  tenantSlug,
  CLAIM_CATEGORIES,
  type ClaimCategory,
} from '../../seam/claims.ts';

const DEPLOYS_DIR = fileURLToPath(new URL('../../../var/deployments', import.meta.url));
const TEMPLATE_PATH = 'seam/_tenant/_template/approved-claims.md';

async function getTenant(client: pg.PoolClient | pg.Pool, id: string) {
  const { rows } = await client.query(`SELECT * FROM tenant.tenant WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function latestPin(client: pg.PoolClient | pg.Pool, tenantId: string) {
  const { rows } = await client.query(
    `SELECT release_version, pinned_at FROM tenant.tenant_pin WHERE tenant_id = $1
      ORDER BY pinned_at DESC LIMIT 1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

async function latestPublished(client: pg.PoolClient | pg.Pool): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT version FROM shared.seam_release WHERE status = 'published'
      ORDER BY published_at DESC LIMIT 1`,
  );
  return rows[0]?.version ?? null;
}

/** Diff two releases' pinned sets in changelog shape (FR-F.6). */
async function diffReleases(client: pg.PoolClient | pg.Pool, from: string, to: string) {
  const load = async (v: string) => {
    const { rows } = await client.query(
      `SELECT rv.rule_id, rv.id, rv.status_at_version FROM shared.release_rule_version p
         JOIN shared.rule_version rv ON rv.id = p.rule_version_id WHERE p.release_version = $1`,
      [v],
    );
    return new Map(rows.map((r) => [r.rule_id, r]));
  };
  const a = await load(from);
  const b = await load(to);
  const out: Record<string, string[]> = { added: [], changed: [], staled: [], reauthored: [], retired: [] };
  for (const [id, brow] of b) {
    const arow = a.get(id);
    if (!arow) out.added.push(id);
    else if (arow.id !== brow.id) {
      if (arow.status_at_version === 'stale' && brow.status_at_version === 'active') out.reauthored.push(id);
      else out.changed.push(id);
    }
    if (arow && arow.status_at_version !== 'stale' && brow.status_at_version === 'stale') out.staled.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) out.retired.push(id);
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

/** Tenant scope check: a tenant_admin only ever reaches their own tenant. */
function scopeOk(req: any, tenantId: string): boolean {
  if (req.actor.role !== 'tenant_admin') return true;
  return req.actor.tenant_id === tenantId;
}

export function tenantsRoutes(app: FastifyInstance) {
  // ── fleet (FR-F.5) ─────────────────────────────────────────
  app.get('/api/tenants', async (req, reply) => {
    if (req.actor.role === 'tenant_admin') return reply.code(403).send({ error: 'The fleet is a practice surface' });
    const { rows: tenants } = await pool.query(`SELECT * FROM tenant.tenant ORDER BY onboarded_at`);
    const published = await latestPublished(pool);
    const out = [];
    for (const t of tenants) {
      const pin = await latestPin(pool, t.id);
      const { rows: claims } = await pool.query(
        `SELECT count(*) FILTER (WHERE status = 'active')::int AS active,
                count(*) FILTER (WHERE review_state = 'in_review')::int AS pending
           FROM tenant.claim WHERE tenant_id = $1`,
        [t.id],
      );
      let staleCount = 0;
      if (pin) {
        const { rows } = await pool.query(
          `SELECT count(DISTINCT r.rule_id)::int AS n
             FROM shared.release_rule_version p
             JOIN shared.rule_version rv ON rv.id = p.rule_version_id
             JOIN shared.rule r ON r.rule_id = rv.rule_id
            WHERE p.release_version = $1 AND r.status = 'stale'`,
          [pin.release_version],
        );
        staleCount = rows[0].n;
      }
      const { rows: deploys } = await pool.query(
        `SELECT id, environment, deployed_at, checksum, release_version FROM tenant.deployment
          WHERE tenant_id = $1 AND active ORDER BY deployed_at DESC LIMIT 1`,
        [t.id],
      );
      out.push({
        ...t,
        pinned_version: pin?.release_version ?? null,
        stale_rules: staleCount,
        claims_active: claims[0].active,
        claims_pending: claims[0].pending,
        upgrade_available: !!(pin && published && pin.release_version !== published),
        latest_published: published,
        last_deployment: deploys[0] ?? null,
      });
    }
    return { tenants: out, latest_published: published };
  });

  // ── provision (FR-F.1) ─────────────────────────────────────
  app.post('/api/tenants', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    const { name, admin_name } = req.body as { name: string; admin_name?: string };
    if (!name?.trim()) return reply.code(422).send({ error: 'A tenant has a name' });
    return withTx(async (client) => {
      const {
        rows: [t],
      } = await client.query(`INSERT INTO tenant.tenant (name) VALUES ($1) RETURNING *`, [name.trim()]);
      let admin = null;
      if (admin_name?.trim()) {
        const {
          rows: [u],
        } = await client.query(
          `INSERT INTO shared.app_user (name, role, tenant_id) VALUES ($1, 'tenant_admin', $2) RETURNING id, name, role, tenant_id`,
          [admin_name.trim(), t.id],
        );
        admin = u;
      }
      await audit(client, { object_type: 'tenant', object_id: t.id, action: 'provisioned', actor_id: req.actor.id, detail: { name } });
      return { tenant: t, admin };
    });
  });

  // ── engagement (FR-F.2) ────────────────────────────────────
  app.put('/api/tenants/:id/engagement', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    const { id } = req.params as { id: string };
    const b = req.body as { jurisdictions?: string[]; regimes?: string[]; sla_tier?: string; line_flags?: any; start_date?: string };
    if (b.sla_tier && !['standard', 'priority', 'critical'].includes(b.sla_tier)) {
      return reply.code(422).send({ error: 'sla_tier is standard, priority or critical' });
    }
    return withTx(async (client) => {
      if (!(await getTenant(client, id))) return reply.code(404).send({ error: 'No such tenant' });
      await client.query(
        `INSERT INTO tenant.engagement (tenant_id, jurisdictions, regimes, sla_tier, line_flags, start_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id) DO UPDATE SET jurisdictions = EXCLUDED.jurisdictions, regimes = EXCLUDED.regimes,
           sla_tier = EXCLUDED.sla_tier, line_flags = EXCLUDED.line_flags, start_date = EXCLUDED.start_date`,
        [id, b.jurisdictions ?? [], b.regimes ?? [], b.sla_tier ?? 'standard',
         JSON.stringify(b.line_flags ?? { retainer: true, scoped: false, success: false }), b.start_date ?? null],
      );
      await audit(client, { object_type: 'tenant', object_id: id, action: 'engagement_scoped', actor_id: req.actor.id, detail: b as any });
      return { ok: true };
    });
  });

  // ── tenant detail (practice, or the tenant's own admin) ────
  app.get('/api/tenants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!scopeOk(req, id)) return reply.code(403).send({ error: 'Not your tenant' });
    const t = await getTenant(pool, id);
    if (!t) return reply.code(404).send({ error: 'No such tenant' });
    const pin = await latestPin(pool, id);
    const { rows: engagement } = await pool.query(`SELECT * FROM tenant.engagement WHERE tenant_id = $1`, [id]);
    const { rows: claims } = await pool.query(
      `SELECT c.*, a.name AS author_name, r.name AS reviewer_name FROM tenant.claim c
         LEFT JOIN shared.app_user a ON a.id = c.author_user_id
         LEFT JOIN shared.app_user r ON r.id = c.reviewer_user_id
        WHERE c.tenant_id = $1 ORDER BY c.claim_id, c.version`,
      [id],
    );
    const { rows: deployments } = await pool.query(
      `SELECT id, environment, deployed_at, checksum, release_version, active, revoked FROM tenant.deployment
        WHERE tenant_id = $1 ORDER BY deployed_at DESC`,
      [id],
    );
    const published = await latestPublished(pool);
    let upgrade_diff = null;
    if (pin && published && pin.release_version !== published) {
      upgrade_diff = await diffReleases(pool, pin.release_version, published);
    }
    let stale_rules: string[] = [];
    if (pin) {
      const { rows } = await pool.query(
        `SELECT DISTINCT r.rule_id FROM shared.release_rule_version p
           JOIN shared.rule_version rv ON rv.id = p.rule_version_id
           JOIN shared.rule r ON r.rule_id = rv.rule_id
          WHERE p.release_version = $1 AND r.status = 'stale' ORDER BY r.rule_id`,
        [pin.release_version],
      );
      stale_rules = rows.map((r) => r.rule_id);
    }
    return {
      tenant: t,
      engagement: engagement[0] ?? null,
      pinned_version: pin?.release_version ?? null,
      latest_published: published,
      upgrade_diff,
      stale_rules,
      claims,
      deployments,
    };
  });

  // ── claims: draft / edit / submit / approve / return (FR-F.3) ──
  app.post('/api/tenants/:id/claims', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!scopeOk(req, id)) return reply.code(403).send({ error: 'Not your tenant' });
    if (req.actor.role === 'analyst') return reply.code(403).send({ error: 'Substance is authored by the specialists or the adopter admin' });
    const b = req.body as { title: string; statement: string; category: ClaimCategory; evidence?: string; review_date?: string };
    if (!b?.title?.trim() || !b?.statement?.trim()) return reply.code(422).send({ error: 'A claim is one checkable sentence with a title' });
    if (!CLAIM_CATEGORIES[b.category]) return reply.code(422).send({ error: `category is one of: ${Object.keys(CLAIM_CATEGORIES).join(', ')}` });
    return withTx(async (client) => {
      if (!(await getTenant(client, id))) return reply.code(404).send({ error: 'No such tenant' });
      const { rows: existing } = await client.query(`SELECT DISTINCT claim_id FROM tenant.claim WHERE tenant_id = $1`, [id]);
      const claim_id = allocateClaimId(b.category, existing.map((r) => r.claim_id));
      const {
        rows: [c],
      } = await client.query(
        `INSERT INTO tenant.claim (claim_id, tenant_id, version, title, statement, category, evidence, review_date, status, review_state, author_user_id)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'draft', 'draft', $8) RETURNING *`,
        [claim_id, id, b.title.trim(), b.statement.trim(), b.category, b.evidence ?? null, b.review_date ?? null, req.actor.id],
      );
      await audit(client, { object_type: 'claim', object_id: `${id}:${claim_id}`, action: 'draft_created', actor_id: req.actor.id, detail: {} });
      return { claim: c };
    });
  });

  app.put('/api/tenants/:id/claims/:claimId', async (req, reply) => {
    const { id, claimId } = req.params as { id: string; claimId: string };
    if (!scopeOk(req, id)) return reply.code(403).send({ error: 'Not your tenant' });
    const b = req.body as { title?: string; statement?: string; evidence?: string; review_date?: string };
    return withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM tenant.claim WHERE tenant_id = $1 AND claim_id = $2 ORDER BY version DESC LIMIT 1`,
        [id, claimId],
      );
      const c = rows[0];
      if (!c) return reply.code(404).send({ error: 'No such claim' });
      if (c.status === 'retired') return reply.code(422).send({ error: 'Retired is terminal; author a new claim' });
      // Editing an approved claim appends a new draft version (5.5).
      if (c.review_state === 'approved') {
        const {
          rows: [nv],
        } = await client.query(
          `INSERT INTO tenant.claim (claim_id, tenant_id, version, title, statement, category, evidence, review_date, status, review_state, author_user_id, change_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 'draft', $9, $10) RETURNING *`,
          [claimId, id, c.version + 1, b.title ?? c.title, b.statement ?? c.statement, c.category,
           b.evidence ?? c.evidence, b.review_date ?? c.review_date, req.actor.id, (b as any).change_note ?? null],
        );
        await audit(client, { object_type: 'claim', object_id: `${id}:${claimId}`, action: 'new_version_drafted', actor_id: req.actor.id, detail: { version: nv.version } });
        return { claim: nv };
      }
      if (!['draft', 'returned'].includes(c.review_state)) return reply.code(409).send({ error: 'Only a draft is editable' });
      if (c.author_user_id !== req.actor.id) return reply.code(403).send({ error: 'Only the author edits their draft' });
      await client.query(
        `UPDATE tenant.claim SET title = $1, statement = $2, evidence = $3, review_date = $4, review_state = 'draft'
          WHERE tenant_id = $5 AND claim_id = $6 AND version = $7`,
        [b.title ?? c.title, b.statement ?? c.statement, b.evidence ?? c.evidence, b.review_date ?? c.review_date, id, claimId, c.version],
      );
      await audit(client, { object_type: 'claim', object_id: `${id}:${claimId}`, action: 'draft_saved', actor_id: req.actor.id, detail: {} });
      return { ok: true };
    });
  });

  app.post('/api/tenants/:id/claims/:claimId/submit', async (req, reply) => {
    const { id, claimId } = req.params as { id: string; claimId: string };
    if (!scopeOk(req, id)) return reply.code(403).send({ error: 'Not your tenant' });
    return withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM tenant.claim WHERE tenant_id = $1 AND claim_id = $2 ORDER BY version DESC LIMIT 1`,
        [id, claimId],
      );
      const c = rows[0];
      if (!c || !['draft', 'returned'].includes(c.review_state)) return reply.code(409).send({ error: 'No submittable draft' });
      if (c.author_user_id !== req.actor.id) return reply.code(403).send({ error: 'Only the author submits their draft' });
      // Voice lint blocks at submission, like any substance (FR-9.4).
      const hits = lintFields({ title: c.title, statement: c.statement, evidence: c.evidence ?? '' });
      if (hits.length) {
        return reply.code(422).send({
          error: 'Submission blocked by voice lint',
          findings: hits.map((h: any) => ({ level: 'block', code: h.findings[0].type, field: h.field, message: `${h.field}: ${h.findings.map((f: any) => (f.type === 'em_dash' ? 'em dash' : `"${f.word}"`)).join(', ')}` })),
        });
      }
      if (!c.evidence?.trim()) return reply.code(422).send({ error: 'A claim without evidence is not ready (template authoring rule 2)' });
      await client.query(
        `UPDATE tenant.claim SET review_state = 'in_review', status = 'in_review', submitted_at = now()
          WHERE tenant_id = $1 AND claim_id = $2 AND version = $3`,
        [id, claimId, c.version],
      );
      await audit(client, { object_type: 'claim', object_id: `${id}:${claimId}`, action: 'submitted_for_review', actor_id: req.actor.id, detail: {} });
      return { ok: true };
    });
  });

  app.post('/api/tenants/:id/claims/:claimId/approve', async (req, reply) => {
    const { id, claimId } = req.params as { id: string; claimId: string };
    if (!canApproveSubstance(req.actor)) return reply.code(403).send({ error: 'Substance approval needs a qualified reviewer' });
    return withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM tenant.claim WHERE tenant_id = $1 AND claim_id = $2 ORDER BY version DESC LIMIT 1`,
        [id, claimId],
      );
      const c = rows[0];
      if (!c || c.review_state !== 'in_review') return reply.code(409).send({ error: 'No claim in review' });
      if (c.author_user_id === req.actor.id) return reply.code(403).send({ error: 'The author of a claim cannot be its reviewer' });
      await client.query(
        `UPDATE tenant.claim SET review_state = 'approved', status = 'active', reviewer_user_id = $1,
                approved_by = (SELECT name || ', ' || role FROM shared.app_user WHERE id = $1), approved_at = now()
          WHERE tenant_id = $2 AND claim_id = $3 AND version = $4`,
        [req.actor.id, id, claimId, c.version],
      );
      await audit(client, { object_type: 'claim', object_id: `${id}:${claimId}`, action: 'approved', actor_id: req.actor.id, detail: { version: c.version } });
      return { ok: true };
    });
  });

  app.post('/api/tenants/:id/claims/:claimId/return', async (req, reply) => {
    const { id, claimId } = req.params as { id: string; claimId: string };
    if (!canApproveSubstance(req.actor)) return reply.code(403).send({ error: 'Reviewers only' });
    const { notes } = req.body as { notes: string };
    if (!notes?.trim()) return reply.code(422).send({ error: 'A return carries notes for the author' });
    return withTx(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM tenant.claim WHERE tenant_id = $1 AND claim_id = $2 ORDER BY version DESC LIMIT 1`,
        [id, claimId],
      );
      const c = rows[0];
      if (!c || c.review_state !== 'in_review') return reply.code(409).send({ error: 'No claim in review' });
      if (c.author_user_id === req.actor.id) return reply.code(403).send({ error: 'The author cannot review their own claim' });
      await client.query(
        `UPDATE tenant.claim SET review_state = 'returned', status = 'draft', reviewer_user_id = $1, review_notes = $2
          WHERE tenant_id = $3 AND claim_id = $4 AND version = $5`,
        [req.actor.id, notes, id, claimId, c.version],
      );
      await audit(client, { object_type: 'claim', object_id: `${id}:${claimId}`, action: 'returned_with_notes', actor_id: req.actor.id, detail: { notes } });
      return { ok: true };
    });
  });

  app.post('/api/tenants/:id/claims/:claimId/retire', async (req, reply) => {
    const { id, claimId } = req.params as { id: string; claimId: string };
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    return withTx(async (client) => {
      const { rows } = await client.query(
        `UPDATE tenant.claim SET status = 'retired' WHERE tenant_id = $1 AND claim_id = $2 AND status IN ('active', 'stale')
         RETURNING version`,
        [id, claimId],
      );
      if (!rows.length) return reply.code(422).send({ error: 'Only an active or stale claim retires' });
      await audit(client, { object_type: 'claim', object_id: `${id}:${claimId}`, action: 'retired', actor_id: req.actor.id, detail: {} });
      return { ok: true };
    });
  });

  // ── pin and deploy (FR-F.4) ────────────────────────────────
  async function performDeploy(client: pg.PoolClient, tenant: any, release: string, environment: string, actorId: string) {
    const { rows: rel } = await client.query(`SELECT status FROM shared.seam_release WHERE version = $1`, [release]);
    if (!rel.length || !['published', 'deprecated'].includes(rel[0].status)) {
      throw Object.assign(new Error(`Only a published release deploys; ${release} is ${rel[0]?.status ?? 'unknown'}`), { statusCode: 422 });
    }

    const files = await exportRelease(client, release);
    const template = files.get(TEMPLATE_PATH);
    if (!template) throw new Error('Release export lacks the claims template');

    const { rows: claims } = await client.query(
      `SELECT DISTINCT ON (claim_id) * FROM tenant.claim WHERE tenant_id = $1 ORDER BY claim_id, version DESC`,
      [tenant.id],
    );
    const slug = tenantSlug(tenant.name);
    files.set(`seam/_tenant/${slug}/approved-claims.md`, renderClaimsFile(template, tenant.name, claims as any));

    // FR-7.3, asserted on every deploy: exactly one tenant directory beyond
    // the template, and it is this tenant's.
    const tenantDirs = [...files.keys()].filter((p) => p.startsWith('seam/_tenant/') && !p.startsWith('seam/_tenant/_template/'));
    if (tenantDirs.length !== 1 || !tenantDirs[0].startsWith(`seam/_tenant/${slug}/`)) {
      throw new Error(`Bundle claim isolation violated: ${tenantDirs.join(', ')}`);
    }

    const checksum = bundleChecksum(files);
    const deploy_key = randomBytes(24).toString('hex');
    const outDir = path.join(DEPLOYS_DIR, slug, release);
    for (const [rel_, content] of files) {
      const target = path.join(outDir, rel_);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
    }

    await client.query(`UPDATE tenant.deployment SET active = false WHERE tenant_id = $1`, [tenant.id]);
    const {
      rows: [dep],
    } = await client.query(
      `INSERT INTO tenant.deployment (tenant_id, environment, bundle_uri, deploy_key, checksum, release_version, active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, environment, deployed_at, checksum, release_version`,
      [tenant.id, environment, outDir, deploy_key, checksum, release],
    );
    await client.query(`INSERT INTO tenant.tenant_pin (tenant_id, release_version) VALUES ($1, $2)`, [tenant.id, release]);
    await audit(client, { object_type: 'tenant', object_id: tenant.id, action: 'deployed', actor_id: actorId, detail: { release, checksum, deployment_id: dep.id } });
    return { deployment: dep, deploy_key, checksum, files: [...files.keys()].sort() };
  }

  app.post('/api/tenants/:id/deploy', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead', 'analyst'], reply)) return;
    const { id } = req.params as { id: string };
    const { release, environment } = req.body as { release: string; environment?: string };
    return withTx(async (client) => {
      const t = await getTenant(client, id);
      if (!t) return reply.code(404).send({ error: 'No such tenant' });
      return performDeploy(client, t, release, environment ?? 'production', req.actor.id);
    });
  });

  // ── upgrade (FR-F.6) ───────────────────────────────────────
  app.get('/api/tenants/:id/upgrade-diff', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!scopeOk(req, id)) return reply.code(403).send({ error: 'Not your tenant' });
    const pin = await latestPin(pool, id);
    const published = await latestPublished(pool);
    if (!pin || !published) return reply.code(422).send({ error: 'Tenant is not pinned, or nothing is published' });
    if (pin.release_version === published) return { up_to_date: true, version: published };
    return { from: pin.release_version, to: published, diff: await diffReleases(pool, pin.release_version, published) };
  });

  app.post('/api/tenants/:id/upgrade', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    const { id } = req.params as { id: string };
    return withTx(async (client) => {
      const t = await getTenant(client, id);
      if (!t) return reply.code(404).send({ error: 'No such tenant' });
      const pin = await latestPin(client, id);
      const published = await latestPublished(client);
      if (!pin || !published || pin.release_version === published) {
        return reply.code(422).send({ error: 'Nothing to upgrade to' });
      }
      const diff = await diffReleases(client, pin.release_version, published);
      const deployed = await performDeploy(client, t, published, 'production', req.actor.id);
      // Scoped-authoring billing line: an upgrade that delivers added coverage (FR-H.2).
      if (diff.added.length) {
        await client.query(
          `INSERT INTO tenant.billing_event (tenant_id, line, trigger_ref) VALUES ($1, 'scoped', $2)`,
          [id, `upgrade ${pin.release_version} -> ${published}: +${diff.added.length} rules`],
        );
      }
      await audit(client, { object_type: 'tenant', object_id: id, action: 'upgraded', actor_id: req.actor.id, detail: { from: pin.release_version, to: published, diff } });
      return { from: pin.release_version, to: published, diff, deployment: deployed.deployment, deploy_key: deployed.deploy_key };
    });
  });
}
