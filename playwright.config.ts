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
 * The webServer config auto-starts the Waggle server (with --skip-litellm for CI).
 * The server serves the built frontend from app/dist/ at localhost:3333.
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
   * The server serves the built React frontend from app/dist/ as static files. */
  webServer: {
    command: 'npx tsx packages/server/src/local/start.ts --skip-litellm',
    port: 3333,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
