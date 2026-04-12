Read CLAUDE.md before proceeding.

This is the complete E2E test stabilization sprint.
All fixes are surgical — read each file before editing.
Zero TypeScript errors required. Target: 291/291 passing, 0 skipped, runtime < 20 min.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT — Current State
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Last run results:
  waggle-complete.spec.ts        89 tests  — 89 passed
  user-behavior.spec.ts          60 tests  — 60 passed
  competitive-benchmarks.spec.ts 52 tests  — 52 passed
  full-wiring-audit.spec.ts      60 tests  — 60 passed
  user-journeys.spec.ts          12 tests  — 12 passed
  phase8-visual.spec.ts          22 tests  — ~0 passed, 1 failed, 22 skipped

3 flaky (pass on retry): workspaces race, Chat view snapshot, Settings view timing
22 skipped: ALL from phase8-visual.spec.ts — onboarding not cleared reliably
Runtime: ~1 hour (unacceptable for development loop)

playwright.config.ts already has:
  - Two projects: 'api' (retries:1, workers:2) and 'visual' (retries:2, workers:1)
  - actionTimeout: 10_000, navigationTimeout: 20_000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — Fix phase8-visual.spec.ts (22 skipped → 0 skipped)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Root cause: test.skip() inside beforeEach does NOT reliably propagate
to individual tests in Playwright. Each test runs its own isOnboarding()
check which returns true because localStorage may not persist across
the page.reload() in some Playwright worker contexts.

Read tests/e2e/phase8-visual.spec.ts fully before editing.

FIX 1a — Replace isOnboarding() to only check for visible overlay,
NOT sidebar absence (sidebar slow to render = false positive):

  async function isOnboarding(page: Page): Promise<boolean> {
    const overlay = page.locator('.fixed.inset-0.z-\\[1000\\]');
    if (await overlay.isVisible().catch(() => false)) return true;
    const text = page.locator('text=Welcome').or(page.locator('text=Get Started'));
    return text.isVisible().catch(() => false);
  }

FIX 1b — Fix beforeEach in the visual baselines for() loop.
Triple skipOnboarding + extended sidebar timeout + reload retry:

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await skipOnboarding(page);
    await page.reload();
    await skipOnboarding(page);
    await page.waitForTimeout(400);
    await skipOnboarding(page); // third call — belt and suspenders

    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');
    const loaded = await sidebar.isVisible({ timeout: 25000 }).catch(() => false);
    if (!loaded) {
      await page.reload();
      await skipOnboarding(page);
      const retryLoaded = await sidebar.isVisible({ timeout: 20000 }).catch(() => false);
      if (!retryLoaded) {
        test.skip(true, 'App shell did not load after retry');
        return;
      }
    }
    await setTheme(page, theme);
  });

FIX 1c — Fix each individual view test. Replace isOnboarding checks
with overlay-only check + skipOnboarding:

  // Inside each view test body (for view in VIEWS loop):
  await skipOnboarding(page);
  const hasOverlay = await page.locator('.fixed.inset-0.z-\\[1000\\]').isVisible().catch(() => false);
  if (hasOverlay) {
    test.skip(true, 'Onboarding overlay still visible');
    return;
  }
  // Remove the 'hasSidebar' check below — sidebar already verified in beforeEach

FIX 1d — Fix snapshot settling (replace fixed timers with waitForFunction):

  await navigateTo(page, view.sidebar);

  // Wait for view content — not a fixed timer
  await page.waitForFunction(() =>
    (document.body.textContent?.length ?? 0) > 100,
    { timeout: 8000 }
  ).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400); // short final settle for animations

  const screenshot = await stableScreenshot(page);
  expect(screenshot).toMatchSnapshot(`${view.name}-${theme}.png`);

FIX 1e — Fix View structural smoke tests beforeEach (triple skipOnboarding):

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await skipOnboarding(page);
    await page.reload();
    await skipOnboarding(page);
    await page.waitForTimeout(300);
    await skipOnboarding(page);
    await waitForApp(page);
  });

And in each smoke test body, replace isOnboarding checks with overlay-only:
  await skipOnboarding(page);
  const hasOverlay = await page.locator('.fixed.inset-0.z-\\[1000\\]').isVisible().catch(() => false);
  if (hasOverlay) { test.skip(true, 'Onboarding overlay visible'); return; }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — Fix 3 Flaky Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLAKY 1: full-wiring-audit.spec.ts — "workspaces load from API"
Root cause: waitForResponse race condition is inherently racy.
Fix: Replace the entire test body with a direct API call:

  test('workspaces load from API', async ({ page }) => {
    const res = await page.request.get(`${API}/api/workspaces`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

FLAKY 2: waggle-complete.spec.ts — "14.4 Settings view loads"
Root cause: waitForFunction condition too strict under load.
Fix: Find test 14.4, change the waitForFunction condition to:

  await page.waitForFunction(() =>
    (document.body.textContent?.length ?? 0) > 200,
    { timeout: 15000 }
  ).catch(() => {});

FLAKY 3: phase8-visual.spec.ts — "Chat view light snapshot mismatch"
Fixed by Phase 1 FIX 1d (waitForFunction replaces fixed timer).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3 — Add npm scripts to package.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read package.json. Add to the scripts section:

  "test:e2e":    "node node_modules/playwright/cli.js test --project=api --reporter=list",
  "test:visual": "node node_modules/playwright/cli.js test --project=visual --reporter=list",
  "test:all":    "node node_modules/playwright/cli.js test --reporter=list",
  "test:retry":  "node node_modules/playwright/cli.js test --last-failed --reporter=list",
  "test:fast":   "node node_modules/playwright/cli.js test --project=api --grep-invert=\"4\\.9|B8\\.5\" --reporter=list"

Use forward slashes (/) in paths, not backslashes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 4 — Regenerate Visual Baselines
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After all code fixes are applied, run:

  node node_modules\playwright\cli.js test tests/e2e/phase8-visual.spec.ts --update-snapshots --reporter=list

Expected: 22 tests execute, PNG baselines written to tests/visual/baselines/
This regenerates stale snapshots to match current UI state.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 5 — Verify
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run in order:

  # Step 1: API project (~5 min)
  node node_modules\playwright\cli.js test --project=api --reporter=list
  Expected: 269 tests, 0 failed, 0 skipped

  # Step 2: Visual project (~8 min, after --update-snapshots)
  node node_modules\playwright\cli.js test --project=visual --reporter=list
  Expected: 22 tests, 0 failed, 0 skipped

  # Step 3: If anything fails, retry only those
  node node_modules\playwright\cli.js test --last-failed --reporter=list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Edit phase8-visual.spec.ts — 5 fixes (1a through 1e)
2. Edit full-wiring-audit.spec.ts — replace 1 test body
3. Edit waggle-complete.spec.ts — change 1 waitForFunction timeout
4. Edit package.json — add 5 npm scripts
5. Run --update-snapshots on phase8-visual
6. Run --project=api → report results
7. Run --project=visual → report results
8. Run --last-failed if needed

REPORT:
  - Total/passed/failed/skipped for api project
  - Total/passed/failed/skipped for visual project
  - Runtime for each project
  - List any remaining failures with exact error message
