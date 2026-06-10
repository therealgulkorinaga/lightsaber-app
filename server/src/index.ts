import { buildApp } from './api/app.ts';

const app = await buildApp();
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '127.0.0.1' });
console.log(`Lightsaber Backoffice API on http://127.0.0.1:${port}`);
