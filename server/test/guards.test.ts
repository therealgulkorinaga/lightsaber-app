// The database-level guarantees: immutability (FR-9.2/FR-G.1), the two-person
// rule (FR-B.1/B.3), the publish gate (FR-9.3), terminal retirement (5.1),
// and tenant isolation under RLS (FR-7.1). Each test runs in a rolled-back
// transaction against the seeded database.

import { afterAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { pool } from '../src/db/pool.ts';

afterAll(() => pool.end());

async function inRolledBackTx(fn: (c: pg.PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** Expect a statement to fail, then keep the surrounding transaction usable. */
async function expectFail(c: pg.PoolClient, sql: string, params: any[], re: RegExp) {
  await c.query('SAVEPOINT sp');
  try {
    await expect(c.query(sql, params)).rejects.toThrow(re);
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT sp');
  }
}

const AUTHOR = '00000000-0000-4000-8000-000000000001';
const REVIEWER = '00000000-0000-4000-8000-000000000002';

describe('immutability (FR-9.2, FR-G.1, FR-B.4)', () => {
  it('an approved rule version cannot be edited', async () => {
    await inRolledBackTx(async (c) => {
      const { rows } = await c.query(
        `SELECT id FROM shared.rule_version WHERE review_state = 'approved' LIMIT 1`,
      );
      await expect(
        c.query(`UPDATE shared.rule_version SET statement = 'tampered' WHERE id = $1`, [rows[0].id]),
      ).rejects.toThrow(/approved and immutable/);
    });
  });

  it('rule versions are never deleted', async () => {
    await inRolledBackTx(async (c) => {
      await expect(c.query(`DELETE FROM shared.rule_version WHERE rule_id = 'DORA-TPR-001'`)).rejects.toThrow(
        /never deleted/,
      );
    });
  });

  it('a published release is immutable and its pins cannot be touched', async () => {
    await inRolledBackTx(async (c) => {
      await expectFail(c, `UPDATE shared.seam_release SET changelog = '{}' WHERE version = '1.1.0'`, [], /published and immutable/);
      await expectFail(c, `DELETE FROM shared.release_rule_version WHERE release_version = '1.1.0'`, [], /immutable/);
      await expectFail(c, `DELETE FROM shared.bundle_export WHERE release_version = '1.1.0'`, [], /immutable/);
    });
  });

  it('retired is terminal for a rule_id (5.1)', async () => {
    await inRolledBackTx(async (c) => {
      await expect(
        c.query(`UPDATE shared.rule SET status = 'active' WHERE rule_id = 'ICP-DQ-001'`),
      ).rejects.toThrow(/retired is terminal/);
    });
  });
});

describe('two-person rule at the database (FR-B.1, FR-B.3)', () => {
  it('rejects approval where reviewer = author', async () => {
    await inRolledBackTx(async (c) => {
      const {
        rows: [v],
      } = await c.query(
        `INSERT INTO shared.rule_version (rule_id, semver_at_author, title, author_id, content_hash)
         SELECT 'DORA-TPR-001', '1.1', 'test draft', $1, 'hash' RETURNING id`,
        [AUTHOR],
      );
      await expectFail(
        c,
        `UPDATE shared.rule_version SET review_state = 'approved', reviewer_id = $1 WHERE id = $2`,
        [AUTHOR, v.id],
        /cannot be its reviewer/,
      );
      // and with a distinct reviewer it succeeds
      await c.query(
        `UPDATE shared.rule_version SET review_state = 'approved', reviewer_id = $1 WHERE id = $2`,
        [REVIEWER, v.id],
      );
    });
  });

  it('rejects approval without a content hash (FR-B.4)', async () => {
    await inRolledBackTx(async (c) => {
      const {
        rows: [v],
      } = await c.query(
        `INSERT INTO shared.rule_version (rule_id, semver_at_author, title, author_id)
         VALUES ('DORA-TPR-001', '1.1', 'test draft', $1) RETURNING id`,
        [AUTHOR],
      );
      await expect(
        c.query(
          `UPDATE shared.rule_version SET review_state = 'approved', reviewer_id = $1 WHERE id = $2`,
          [REVIEWER, v.id],
        ),
      ).rejects.toThrow(/content_hash/);
    });
  });
});

describe('release state machine and publish gate (FR-9.3, 5.2)', () => {
  it('blocks staged -> published (no path bypasses eval)', async () => {
    await inRolledBackTx(async (c) => {
      await c.query(`INSERT INTO shared.seam_release (version, status) VALUES ('9.9.9', 'staged')`);
      await expect(
        c.query(`UPDATE shared.seam_release SET status = 'published' WHERE version = '9.9.9'`),
      ).rejects.toThrow(/illegal release transition/);
    });
  });

  it('blocks publish on a red eval run', async () => {
    await inRolledBackTx(async (c) => {
      const {
        rows: [run],
      } = await c.query(
        `INSERT INTO shared.eval_run (candidate_version, passed, results) VALUES ('9.9.9', false, '{}') RETURNING id`,
      );
      await c.query(`INSERT INTO shared.seam_release (version, status, eval_run_id) VALUES ('9.9.9', 'eval_passed', $1)`, [run.id]);
      await expect(
        c.query(`UPDATE shared.seam_release SET status = 'published' WHERE version = '9.9.9'`),
      ).rejects.toThrow(/no publish path exists for a red candidate/);
    });
  });

  it('blocks publish when the green run belongs to a different candidate', async () => {
    await inRolledBackTx(async (c) => {
      const {
        rows: [run],
      } = await c.query(
        `INSERT INTO shared.eval_run (candidate_version, passed, results) VALUES ('1.1.0', true, '{}') RETURNING id`,
      );
      await c.query(`INSERT INTO shared.seam_release (version, status, eval_run_id) VALUES ('9.9.9', 'eval_passed', $1)`, [run.id]);
      await expect(
        c.query(`UPDATE shared.seam_release SET status = 'published' WHERE version = '9.9.9'`),
      ).rejects.toThrow(/is for candidate/);
    });
  });

  it('publishes on a green run for the same candidate', async () => {
    await inRolledBackTx(async (c) => {
      const {
        rows: [run],
      } = await c.query(
        `INSERT INTO shared.eval_run (candidate_version, passed, results) VALUES ('9.9.9', true, '{}') RETURNING id`,
      );
      await c.query(`INSERT INTO shared.seam_release (version, status, eval_run_id) VALUES ('9.9.9', 'eval_passed', $1)`, [run.id]);
      const { rows } = await c.query(
        `UPDATE shared.seam_release SET status = 'published' WHERE version = '9.9.9' RETURNING published_at`,
      );
      expect(rows[0].published_at).toBeTruthy();
    });
  });
});

describe('tenant isolation under RLS (FR-7.1)', () => {
  it('a tenant session reads zero rows from another tenant', async () => {
    await inRolledBackTx(async (c) => {
      await c.query(`SELECT set_config('app.is_practice', 'true', true)`);
      const {
        rows: [ta],
      } = await c.query(`INSERT INTO tenant.tenant (name) VALUES ('Adopter A') RETURNING id`);
      const {
        rows: [tb],
      } = await c.query(`INSERT INTO tenant.tenant (name) VALUES ('Adopter B') RETURNING id`);
      await c.query(
        `INSERT INTO tenant.claim (claim_id, tenant_id, statement, category) VALUES
         ('CLM-001', $1, 'Adopter A processes all data in EEA regions.', 'security_cert_residency'),
         ('CLM-001', $2, 'Adopter B holds ISO 27001.', 'security_cert_residency')`,
        [ta.id, tb.id],
      );

      // Switch to a tenant session scoped to Adopter A.
      await c.query(`SET LOCAL ROLE lsb_tenant`);
      await c.query(`SELECT set_config('app.is_practice', '', true)`);
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [ta.id]);

      const { rows: visible } = await c.query(`SELECT tenant_id, statement FROM tenant.claim`);
      expect(visible).toHaveLength(1);
      expect(visible[0].tenant_id).toBe(ta.id);

      const { rows: other } = await c.query(`SELECT * FROM tenant.claim WHERE tenant_id = $1`, [tb.id]);
      expect(other).toHaveLength(0); // zero rows from the other tenant, under test

      // And the shared corpus is unreachable for tenant sessions (FR-7.2).
      await expect(c.query(`SELECT count(*) FROM shared.rule`)).rejects.toThrow(/permission denied/);
    });
  });
});
