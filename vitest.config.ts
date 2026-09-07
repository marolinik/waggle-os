import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { INFRA_TEST_SUITES } from './vitest.infra-suites';
import { waggleSrcAliases } from './vitest.aliases';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve every @waggle/* workspace package from src/ so tests don't need
      // a build step (several packages export dist/, unbuilt on fresh checkout/CI).
      ...waggleSrcAliases(__dirname),
      // App uses @/ alias for src directory
      '@/': path.resolve(__dirname, 'app/src') + '/',
      '@': path.resolve(__dirname, 'app/src'),
    },
  },
  test: {
    globals: true,
    // Passing tests should not bury failures under expected provider/startup
    // diagnostics. Use `--silent=false` when investigating a failing case.
    silent: true,
    testTimeout: 30_000,
    // Fastify setup/teardown can exceed Vitest's 10s hook default when the
    // complete 700+ file gate shares a two-worker CI runner.
    hookTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    maxWorkers: 4,
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/tests/**/*.test.tsx',
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
      'scripts/**/*.test.ts',
      'app/scripts/**/*.test.ts',
      'app/tests/**/*.test.ts',
      'benchmarks/*/tests/**/*.test.ts',
    ],
    // INFRA_TEST_SUITES require live Postgres (5434) + Redis (6381); excluded
    // from the default gate so `npm test` runs green without Docker. Run them
    // via `npm run test:infra`. See docs/audits/2026-06-01-full-repo-verification-sweep.md.
    exclude: [
      'apps/**', 'node_modules/**', '**/__faza1-closed/**',
      ...INFRA_TEST_SUITES,
      // Requires the gitignored ~13MB pre-built packages/marketplace/marketplace.db
      // fixture (createTempDb copies it); absent on a clean checkout / CI. Proper
      // fix (regenerate from sources-seed.ts in test setup) tracked in
      // docs/audits/2026-06-01-full-repo-verification-sweep.md.
      'packages/marketplace/tests/sync-verification.test.ts',
      // Wall-clock budgets run in a dedicated lane so filesystem/process
      // contention cannot make the deterministic correctness gate flaky.
      'packages/server/tests/performance/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.d.ts'],
    },
  },
});
