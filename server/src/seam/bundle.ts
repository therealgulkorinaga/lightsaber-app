// The skill bundle layout: file list and loader. The bundle on disk at
// /skill is the 1.1.0 seed source; everything Loom ships later is generated.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_NAME = 'lightsaber-regulated-fintech-sales';

export const BUNDLE_DIR = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../skill',
  SKILL_NAME,
);

// Rules-bearing seam files with their parse grammar.
export const RULES_FILES = [
  { path: 'seam/regulatory-rules.md', kind: 'regulatory' as const, hasContents: true, ruleSections: null },
  { path: 'seam/icp-and-scoring.md', kind: 'icp' as const, hasContents: false, ruleSections: ['Disqualifiers', 'Signals'] },
  { path: 'seam/objection-corpus.md', kind: 'objection' as const, hasContents: false, ruleSections: null },
  { path: 'seam/messaging.md', kind: 'messaging' as const, hasContents: false, ruleSections: null },
];

// Whole-document files, exported verbatim.
export const DOCUMENT_FILES = [
  'SKILL.md',
  'references/seam-schema.md',
  'references/artifact-templates.md',
  'seam/_tenant/_template/approved-claims.md',
];

export const EVALS_FILE = 'evals/evals.json';

export async function readBundleFile(relPath: string): Promise<string> {
  return readFile(path.join(BUNDLE_DIR, relPath), 'utf8');
}
