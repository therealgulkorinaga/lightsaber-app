// Minimal forward-only SQL migration runner. Files in server/migrations are
// applied in lexicographic order, each in its own transaction, tracked in
// schema_migrations. The schema is versioned from the start per the brief.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

export async function migrate(): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  migrate()
    .then((ran) => {
      console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Nothing to apply.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
