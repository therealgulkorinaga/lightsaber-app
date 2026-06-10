import { buildApp } from './api/app.ts';
import { runWatchCheck } from './api/routes/watch.ts';

const app = await buildApp();
// The deterministic maintenance pass runs on start (and on demand via the
// API): date triggers fire, overdue re-verify flags raise, stale claims sweep.
try {
  const check = await runWatchCheck(null);
  if (check.triggered.length || check.overdue.length) {
    console.log('Watch check:', JSON.stringify(check));
  }
} catch (err) {
  console.error('Watch check failed:', (err as Error).message);
}
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '127.0.0.1' });
console.log(`Lightsaber Backoffice API on http://127.0.0.1:${port}`);
