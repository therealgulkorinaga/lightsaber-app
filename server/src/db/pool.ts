import pg from 'pg';

const { Pool } = pg;

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/lightsaber_backoffice';

// Server sessions are practice-side by default: tenant tables sit behind
// forced RLS and require the context GUC, set here as a connection startup
// parameter. Tenant-scoped paths override with SET LOCAL inside their
// transaction; tests prove isolation under the lsb_tenant role.
export const pool = new Pool({
  connectionString: DATABASE_URL,
  options: '-c app.is_practice=true',
});

/** Run fn inside a transaction on a dedicated client. */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
