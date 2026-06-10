// Components A and B: authoring workspace + review and approval.

import type { FastifyInstance } from 'fastify';
import { pool, withTx } from '../../db/pool.ts';
import { audit } from '../lib/audit.ts';
import { canApproveSubstance, requireRole } from '../lib/auth.ts';
import { validateDraft, type DraftInput, lintableFields, PROSPECT_FIELDS } from '../lib/validate.ts';
import { contentHash, renderRuleBlock, type RuleRender } from '../../seam/render.ts';
import { lintFields, BANNED_WORDS } from '@lightsaber/voice-lint';
import { closeReauthorTasks } from './watch.ts';
import type pg from 'pg';

const KIND_FILE: Record<string, string> = {
  regulatory: 'seam/regulatory-rules.md',
  icp: 'seam/icp-and-scoring.md',
  objection: 'seam/objection-corpus.md',
  messaging: 'seam/messaging.md',
};

function versionRowToRender(rule: any, v: any): RuleRender {
  return {
    rule_id: rule.rule_id,
    kind: rule.kind,
    regime: rule.regime,
    scope: rule.scope,
    title: v.title,
    semver_at_author: v.semver_at_author,
    version_annotation: v.version_annotation ?? '',
    status_at_version: v.status_at_version,
    jurisdiction_tags: v.jurisdiction_tags ?? [],
    statement: v.statement,
    buyer_reading: v.buyer_reading,
    authority_summary: v.authority_summary,
    applicability: v.applicability,
    movement_note: v.movement_note,
    kind_fields: v.kind_fields ?? {},
  };
}

/** Normalise editor input into version-row column values. */
function draftColumns(d: DraftInput) {
  const kf = { ...(d.kind_fields ?? {}) };
  delete kf.watch; // watch config arms a watch item; it is not render content
  if (d.kind === 'regulatory') {
    kf.inputs_raw ??= (d.inputs_required ?? []).join(', ') + '.';
    kf.movement_flag = d.movement_note != null && d.movement_note !== '';
  }
  return {
    title: d.title ?? '',
    statement: d.statement ?? null,
    buyer_reading: d.buyer_reading ?? null,
    authority_summary: d.authority_summary ?? null,
    applicability: d.applicability ?? null,
    inputs_required: d.inputs_required ?? [],
    jurisdiction_tags: d.jurisdiction_tags ?? [],
    kind_fields: kf,
    movement_note: d.movement_note || null,
  };
}

async function openVersion(client: pg.PoolClient | pg.Pool, ruleId: string) {
  const { rows } = await client.query(
    `SELECT * FROM shared.rule_version
      WHERE rule_id = $1 AND review_state IN ('draft', 'returned', 'in_review')
      ORDER BY created_at DESC LIMIT 1`,
    [ruleId],
  );
  return rows[0] ?? null;
}

async function getRule(client: pg.PoolClient | pg.Pool, ruleId: string) {
  const { rows } = await client.query(`SELECT * FROM shared.rule WHERE rule_id = $1`, [ruleId]);
  return rows[0] ?? null;
}

/** FR-A.9: a saved movement note arms (or re-arms) a watch item for the rule. */
async function armWatchItem(client: pg.PoolClient, ruleId: string, d: DraftInput, actorId: string) {
  const w = d.kind_fields?.watch;
  if (!d.movement_note || !w) return;
  const { rows: existing } = await client.query(
    `SELECT wi.id FROM shared.watch_item wi JOIN shared.watch_rule wr ON wr.watch_item_id = wi.id
      WHERE wr.rule_id = $1 AND wi.status = 'armed'`,
    [ruleId],
  );
  if (existing.length) {
    await client.query(
      `UPDATE shared.watch_item SET trigger_type=$1, trigger_date=$2, event_description=$3,
              reverify_date=$4, reverify_action=$5, last_checked_at=now() WHERE id=$6`,
      [w.trigger_type, w.trigger_date ?? null, w.event_description ?? null, w.reverify_date ?? null, d.movement_note, existing[0].id],
    );
  } else {
    const {
      rows: [item],
    } = await client.query(
      `INSERT INTO shared.watch_item (trigger_type, trigger_date, event_description, reverify_date, reverify_action, status, owner_id)
       VALUES ($1,$2,$3,$4,$5,'armed',$6) RETURNING id`,
      [w.trigger_type, w.trigger_date ?? null, w.event_description ?? null, w.reverify_date ?? null, d.movement_note, actorId],
    );
    await client.query(`INSERT INTO shared.watch_rule (watch_item_id, rule_id) VALUES ($1, $2)`, [item.id, ruleId]);
  }
}

