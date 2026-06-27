/**
 * E2E User Journey Tests — current AppShell browser journeys.
 *
 * These tests exercise the live single-canvas shell as a fresh returning user:
 * navigation, shortcuts, chat entry, command search, settings, theme, home,
 * keyboard help, and status-bar context.
 */

import { test, expect, type Page } from '@playwright/test';

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';

function routeWithSkip(route: string) {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

async function gotoApp(page: Page, route = '/home') {
  await page.goto(routeWithSkip(route), { waitUntil: 'domcontentloaded' });
  await waitForShell(page);
}

async function waitForShell(page: Page) {
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
  await page.waitForTimeout(300);
}

async function openViaNav(page: Page, testId: string, routePattern: RegExp) {
  await page.getByTestId(testId).click();
  await page.waitForURL(routePattern, { timeout: 10_000 });
  await waitForShell(page);
}

async function pressCtrlShiftDigit(page: Page, digit: string) {
  await page.evaluate((d) => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: d,
      code: `Digit${d}`,
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    }));
  }, digit);
}

test.describe('User Journey Tests', () => {
  test('J1: app loads successfully — no blank screen', async ({ page }) => {
    await gotoApp(page, '/home');

    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByText('Waggle AI')).toBeVisible();
  });

  test('J2: sidebar shows current navigation items', async ({ page }) => {
    await gotoApp(page);

    const sidebar = page.getByRole('navigation', { name: 'Primary' });
    await expect(sidebar).toBeVisible();

    for (const label of ['Home', 'Chat', 'Memory', 'Agents & tasks', 'Library']) {
      await expect(sidebar.getByRole('button', { name: label })).toBeVisible();
    }
    await expect(page.getByTestId('sidebar-command')).toBeVisible();
    await expect(page.getByTestId('nav-spawn-agent')).toBeVisible();
  });

  test('J3: workspace switcher opens and closes', async ({ page }) => {
    await gotoApp(page);

    await page.getByTestId('sidebar-workspace').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/workspace/i);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('J4: navigate between primary surfaces using sidebar', async ({ page }) => {
    await gotoApp(page);

    await openViaNav(page, 'nav-memory', /\/memory/);
    await expect(page.locator('body')).toContainText(/memory/i);

    await openViaNav(page, 'nav-agents', /\/agents/);
    await expect(page.locator('body')).toContainText(/agent|task|template/i);

    await openViaNav(page, 'nav-library', /\/artifacts/);
    await expect(page.locator('body')).toContainText(/artifact|library|file|workspace/i);

    await openViaNav(page, 'nav-home', /\/home/);
    await expect(page.locator('body')).toContainText(/workspace|today|continue|create/i);
  });

  test('J5: navigate views with keyboard shortcuts', async ({ page }) => {
    await gotoApp(page);

    await pressCtrlShiftDigit(page, '7');
    await page.waitForURL(/\/settings/, { timeout: 10_000 });
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible();

    await pressCtrlShiftDigit(page, '5');
    await page.waitForURL(/\/memory/, { timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/memory/i);

    await pressCtrlShiftDigit(page, '2');
    await page.waitForURL(/\/agents/, { timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/agent|task|template/i);
  });

  test('J6: chat textarea accepts input', async ({ page, request }) => {
    const workspacesRes = await request.get('/api/workspaces');
    const workspaces = await workspacesRes.json();
    let workspaceId = Array.isArray(workspaces) ? workspaces[0]?.id : undefined;
    if (!workspaceId) {
      const createRes = await request.post('/api/workspaces', {
        data: { name: `Journey Chat ${Date.now()}`, group: 'Workspaces', description: 'Chat journey workspace' },
      });
      expect(createRes.ok()).toBeTruthy();
      const created = await createRes.json();
      const workspace = created.workspace ?? created.data ?? created;
      workspaceId = workspace.id ?? workspace.name;
    }
    expect(workspaceId).toBeTruthy();

    await gotoApp(page, `/workspaces/${workspaceId}/chat`);
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill('Hello Waggle, this is a test message');
    await expect(textarea).toHaveValue('Hello Waggle, this is a test message');

    await textarea.fill('/help');
    await expect(textarea).toHaveValue('/help');
  });

  test('J7: global search opens, searches, selects, and closes', async ({ page }) => {
    await gotoApp(page);

    await page.keyboard.press('Control+k');
    const dialog = page.getByTestId('command-center-dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const searchInput = dialog.locator('input, [data-slot="command-input"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('memory');
    await expect(dialog).toContainText(/memory/i);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('J8: settings view shows tabs and tab content', async ({ page }) => {
    await gotoApp(page, '/settings');

    const tablist = page.getByRole('tablist', { name: 'Settings sections' });
    await expect(tablist).toBeVisible();

    await expect(tablist.getByRole('tab', { name: /Models/i })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /General/i })).toBeVisible();

    const panel = page.getByRole('tabpanel').first();
    await tablist.getByRole('tab', { name: /General/i }).click();
    await expect(panel).toContainText(/Theme|Local-first/i);

    await tablist.getByRole('tab', { name: /Models/i }).click();
    await expect(panel).toContainText(/Model|provider|local/i);
  });

  test('J9: theme cards switch dark/light mode', async ({ page }) => {
    await gotoApp(page, '/settings?tab=general');

    const panel = page.getByRole('tabpanel');
    await panel.getByRole('button', { name: /Light/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await panel.getByRole('button', { name: /Dark/i }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
  });

  test('J10: home view shows dashboard workspace affordances', async ({ page }) => {
    await gotoApp(page, '/home');

    const home = page.locator('[data-testid="home-cockpit"], [data-testid="home-cockpit-empty"]').first();
    await expect(home).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/workspace|today|create|continue/i);
  });

  test('J11: keyboard shortcuts help overlay opens and closes', async ({ page }) => {
    await gotoApp(page);

    await page.keyboard.press('Control+/');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/Keyboard Shortcuts/i);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('J12: status bar displays product and active surface context', async ({ page }) => {
    await gotoApp(page, '/memory');

    await expect(page.getByText('Waggle AI')).toBeVisible();
    await expect(page.getByTestId('statusbar-focused-window')).toContainText(/memory/i);
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  });
});
