// CLI: export a release (or the live working state) to server/var/exports.
//   npm run -w server export            -> live state
//   npm run -w server export -- 1.1.0   -> pinned release

import path from 'node:path';
import { pool } from '../db/pool.ts';
import { exportLive, exportRelease, writeBundle } from './exporter.ts';
import { bundleChecksum } from '../seam/render.ts';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
const files = version ? await exportRelease(pool, version) : await exportLive(pool);
const outDir = path.resolve(
  fileURLToPath(new URL('../../var/exports', import.meta.url)),
  version ?? 'live',
);
const checksum = await writeBundle(files, outDir);
console.log(`Exported ${files.size} files to ${outDir}`);
console.log(`Checksum: ${checksum}`);
if (checksum !== bundleChecksum(files)) throw new Error('checksum drift');
await pool.end();
