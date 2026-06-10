// Builds a fresh, fully migrated and seeded test database per run.

import { execSync } from 'node:child_process';

const TEST_DB = 'lightsaber_backoffice_test';

export default async function setup() {
  process.env.DATABASE_URL = `postgres://localhost:5432/${TEST_DB}`;
  execSync(`dropdb --if-exists ${TEST_DB}`);
  execSync(`createdb ${TEST_DB}`);
  const { migrate } = await import('../src/db/migrate.ts');
  await migrate();
  const { seed } = await import('../src/seed/seed.ts');
  await seed();
  const { pool } = await import('../src/db/pool.ts');
  await pool.end();
}
