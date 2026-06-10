// Seed harness: parse the shipped 1.1.0 bundle into the database of record,
// then prove it by exporting back and asserting byte-identity with the source.
// After this runs, the markdown bundle is a build artifact; the DB is truth.

import path from 'node:path';
import type pg from 'pg';
import { pool, withTx } from '../db/pool.ts';
import { parseRulesFile } from '../seam/parse.ts';
import type { RuleRender } from '../seam/render.ts';
import { contentHash } from '../seam/render.ts';
import {
  BUNDLE_DIR,
  DOCUMENT_FILES,
  EVALS_FILE,
  RULES_FILES,
  readBundleFile,
} from '../seam/bundle.ts';
import { exportRelease, writeBundle } from '../export/exporter.ts';

export const SEED_VERSION = '1.1.0';
export const SEED_DATE = '2026-06-10';

const AUTHOR = '00000000-0000-4000-8000-000000000001'; // R. Hale
const REVIEWER = '00000000-0000-4000-8000-000000000002'; // A. Okafor
const PRACTICE_LEAD = '00000000-0000-4000-8000-000000000003'; // M. Brennan

// The three movement-noted rules become armed watch items (FR-C.1).
const WATCH_SEED: Record<
  string,
  { trigger_type: 'date' | 'event'; trigger_date: string | null; event_description: string | null; reverify_date: string | null }
> = {
  'AIA-TML-007': {
    trigger_type: 'event',
    trigger_date: null,
    event_description:
      'Formal adoption and Official Journal publication of the Digital Omnibus on AI',
    reverify_date: '2026-08-02',
  },
  'IE-AI-006': {
    trigger_type: 'date',
    trigger_date: '2026-08-02',
    event_description: null,
    reverify_date: '2026-08-02',
  },
  'US-AI-009': {
    trigger_type: 'event',
    trigger_date: null,
    event_description:
      'Enactment of a federal AI framework, or a controlling judgment in the federal preemption contest',
    reverify_date: null,
  },
};

function classifySource(authority: string): string {
  if (/regulation \(eu\)|^DORA |^GDPR |implementing technical standards|delegated regulation/i.test(authority)) return 'regulation';
  if (/regulatory technical standards|RTS/i.test(authority)) return 'RTS';
  if (/guidance|guidelines|supervisory statement|SS\d|circular|policy statement|finalised guidance/i.test(authority)) return 'guidance';
  if (/\bact\b|U\.S\.C|\bcode\b|statute/i.test(authority)) return 'statute';
  if (/executive order/i.test(authority)) return 'executive_order';
  return 'other';
}

async function insertRule(client: pg.PoolClient, r: RuleRender): Promise<string> {
  await client.query(
    `INSERT INTO shared.rule (rule_id, kind, regime, scope, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [r.rule_id, r.kind, r.regime, r.scope, r.status_at_version],
  );
  const hash = contentHash(r);
  const {
    rows: [v],
  } = await client.query(
    `INSERT INTO shared.rule_version
       (rule_id, semver_at_author, version_annotation, title, statement, buyer_reading,
        authority_summary, applicability, inputs_required, jurisdiction_tags, kind_fields,
        movement_note, status_at_version, review_state, author_id, reviewer_id,
        approved_at, change_note, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'approved',$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      r.rule_id,
      r.semver_at_author,
      r.version_annotation,
      r.title,
      r.statement,
      r.buyer_reading,
      r.authority_summary,
      r.applicability,
      r.kind === 'regulatory'
        ? (await import('../seam/parse.ts')).parseInputNames(r.kind_fields.inputs_raw)
        : (r.kind_fields.inputs_required ?? []),
      r.jurisdiction_tags,
      JSON.stringify(r.kind_fields),
      r.movement_note,
      r.status_at_version,
      AUTHOR,
      REVIEWER,
      SEED_DATE,
      `Seeded from shipped seam ${SEED_VERSION} bundle`,
      hash,
    ],
  );
  await client.query(`UPDATE shared.rule SET current_version_id = $1 WHERE rule_id = $2`, [
    v.id,
    r.rule_id,
  ]);
  for (const tag of r.jurisdiction_tags) {
    await client.query(
      `INSERT INTO shared.rule_jurisdiction (rule_id, jurisdiction_tag) VALUES ($1, $2)`,
      [r.rule_id, tag],
    );
  }
  if (r.kind === 'regulatory' && r.authority_summary) {
    await client.query(
      `INSERT INTO shared.source (rule_version_id, citation, source_type) VALUES ($1, $2, $3)`,
      [v.id, r.authority_summary, classifySource(r.authority_summary)],
    );
  }
  return v.id;
}

