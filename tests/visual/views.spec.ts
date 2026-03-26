/**
 * 9G-4: Visual Regression Tests — Screenshot baselines for all 7 views.
 *
 * Each view is tested in both dark and light mode = 14 baselines total.
 * The server must be running at localhost:3333 before running these tests.
 *
 * To generate baselines:
 *   npx playwright test --update-snapshots
 *
 * To verify:
 *   npx playwright test
 */

import { test, expect } from '@playwright/test';

// The 7 views in Waggle and their sidebar navigation indices
const VIEWS = [
  { name: 'chat', navIndex: 0, label: 'Chat' },
  { name: 'memory', navIndex: 1, label: 'Memory' },
  { name: 'events', navIndex: 2, label: 'Events' },
  { name: 'capabilities', navIndex: 3, label: 'Capabilities' },
  { name: 'cockpit', navIndex: 4, label: 'Cockpit' },
  { name: 'mission-control', navIndex: 5, label: 'Mission Control' },
  { name: 'settings', navIndex: 6, label: 'Settings' },
] as const;

// Wait for the app to fully load (SPA hydration + data fetches)
async function waitForAppReady(page: import('@playwright/test').Page) {
  // Wait for the main app shell to render
  await page.waitForSelector('[data-testid="app-shell"], .app-shell, main', {
    timeout: 10_000,
  }).catch(() => {
    // Fallback: just wait for any content
  });
  // Let React settle
  await page.waitForTimeout(1000);
}

// Navigate to a specific view by clicking the sidebar nav item
async function navigateToView(page: import('@playwright/test').Page, navIndex: number) {
  // Sidebar nav buttons — try data-testid first, then positional
  const navButtons = page.locator('nav button, [role="navigation"] button, .sidebar button');
  const count = await navButtons.count();

  if (count > navIndex) {
    await navButtons.nth(navIndex).click();
    await page.waitForTimeout(500); // Let view transition complete
  }
}

// Set theme mode
async function setTheme(page: import('@playwright/test').Page, mode: 'dark' | 'light') {
  await page.evaluate((m) => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(m);
    // Also try setting the data attribute pattern
    document.documentElement.setAttribute('data-theme', m);
  }, mode);
  await page.waitForTimeout(300); // Let CSS transitions settle
}

test.describe('Visual Regression — Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await setTheme(page, 'dark');
  });

  for (const view of VIEWS) {
    test(`${view.name} view — dark`, async ({ page }) => {
      await navigateToView(page, view.navIndex);
      await expect(page).toHaveScreenshot(`${view.name}-dark.png`, {
        fullPage: false,
      });
    });
  }
});

test.describe('Visual Regression — Light Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await setTheme(page, 'light');
  });

  for (const view of VIEWS) {
    test(`${view.name} view — light`, async ({ page }) => {
      await navigateToView(page, view.navIndex);
      await expect(page).toHaveScreenshot(`${view.name}-light.png`, {
        fullPage: false,
      });
    });
  }
});
