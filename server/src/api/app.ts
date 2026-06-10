import Fastify from 'fastify';
import cors from '@fastify/cors';
import { authPlugin } from './lib/auth.ts';
import { rulesRoutes } from './routes/rules.ts';
import { releasesRoutes } from './routes/releases.ts';
import { auditRoutes } from './routes/audit.ts';
import { tenantsRoutes } from './routes/tenants.ts';
import { watchRoutes } from './routes/watch.ts';
import { gapsRoutes } from './routes/gaps.ts';
import { servicesRoutes } from './routes/services.ts';
import { assistRoutes } from './routes/assist.ts';
import { pool } from '../db/pool.ts';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true, allowedHeaders: ['Content-Type', 'X-User-Id'] });

  // The user list is the one unauthenticated endpoint: the dev switcher needs it.
  app.get('/api/users', async () => {
    const { rows } = await pool.query(
      `SELECT id, name, role FROM shared.app_user WHERE status = 'active' ORDER BY role, name`,
    );
    return { users: rows };
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/api/users' || req.method === 'OPTIONS') return;
    // The deployed skill writes gaps with a deployment key, not a user (FR-D.1).
    if (req.url === '/api/gaps' && req.method === 'POST') return;
    return authPlugin(req, reply);
  });

  rulesRoutes(app);
  releasesRoutes(app);
  auditRoutes(app);
  tenantsRoutes(app);
  watchRoutes(app);
  gapsRoutes(app);
  servicesRoutes(app);
  assistRoutes(app);

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any).statusCode ?? 500;
    reply.code(status).send({ error: (err as Error).message });
  });

  return app;
}
