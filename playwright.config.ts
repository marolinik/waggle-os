/**
 * Playwright Configuration — Visual Regression + E2E User Journeys
 *
 * Two test suites:
 *   1. Visual regression: screenshot baselines for all 7 views (dark + light) = 14 baselines
 *   2. E2E user journeys: browser-automated interaction tests
 *
 * Usage:
 *   npx playwright test                              # Run all tests
 *   npx playwright test tests/visual                 # Visual regression only
 *   npx playwright test tests/e2e                    # E2E user journeys only
 *   npx playwright test --update-snapshots           # Update visual baselines
 *
 * The webServer config builds apps/web and auto-starts the Waggle server
 * (with --skip-litellm for CI). The server serves the freshly-built React
 * frontend from <root>/dist/ at localhost:3333 — matching the canonical
 * `npm run build` target so tests always run against the latest source.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts', // Only run .spec.ts files (excludes Vitest .test.ts files)
  snapshotDir: './tests/visual/baselines',
  snapshotPathTemplate: '{snapshotDir}/{testName}/{arg}{ext}',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.003, // 0.3% threshold
      animations: 'disabled',
    },
  },
  fullyParallel: false, // Sequential to avoid port conflicts
  retries: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3333',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1200, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Auto-start the Waggle server before tests run.
   * --skip-litellm ensures tests don't need a real LLM provider.
   *
   * The command builds apps/web first (root `npm run build` → <root>/dist)
   * so Playwright always runs against the current source. `reuseExisting-
   * Server: true` skips this when a dev server is already running on :3333
   * (developer runs `npm run dev` in another terminal + `npx playwright test`;
   * the config notices the port is occupied and skips build+start).
   *
   * The server auto-detects <root>/dist per packages/server/src/local/
   * index.ts — no WAGGLE_FRONTEND_DIR override needed. */
  webServer: {
    command: 'npm run build && npx tsx packages/server/src/local/start.ts --skip-litellm',
    port: 3333,
    reuseExistingServer: true,
    timeout: 120_000, // 2 min — Vite build (~30-60s) + server boot (~5-10s)
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
