import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

const TEST_DB_URL = 'postgres://localhost:5432/lightsaber_backoffice_test';

// Tests share one database and must run in filename order: 00-roundtrip
// (read-only) before 10-guards (rolled back) before 30-api-flow (mutating).
class FilenameSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  test: {
    fileParallelism: false,
    sequence: { concurrent: false, sequencer: FilenameSequencer },
    globalSetup: './test/global-setup.ts',
    env: { DATABASE_URL: TEST_DB_URL },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
