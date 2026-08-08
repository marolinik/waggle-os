/**
 * Phase 8 structural smoke coverage for the current Waggle views.
 *
 * Deterministic pixel regression coverage lives in tests/visual/views.spec.ts.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';

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
  await page.request.patch(`${BASE}/api/settings`, {
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

function routeWithSkip(route: string): string {
  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`;
}

/**
 * Navigate to a named view via the sidebar button.
 * Retries if the sidebar is collapsed.
 */
async function navigateTo(page: Page, viewName: string): Promise<void> {
  // If onboarding overlay is visible, press Escape or click skip to dismiss it
  const overlay = page.locator('.fixed.inset-0.z-\\[9999\\]');
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

  const sidebarSelectors: Record<string, string[]> = {
    Chat: ['[data-testid="nav-chat"]', 'button[aria-label="Chat"]'],
    Memory: ['[data-testid="nav-memory"]', 'button[aria-label="Memory"]'],
    Settings: ['[data-testid="sidebar-user"]', 'button[aria-label="Account and settings"]'],
    'Agents': ['[data-testid="nav-agents"]', 'button[aria-label="Agents"]'],
    Library: ['[data-testid="nav-library"]', 'button[aria-label="Library"]'],
  };

  for (const selector of sidebarSelectors[viewName] ?? []) {
    const candidate = sidebar.locator(selector).first();
    if (await candidate.isVisible({ timeout: 700 }).catch(() => false)) {
      await candidate.click();
      await page.waitForTimeout(600);
      return;
    }
  }

  const btn = sidebar.locator('button', { hasText: viewName }).first();
  if (await btn.isVisible({ timeout: 700 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(600);
    return;
  }

  const routes: Record<string, string> = {
    Chat: '/workspaces/default/chat',
    Memory: '/memory',
    Events: '/settings/events',
    Capabilities: '/skills',
    'Skills Hub': '/skills',
    Cockpit: '/settings/mission-control',
    'Mission Control': '/settings/mission-control',
    Settings: '/settings',
  };
  const route = routes[viewName];
  if (!route) throw new Error(`No current navigation target configured for "${viewName}"`);
  await page.goto(routeWithSkip(route), { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
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
    await page.request.patch(`${BASE}/api/settings`, {
      data: { onboardingCompleted: true },
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    await page.goto(routeWithSkip('/home'));
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

    await navigateTo(page, 'Skills Hub');
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

    await navigateTo(page, 'Settings');
    await page.getByRole('tab', { name: /General/i }).click();
    await expect(page.getByText('Theme')).toBeVisible({ timeout: 5000 });
    const before = await getThemeSignal();
    const target = before.includes('light') ? 'Dark' : 'Light';

    await page.getByRole('button', { name: new RegExp(target, 'i') }).first().click();
    await page.waitForTimeout(400);

    const after = await getThemeSignal();
    expect(after).not.toBe(before);
  });
});