/**
 * Place an approved rule into its seam file's block list so the live export
 * carries it. Regulatory rules land in the section sharing their primary
 * jurisdiction tag (else regime); ICP rules in Signals/Disqualifiers;
 * objection/messaging append at file end. Blocks are working state, so the
 * file's block list is rebuilt in-transaction.
 */
async function insertRuleBlock(client: pg.PoolClient, rule: any, version: any) {
  const filePath = KIND_FILE[rule.kind];
  const { rows: blocks } = await client.query(
    `SELECT * FROM shared.seam_block WHERE file_path = $1 ORDER BY position`,
    [filePath],
  );
  if (blocks.some((b) => b.rule_id === rule.rule_id)) return; // re-authored rule: block already present

  const { rows: ruleRows } = await client.query(
    `SELECT r.rule_id, r.kind, r.regime, b.section_id, v.jurisdiction_tags
       FROM shared.seam_block b JOIN shared.rule r ON r.rule_id = b.rule_id
       JOIN shared.rule_version v ON v.id = r.current_version_id
      WHERE b.file_path = $1 AND b.block_type = 'rule'
      ORDER BY b.position`,
    [filePath],
  );

  let targetSection: string | null = null;
  if (rule.kind === 'regulatory') {
    const primary = version.jurisdiction_tags?.[0];
    const sameTag = ruleRows.filter((r) => r.jurisdiction_tags?.[0] === primary);
    const sameRegime = ruleRows.filter((r) => r.regime === rule.regime);
    targetSection = sameTag.at(-1)?.section_id ?? sameRegime.at(-1)?.section_id ?? null;
    if (!targetSection) {
      throw Object.assign(
        new Error(
          `No section in ${filePath} covers jurisdiction ${primary} or regime ${rule.regime}; add the section first`,
        ),
        { statusCode: 422 },
      );
    }
  } else if (rule.kind === 'icp') {
    const isDq = !!version.kind_fields?.is_disqualifier;
    const peers = ruleRows.filter((r) => r.rule_id.startsWith('ICP-DQ-') === isDq);
    targetSection = peers.at(-1)?.section_id ?? null;
  }

  // Insert after the last rule block of the target section (or of the file).
  let insertAfter = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.block_type === 'rule' && (targetSection == null || b.section_id === targetSection)) {
      insertAfter = i;
    }
  }
  if (insertAfter === -1) insertAfter = blocks.length - 1;

  const newBlocks = [
    ...blocks.slice(0, insertAfter + 1),
    { block_type: 'text', text_content: '\n\n', rule_id: null, section_id: null },
    { block_type: 'rule', text_content: null, rule_id: rule.rule_id, section_id: targetSection },
    ...blocks.slice(insertAfter + 1),
  ];

  await client.query(`DELETE FROM shared.seam_block WHERE file_path = $1`, [filePath]);
  for (let i = 0; i < newBlocks.length; i++) {
    const b: any = newBlocks[i];
    await client.query(
      `INSERT INTO shared.seam_block (file_path, section_id, position, block_type, text_content, rule_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [filePath, b.section_id, i, b.block_type, b.text_content, b.rule_id],
    );
  }
}

// ID prefixes follow the corpus conventions: EU/UK instruments take their
// regime's prefix; layered local rules take their jurisdiction's.
const REGIME_PREFIX: Record<string, string> = {
  DORA: 'DORA',
  EU_AI_ACT: 'AIA',
  GDPR: 'GDPR',
  FCA: 'FCA',
  PRA: 'PRA',
  MiCA: 'MICA',
};
const JURISDICTION_PREFIX: Record<string, string> = {
  IE: 'IE',
  DE: 'DE',
  FR: 'FR',
  NL: 'NL',
  US: 'US',
  'US-NY': 'NY',
  'US-CA': 'CA',
  'US-TX': 'TX',
  'US-NYC': 'NYC',
  UK: 'UK',
};

// Prefixes that share one number sequence (NYC-AEDT-003 sits inside the NY run).
const PREFIX_FAMILY: Record<string, string[]> = {
  NY: ['NY', 'NYC'],
  NYC: ['NY', 'NYC'],
};

export function rulesRoutes(app: FastifyInstance) {
  // The system allocates rule IDs (FR-A.2); authors supply a topic, not an ID.
  // Numbering is sequential across the regime/jurisdiction family, the corpus
  // convention: DORA-TPR-001, DORA-REG-002, DORA-CON-003 ... next is -008.
  app.get('/api/rules/suggest-id', async (req, reply) => {
    const q = req.query as { kind?: string; regime?: string; jurisdiction?: string; topic?: string };
    const kind = q.kind ?? 'regulatory';

    if (kind !== 'regulatory') {
      const prefix = kind === 'icp' ? (q.topic === 'DQ' ? 'ICP-DQ' : 'ICP') : kind === 'objection' ? 'OBJ' : 'MSG';
      const { rows } = await pool.query(`SELECT rule_id FROM shared.rule WHERE rule_id ~ ('^' || $1 || '-[0-9]{3}$')`, [prefix]);
      const next = rows.reduce((mx, r) => Math.max(mx, Number(r.rule_id.slice(-3))), 0) + 1;
      return { rule_id: `${prefix}-${String(next).padStart(3, '0')}` };
    }

    const topic = (q.topic ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const base =
      q.regime === 'cross_regime'
        ? (JURISDICTION_PREFIX[q.jurisdiction ?? ''] ?? 'XRG')
        : (REGIME_PREFIX[q.regime ?? ''] ?? null);
    if (!base) return reply.code(422).send({ error: `No prefix convention for regime ${q.regime}` });
    if (base !== 'XRG' && (topic.length < 2 || topic.length > 6)) {
      return reply.code(422).send({ error: 'Supply a short topic code (2-6 letters), e.g. CON for contracts, OUT for outsourcing' });
    }

    const family = PREFIX_FAMILY[base] ?? [base];
    // Family-wide sequence: match PREFIX-TOPIC-NNN and bare PREFIX-NNN (XRG, UK-CTP style).
    const { rows } = await pool.query(
      `SELECT rule_id FROM shared.rule
        WHERE rule_id ~ ('^(' || $1 || ')(-[A-Z0-9]+)?-[0-9]{3}$')`,
      [family.join('|')],
    );
    const next = rows.reduce((mx, r) => Math.max(mx, Number(r.rule_id.slice(-3))), 0) + 1;
    const nnn = String(next).padStart(3, '0');
    return { rule_id: base === 'XRG' ? `XRG-${nnn}` : `${base}-${topic}-${nnn}` };
  });

  // Registry data for the editor.
  app.get('/api/meta', async () => {
    const [jur, regimes, users, policy] = await Promise.all([
      pool.query(`SELECT tag, parent_tag, layer_depth, display_name FROM shared.jurisdiction ORDER BY layer_depth, tag`),
      pool.query(`SELECT code, name, jurisdictions FROM shared.regime ORDER BY code`),
      pool.query(`SELECT id, name, role FROM shared.app_user WHERE status = 'active' ORDER BY name`),
      pool.query(`SELECT kind, requires_review, mandatory FROM shared.review_policy`),
    ]);
    return {
      jurisdictions: jur.rows,
      regimes: regimes.rows,
      users: users.rows,
      review_policy: policy.rows,
      prospect_fields: PROSPECT_FIELDS,
      banned_words: BANNED_WORDS,
    };
  });

  // Live lint for the editor (FR-A.5).
  app.post('/api/lint', async (req) => {
    const { fields } = req.body as { fields: Record<string, string> };
    return { findings: lintFields(fields ?? {}) };
  });

  // List rules. Draft privacy per FR-A.8: another author's never-approved
  // rule is invisible unless you are a reviewer or the practice lead.
  app.get('/api/rules', async (req) => {
    const q = req.query as { kind?: string; status?: string };
    const actor = req.actor;
    const privileged = ['reviewer', 'practice_lead'].includes(actor.role);
    const { rows } = await pool.query(
      `SELECT r.rule_id, r.kind, r.regime, r.scope, r.status,
              v.title, v.semver_at_author, v.status_at_version, v.jurisdiction_tags,
              v.review_state, v.author_id, v.reviewer_id, u.name AS author_name
         FROM shared.rule r
         LEFT JOIN shared.rule_version v ON v.id = r.current_version_id
         LEFT JOIN shared.app_user u ON u.id = v.author_id
        WHERE ($1::text IS NULL OR r.kind = $1)
          AND ($2::text IS NULL OR r.status = $2)
          AND (r.status <> 'draft' OR v.author_id = $3 OR $4)
        ORDER BY r.rule_id`,
      [q.kind ?? null, q.status ?? null, actor.id, privileged],
    );
    return { rules: rows };
  });

  app.get('/api/rules/:ruleId', async (req, reply) => {
    const { ruleId } = req.params as { ruleId: string };
    const rule = await getRule(pool, ruleId);
    if (!rule) return reply.code(404).send({ error: `No rule ${ruleId}` });

    const { rows: versions } = await pool.query(
      `SELECT v.*, a.name AS author_name, rv.name AS reviewer_name
         FROM shared.rule_version v
         LEFT JOIN shared.app_user a ON a.id = v.author_id
         LEFT JOIN shared.app_user rv ON rv.id = v.reviewer_id
        WHERE v.rule_id = $1 ORDER BY v.created_at`,
      [ruleId],
    );

    // FR-A.8 draft privacy.
    const privileged = ['reviewer', 'practice_lead'].includes(req.actor.role);
    const visible = versions.filter(
      (v) => v.review_state !== 'draft' || v.author_id === req.actor.id || privileged,
    );
    if (!visible.length) return reply.code(404).send({ error: `No rule ${ruleId}` });

    const { rows: sources } = await pool.query(
      `SELECT s.* FROM shared.source s WHERE s.rule_version_id = ANY($1)`,
      [visible.map((v) => v.id)],
    );
    const { rows: watch } = await pool.query(
      `SELECT wi.* FROM shared.watch_item wi JOIN shared.watch_rule wr ON wr.watch_item_id = wi.id
        WHERE wr.rule_id = $1`,
      [ruleId],
    );
    const { rows: overrides } = await pool.query(
      `SELECT * FROM shared.lint_override WHERE rule_version_id = ANY($1)`,
      [visible.map((v) => v.id)],
    );
    return { rule, versions: visible, sources, watch, lint_overrides: overrides };
  });

  // Create a new rule with its first draft version (FR-A.1, FR-A.2).
  app.post('/api/rules', async (req, reply) => {
    if (!requireRole(req.actor, ['author', 'reviewer', 'practice_lead'], reply)) return;
    const d = req.body as DraftInput;
    return withTx(async (client) => {
      const findings = await validateDraft(client, d, { isNewRule: true });
      const hard = findings.filter((f) => ['id_convention', 'id_taken', 'unknown_tag'].includes(f.code));
      if (hard.length) return reply.code(422).send({ error: 'Draft rejected', findings: hard });

      const cols = draftColumns(d);
      await client.query(
        `INSERT INTO shared.rule (rule_id, kind, regime, scope, status) VALUES ($1,$2,$3,'shared','draft')`,
        [d.rule_id, d.kind, d.regime ?? null],
      );
      const {
        rows: [v],
      } = await client.query(
        `INSERT INTO shared.rule_version
           (rule_id, semver_at_author, title, statement, buyer_reading, authority_summary,
            applicability, inputs_required, jurisdiction_tags, kind_fields, movement_note, author_id, ai_assisted)
         VALUES ($1,'1.0',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          d.rule_id, cols.title, cols.statement, cols.buyer_reading, cols.authority_summary,
          cols.applicability, cols.inputs_required, cols.jurisdiction_tags,
          JSON.stringify(cols.kind_fields), cols.movement_note, req.actor.id,
          (req.body as any).ai_assisted === true, // provenance: agent-drafted, human-accepted (FR-AI.6)
        ],
      );
      await client.query(`UPDATE shared.rule SET current_version_id = $1 WHERE rule_id = $2`, [v.id, d.rule_id]);
      for (const tag of cols.jurisdiction_tags) {
        await client.query(`INSERT INTO shared.rule_jurisdiction (rule_id, jurisdiction_tag) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [d.rule_id, tag]);
      }
      for (const s of d.sources ?? []) {
        await client.query(
          `INSERT INTO shared.source (rule_version_id, citation, source_type, url, retrieved_at) VALUES ($1,$2,$3,$4,$5)`,
          [v.id, s.citation, s.source_type, s.url ?? null, s.retrieved_at ?? null],
        );
      }
      await armWatchItem(client, d.rule_id, d, req.actor.id);
      await audit(client, { object_type: 'rule', object_id: d.rule_id, action: 'draft_created', actor_id: req.actor.id, detail: { version_id: v.id } });
      return { rule_id: d.rule_id, version: v, findings };
    });
  });

  // Open a new draft version of an existing rule (the edit path, FR-A.7).
  app.post('/api/rules/:ruleId/versions', async (req, reply) => {
    if (!requireRole(req.actor, ['author', 'reviewer', 'practice_lead'], reply)) return;
    const { ruleId } = req.params as { ruleId: string };
    return withTx(async (client) => {
      const rule = await getRule(client, ruleId);
      if (!rule) return reply.code(404).send({ error: `No rule ${ruleId}` });
      if (rule.status === 'retired') return reply.code(422).send({ error: `Retired is terminal for ${ruleId}; author a replacement under a new ID` });
      const open = await openVersion(client, ruleId);
      if (open) return reply.code(409).send({ error: `An open version already exists for ${ruleId}`, version: open });

      const {
        rows: [cur],
      } = await client.query(`SELECT * FROM shared.rule_version WHERE id = $1`, [rule.current_version_id]);
      const [maj, min] = cur.semver_at_author.split('.').map(Number);
      const nextSemver = `${maj}.${min + 1}`;
      const {
        rows: [v],
      } = await client.query(
        `INSERT INTO shared.rule_version
           (rule_id, semver_at_author, version_annotation, title, statement, buyer_reading, authority_summary,
            applicability, inputs_required, jurisdiction_tags, kind_fields, movement_note, status_at_version,
            author_id, supersedes_version_id)
         VALUES ($1,$2,'',$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13) RETURNING *`,
        [
          ruleId, nextSemver, cur.title, cur.statement, cur.buyer_reading, cur.authority_summary,
          cur.applicability, cur.inputs_required, cur.jurisdiction_tags, JSON.stringify(cur.kind_fields),
          cur.movement_note, req.actor.id, cur.id,
        ],
      );
      // carry sources forward
      await client.query(
        `INSERT INTO shared.source (rule_version_id, citation, source_type, url, retrieved_at)
         SELECT $1, citation, source_type, url, retrieved_at FROM shared.source WHERE rule_version_id = $2`,
        [v.id, cur.id],
      );
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'new_version_drafted', actor_id: req.actor.id, detail: { version_id: v.id, semver: nextSemver } });
      return { version: v };
    });
  });

  // Save the open draft (FR-A.1; lint advisory here, blocking at submit).
  app.put('/api/rules/:ruleId/draft', async (req, reply) => {
    const { ruleId } = req.params as { ruleId: string };
    const d = { ...(req.body as DraftInput), rule_id: ruleId };
    return withTx(async (client) => {
      const rule = await getRule(client, ruleId);
      if (!rule) return reply.code(404).send({ error: `No rule ${ruleId}` });
      const open = await openVersion(client, ruleId);
      if (!open) return reply.code(409).send({ error: 'No open version; create one first' });
      if (open.review_state === 'in_review') return reply.code(409).send({ error: 'Version is in review; return it before editing' });
      if (open.author_id !== req.actor.id) return reply.code(403).send({ error: 'Only the author edits their draft' });

      d.kind = rule.kind;
      const cols = draftColumns(d);
      const {
        rows: [v],
      } = await client.query(
        `UPDATE shared.rule_version SET
           title=$1, statement=$2, buyer_reading=$3, authority_summary=$4, applicability=$5,
           inputs_required=$6, jurisdiction_tags=$7, kind_fields=$8, movement_note=$9,
           change_note=$10, review_state='draft', review_notes = review_notes
         WHERE id=$11 RETURNING *`,
        [
          cols.title, cols.statement, cols.buyer_reading, cols.authority_summary, cols.applicability,
          cols.inputs_required, cols.jurisdiction_tags, JSON.stringify(cols.kind_fields), cols.movement_note,
          (req.body as any).change_note ?? open.change_note, open.id,
        ],
      );
      if (d.sources) {
        await client.query(`DELETE FROM shared.source WHERE rule_version_id = $1`, [open.id]);
        for (const s of d.sources) {
          await client.query(
            `INSERT INTO shared.source (rule_version_id, citation, source_type, url, retrieved_at) VALUES ($1,$2,$3,$4,$5)`,
            [open.id, s.citation, s.source_type, s.url ?? null, s.retrieved_at ?? null],
          );
        }
      }
      await armWatchItem(client, ruleId, d, req.actor.id);
      const findings = await validateDraft(client, d, { isNewRule: false });
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'draft_saved', actor_id: req.actor.id, detail: { version_id: open.id } });
      return { version: v, findings };
    });
  });

  // Tick a source as read (the anchoring control, FR-AI.6).
  app.post('/api/rules/:ruleId/sources/:sourceId/verify', async (req, reply) => {
    const { ruleId, sourceId } = req.params as { ruleId: string; sourceId: string };
    return withTx(async (client) => {
      const open = await openVersion(client, ruleId);
      if (!open) return reply.code(409).send({ error: 'No open version' });
      if (open.author_id !== req.actor.id) return reply.code(403).send({ error: 'The author verifies their own sources; that is the point' });
      const { rows } = await client.query(
        `UPDATE shared.source SET verified_by = $1, verified_at = now()
          WHERE id = $2 AND rule_version_id = $3 RETURNING citation`,
        [req.actor.id, sourceId, open.id],
      );
      if (!rows.length) return reply.code(404).send({ error: 'No such source on the open version' });
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'source_verified', actor_id: req.actor.id, detail: { source_id: sourceId, citation: rows[0].citation } });
      return { ok: true };
    });
  });

  // Record a lint override with its reason (FR-A.5 AC).
  app.post('/api/rules/:ruleId/lint-overrides', async (req, reply) => {
    const { ruleId } = req.params as { ruleId: string };
    const { field, word, reason } = req.body as { field: string; word: string; reason: string };
    if (!reason?.trim()) return reply.code(422).send({ error: 'An override carries a recorded reason' });
    return withTx(async (client) => {
      const open = await openVersion(client, ruleId);
      if (!open) return reply.code(409).send({ error: 'No open version' });
      if (open.author_id !== req.actor.id) return reply.code(403).send({ error: 'Only the author overrides their draft lint' });
      await client.query(
        `INSERT INTO shared.lint_override (rule_version_id, field, word, reason, recorded_by) VALUES ($1,$2,$3,$4,$5)`,
        [open.id, field, word, reason, req.actor.id],
      );
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'lint_override_recorded', actor_id: req.actor.id, detail: { field, word, reason } });
      return { ok: true };
    });
  });

  // Submit for review (FR-B.1). Validation is blocking here.
  app.post('/api/rules/:ruleId/submit', async (req, reply) => {
    const { ruleId } = req.params as { ruleId: string };
    return withTx(async (client) => {
      const rule = await getRule(client, ruleId);
      if (!rule) return reply.code(404).send({ error: `No rule ${ruleId}` });
      const open = await openVersion(client, ruleId);
      if (!open || !['draft', 'returned'].includes(open.review_state)) {
        return reply.code(409).send({ error: 'No submittable draft' });
      }
      if (open.author_id !== req.actor.id) return reply.code(403).send({ error: 'Only the author submits their draft' });

      const { rows: sources } = await client.query(`SELECT citation, source_type FROM shared.source WHERE rule_version_id = $1`, [open.id]);
      const { rows: overrideRows } = await client.query(`SELECT field, word FROM shared.lint_override WHERE rule_version_id = $1`, [open.id]);
      const { rows: armedWatch } = await client.query(
        `SELECT 1 FROM shared.watch_item wi JOIN shared.watch_rule wr ON wr.watch_item_id = wi.id
          WHERE wr.rule_id = $1 AND wi.status = 'armed'`,
        [ruleId],
      );
      const d: DraftInput = {
        rule_id: ruleId,
        kind: rule.kind,
        regime: rule.regime,
        title: open.title,
        statement: open.statement,
        buyer_reading: open.buyer_reading,
        authority_summary: open.authority_summary,
        applicability: open.applicability,
        inputs_required: open.inputs_required,
        jurisdiction_tags: open.jurisdiction_tags,
        kind_fields: open.kind_fields,
        movement_note: open.movement_note,
        sources: sources as any,
      };
      const findings = (
        await validateDraft(client, d, { isNewRule: false, overrides: overrideRows, armedWatch: armedWatch.length > 0 })
      ).filter((f) => f.level === 'block');
      if (findings.length) return reply.code(422).send({ error: 'Submission blocked', findings });

      // Anchoring control (FR-AI.6): an AI-assisted draft submits only after
      // its author has ticked every source as read. Acceptance is a
      // verification act, above all on the Authority.
      if (open.ai_assisted) {
        const { rows: unread } = await client.query(
          `SELECT citation FROM shared.source WHERE rule_version_id = $1 AND verified_by IS NULL`,
          [open.id],
        );
        if (unread.length) {
          return reply.code(422).send({
            error: 'This draft began as an assistant draft; tick each source as read before it goes for review',
            findings: unread.map((u) => ({ level: 'block', code: 'source_unverified', field: 'sources', message: `Unread: ${u.citation}` })),
          });
        }
      }

      // FR-A.7: an unchanged submission is a no-op. Compare content with the
      // version token normalised, or the semver bump alone would defeat it.
      if (open.supersedes_version_id) {
        const {
          rows: [prev],
        } = await client.query(`SELECT * FROM shared.rule_version WHERE id = $1`, [open.supersedes_version_id]);
        const normalised = (v: any) =>
          renderRuleBlock(versionRowToRender(rule, { ...v, semver_at_author: 'X', version_annotation: '' }));
        if (prev && normalised(prev) === normalised(open)) {
          return reply.code(422).send({ error: 'No change against the current active version; nothing to review' });
        }
      }

      const hash = contentHash(versionRowToRender(rule, open));
      await client.query(
        `UPDATE shared.rule_version SET review_state='in_review', submitted_at=now(), content_hash=$1 WHERE id=$2`,
        [hash, open.id],
      );
      if (rule.status === 'draft' || rule.status === 'returned') {
        await client.query(`UPDATE shared.rule SET status='in_review' WHERE rule_id=$1`, [ruleId]);
      }
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'submitted_for_review', actor_id: req.actor.id, detail: { version_id: open.id, content_hash: hash } });
      return { ok: true, content_hash: hash };
    });
  });

  // Approve (FR-B.2/B.3): a separate reviewer; recorded against the version.
  app.post('/api/rules/:ruleId/approve', async (req, reply) => {
    if (!canApproveSubstance(req.actor)) {
      return reply.code(403).send({ error: 'Substance approval needs a qualified reviewer; analysts and tenant admins cannot approve' });
    }
    const { ruleId } = req.params as { ruleId: string };
    return withTx(async (client) => {
      const rule = await getRule(client, ruleId);
      if (!rule) return reply.code(404).send({ error: `No rule ${ruleId}` });
      const open = await openVersion(client, ruleId);
      if (!open || open.review_state !== 'in_review') return reply.code(409).send({ error: 'No version in review' });
      if (open.author_id === req.actor.id) {
        return reply.code(403).send({ error: 'The author of a version cannot be its reviewer; substance takes a second pair of eyes' });
      }
      // Approval binds to the exact content reviewed (FR-B.4).
      const hash = contentHash(versionRowToRender(rule, open));
      if (hash !== open.content_hash) {
        return reply.code(409).send({ error: 'Content changed since submission; re-submit' });
      }
      await client.query(
        `UPDATE shared.rule_version SET review_state='approved', reviewer_id=$1, approved_at=now() WHERE id=$2`,
        [req.actor.id, open.id],
      );
      // A stale rule with an approved re-author returns to the staging path
      // (active on the next published release, 5.1 / FR-C.5).
      await client.query(
        `UPDATE shared.rule SET current_version_id=$1,
                status = CASE WHEN status IN ('draft','in_review','returned','stale') THEN 'approved' ELSE status END
          WHERE rule_id=$2`,
        [open.id, ruleId],
      );
      await closeReauthorTasks(client, ruleId, open.id, req.actor.id);
      // jurisdiction registry rows for querying
      await client.query(`DELETE FROM shared.rule_jurisdiction WHERE rule_id = $1`, [ruleId]);
      for (const tag of open.jurisdiction_tags ?? []) {
        await client.query(`INSERT INTO shared.rule_jurisdiction (rule_id, jurisdiction_tag) VALUES ($1,$2)`, [ruleId, tag]);
      }
      await insertRuleBlock(client, rule, open);
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'approved', actor_id: req.actor.id, detail: { version_id: open.id, content_hash: hash } });
      return { ok: true };
    });
  });

  // Return with notes (FR-B.2).
  app.post('/api/rules/:ruleId/return', async (req, reply) => {
    if (!canApproveSubstance(req.actor)) return reply.code(403).send({ error: 'Reviewers only' });
    const { ruleId } = req.params as { ruleId: string };
    const { notes } = req.body as { notes: string };
    if (!notes?.trim()) return reply.code(422).send({ error: 'A return carries notes for the author' });
    return withTx(async (client) => {
      const open = await openVersion(client, ruleId);
      if (!open || open.review_state !== 'in_review') return reply.code(409).send({ error: 'No version in review' });
      if (open.author_id === req.actor.id) return reply.code(403).send({ error: 'The author cannot review their own version' });
      await client.query(
        `UPDATE shared.rule_version SET review_state='returned', reviewer_id=$1, review_notes=$2 WHERE id=$3`,
        [req.actor.id, notes, open.id],
      );
      await client.query(`UPDATE shared.rule SET status = CASE WHEN status='in_review' THEN 'returned' ELSE status END WHERE rule_id=$1`, [ruleId]);
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'returned_with_notes', actor_id: req.actor.id, detail: { version_id: open.id, notes } });
      return { ok: true };
    });
  });

  // Retire (Practice Lead decision; recorded, never deleted; 5.1).
  app.post('/api/rules/:ruleId/retire', async (req, reply) => {
    if (!requireRole(req.actor, ['practice_lead'], reply)) return;
    const { ruleId } = req.params as { ruleId: string };
    const { reason } = req.body as { reason?: string };
    return withTx(async (client) => {
      const rule = await getRule(client, ruleId);
      if (!rule) return reply.code(404).send({ error: `No rule ${ruleId}` });
      if (!['active', 'stale', 'approved'].includes(rule.status)) {
        return reply.code(422).send({ error: `Only an active or stale rule retires; ${ruleId} is ${rule.status}` });
      }
      await client.query(`UPDATE shared.rule SET status='retired' WHERE rule_id=$1`, [ruleId]);
      await client.query(`DELETE FROM shared.seam_block WHERE rule_id = $1`, [ruleId]);
      await audit(client, { object_type: 'rule', object_id: ruleId, action: 'retired', actor_id: req.actor.id, detail: { reason: reason ?? null } });
      return { ok: true };
    });
  });

  // The review queue (Component B surface).
  app.get('/api/review-queue', async () => {
    const { rows } = await pool.query(
      `SELECT v.id AS version_id, v.rule_id, v.title, v.semver_at_author, v.review_state,
              v.submitted_at, v.approved_at, v.author_id, a.name AS author_name,
              rv.name AS reviewer_name, r.kind, r.regime
         FROM shared.rule_version v
         JOIN shared.rule r ON r.rule_id = v.rule_id
         LEFT JOIN shared.app_user a ON a.id = v.author_id
         LEFT JOIN shared.app_user rv ON rv.id = v.reviewer_id
        WHERE v.review_state IN ('in_review', 'returned')
           OR (v.review_state = 'approved' AND v.approved_at > now() - interval '30 days'
               AND NOT EXISTS (SELECT 1 FROM shared.release_rule_version p WHERE p.rule_version_id = v.id))
        ORDER BY v.submitted_at DESC NULLS LAST`,
    );
    const { rows: claims } = await pool.query(
      `SELECT c.claim_id AS rule_id, c.title, c.version::text AS semver_at_author, c.review_state,
              c.submitted_at, c.approved_at, c.author_user_id AS author_id, a.name AS author_name,
              r2.name AS reviewer_name, 'claim' AS kind, t.name AS regime, c.tenant_id
         FROM tenant.claim c
         JOIN tenant.tenant t ON t.id = c.tenant_id
         LEFT JOIN shared.app_user a ON a.id = c.author_user_id
         LEFT JOIN shared.app_user r2 ON r2.id = c.reviewer_user_id
        WHERE c.review_state = 'in_review'
        ORDER BY c.submitted_at DESC NULLS LAST`,
    );
    return { queue: rows, claims };
  });
}
