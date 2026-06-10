// Component E: candidate assembly, the gate, publish, bundle export.

import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { requireRole } from '../lib/auth.ts';
import { runGate } from '../../gate/gate.ts';
import { exportRelease, writeBundle } from '../../export/exporter.ts';
import { bundleChecksum } from '../../seam/render.ts';

const EXPORTS_DIR = fileURLToPath(new URL('../../../var/exports', import.meta.url));

function bumpSemver(base: string, bump: 'major' | 'minor' | 'patch'): string {
  const [maj, min, pat] = base.split('.').map(Number);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

async function latestPublished(client: any): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT version FROM shared.seam_release WHERE status IN ('published', 'deprecated')
      ORDER BY published_at DESC LIMIT 1`,
  );
  return rows[0]?.version ?? null;
}

export function releasesRoutes(app: FastifyInstance) {
  // The eval suite is part of the candidate (FR-E.1); editing it is recorded.
  app.get('/api/eval-cases', async () => {
    const { rows } = await pool.query(`SELECT * FROM shared.eval_case ORDER BY id`);
    return { cases: rows };
  });

  app.put('/api/eval-cases/:id', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead', 'analyst'], reply)) return;
    const id = Number((req.params as any).id);
    const b = req.body as { prompt?: string; expected_output?: string; assertions?: any[]; jurisdiction_scope?: string[] };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM shared.eval_case WHERE id = $1`, [id]);
      if (!rows.length) return reply.code(404).send({ error: `No eval case ${id}` });
      const cur = rows[0];
      await client.query(
        `UPDATE shared.eval_case SET prompt=$1, expected_output=$2, assertions=$3, jurisdiction_scope=$4, created_by=$5 WHERE id=$6`,
        [
          b.prompt ?? cur.prompt,
          b.expected_output ?? cur.expected_output,
          JSON.stringify(b.assertions ?? cur.assertions),
          b.jurisdiction_scope ?? cur.jurisdiction_scope,
          req.actor.id, // eval authorship is human by construction (FR-AI.6)
          id,
        ],
      );
      await audit(client, { object_type: 'eval_case', object_id: String(id), action: 'updated', actor_id: req.actor.id, detail: { before: cur, after: b } });
      return { ok: true };
    });
  });

  app.post('/api/eval-cases', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead', 'analyst'], reply)) return;
    const b = req.body as { prompt: string; expected_output: string; assertions: any[]; jurisdiction_scope?: string[] };
    if (!b?.prompt || !b?.expected_output) return reply.code(422).send({ error: 'prompt and expected_output required' });
    return withTx(async (client) => {
      const {
        rows: [next],
      } = await client.query(`SELECT coalesce(max(id), 0) + 1 AS id FROM shared.eval_case`);
      await client.query(
        `INSERT INTO shared.eval_case (id, prompt, expected_output, assertions, jurisdiction_scope, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [next.id, b.prompt, b.expected_output, JSON.stringify(b.assertions ?? []), b.jurisdiction_scope ?? [], req.actor.id],
      );
      await audit(client, { object_type: 'eval_case', object_id: String(next.id), action: 'created', actor_id: req.actor.id, detail: {} });
      return { id: next.id };
    });
  });

  app.get('/api/releases', async () => {
    const { rows } = await pool.query(
      `SELECT sr.*, u.name AS released_by_name, er.passed AS eval_passed_flag, er.finished_at AS eval_finished_at,
              (SELECT count(*)::int FROM shared.release_rule_version p WHERE p.release_version = sr.version) AS pinned_versions,
              (SELECT checksum FROM shared.bundle_export be WHERE be.release_version = sr.version ORDER BY exported_at DESC LIMIT 1) AS checksum
         FROM shared.seam_release sr
         LEFT JOIN shared.app_user u ON u.id = sr.released_by
         LEFT JOIN shared.eval_run er ON er.id = sr.eval_run_id
        ORDER BY sr.created_at DESC`,
    );
    return { releases: rows };
  });

  app.get('/api/releases/:version', async (req, reply) => {
    const { version } = req.params as { version: string };
    const { rows } = await pool.query(`SELECT * FROM shared.seam_release WHERE version = $1`, [version]);
    if (!rows.length) return reply.code(404).send({ error: `No release ${version}` });
    const release = rows[0];
    const { rows: runs } = await pool.query(
      `SELECT * FROM shared.eval_run WHERE candidate_version = $1 ORDER BY started_at DESC`,
      [version],
    );
    const { rows: pins } = await pool.query(
      `SELECT v.rule_id, v.semver_at_author, v.status_at_version, r.kind
         FROM shared.release_rule_version p
         JOIN shared.rule_version v ON v.id = p.rule_version_id
         JOIN shared.rule r ON r.rule_id = v.rule_id
        WHERE p.release_version = $1 ORDER BY v.rule_id`,
      [version],
    );
    const { rows: exports_ } = await pool.query(
      `SELECT * FROM shared.bundle_export WHERE release_version = $1 ORDER BY exported_at DESC`,
      [version],
    );
    return { release, eval_runs: runs, pins, exports: exports_ };
  });

  // FR-E.1: assemble the staging set into a frozen candidate.
  app.post('/api/releases', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead', 'analyst'], reply)) return;
    const body = (req.body ?? {}) as { bump?: 'major' | 'minor' | 'patch'; version?: string };
    return withTx(async (client) => {
      const base = await latestPublished(client);
      let version = body.version ?? bumpSemver(base ?? '0.0.0', body.bump ?? 'minor');
      if (!body.version) {
        // A failed candidate burns its number; keep bumping past taken versions.
        for (;;) {
          const { rows } = await client.query(`SELECT 1 FROM shared.seam_release WHERE version = $1`, [version]);
          if (!rows.length) break;
          version = bumpSemver(version, body.bump ?? 'minor');
        }
      }
      const { rows: exists } = await client.query(`SELECT 1 FROM shared.seam_release WHERE version = $1`, [version]);
      if (exists.length) return reply.code(409).send({ error: `Release ${version} already exists` });

      // The staging set: the latest approved version of every non-retired rule.
      // A rule the watch staled (and no approved re-author yet) pins with the
      // stale overlay so the bundle renders it stale (FR-C.4).
      const { rows: staged } = await client.query(
        `SELECT DISTINCT ON (v.rule_id) v.id, v.rule_id, v.semver_at_author,
                CASE WHEN r.status = 'stale' AND v.status_at_version = 'active' THEN 'stale'
                     ELSE v.status_at_version END AS status_at_version,
                CASE WHEN r.status = 'stale' AND v.status_at_version = 'active' THEN 'stale'
                     ELSE NULL END AS status_override
           FROM shared.rule_version v
           JOIN shared.rule r ON r.rule_id = v.rule_id
          WHERE v.review_state = 'approved' AND r.status <> 'retired'
          ORDER BY v.rule_id, v.approved_at DESC`,
      );
      if (!staged.length) return reply.code(422).send({ error: 'Nothing approved to assemble' });

      // Changelog vs the base release (FR-E.7 AC). Re-authoring is detected
      // precisely: the staged version closed a re-authoring task (FR-C.5);
      // base-release comparison alone cannot see staleness that came and went
      // between releases.
      const { rows: closedBy } = await client.query(
        `SELECT DISTINCT closed_by_version_id FROM shared.reauthor_task WHERE closed_by_version_id IS NOT NULL`,
      );
      const reauthorVersionIds = new Set(closedBy.map((r) => r.closed_by_version_id));
      let changelog: Record<string, string[]> = { added: [], changed: [], staled: [], reauthored: [], retired: [] };
      if (base) {
        const { rows: basePins } = await client.query(
          `SELECT v.rule_id, v.id, COALESCE(p.status_override, v.status_at_version) AS status_at_version
             FROM shared.release_rule_version p
             JOIN shared.rule_version v ON v.id = p.rule_version_id WHERE p.release_version = $1`,
          [base],
        );
        const baseById = new Map(basePins.map((b) => [b.rule_id, b]));
        const stagedIds = new Set(staged.map((s) => s.rule_id));
        for (const s of staged) {
          const prior = baseById.get(s.rule_id);
          if (!prior) changelog.added.push(s.rule_id);
          else if (prior.id !== s.id) {
            if (reauthorVersionIds.has(s.id) || (prior.status_at_version === 'stale' && s.status_at_version === 'active')) {
              changelog.reauthored.push(s.rule_id);
            } else {
              changelog.changed.push(s.rule_id);
            }
          }
          if (prior && prior.status_at_version !== 'stale' && s.status_at_version === 'stale') changelog.staled.push(s.rule_id);
        }
        for (const b of basePins) if (!stagedIds.has(b.rule_id)) changelog.retired.push(b.rule_id);
        for (const k of Object.keys(changelog)) changelog[k].sort();
      } else {
        changelog.added = staged.map((s) => s.rule_id).sort();
      }

      await client.query(
        `INSERT INTO shared.seam_release (version, base_version, assembled_at, released_by, changelog, status)
         VALUES ($1, $2, now(), $3, $4, 'draft')`,
        [version, base, req.actor.id, JSON.stringify(changelog)],
      );
      for (const s of staged) {
        await client.query(
          `INSERT INTO shared.release_rule_version (release_version, rule_version_id, status_override) VALUES ($1, $2, $3)`,
          [version, s.id, s.status_override],
        );
      }

      // Pin the document/block state.
      const { rows: fileRows } = await client.query(`SELECT file_path, kind FROM shared.seam_file`);
      for (const f of fileRows) {
        if (f.kind === 'evals') continue;
        const { rows: sectionRows } = await client.query(
          `SELECT id, heading, contents_label FROM shared.seam_section WHERE file_path = $1 ORDER BY position`,
          [f.file_path],
        );
        const sectionIndex = new Map(sectionRows.map((s, i) => [s.id, i]));
        const { rows: blockRows } = await client.query(
          `SELECT block_type, text_content, rule_id, section_id FROM shared.seam_block WHERE file_path = $1 ORDER BY position`,
          [f.file_path],
        );
        const snapshot = {
          sections: sectionRows.map((s) => ({ heading: s.heading, contents_label: s.contents_label })),
          blocks: blockRows.map((b) =>
            b.block_type === 'text'
              ? { type: 'text', text: b.text_content }
              : b.block_type === 'rule'
                ? { type: 'rule', rule_id: b.rule_id, section: sectionIndex.get(b.section_id) ?? null }
                : { type: 'contents' },
          ),
        };
        await client.query(
          `INSERT INTO shared.release_document (release_version, file_path, blocks) VALUES ($1, $2, $3)`,
          [version, f.file_path, JSON.stringify(snapshot)],
        );
      }

      // Pin the eval suite as it stands (FR-E.1).
      const { rows: evalRows } = await client.query(`SELECT * FROM shared.eval_case ORDER BY id`);
      for (const c of evalRows) {
        await client.query(
          `INSERT INTO shared.release_eval_case (release_version, eval_case_id, snapshot) VALUES ($1, $2, $3)`,
          [version, c.id, JSON.stringify({ id: c.id, prompt: c.prompt, expected_output: c.expected_output, files: c.files, assertions: c.assertions, jurisdiction_scope: c.jurisdiction_scope })],
        );
      }

      await client.query(`UPDATE shared.seam_release SET status = 'staged' WHERE version = $1`, [version]);
      await audit(client, { object_type: 'seam_release', object_id: version, action: 'candidate_assembled', actor_id: req.actor.id, detail: { base, pinned: staged.length, changelog } });
      return { version, base, pinned: staged.length, changelog };
    });
  });

  // Run the gate (FR-E.2 .. FR-E.6).
  app.post('/api/releases/:version/gate', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead', 'analyst', 'author', 'reviewer'], reply)) return;
    const { version } = req.params as { version: string };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM shared.seam_release WHERE version = $1`, [version]);
      if (!rows.length) return reply.code(404).send({ error: `No release ${version}` });
      const release = rows[0];
      if (!['staged', 'eval_passed', 'eval_failed'].includes(release.status)) {
        return reply.code(409).send({ error: `Release ${version} is ${release.status}; gate runs on a staged candidate` });
      }
      // Re-running after a previous outcome re-enters via the state machine.
      if (release.status === 'eval_failed') {
        await client.query(`UPDATE shared.seam_release SET status = 'draft' WHERE version = $1`, [version]);
        await client.query(`UPDATE shared.seam_release SET status = 'staged' WHERE version = $1`, [version]);
      }
      if (release.status !== 'eval_passed') {
        await client.query(`UPDATE shared.seam_release SET status = 'eval_running' WHERE version = $1`, [version]);
      }

      const result = await runGate(client, version, release.base_version);
      const {
        rows: [run],
      } = await client.query(
        `INSERT INTO shared.eval_run (candidate_version, runner, finished_at, passed, results)
         VALUES ($1, 'static', now(), $2, $3) RETURNING id`,
        [version, result.passed, JSON.stringify(result.checks)],
      );
      if (release.status !== 'eval_passed') {
        await client.query(
          `UPDATE shared.seam_release SET status = $1, eval_run_id = $2 WHERE version = $3`,
          [result.passed ? 'eval_passed' : 'eval_failed', run.id, version],
        );
      } else if (result.passed) {
        await client.query(`UPDATE shared.seam_release SET eval_run_id = $1 WHERE version = $2`, [run.id, version]);
      } else {
        // A previously green candidate that now fails re-blocks.
        await client.query(`UPDATE shared.seam_release SET status = 'eval_failed', eval_run_id = $1 WHERE version = $2`, [run.id, version]);
      }
      await audit(client, { object_type: 'seam_release', object_id: version, action: result.passed ? 'gate_passed' : 'gate_failed', actor_id: req.actor.id, detail: { eval_run_id: run.id } });
      return { version, passed: result.passed, checks: result.checks, eval_run_id: run.id };
    });
  });

  // Publish (FR-E.7). The DB trigger independently re-verifies the green run.
  app.post('/api/releases/:version/publish', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    const { version } = req.params as { version: string };
    return withTx(async (client) => {
      const { rows } = await client.query(`SELECT * FROM shared.seam_release WHERE version = $1`, [version]);
      if (!rows.length) return reply.code(404).send({ error: `No release ${version}` });
      if (rows[0].status !== 'eval_passed') {
        return reply.code(409).send({ error: `No publish path for a ${rows[0].status} candidate (FR-9.3)` });
      }
      await client.query(`UPDATE shared.seam_release SET status = 'published', released_by = $1 WHERE version = $2`, [req.actor.id, version]);

      // 5.1: approved versions in a published release become active.
      await client.query(
        `UPDATE shared.rule r SET status = 'active'
          FROM shared.release_rule_version p
          JOIN shared.rule_version v ON v.id = p.rule_version_id
         WHERE p.release_version = $1 AND v.rule_id = r.rule_id
           AND r.status = 'approved' AND v.status_at_version = 'active'`,
        [version],
      );

      // Services hooks (FR-H.1/H.2): a publish that re-authors rules closes the
      // republish SLA clock and emits the retainer line for every tenant whose
      // pinned version contained those rules.
      const {
        rows: [relRow],
      } = await client.query(`SELECT changelog FROM shared.seam_release WHERE version = $1`, [version]);
      const reauthored: string[] = relRow?.changelog?.reauthored ?? [];
      if (reauthored.length) {
        const { rows: affected } = await client.query(
          `SELECT DISTINCT ON (tp.tenant_id) tp.tenant_id
             FROM tenant.tenant_pin tp
             JOIN shared.release_rule_version p ON p.release_version = tp.release_version
             JOIN shared.rule_version rv ON rv.id = p.rule_version_id
            WHERE rv.rule_id = ANY($1)
            ORDER BY tp.tenant_id, tp.pinned_at DESC`,
          [reauthored],
        );
        for (const a of affected) {
          await client.query(
            `INSERT INTO tenant.billing_event (tenant_id, line, trigger_ref) VALUES ($1, 'retainer', $2)`,
            [a.tenant_id, `re-authored release ${version}: ${reauthored.join(', ')}`],
          );
        }
        // Close open SLA clocks whose watch items' rules are all re-authored.
        const { rows: windows } = await client.query(`SELECT value FROM shared.app_config WHERE key = 'sla_windows'`);
        const w = windows[0]?.value ?? {};
        const { rows: openSla } = await client.query(
          `SELECT s.id, s.tier, s.triggered_at, s.stale_flagged_at, s.watch_item_id FROM tenant.sla_event s
            WHERE s.republished_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM shared.reauthor_task t
                               WHERE t.watch_item_id = s.watch_item_id AND t.status = 'open')`,
        );
        for (const s of openSla) {
          const tier = w[s.tier] ?? w.standard ?? { stale_hours: 72, republish_days: 30 };
          const staleMs = new Date(s.stale_flagged_at).getTime() - new Date(s.triggered_at).getTime();
          const republishMs = Date.now() - new Date(s.triggered_at).getTime();
          const breach =
            staleMs > tier.stale_hours * 3_600_000 || republishMs > tier.republish_days * 86_400_000;
          await client.query(
            `UPDATE tenant.sla_event SET republished_at = now(), breach = $1 WHERE id = $2`,
            [breach, s.id],
          );
        }
      }

      // A backlog gap whose linked rule ships in this release closes (E3.6).
      const delivered: string[] = [
        ...(relRow?.changelog?.added ?? []),
        ...(relRow?.changelog?.changed ?? []),
        ...(relRow?.changelog?.reauthored ?? []),
      ];
      if (delivered.length) {
        await client.query(
          `UPDATE tenant.gap_log SET triage_status = 'closed'
            WHERE triage_status = 'in_authoring' AND linked_rule_id = ANY($1)`,
          [delivered],
        );
      }

      const files = await exportRelease(client, version);
      const outDir = path.join(EXPORTS_DIR, version);
      const checksum = await writeBundle(files, outDir);
      await client.query(
        `INSERT INTO shared.bundle_export (release_version, format, uri, checksum) VALUES ($1, 'skill-bundle', $2, $3)`,
        [version, outDir, checksum],
      );
      await audit(client, { object_type: 'seam_release', object_id: version, action: 'published', actor_id: req.actor.id, detail: { checksum, files: files.size } });
      return { version, status: 'published', checksum, files: [...files.keys()].sort() };
    });
  });

  // Reproduce a release's exact bundle (FR-G.3); deterministic (FR-9.6).
  app.get('/api/releases/:version/export', async (req, reply) => {
    const { version } = req.params as { version: string };
    try {
      const files = await exportRelease(pool, version);
      const checksum = bundleChecksum(files);
      const manifest = Object.fromEntries([...files.entries()].map(([p, c]) => [p, { bytes: Buffer.byteLength(c, 'utf8') }]));
      return { version, checksum, manifest, files: Object.fromEntries(files) };
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });
}
