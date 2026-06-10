// FR-E.9 / FR-9.6 / the seed contract: Loom boots populated with the real
// 1.1.0 corpus, and export of the seeded release is byte-identical with the
// shipped bundle. Run against a seeded database (npm run db:reset).

import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.ts';
import { exportLive, exportRelease } from '../src/export/exporter.ts';
import { bundleChecksum } from '../src/seam/render.ts';
import { DOCUMENT_FILES, EVALS_FILE, RULES_FILES, readBundleFile } from '../src/seam/bundle.ts';

const ALL_FILES = [...RULES_FILES.map((f) => f.path), ...DOCUMENT_FILES, EVALS_FILE];

afterAll(() => pool.end());

describe('seeded 1.1.0 corpus', () => {
  it('holds the exact rule counts the PRD names', async () => {
    const { rows } = await pool.query(
      `SELECT kind, count(*)::int AS n FROM shared.rule WHERE status <> 'retired' GROUP BY kind`,
    );
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
    expect(byKind.regulatory).toBe(59);
    expect(byKind.icp).toBe(12); // 10 signals + 2 disqualifiers
    expect(byKind.objection).toBe(12);
    expect(byKind.messaging).toBe(7);

    const { rows: dq } = await pool.query(
      `SELECT count(*)::int AS n FROM shared.rule_version v
        JOIN shared.rule r ON r.current_version_id = v.id
       WHERE r.kind = 'icp' AND r.status <> 'retired'
         AND (v.kind_fields->>'is_disqualifier')::boolean`,
    );
    expect(dq[0].n).toBe(2);

    const { rows: evals } = await pool.query(`SELECT count(*)::int AS n FROM shared.eval_case`);
    expect(evals[0].n).toBe(10);
  });

  it('keeps ICP-DQ-001 retired so its ID can never be reused (FR-A.2)', async () => {
    const { rows } = await pool.query(`SELECT status FROM shared.rule WHERE rule_id = 'ICP-DQ-001'`);
    expect(rows[0]?.status).toBe('retired');
  });

  it('arms the three movement notes as watch items without loss (FR-C.1)', async () => {
    const { rows } = await pool.query(
      `SELECT wr.rule_id, wi.status, wi.trigger_type, wi.reverify_date, wi.reverify_action
         FROM shared.watch_item wi JOIN shared.watch_rule wr ON wr.watch_item_id = wi.id
        ORDER BY wr.rule_id`,
    );
    expect(rows.map((r) => r.rule_id)).toEqual(['AIA-TML-007', 'IE-AI-006', 'US-AI-009']);
    for (const r of rows) {
      expect(r.status).toBe('armed');
      expect(r.reverify_action).toBeTruthy(); // the movement note text travels with the item
    }
    const aia = rows.find((r) => r.rule_id === 'AIA-TML-007')!;
    expect(aia.trigger_type).toBe('event');
  });

  it('every active rule version carries full provenance (FR-G.2)', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM shared.rule_version v JOIN shared.rule r ON r.current_version_id = v.id
       WHERE v.review_state = 'approved'
         AND (v.author_id IS NULL OR v.reviewer_id IS NULL OR v.approved_at IS NULL OR v.content_hash IS NULL)`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('lossless export (FR-E.9, FR-G.3)', () => {
  it('release 1.1.0 export is byte-identical with the shipped bundle', async () => {
    const exported = await exportRelease(pool, '1.1.0');
    expect(exported.size).toBe(ALL_FILES.length);
    for (const p of ALL_FILES) {
      const original = await readBundleFile(p);
      expect(exported.get(p), p).toBe(original);
    }
  });

  it('live export equals the seeded state too', async () => {
    const exported = await exportLive(pool);
    for (const p of ALL_FILES) {
      const original = await readBundleFile(p);
      expect(exported.get(p), p).toBe(original);
    }
  });

  it('re-export yields the same checksum (FR-9.6)', async () => {
    const a = bundleChecksum(await exportRelease(pool, '1.1.0'));
    const b = bundleChecksum(await exportRelease(pool, '1.1.0'));
    expect(a).toBe(b);
    const { rows } = await pool.query(
      `SELECT checksum FROM shared.bundle_export WHERE release_version = '1.1.0'`,
    );
    expect(rows[0].checksum).toBe(a);
  });

  it('release 1.1.0 pins exactly 90 rule versions', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM shared.release_rule_version WHERE release_version = '1.1.0'`,
    );
    expect(rows[0].n).toBe(90); // 59 + 12 + 12 + 7
  });
});
