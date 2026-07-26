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

async function visibleHorizontalOverflow(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(elements => elements
    .map(el => {
      const rect = el.getBoundingClientRect();
      return {
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 80),
        left: Math.floor(rect.left),
        right: Math.ceil(rect.right),
        width: Math.ceil(rect.width),
      };
    })
    .filter(item => item.width > 0 && (item.left < -1 || item.right > window.innerWidth + 1)));
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

    for (const label of ['Home', 'Chat', 'Memory', 'Agents', 'Library']) {
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

  test('J3b: notification and create-workspace overlays have dialog close contracts', async ({ page }) => {
    await gotoApp(page);

    await page.getByRole('button', { name: /^Notifications/ }).click();
    const notifications = page.getByRole('dialog', { name: /notifications/i });
    await expect(notifications).toBeVisible({ timeout: 5_000 });
    await expect(notifications.getByRole('button', { name: /close notifications/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notifications).not.toBeVisible({ timeout: 5_000 });

    await page.getByTestId('sidebar-workspace').click();
    const switcher = page.getByRole('dialog', { name: /switch workspace/i });
    await expect(switcher).toBeVisible({ timeout: 5_000 });
    await switcher.getByRole('button', { name: /new workspace/i }).click();
    const createWorkspace = page.getByRole('dialog', { name: /create workspace/i });
    await expect(createWorkspace).toBeVisible({ timeout: 5_000 });
    await expect(createWorkspace.getByRole('button', { name: /close create workspace/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(createWorkspace).not.toBeVisible({ timeout: 5_000 });
  });

  test('J3c: tier interruption modal exposes a named close contract', async ({ page }) => {
    await gotoApp(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
        detail: {
          required: 'TEAMS',
          actual: 'FREE',
          message: 'Team workspaces require a Team plan.',
        },
      }));
    });

    const upgrade = page.getByRole('dialog', { name: /upgrade to unlock/i });
    await expect(upgrade).toBeVisible({ timeout: 5_000 });
    await upgrade.getByRole('button', { name: /close upgrade dialog/i }).click();
    await expect(upgrade).not.toBeVisible({ timeout: 5_000 });
  });

  test('J3d: approvals revoke-all uses an in-app confirmation', async ({ page }) => {
    const nativeDialogs: string[] = [];
    let clearCalled = false;

    await page.route('**/api/approval/pending', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pending: [], count: 0 }),
    }));
    await page.route('**/api/approval/grants', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        grants: [{
          id: 'grant-send-email',
          toolName: 'send_email',
          targetKey: 'client@example.com',
          sourceWorkspaceId: 'workspace-1',
          description: 'Always allow send_email to client@example.com',
          grantedAt: new Date().toISOString(),
          expiresAt: null,
        }],
        count: 1,
      }),
    }));
    await page.route('**/api/approval/grants/clear', route => {
      clearCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    page.on('dialog', async dialog => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await gotoApp(page, '/approvals');
    await page.getByRole('button', { name: /grants/i }).click();
    await expect(page.getByText('1 active grant')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /revoke all/i }).click();
    expect(nativeDialogs).toEqual([]);

    const modal = page.getByTestId('approval-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText(/revoke all saved approval grants/i);
    await expect(modal).toContainText(/1 saved grant/i);

    await page.getByTestId('approval-modal-approve').click();
    await expect.poll(() => clearCalled).toBe(true);
    await expect(page.getByText('No saved grants')).toBeVisible({ timeout: 5_000 });
  });

  test('J3e: artifact delete uses an in-app confirmation', async ({ page }) => {
    const nativeDialogs: string[] = [];
    let deleteCalled = false;
    const artifact = {
      id: 'artifact-brief',
      title: 'Quarterly Research Brief',
      kind: 'document',
      workspaceId: 'workspace-research',
      createdBy: 'agent-researcher',
      source: 'agent',
      status: 'ready',
      storagePath: '/artifacts/quarterly-brief.md',
      tags: ['research'],
      createdAt: '2026-07-08T08:00:00.000Z',
      updatedAt: '2026-07-08T09:00:00.000Z',
    };

    await page.route('**/api/artifacts**', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/artifacts/search-related') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ memories: [], sessions: [], tasks: [], agents: [], artifacts: [] }),
        });
      }
      if (url.pathname === '/api/artifacts' && request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [artifact], count: 1 }),
        });
      }
      if (url.pathname === '/api/artifacts/artifact-brief' && request.method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });
    page.on('dialog', async dialog => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await gotoApp(page, '/artifacts');
    await page.getByRole('button', { name: /quarterly research brief/i }).click();
    await expect(page.getByRole('dialog')).toContainText(/quarterly research brief/i);

    await page.getByRole('button', { name: /^delete$/i }).click();
    expect(nativeDialogs).toEqual([]);

    const modal = page.getByTestId('approval-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText(/delete artifact permanently/i);
    await expect(modal).toContainText(/backing file/i);

    await page.getByTestId('approval-modal-approve').click();
    await expect.poll(() => deleteCalled).toBe(true);
  });

  test('J3f: memory destructive trust actions use in-app confirmations', async ({ page }) => {
    const nativeDialogs: string[] = [];
    let deleteCalled = false;
    let eraseCalled = false;
    let allowCalled = false;
    const memory = {
      id: 'memory-research-note',
      kind: 'fact',
      title: 'Research Note',
      content: 'The supplier review belongs in the Q3 diligence packet.',
      scope: 'personal',
      workspaceId: null,
      source: 'user_stated',
      sourceId: null,
      sourceUrl: null,
      importance: 'normal',
      status: 'active',
      confidence: 91,
      tags: ['research'],
      evidence: [],
      hasOriginalSource: false,
      createdAt: '2026-07-08T08:00:00.000Z',
      updatedAt: '2026-07-08T09:00:00.000Z',
    };
    const suppression = {
      source: 'chatgpt',
      sourceRef: 'research-export.json',
      erasedAt: '2026-07-08T09:30:00.000Z',
      reason: 'GDPR Art.17 erasure',
    };

    await page.route('**/api/memory**', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/memory' && request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [memory], count: 1 }),
        });
      }
      if (url.pathname === '/api/memory/memory-research-note' && request.method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
      if (url.pathname === '/api/memory/erase' && request.method() === 'POST') {
        eraseCalled = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            erased: true,
            mind: 'personal',
            result: {
              framesDeleted: 1,
              archiveRedacted: 1,
              chunkVectorsPurged: 0,
              entitiesErased: 1,
              relationsErased: 0,
            },
          }),
        });
      }
      if (url.pathname === '/api/memory/suppression' && request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ mind: 'personal', suppressed: [suppression] }),
        });
      }
      if (url.pathname === '/api/memory/suppression/allow' && request.method() === 'POST') {
        allowCalled = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ removed: true, mind: 'personal' }),
        });
      }
      return route.continue();
    });
    page.on('dialog', async dialog => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await gotoApp(page, '/memory?tab=memories');
    const memoryPanel = page.getByTestId('memory-view-panel');
    const memoryCard = memoryPanel.getByLabel('Research Note', { exact: true });
    await memoryCard.click();
    await expect(page.getByRole('dialog')).toContainText(/research note/i);

    await page.getByRole('button', { name: /^delete$/i }).click();
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByTestId('approval-modal')).toContainText(/delete memory permanently/i);
    await expect(page.getByTestId('approval-modal')).toContainText(/archive/i);
    await page.getByTestId('approval-modal-approve').click();
    await expect.poll(() => deleteCalled).toBe(true);

    await memoryCard.click();
    await page.getByRole('button', { name: /^erase$/i }).click();
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByTestId('approval-modal')).toContainText(/erase memory and derived data/i);
    await expect(page.getByTestId('approval-modal')).toContainText(/cannot be undone/i);
    await page.getByTestId('approval-modal-approve').click();
    await expect.poll(() => eraseCalled).toBe(true);
    await expect(page.getByText(/erased "research note"/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /erased sources/i }).click();
    await expect(page.getByText('research-export.json')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /allow re-import/i }).click();
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByTestId('approval-modal')).toContainText(/allow source to be re-imported/i);
    await expect(page.getByTestId('approval-modal')).toContainText(/re-consented/i);
    await page.getByTestId('approval-modal-approve').click();
    await expect.poll(() => allowCalled).toBe(true);
  });

  test('J3g: wiki export destinations use in-app forms', async ({ page }) => {
    const nativeDialogs: string[] = [];
    let obsidianCalled = false;
    let notionCalled = false;
    let obsidianBody: unknown = null;
    let notionBody: unknown = null;
    const wikiPage = {
      slug: 'research-guide',
      pageType: 'entity',
      name: 'Research Guide',
      contentHash: 'hash-research-guide',
      markdown: '# Research Guide',
      frameIds: 'memory-1',
      compiledAt: '2026-07-08T09:00:00.000Z',
      sourceCount: 3,
    };

    await page.route('**/api/wiki/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/wiki/pages' && request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([wikiPage]),
        });
      }
      if (url.pathname === '/api/wiki/export/obsidian' && request.method() === 'POST') {
        obsidianCalled = true;
        obsidianBody = request.postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            outDir: 'C:/Research Vault',
            filesWritten: 3,
            indexPath: 'C:/Research Vault/_index.md',
            byType: { entity: 1, concept: 2 },
          }),
        });
      }
      if (url.pathname === '/api/wiki/export/notion' && request.method() === 'POST') {
        notionCalled = true;
        notionBody = request.postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pagesCreated: 1,
            pagesUpdated: 2,
            pagesUnchanged: 0,
            pagesFailed: 0,
            byType: { entity: 1 },
            errors: [],
          }),
        });
      }
      return route.continue();
    });
    page.on('dialog', async dialog => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await gotoApp(page, '/memory?tab=wiki');
    await expect(page.getByText('Research Guide')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /export to obsidian vault/i }).click();
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByTestId('wiki-export-dialog')).toContainText(/export to obsidian/i);
    await page.getByLabel(/obsidian vault directory/i).fill('  C:/Research Vault  ');
    await page.getByRole('button', { name: /^export to obsidian$/i }).click();
    await expect.poll(() => obsidianCalled).toBe(true);
    expect(obsidianBody).toEqual({ outDir: 'C:/Research Vault' });
    await expect(page.getByText(/obsidian export complete/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /export to notion workspace/i }).click();
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByTestId('wiki-export-dialog')).toContainText(/export to notion/i);
    await page.getByLabel(/notion root page url/i).fill('  https://www.notion.so/root  ');
    await page.getByRole('button', { name: /^export to notion$/i }).click();
    await expect.poll(() => notionCalled).toBe(true);
    expect(notionBody).toEqual({ rootPageUrl: 'https://www.notion.so/root' });
    await expect(page.getByText(/notion export complete/i)).toBeVisible({ timeout: 5_000 });
    expect(nativeDialogs).toEqual([]);
  });

  test('J3h: settings backup and restore trust actions stay in-app', async ({ page }) => {
    const nativeDialogs: string[] = [];
    let restoreCalled = false;

    await page.route('**/api/backup', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Vault key missing' }),
    }));
    await page.route('**/api/restore', route => {
      restoreCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    page.on('dialog', async dialog => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await gotoApp(page, '/settings?tab=backup');
    await expect(page.getByRole('heading', { name: /encrypted backup/i })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /create backup/i }).click();
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByRole('alert')).toContainText(/vault key missing/i);

    await page.getByLabel(/restore backup file/i).setInputFiles({
      name: 'research.waggle-backup',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('backup-data'),
    });
    expect(nativeDialogs).toEqual([]);
    await expect(page.getByTestId('approval-modal')).toContainText(/restore backup/i);
    await expect(page.getByTestId('approval-modal')).toContainText(/research\.waggle-backup/i);
    await expect(page.getByTestId('approval-modal')).toContainText(/overwrite current data/i);

    await page.getByTestId('approval-modal-approve').click();
    await expect.poll(() => restoreCalled).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: /backup restored successfully/i })).toBeVisible({ timeout: 5_000 });
    expect(nativeDialogs).toEqual([]);
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
      expect([200, 201, 403, 409]).toContain(createRes.status());
      if (createRes.ok()) {
        const created = await createRes.json();
        const workspace = created.workspace ?? created.data ?? created;
        workspaceId = workspace.id ?? workspace.name;
      } else {
        workspaceId = 'default';
      }
    }
    expect(workspaceId).toBeTruthy();

    await gotoApp(page, `/workspaces/${workspaceId}/chat`);
    const textarea = page.getByRole('textbox').first();
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

  test('J-mobile: Command Center is described and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);

    await page.keyboard.press('Control+k');
    const dialog = page.getByTestId('command-center-dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveAttribute('aria-describedby', /.+/);

    const describedBy = await dialog.getAttribute('aria-describedby');
    const description = await page.evaluate((id) => document.getElementById(id ?? '')?.textContent ?? '', describedBy);
    expect(description).toMatch(/search and run commands/i);

    const overflow = await visibleHorizontalOverflow(
      page,
      '[data-testid="command-center-dialog"] [cmdk-item]:visible, [data-testid="command-center-dialog"] [cmdk-item] *:visible, [data-testid="command-center-dialog"] input:visible, [data-testid="command-center-dialog"] kbd:visible',
    );
    expect(overflow, 'command center mobile overflow').toEqual([]);

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

  test('J-mobile: Settings is usable at 390px width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const routes = ['/settings', '/settings?tab=models', '/settings?tab=billing', '/settings/profile'];
    for (const route of routes) {
      await gotoApp(page, route);
      if (route !== '/settings/profile') {
        await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible();
        await expect(page.getByRole('tabpanel').first()).toBeVisible();
      } else {
        await expect(page.locator('body')).toContainText(/profile|identity|save|writing style/i);
      }

      const documentOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(documentOverflow, `${route} document overflow`).toBe(false);

      const overflow = await visibleHorizontalOverflow(
        page,
        'button:visible, [role="tab"]:visible, [role="tabpanel"]:visible, input:visible, select:visible, textarea:visible',
      );
      expect(overflow, `${route} visible control overflow`).toEqual([]);
    }
  });

  test('J-mobile: create workspace prioritizes primary setup at 390px width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);

    await page.getByTestId('sidebar-workspace').click();
    const switcher = page.getByRole('dialog', { name: /switch workspace/i });
    await expect(switcher).toBeVisible({ timeout: 5_000 });
    await switcher.getByRole('button', { name: /new workspace/i }).click();

    const dialog = page.getByRole('dialog', { name: /create workspace/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const nameInput = dialog.getByRole('textbox', { name: /what project or area/i });
    const createButton = dialog.getByRole('button', { name: /^create workspace$/i });
    const templateButton = dialog.getByRole('button', { name: /start from template/i });

    await expect(nameInput).toBeVisible();
    await expect(createButton).toBeVisible();
    await expect(templateButton).toBeVisible();
    await expect(dialog.getByPlaceholder(/search templates/i)).toHaveCount(0);

    const rects = await Promise.all([
      nameInput.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { top: Math.floor(r.top), bottom: Math.ceil(r.bottom), viewport: window.innerHeight };
      }),
      createButton.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { top: Math.floor(r.top), bottom: Math.ceil(r.bottom), viewport: window.innerHeight };
      }),
    ]);
    expect(rects[0].bottom, `workspace name initially reachable: ${JSON.stringify(rects[0])}`).toBeLessThanOrEqual(rects[0].viewport);
    expect(rects[1].bottom, `create action initially reachable: ${JSON.stringify(rects[1])}`).toBeLessThanOrEqual(rects[1].viewport);

    await templateButton.click();
    await expect(dialog.getByPlaceholder(/search templates/i)).toBeVisible();

    const agentButton = dialog.getByRole('button', { name: /choose an agent/i });
    await expect(agentButton).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByText('Agent (optional)', { exact: true })).toHaveCount(0);

    await agentButton.click();
    await expect(dialog.getByRole('button', { name: /hide agent assignment/i })).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByText('Agent (optional)', { exact: true })).toBeVisible();

    expect(await visibleHorizontalOverflow(
      page,
      '[role="dialog"]:visible, [role="dialog"] button:visible, [role="dialog"] input:visible, [role="dialog"] textarea:visible',
    ), 'create workspace mobile overflow').toEqual([]);
  });

  test('J-mobile: first-run onboarding keeps primary actions reachable at 390px width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err.message));
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/?forceWizard=true', { waitUntil: 'domcontentloaded' });
    const onboarding = page.getByRole('region', { name: /waggle onboarding/i });
    await expect(onboarding).toBeVisible({ timeout: 20_000 });

    expect(await visibleHorizontalOverflow(
      page,
      '[aria-label="Waggle onboarding"]:visible, [aria-label="Waggle onboarding"] button:visible, [aria-label="Waggle onboarding"] input:visible, [aria-label="Waggle onboarding"] [role="combobox"]:visible',
    ), 'welcome overflow').toEqual([]);

    await onboarding.getByRole('button', { name: /continue/i }).click();
    await expect(onboarding.getByText(/tell us who you are/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);

    const profileContinue = onboarding.getByRole('button', { name: /continue/i });
    await expect(profileContinue).toBeVisible();
    const rect = await profileContinue.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: Math.floor(r.top), bottom: Math.ceil(r.bottom), viewport: window.innerHeight };
    });
    expect(rect.bottom, `Profile Continue should be initially reachable: ${JSON.stringify(rect)}`).toBeLessThanOrEqual(rect.viewport);

    expect(await visibleHorizontalOverflow(
      page,
      '[aria-label="Waggle onboarding"]:visible, [aria-label="Waggle onboarding"] button:visible, [aria-label="Waggle onboarding"] input:visible, [aria-label="Waggle onboarding"] [role="combobox"]:visible',
    ), 'profile overflow').toEqual([]);
    expect(pageErrors).toHaveLength(0);
    expect(consoleErrors.filter(e => /clerk|content security policy|csp/i.test(e))).toHaveLength(0);
  });

  test('J-model: onboarding API-key setup reaches a saved, continuable state', async ({ page }) => {
    let keySaved = false;
    const settingsPayloads: Record<string, unknown>[] = [];
    const providers = {
      providers: [
        {
          id: 'anthropic', name: 'Anthropic', hasKey: false, badge: null,
          keyUrl: 'https://console.anthropic.com/settings/keys', requiresKey: true,
          models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', cost: '$$', speed: 'medium' }],
        },
        {
          id: 'openai', name: 'OpenAI', hasKey: false, badge: null,
          keyUrl: 'https://platform.openai.com/api-keys', requiresKey: true,
          models: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', cost: '$', speed: 'fast' }],
        },
      ],
      search: [{ id: 'duckduckgo', name: 'DuckDuckGo', hasKey: true, priority: 4 }],
      activeSearch: 'duckduckgo',
    };

    await page.route('**/api/providers', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...providers,
        providers: providers.providers.map(provider => ({ ...provider, hasKey: provider.id === 'anthropic' ? keySaved : provider.hasKey })),
      }),
    }));
    await page.route('**/api/local-inference/status', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ servers: [], ollamaInstalled: false, totalLocalModels: 0 }),
    }));
    await page.route('**/api/settings/probe-model', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ model: null, configured: false, verified: false }),
    }));
    await page.route('**/api/settings/probe-provider', route => {
      const { provider } = route.request().postDataJSON() as { provider?: string };
      const configured = keySaved && provider === 'anthropic';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured, valid: configured, verified: false }),
      });
    });
    await page.route('**/api/settings', async route => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      settingsPayloads.push(payload);
      const providerUpdate = payload.providers as Record<string, { apiKey?: string }> | undefined;
      if (providerUpdate?.anthropic?.apiKey) keySaved = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ defaultModel: 'claude-sonnet-4-6', providers: {} }) });
    });
    await page.route('**/api/settings/test-key', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, verified: false }),
    }));

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/?forceWizard=true', { waitUntil: 'domcontentloaded' });

    const onboarding = page.getByRole('region', { name: /waggle onboarding/i });
    await expect(onboarding).toBeVisible({ timeout: 20_000 });
    await onboarding.getByRole('button', { name: /continue/i }).click();
    await expect(onboarding.getByText(/tell us who you are/i)).toBeVisible({ timeout: 10_000 });
    await onboarding.getByRole('button', { name: /continue/i }).click();
    await expect(onboarding.getByText(/connect a model/i)).toBeVisible({ timeout: 10_000 });

    await onboarding.getByRole('button', { name: /anthropic/i }).click();
    const keyInput = onboarding.getByLabel(/api key for anthropic/i);
    await expect(keyInput).toBeFocused();
    await keyInput.fill('sk-ant-browser-contract');
    const saveButton = onboarding.getByRole('button', { name: /validate & save/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(onboarding.getByRole('status').filter({ hasText: /saved/i })).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => keySaved).toBe(true);
    const keyWriteIndex = settingsPayloads.findIndex(payload => 'providers' in payload);
    const modelWriteIndex = settingsPayloads.findIndex(payload => payload.defaultModel === 'claude-sonnet-4-6');
    expect(settingsPayloads[keyWriteIndex]).toMatchObject({ providers: { anthropic: { apiKey: 'sk-ant-browser-contract' } } });
    expect(modelWriteIndex).toBeGreaterThan(keyWriteIndex);
    await expect(onboarding.getByRole('button', { name: /^continue/i })).toBeEnabled({ timeout: 10_000 });
  });

  test('J-model: Settings API-key setup preserves the same save contract', async ({ page }) => {
    let keySaved = false;
    await page.route('**/api/providers', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [{
          id: 'anthropic', name: 'Anthropic', hasKey: false, badge: null,
          keyUrl: 'https://console.anthropic.com/settings/keys', requiresKey: true,
          models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', cost: '$$', speed: 'medium' }],
        }],
        search: [{ id: 'duckduckgo', name: 'DuckDuckGo', hasKey: true, priority: 4 }],
        activeSearch: 'duckduckgo',
      }),
    }));
    await page.route('**/api/local-inference/status', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ servers: [], ollamaInstalled: false, totalLocalModels: 0 }),
    }));
    await page.route('**/api/settings/probe-model', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ model: null, configured: false, verified: false }),
    }));
    await page.route('**/api/settings/probe-provider', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: false, valid: false, verified: false }),
    }));
    await page.route('**/api/settings/test-key', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, verified: false }),
    }));
    await page.route('**/api/settings', async route => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }
      keySaved = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: {} }) });
    });

    await gotoApp(page, '/settings?tab=models');
    const panel = page.getByRole('tabpanel').first();
    await expect(panel.getByText(/bring your own key/i)).toBeVisible({ timeout: 10_000 });
    await panel.getByRole('button', { name: /anthropic/i }).click();
    const keyInput = panel.getByLabel(/api key for anthropic/i);
    await keyInput.fill('sk-ant-settings-contract');
    await panel.getByRole('button', { name: /validate & save/i }).click();

    await expect(panel.getByRole('status').filter({ hasText: /saved/i })).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => keySaved).toBe(true);
  });

  test('J-route-coverage: thin utility routes render or redirect clearly', async ({ page }) => {
    await gotoApp(page, '/benchmarks');
    await expect(page.locator('body')).toContainText(/benchmark|capability|score|memory/i);

    await gotoApp(page, '/platform');
    await expect(page.locator('body')).toContainText(/platform|local|governance|memory|agent/i);

    await page.goto(routeWithSkip('/payment-cancelled'), { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/settings\?tab=billing/, { timeout: 10_000 });
    await waitForShell(page);
    await expect(page.locator('body')).toContainText(/billing|plan|team|solo|checkout/i);
  });

  test('J-route-coverage: priority thin routes render meaningful shells', async ({ page }) => {
    const routeChecks: Array<[string, RegExp]> = [
      ['/launcher', /tool launcher|optional prompt|detecting installed tools|launch/i],
      ['/launcher?watch=1', /tool launcher|optional prompt|detecting installed tools|launch/i],
      ['/waggle-dance', /waggle dance|signals|discovery|handoff/i],
      ['/artifacts', /artifact|library|document|presentation/i],
      ['/settings/profile', /who are you|identity|writing style|save/i],
      ['/settings/timeline', /timeline|workspace|activity/i],
      ['/payment-success', /checkout|paid|plans|nothing to confirm/i],
      ['/automations', /automation|schedule|trigger|history|logs/i],
      ['/mcps', /mcp hub|installed|catalog|custom/i],
      ['/settings/usage', /usage|cost|tokens|budget|upgrade/i],
      ['/files', /storage|files|workspace|local/i],
    ];

    for (const [route, bodyPattern] of routeChecks) {
      await gotoApp(page, route);
      await expect(page.locator('body')).toContainText(bodyPattern);

      if (route === '/files') {
        await expect(page.getByRole('region', { name: /workspace storage overview/i })).toHaveAttribute('tabindex', '0');
        await page.getByRole('tab', { name: /^Files$/ }).click();
        await expect(page.getByRole('region', { name: /files in/i })).toHaveAttribute('tabindex', '0');
      }
    }
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
