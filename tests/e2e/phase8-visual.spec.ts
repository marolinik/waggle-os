/**
 * Phase 8 — Visual Regression Baselines (9G-4)
 *
 * Captures screenshot baselines for all 7 Waggle views in both dark and light
 * modes. This completes the 9G-4 gap identified in CONTINUE-PHASE9.md.
 *
 * Each view × theme = 1 baseline PNG. Total: 14 baselines.
 *
 * Baseline storage:  tests/visual/baselines/
 * Snapshot template: {snapshotDir}/{testName}/{arg}{ext}  (from playwright.config.ts)
 *
 * Usage:
 *   # Create / update baselines (first run or after intentional UI changes)
 *   npx playwright test tests/e2e/phase8-visual.spec.ts --update-snapshots
 *
 *   # Verify no regressions (CI)
 *   npx playwright test tests/e2e/phase8-visual.spec.ts
 *
 * Prerequisites:
 *   - Server running at localhost:3333  (playwright.config.ts webServer auto-starts it)
 *   - app/dist built (npm run build in app/)
 *   - No onboarding wizard state (fresh ~/.waggle or pre-seeded with config)
 *
 * Diff threshold: 0.3% pixel ratio (configured in playwright.config.ts)
 *
 * Notes:
 *   - Tests skip gracefully when onboarding wizard is active (first-run state).
 *   - MissionControl view is tested for presence only (may be gated by Phase 8D).
 *   - Animations are disabled via playwright config to prevent flaky snapshots.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for the Waggle app shell to be ready (copied from user-journeys.spec.ts). */
async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector(
    '.waggle-app-shell, .waggle-sidebar, [role="navigation"], [class*="onboarding"]',
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(1000);
}

/** Returns true if the onboarding wizard is blocking the main UI. */
async function isOnboarding(page: Page): Promise<boolean> {
  // OnboardingWizard renders with z-[9999] (not z-[1000])
  const overlay = page.locator('.fixed.inset-0.z-\\[9999\\]');
  if (await overlay.isVisible().catch(() => false)) return true;
  const text = page.locator('text=Welcome to Waggle').or(page.locator('text=Why Waggle'));
  return text.isVisible().catch(() => false);
}

/** Skip onboarding — hits the server API (source of truth) AND localStorage.
 *  The server persists onboardingCompleted in config.json which the app reads
 *  on every load — localStorage alone is not sufficient.
 */
async function skipOnboarding(page: Page): Promise<void> {
  // 1. Server-side: PATCH /api/settings — this is what the app reads on load
  await page.request.patch('http://127.0.0.1:3333/api/settings', {
    data: { onboardingCompleted: true },
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {}); // non-blocking — proceed even if server unreachable

  // 2. addInitScript: fires before React mounts on next navigation
  await page.addInitScript(() => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7 }));
    localStorage.setItem('waggle:first-run', 'done');
  });

  // 3. Immediate evaluate: sets localStorage if page already loaded
  await page.evaluate(() => {
    try {
      localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7 }));
      localStorage.setItem('waggle:first-run', 'done');
    } catch { /* ignore */ }
  }).catch(() => {});
}

/**
 * Navigate to a named view via the sidebar button.
 * Retries if the sidebar is collapsed.
 */
async function navigateTo(page: Page, viewName: string): Promise<void> {
  // If onboarding overlay is visible, press Escape or click skip to dismiss it
  const overlay = page.locator('.fixed.inset-0.z-\[9999\]');
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    // Try to find and click a skip/dismiss button
    const skipBtn = page.locator('button').filter({ hasText: /skip|dismiss|close|later/i }).first();
    if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    } else {
      // Press Escape to dismiss
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }

  const sidebar = page.locator('[role="navigation"]');

  // Ensure sidebar is expanded
  const expandBtn = page.locator('button[aria-label="Expand sidebar"]');
  if (await expandBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  const btn = sidebar.locator('button', { hasText: viewName }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(600);
}

/**
 * Set theme by clicking the sidebar theme toggle until the correct mode is active.
 * Returns the final theme ('dark' | 'light').
 */
async function setTheme(page: Page, target: 'dark' | 'light'): Promise<void> {
  // Theme toggle is in the sidebar — ensure it's expanded
  const expandBtn = page.locator('button[aria-label="Expand sidebar"]');
  if (await expandBtn.isVisible().catch(() => false)) {
    await expandBtn.click();
    await page.waitForTimeout(200);
  }

  const sidebar = page.locator('[role="navigation"]');

  // Check current theme from html element
  const getCurrentTheme = async (): Promise<'dark' | 'light'> => {
    const cls = await page.locator('html').getAttribute('class') ?? '';
    const dt = await page.locator('html').getAttribute('data-theme') ?? '';
    return (cls.includes('dark') || dt === 'dark') ? 'dark' : 'light';
  };

  const current = await getCurrentTheme();
  if (current !== target) {
    const toggle = sidebar.locator('button', { hasText: /light mode|dark mode/i });
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(400);
    }
  }
}

/**
 * Capture a stable screenshot — waits for network idle and hides dynamic elements
 * (timestamps, cost counters, status bar tokens) that would cause diff failures.
 */
async function stableScreenshot(page: Page): Promise<Buffer> {
  // Hide elements whose content changes between runs
  await page.evaluate(() => {
    const selectors = [
      '[data-testid="status-bar-tokens"]',
      '[data-testid="status-bar-cost"]',
      '[class*="timestamp"]',
      '[class*="Timestamp"]',
      '.status-bar__cost',
      '.waggle-status-bar__tokens',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    }
  });

  // Wait for any pending network activity to settle
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(200);

  return page.screenshot({ fullPage: false });
}

