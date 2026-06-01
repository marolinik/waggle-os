import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { INFRA_TEST_SUITES } from './vitest.infra-suites';

/**
 * Infra-lane vitest config — runs ONLY the suites that require live PostgreSQL
 * (5434) + Redis (6381). Bring infra up first: `docker-compose up -d postgres
 * redis` (and apply the schema), then `npm run test:infra`.
 *
 * The default `npm test` (vitest.config.ts) EXCLUDES these so the no-Docker
 * gate stays green. See docs/audits/2026-06-01-full-repo-verification-sweep.md.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@waggle/marketplace': path.resolve(__dirname, 'packages/marketplace/src/index.ts'),
      '@/': path.resolve(__dirname, 'app/src') + '/',
      '@': path.resolve(__dirname, 'app/src'),
    },
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
    include: [...INFRA_TEST_SUITES],
    exclude: ['node_modules/**'],
  },
});
