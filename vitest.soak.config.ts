import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { waggleSrcAliases } from './vitest.aliases';

/**
 * Soak-lane vitest config — runs ONLY the R-6 soak, which writes a real
 * multi-tens-of-thousands-frame `.mind` to disk and takes minutes.
 *
 * The default `npm test` (vitest.config.ts) EXCLUDES it so the correctness gate
 * stays fast and deterministic; a filter alone cannot re-include an excluded
 * path, which is why this is a separate config rather than a script flag.
 *
 * `npm run test:soak`. Size it with `WAGGLE_SOAK_FRAMES`.
 */
export default defineConfig({
  resolve: {
    alias: {
      ...waggleSrcAliases(__dirname),
      '@/': path.resolve(__dirname, 'app/src') + '/',
      '@': path.resolve(__dirname, 'app/src'),
    },
  },
  test: {
    globals: true,
    testTimeout: 900_000,
    hookTimeout: 900_000,
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    include: ['packages/hive-mind-core/tests/soak/**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
});
