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
 * The webServer config builds workspace packages plus apps/web, then auto-starts the Waggle server
 * (with --skip-litellm for CI). The server serves the freshly-built React
 * frontend from <root>/dist/ at localhost:3333 — matching the canonical
 * `npm run build:all` target so tests always run against the latest source.
 */

import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// Playwright enables FORCE_COLOR for its workers; remove an inherited
// NO_COLOR flag first so Node does not report the conflicting pair.
delete process.env.FORCE_COLOR;
delete process.env.NO_COLOR;

const e2eDataDir = process.env.WAGGLE_E2E_DATA_DIR
  ?? path.join(os.tmpdir(), `waggle-os-playwright-${process.pid}`);
const e2eBaseURL = process.env.WAGGLE_E2E_BASE_URL
  ?? `http://127.0.0.1:${process.env.WAGGLE_E2E_PORT ?? '3333'}`;
const e2eURL = new URL(e2eBaseURL);
const e2ePort = Number.parseInt(
  process.env.WAGGLE_E2E_PORT ?? e2eURL.port ?? '3333',
  10,
) || 3333;
const e2eSkipLiteLLM = process.env.WAGGLE_E2E_SKIP_LITELLM !== '0';
const e2eReuseExistingServer = process.env.WAGGLE_E2E_REUSE_EXISTING_SERVER !== '0';
const e2eEnv = { ...process.env };
const e2eNodeEnvName = 'WAGGLE_E2E_NODE_EXEC';
const e2eNodeCommand = process.platform === 'win32'
  ? `"%${e2eNodeEnvName}%"`
  : `"$${e2eNodeEnvName}"`;
e2eEnv[e2eNodeEnvName] = process.execPath;
// Keep the test runner's terminal quiet without changing production logging.
e2eEnv.FORCE_COLOR = undefined;
e2eEnv.NO_COLOR = undefined;
e2eEnv.NODE_OPTIONS = `${e2eEnv.NODE_OPTIONS ?? ''} --disable-warning=DEP0040`.trim();

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
  workers: 1,
  retries: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: e2eBaseURL,
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
   * The command builds workspace packages and apps/web first (`npm run build:all`)
   * so Playwright always runs against current package and web source. `reuseExisting-
   * Server: true` skips this when a dev server is already running on :3333
   * (developer runs `npm run dev` in another terminal + `npx playwright test`;
   * the config notices the port is occupied and skips build+start). Set
   * WAGGLE_E2E_REUSE_EXISTING_SERVER=0 for isolated acceptance runs.
   *
  * The server auto-detects <root>/dist per packages/server/src/local/
  * index.ts — no WAGGLE_FRONTEND_DIR override needed. */
  webServer: {
    command: `npm run build:all && ${e2eNodeCommand} node_modules/tsx/dist/cli.mjs packages/server/src/local/start.ts${e2eSkipLiteLLM ? ' --skip-litellm' : ''}`,
    url: new URL('/health', e2eBaseURL).toString(),
    reuseExistingServer: e2eReuseExistingServer,
    timeout: 300_000, // Full workspace build + cold tsx sidecar import can exceed 3 min on Windows
    stdout: 'pipe',
    stderr: 'pipe',
    // D1: the e2e suite drives /api/* routes directly (no token bootstrap), so
    // trust loopback in the harness — mirrors vitest.setup.ts which defaults
    // this ON for the test env. The production default stays SECURE (token
    // required); this only affects the locally-spawned test server.
    env: {
      ...e2eEnv,
      WAGGLE_PORT: String(e2ePort),
      WAGGLE_TRUST_LOCALHOST: '1',
      WAGGLE_RATE_LIMIT_MAX_REQUESTS: '2000',
      WAGGLE_DISABLE_MARKETPLACE_SYNC: '1',
      WAGGLE_SUPPRESS_EMBEDDING_WARNING: '1',
      WAGGLE_DATA_DIR: e2eDataDir,
      EMBEDDING_PROVIDER: 'mock',
      VITE_WAGGLE_E2E: '1',
      VITE_CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
    },
  },
});
