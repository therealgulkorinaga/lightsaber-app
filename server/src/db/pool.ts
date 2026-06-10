import pg from 'pg';

const { Pool } = pg;

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost:5432/lightsaber_backoffice';

export const pool = new Pool({ connectionString: DATABASE_URL });

// Server sessions are practice-side by default: tenant tables sit behind
// forced RLS and require the context GUC. Queries on a connection are
// serialised, so this runs before anything else the client executes.
// Tenant-scoped paths override with SET LOCAL inside their transaction.
pool.on('connect', (client) => {
  client.query(`SET app.is_practice = 'true'`).catch(() => {});
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
