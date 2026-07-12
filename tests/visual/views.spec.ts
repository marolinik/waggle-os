/**
 * Legacy Visual Regression suite for the current AppShell.
 *
 * Keeps the original 7-view snapshot names, but routes directly to the modern
 * surfaces instead of clicking retired positional sidebar items.
 */

import { test, expect, type Page } from '@playwright/test';

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';

const VIEWS = [
  { name: 'chat', route: 'chat' },
  { name: 'memory', route: '/memory' },
  { name: 'events', route: '/settings/events' },
  { name: 'capabilities', route: '/skills' },
  { name: 'cockpit', route: '/home' },
  { name: 'mission-control', route: '/settings/mission-control' },
  { name: 'settings', route: '/settings?tab=models' },
] as const;

const THEME_LABELS = {
  dark: 'Dark Mode',
  light: 'Light Mode',
} as const;

function routeWithSkip(route: string) {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

async function firstWorkspaceChatRoute(page: Page) {
  const res = await page.request.get('/api/workspaces');
  const workspaces = await res.json();
  const workspaceId = Array.isArray(workspaces) ? workspaces[0]?.id : null;
  return workspaceId ? `/workspaces/${workspaceId}/chat` : '/home';
}

async function applyTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((mode) => {
    localStorage.setItem('waggle-theme', mode);
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'power',
      tooltipsDismissed: true,
    }));
    if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }, theme);
}

async function gotoVisualView(page: Page, view: typeof VIEWS[number], theme: 'dark' | 'light') {
  await applyTheme(page, theme);
  const route = view.route === 'chat' ? await firstWorkspaceChatRoute(page) : view.route;
  await page.goto(routeWithSkip(route), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
  await page.waitForLoadState('domcontentloaded');
  await waitForVisualReady(page, view.name);
  await page.evaluate((mode) => {
    localStorage.setItem('waggle-theme', mode);
    if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }, theme);
  await page.waitForTimeout(800);
  await stabilizeVisuals(page);
}

async function waitForVisualReady(page: Page, viewName: typeof VIEWS[number]['name']) {
  await page.waitForFunction(() => !document.body.innerText.includes('Loading workspace'), null, { timeout: 15_000 }).catch(() => {});

  if (viewName === 'chat') {
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'memory') {
    await expect(page.getByTestId('memory-center-app')).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'cockpit') {
    await expect(page.locator('[data-testid="home-cockpit"], [data-testid="home-cockpit-empty"]').first()).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'settings') {
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'capabilities') {
    await expect(page.locator('body')).toContainText(/skill|capabilit|marketplace/i, { timeout: 15_000 });
    return;
  }
  if (viewName === 'events') {
    await expect(page.locator('body')).toContainText(/event|timeline|agent/i, { timeout: 15_000 });
    return;
  }
  if (viewName === 'mission-control') {
    await expect(page.locator('body')).toContainText(/cockpit|health|cost/i, { timeout: 15_000 });
  }
}

async function stabilizeVisuals(page: Page) {
  await page.addStyleTag({
    content: `
      [aria-label="Notifications"],
      [data-testid="statusbar-memory-count"],
      [data-testid="statusbar-tokens"],
      [data-testid="statusbar-cost"],
      [data-testid="import-reminder-banner"],
      [data-testid="import-reminder-banner-cc"],
      [data-testid="home-cockpit-facts"],
      [data-testid="home-cockpit-start-here"] h2,
      [data-testid="home-cockpit-start-here"] h2 ~ p,
      [data-testid^="home-cockpit-ws-"] .truncate,
      [data-testid^="home-cockpit-ws-"] p,
      [data-testid^="home-cockpit-continue-"] {
        visibility: hidden !important;
      }
    `,
  });
  await page.evaluate(() => {
    const dynamicText = [
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s/i,
      /^\d{1,2}:\d{2}$/,
      /^Last active:/i,
      /^just now$/i,
      /^\d+[mhdw] ago$/i,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
      /^Upcoming:/i,
    ];
    for (const el of Array.from(document.querySelectorAll('span, p, button, time, div'))) {
      const text = (el.textContent ?? '').trim();
      if (dynamicText.some(pattern => pattern.test(text)) && (el.children.length === 0 || el.tagName === 'BUTTON')) {
        (el as HTMLElement).style.visibility = 'hidden';
      }
    }
  });
  await page.waitForTimeout(200);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`Visual Regression - ${THEME_LABELS[theme]}`, () => {
    for (const view of VIEWS) {
      test(`${view.name} view - ${theme}`, async ({ page }) => {
        await gotoVisualView(page, view, theme);
        await expect(page).toHaveScreenshot(`${view.name}-${theme}.png`, {
          fullPage: false,
        });
      });
    }
  });
}