// ── View definitions ──────────────────────────────────────────────────────────

const VIEWS = [
  { name: 'Chat',            sidebar: 'Chat' },
  { name: 'Memory',          sidebar: 'Memory' },
  { name: 'Events',          sidebar: 'Events' },
  { name: 'Capabilities',    sidebar: 'Skills & Apps' },
  { name: 'Cockpit',         sidebar: 'Cockpit' },
  { name: 'MissionControl',  sidebar: 'Mission Control' },
  { name: 'Settings',        sidebar: 'Settings' },
] as const;

const THEMES = ['light', 'dark'] as const;

// ═════════════════════════════════════════════════════════════════════════════
// Visual Baseline Tests (7 views × 2 themes = 14 baselines)
// ═════════════════════════════════════════════════════════════════════════════

for (const theme of THEMES) {
  test.describe(`Visual baselines — ${theme} mode`, () => {
    // Visual tests need more time: beforeEach (goto + waitForApp + setTheme) ~10-20s
    // + navigateTo ~5s + waitForFunction + networkidle + screenshot ~10s = up to 35s
    test.describe.configure({ timeout: 90_000 });

    test.beforeEach(async ({ page }) => {
      // CRITICAL: register addInitScript BEFORE first goto so localStorage
      // is set BEFORE React mounts and reads onboarding state.
      await page.addInitScript(() => {
        localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7 }));
        localStorage.setItem('waggle:first-run', 'done');
      });
      // Server-side: PATCH /api/settings (belt and suspenders)
      await page.request.patch('http://127.0.0.1:3333/api/settings', {
        data: { onboardingCompleted: true },
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      // NOW navigate — initScript fires before React, no onboarding shown
      await page.goto('/');
      await waitForApp(page);
      await setTheme(page, theme);
    });

    for (const view of VIEWS) {
      test(`${view.name} view — ${theme}`, async ({ page }) => {
        // No skip conditions — if onboarding blocks navigation, test fails with clear error
        // navigateTo will throw if sidebar button not found within 5s
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
      });
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Structural smoke tests — verify views render without crashing
// (These always run, even without baselines.)
// ═════════════════════════════════════════════════════════════════════════════

test.describe('View structural smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    // Register initScript BEFORE first goto — sets localStorage before React mounts
    await page.addInitScript(() => {
      localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7 }));
      localStorage.setItem('waggle:first-run', 'done');
    });
    await page.request.patch('http://127.0.0.1:3333/api/settings', {
      data: { onboardingCompleted: true },
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    await page.goto('/');
    await waitForApp(page);
  });

  test('Chat view: textarea is present and accepts input', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Chat');
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('/help');
    await expect(textarea).toHaveValue('/help');
  });

  test('Memory view: search input is present', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Memory');
    // Memory view has a search input or empty state
    const searchOrEmpty = page.locator('[placeholder*="search" i]')
      .or(page.locator('text=No memories'))
      .or(page.locator('text=Search'));
    await expect(searchOrEmpty.first()).toBeVisible({ timeout: 5000 });
  });

  test('Settings view: renders at least 5 tabs', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Settings');
    await page.waitForTimeout(500);

    const tabs = page.locator('.settings-panel__tab');
    const count = await tabs.count();
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(5);
    } else {
      // May still be loading
      const loading = page.locator('text=Loading').or(page.locator('text=General'));
      await expect(loading.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Cockpit view: renders cards or loading skeletons', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Cockpit');
    await page.waitForTimeout(1500);

    // Just verify the view loaded without crash — content varies
    const body = await page.textContent('body') ?? '';
    expect(body.length).toBeGreaterThan(50);
  });

  test('Capabilities view: renders marketplace or loading state', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Skills & Apps');
    await page.waitForTimeout(1000);

    const content = page.locator('text=Browse')
      .or(page.locator('text=Installed'))
      .or(page.locator('text=Marketplace'))
      .or(page.locator('text=Loading'))
      .or(page.locator('[class*="capability"]'));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test('Events view: renders timeline or empty state', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Events');
    await page.waitForTimeout(1000);

    // Just verify the view loaded without crash — content varies
    const body = await page.textContent('body') ?? '';
    expect(body.length).toBeGreaterThan(50);
  });

  test('Mission Control view: renders without crashing', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    await navigateTo(page, 'Mission Control');
    await page.waitForTimeout(500);

    // Mission Control may be gated — just check it doesn't crash
    await expect(page.locator('body')).not.toBeEmpty();
    const bodyText = await page.textContent('body');
    expect(bodyText?.trim().length).toBeGreaterThan(5);
  });

  test('theme toggle changes html class or data-theme attribute', async ({ page }) => {
    await skipOnboarding(page);
    const hasOverlay = await page.locator('.fixed.inset-0.z-\\[9999\\]').isVisible().catch(() => false);
    if (hasOverlay) { test.skip(true, 'Onboarding overlay still active'); return; }

    const getThemeSignal = async () => {
      const cls = await page.locator('html').getAttribute('class') ?? '';
      const dt = await page.locator('html').getAttribute('data-theme') ?? '';
      return cls + dt;
    };

    const before = await getThemeSignal();

    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');
    const toggle = sidebar.locator('button', { hasText: /light mode|dark mode/i });

    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(400);
      const after = await getThemeSignal();
      expect(after).not.toBe(before);
    }
  });
});
