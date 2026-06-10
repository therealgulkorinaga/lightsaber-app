// Bundle export (FR-E.9): regenerate SKILL.md + seam/ + references/ + evals/
// from the database. Two modes:
//   exportLive()            - working state (current rule versions, live blocks)
//   exportRelease(version)  - the immutable pinned state of a published release,
//                             which is what FR-G.3 reproducibility reads.
// Exports are deterministic and checksummed (FR-9.6).

import type pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Block, RuleRender, SectionMeta } from '../seam/render.ts';
import { renderFile, bundleChecksum } from '../seam/render.ts';
import { SKILL_NAME, EVALS_FILE } from '../seam/bundle.ts';

type Resolver = (ruleId: string) => RuleRender;

function rowToRender(row: any): RuleRender {
  return {
    rule_id: row.rule_id,
    kind: row.kind,
    regime: row.regime,
    scope: row.scope,
    title: row.title,
    semver_at_author: row.semver_at_author,
    version_annotation: row.version_annotation,
    status_at_version: row.status_at_version,
    jurisdiction_tags: row.jurisdiction_tags,
    statement: row.statement,
    buyer_reading: row.buyer_reading,
    authority_summary: row.authority_summary,
    applicability: row.applicability,
    movement_note: row.movement_note,
    kind_fields: row.kind_fields,
  };
}

function renderEvalsJson(cases: any[]): string {
  const evals = cases.map((c) => ({
    id: c.id,
    prompt: c.prompt,
    expected_output: c.expected_output,
    files: c.files,
    assertions: c.assertions,
  }));
  return JSON.stringify({ skill_name: SKILL_NAME, evals }, null, 2);
}

/** Export the live working state of the seam. */
export async function exportLive(client: pg.PoolClient | pg.Pool): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  // Staleness overlays the immutable version: a rule the watch staled renders
  // `status: stale` live, without touching authored content (FR-C.4).
  const { rows: ruleRows } = await client.query(
    `SELECT r.rule_id, r.kind, r.regime, r.scope, v.*,
            CASE WHEN r.status = 'stale' AND v.status_at_version = 'active' THEN 'stale'
                 ELSE v.status_at_version END AS status_at_version
       FROM shared.rule r
       JOIN shared.rule_version v ON v.id = r.current_version_id`,
  );
  const byId = new Map(ruleRows.map((r) => [r.rule_id, rowToRender(r)]));
  const resolve: Resolver = (id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`No current version for rule ${id}`);
    return r;
  };

  const { rows: fileRows } = await client.query(`SELECT file_path, kind FROM shared.seam_file`);
  for (const f of fileRows) {
    if (f.kind === 'evals') continue;
    const { rows: sectionRows } = await client.query(
      `SELECT id, heading, contents_label FROM shared.seam_section WHERE file_path = $1 ORDER BY position`,
      [f.file_path],
    );
    const sectionIndex = new Map(sectionRows.map((s, i) => [s.id, i]));
    const sections: SectionMeta[] = sectionRows.map((s) => ({
      heading: s.heading,
      contents_label: s.contents_label,
    }));
    const { rows: blockRows } = await client.query(
      `SELECT block_type, text_content, rule_id, section_id
         FROM shared.seam_block WHERE file_path = $1 ORDER BY position`,
      [f.file_path],
    );
    const blocks: Block[] = blockRows.map((b) =>
      b.block_type === 'text'
        ? { type: 'text', text: b.text_content }
        : b.block_type === 'rule'
          ? { type: 'rule', rule_id: b.rule_id, section: sectionIndex.get(b.section_id) ?? null }
          : { type: 'contents' },
    );
    files.set(f.file_path, renderFile(blocks, sections, resolve));
  }

  const { rows: evalRows } = await client.query(`SELECT * FROM shared.eval_case ORDER BY id`);
  files.set(EVALS_FILE, renderEvalsJson(evalRows));
  return files;
}

/** Export the immutable pinned state of a release (FR-G.3). */
export async function exportRelease(
  client: pg.PoolClient | pg.Pool,
  version: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  // The pinned overlay, frozen at assembly, keeps past releases byte-stable
  // while post-trigger candidates carry `status: stale` (FR-C.4, FR-G.3).
  const { rows: ruleRows } = await client.query(
    `SELECT r.rule_id, r.kind, r.regime, r.scope, v.*,
            COALESCE(p.status_override, v.status_at_version) AS status_at_version
       FROM shared.release_rule_version p
       JOIN shared.rule_version v ON v.id = p.rule_version_id
       JOIN shared.rule r ON r.rule_id = v.rule_id
      WHERE p.release_version = $1`,
    [version],
  );
  const byId = new Map(ruleRows.map((r) => [r.rule_id, rowToRender(r)]));
  const resolve: Resolver = (id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`Rule ${id} is not pinned in release ${version} (FR-G.3)`);
    return r;
  };

  const { rows: docRows } = await client.query(
    `SELECT file_path, blocks FROM shared.release_document WHERE release_version = $1`,
    [version],
  );
  if (docRows.length === 0) throw new Error(`Release ${version} not found or holds no documents`);
  for (const d of docRows) {
    const stored = d.blocks as { sections: SectionMeta[]; blocks: Block[] };
    files.set(d.file_path, renderFile(stored.blocks, stored.sections, resolve));
  }

  const { rows: evalRows } = await client.query(
    `SELECT snapshot FROM shared.release_eval_case WHERE release_version = $1 ORDER BY eval_case_id`,
    [version],
  );
  files.set(EVALS_FILE, renderEvalsJson(evalRows.map((r) => r.snapshot)));
  return files;
}

/** Write a bundle to disk under outDir/<SKILL_NAME>/, returning the checksum. */
export async function writeBundle(files: Map<string, string>, outDir: string): Promise<string> {
  for (const [rel, content] of files) {
    const target = path.join(outDir, SKILL_NAME, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return bundleChecksum(files);
}
