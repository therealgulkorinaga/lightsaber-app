// Phase 1 auth: a dev user-switcher. The web app sends X-User-Id; the
// middleware loads the user and enforces role gates (FR-9.7). Real SSO is a
// Phase 2 concern; role enforcement is not — analysts and tenant admins can
// never approve substance regardless of how identity arrives.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../../db/pool.ts';

export interface Actor {
  id: string;
  name: string;
  role: 'author' | 'reviewer' | 'practice_lead' | 'analyst' | 'tenant_admin';
  tenant_id: string | null; // set for tenant_admin: the one tenant they reach
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

export async function authPlugin(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return reply.code(401).send({ error: 'X-User-Id header required (dev user-switcher)' });
  }
  const { rows } = await pool.query(
    `SELECT id, name, role, tenant_id FROM shared.app_user WHERE id = $1 AND status = 'active'`,
    [userId],
  );
  if (!rows.length) return reply.code(401).send({ error: 'Unknown or disabled user' });
  req.actor = rows[0];
}

const SUBSTANCE_APPROVERS = new Set(['author', 'reviewer', 'practice_lead']);

export function canApproveSubstance(actor: Actor): boolean {
  // FR-9.7: analysts and tenant_admins cannot approve substance. Authors can
  // review others' rules (peer review); the author-of-this-version exclusion
  // is enforced separately and again at the database (FR-B.1).
  return SUBSTANCE_APPROVERS.has(actor.role);
}

export function requireRole(actor: Actor, roles: Actor['role'][], reply: FastifyReply): boolean {
  if (!roles.includes(actor.role)) {
    reply.code(403).send({ error: `Requires role: ${roles.join(' or ')}` });
    return false;
  }
  return true;
}
