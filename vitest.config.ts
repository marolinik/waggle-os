import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { INFRA_TEST_SUITES } from './vitest.infra-suites';

export default defineConfig({
  resolve: {
    alias: {
      // Marketplace uses ESM .js extensions — alias to source for Vitest
      '@waggle/marketplace': path.resolve(__dirname, 'packages/marketplace/src/index.ts'),
      // App uses @/ alias for src directory
      '@/': path.resolve(__dirname, 'app/src') + '/',
      '@': path.resolve(__dirname, 'app/src'),
    },
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/tests/**/*.test.tsx',
      'tests/**/*.test.ts',
      'app/scripts/**/*.test.ts',
      'app/tests/**/*.test.ts',
      'benchmarks/*/tests/**/*.test.ts',
    ],
    // INFRA_TEST_SUITES require live Postgres (5434) + Redis (6381); excluded
    // from the default gate so `npm test` runs green without Docker. Run them
    // via `npm run test:infra`. See docs/audits/2026-06-01-full-repo-verification-sweep.md.
    exclude: ['apps/**', 'node_modules/**', '**/__faza1-closed/**', ...INFRA_TEST_SUITES],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.d.ts'],
    },
  },
});
