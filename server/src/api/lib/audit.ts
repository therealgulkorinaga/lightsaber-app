// FR-9.1: every state transition logged with actor and timestamp.

import type pg from 'pg';

export async function audit(
  client: pg.PoolClient | pg.Pool,
  entry: {
    object_type: string;
    object_id: string;
    action: string;
    actor_id: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO shared.audit_log (object_type, object_id, action, actor_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [entry.object_type, entry.object_id, entry.action, entry.actor_id, JSON.stringify(entry.detail ?? {})],
  );
}