export async function seed(): Promise<{ counts: Record<string, number>; checksum: string }> {
  return withTx(async (client) => {
    const { rows: existing } = await client.query(`SELECT count(*)::int AS n FROM shared.rule`);
    if (existing[0].n > 0) {
      throw new Error('Database already holds rules; refusing to re-seed. Run npm run db:reset.');
    }

    const counts: Record<string, number> = {
      regulatory: 0,
      icp_signal: 0,
      icp_disqualifier: 0,
      objection: 0,
      messaging: 0,
      eval_case: 0,
      watch_item: 0,
    };
    const versionIds: string[] = [];

    // ── rules files: parse, verify fidelity, insert ────────────
    for (const rf of RULES_FILES) {
      const source = await readBundleFile(rf.path);
      const parsed = parseRulesFile(source, rf.kind, {
        hasContents: rf.hasContents,
        ruleSections: rf.ruleSections,
      });

      await client.query(`INSERT INTO shared.seam_file (file_path, kind) VALUES ($1, 'rules')`, [
        rf.path,
      ]);
      const sectionIds: string[] = [];
      for (let i = 0; i < parsed.sections.length; i++) {
        const s = parsed.sections[i];
        const {
          rows: [row],
        } = await client.query(
          `INSERT INTO shared.seam_section (file_path, position, heading, contents_label)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [rf.path, i, s.heading, s.contents_label],
        );
        sectionIds.push(row.id);
      }
      // Rules first: rule blocks carry FKs to them.
      for (const r of parsed.rules) {
        versionIds.push(await insertRule(client, r));
        if (r.kind === 'icp') {
          counts[r.kind_fields.is_disqualifier ? 'icp_disqualifier' : 'icp_signal']++;
        } else {
          counts[r.kind]++;
        }
      }

      for (let i = 0; i < parsed.blocks.length; i++) {
        const b = parsed.blocks[i];
        await client.query(
          `INSERT INTO shared.seam_block (file_path, section_id, position, block_type, text_content, rule_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            rf.path,
            b.type === 'rule' && b.section != null ? sectionIds[b.section] : null,
            i,
            b.type,
            b.type === 'text' ? b.text : null,
            b.type === 'rule' ? b.rule_id : null,
          ],
        );
      }
    }

    // ── ICP-DQ-001: retired before 1.1.0, absent from the bundle, but its ID
    // is never reused (FR-A.2) and citation integrity must resolve it.
    await client.query(
      `INSERT INTO shared.rule (rule_id, kind, scope, status) VALUES ('ICP-DQ-001', 'icp', 'shared', 'retired')`,
    );
    const dq1: RuleRender = {
      rule_id: 'ICP-DQ-001',
      kind: 'icp',
      regime: null,
      scope: 'shared',
      title: 'Outside covered jurisdictions (UK and EU)',
      semver_at_author: '1.0',
      version_annotation: '',
      status_at_version: 'retired',
      jurisdiction_tags: [],
      statement: null,
      buyer_reading: null,
      authority_summary: null,
      applicability: null,
      movement_note: null,
      kind_fields: { weight_raw: 'n/a', is_disqualifier: true, reconstructed: true },
    };
    const {
      rows: [dq1v],
    } = await client.query(
      `INSERT INTO shared.rule_version
         (rule_id, semver_at_author, title, kind_fields, status_at_version, review_state,
          author_id, reviewer_id, approved_at, change_note, content_hash)
       VALUES ('ICP-DQ-001', '1.0', $1, $2, 'retired', 'approved', $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        dq1.title,
        JSON.stringify(dq1.kind_fields),
        AUTHOR,
        REVIEWER,
        SEED_DATE,
        'Retired 2026-06-10 and replaced by ICP-DQ-003 on the addition of US coverage. Body reconstructed; the 1.1.0 bundle does not carry retired rule text.',
        contentHash(dq1),
      ],
    );
    await client.query(`UPDATE shared.rule SET current_version_id = $1 WHERE rule_id = 'ICP-DQ-001'`, [dq1v.id]);

    // ── documents ──────────────────────────────────────────────
    for (const docPath of DOCUMENT_FILES) {
      const content = await readBundleFile(docPath);
      await client.query(`INSERT INTO shared.seam_file (file_path, kind) VALUES ($1, 'document')`, [docPath]);
      await client.query(
        `INSERT INTO shared.seam_block (file_path, position, block_type, text_content)
         VALUES ($1, 0, 'text', $2)`,
        [docPath, content],
      );
    }
    await client.query(`INSERT INTO shared.seam_file (file_path, kind) VALUES ($1, 'evals')`, [EVALS_FILE]);

    // ── eval cases ─────────────────────────────────────────────
    const evalsRaw = JSON.parse(await readBundleFile(EVALS_FILE));
    for (const c of evalsRaw.evals) {
      await client.query(
        `INSERT INTO shared.eval_case (id, prompt, expected_output, files, assertions)
         VALUES ($1, $2, $3, $4, $5)`,
        [c.id, c.prompt, c.expected_output, JSON.stringify(c.files), JSON.stringify(c.assertions)],
      );
      counts.eval_case++;
    }

    // ── watch items from movement notes (FR-C.1) ───────────────
    const { rows: movementRules } = await client.query(
      `SELECT v.rule_id, v.movement_note FROM shared.rule_version v
        JOIN shared.rule r ON r.current_version_id = v.id
       WHERE v.movement_note IS NOT NULL ORDER BY v.rule_id`,
    );
    for (const m of movementRules) {
      const w = WATCH_SEED[m.rule_id];
      if (!w) throw new Error(`Movement note on ${m.rule_id} has no watch mapping`);
      const {
        rows: [item],
      } = await client.query(
        `INSERT INTO shared.watch_item
           (trigger_type, trigger_date, event_description, reverify_date, reverify_action, status, owner_id)
         VALUES ($1, $2, $3, $4, $5, 'armed', $6) RETURNING id`,
        [w.trigger_type, w.trigger_date, w.event_description, w.reverify_date, m.movement_note, AUTHOR],
      );
      await client.query(`INSERT INTO shared.watch_rule (watch_item_id, rule_id) VALUES ($1, $2)`, [
        item.id,
        m.rule_id,
      ]);
      counts.watch_item++;
    }

    // ── the 1.1.0 release: published baseline, pins everything ─
    const { rows: changelogRows } = await client.query(
      `SELECT v.rule_id, v.semver_at_author, v.version_annotation FROM shared.rule_version v
        JOIN shared.rule r ON r.current_version_id = v.id WHERE r.status <> 'retired'`,
    );
    const changelog = {
      added: changelogRows.filter((r) => r.version_annotation.includes('added in seam 1.1.0')).map((r) => r.rule_id).sort(),
      changed: changelogRows.filter((r) => r.semver_at_author === '1.1').map((r) => r.rule_id).sort(),
      staled: [],
      reauthored: [],
      retired: ['ICP-DQ-001'],
    };
    await client.query(
      `INSERT INTO shared.seam_release (version, assembled_at, released_by, changelog, status, published_at)
       VALUES ($1, $2, $3, $4, 'published', $2)`,
      [SEED_VERSION, SEED_DATE, PRACTICE_LEAD, JSON.stringify(changelog)],
    );
    for (const vid of versionIds) {
      await client.query(
        `INSERT INTO shared.release_rule_version (release_version, rule_version_id) VALUES ($1, $2)`,
        [SEED_VERSION, vid],
      );
    }

    // Pin documents and block structure.
    const { rows: fileRows } = await client.query(`SELECT file_path, kind FROM shared.seam_file`);
    for (const f of fileRows) {
      if (f.kind === 'evals') continue;
      const { rows: sectionRows } = await client.query(
        `SELECT id, heading, contents_label FROM shared.seam_section WHERE file_path = $1 ORDER BY position`,
        [f.file_path],
      );
      const sectionIndex = new Map(sectionRows.map((s, i) => [s.id, i]));
      const { rows: blockRows } = await client.query(
        `SELECT block_type, text_content, rule_id, section_id FROM shared.seam_block
          WHERE file_path = $1 ORDER BY position`,
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
        [SEED_VERSION, f.file_path, JSON.stringify(snapshot)],
      );
    }
    for (const c of evalsRaw.evals) {
      await client.query(
        `INSERT INTO shared.release_eval_case (release_version, eval_case_id, snapshot) VALUES ($1, $2, $3)`,
        [SEED_VERSION, c.id, JSON.stringify(c)],
      );
    }

    // ── prove it: export the release, byte-compare with the source bundle ──
    const exported = await exportRelease(client, SEED_VERSION);
    const allFiles = [...RULES_FILES.map((f) => f.path), ...DOCUMENT_FILES, EVALS_FILE];
    for (const p of allFiles) {
      const original = await readBundleFile(p);
      const regenerated = exported.get(p);
      if (regenerated !== original) {
        let at = 0;
        const a = regenerated ?? '';
        while (at < Math.min(a.length, original.length) && a[at] === original[at]) at++;
        throw new Error(
          `Seed round-trip is not byte-identical for ${p} (FR-E.9); diverges at byte ${at}`,
        );
      }
    }
    if (exported.size !== allFiles.length) {
      throw new Error(`Export carries ${exported.size} files; bundle has ${allFiles.length}`);
    }

    const outDir = path.resolve(BUNDLE_DIR, '../../server/var/exports', SEED_VERSION);
    const checksum = await writeBundle(exported, outDir);
    await client.query(
      `INSERT INTO shared.bundle_export (release_version, format, uri, checksum) VALUES ($1, 'skill-bundle', $2, $3)`,
      [SEED_VERSION, outDir, checksum],
    );
    await client.query(
      `INSERT INTO shared.audit_log (object_type, object_id, action, actor_id, detail)
       VALUES ('seam_release', $1, 'seeded_published_baseline', $2, $3)`,
      [SEED_VERSION, PRACTICE_LEAD, JSON.stringify({ counts, checksum })],
    );

    return { counts, checksum };
  });
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seed()
    .then(({ counts, checksum }) => {
      console.log('Seeded 1.1.0:', JSON.stringify(counts));
      console.log('Bundle checksum:', checksum);
      console.log('Round trip: byte-identical with /skill source.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
