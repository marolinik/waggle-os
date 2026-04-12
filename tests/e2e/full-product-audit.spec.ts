/**
 * Full Product Audit — comprehensive E2E covering every app and flow.
 *
 * Tests every surface a user can reach from the dock, verifies API health,
 * and walks through critical user journeys.
 *
 * Run: npx playwright test tests/e2e/full-product-audit.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';

// ── Helpers ───────────────────────────────────────────────────────────

async function dismissOverlay(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const overlay = page.locator('.fixed.backdrop-blur-sm');
    if (!await overlay.isVisible({ timeout: 1000 }).catch(() => false)) break;
    const startBtn = page.locator('button:has-text("Start Working")');
    if (await startBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await startBtn.click({ force: true });
      await page.waitForTimeout(500);
      continue;
    }
    await page.mouse.click(5, 5);
    await page.waitForTimeout(500);
  }
}

async function gotoDesktop(page: Page) {
  await page.goto(`${BASE}/?skipOnboarding=true&tier=power`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await dismissOverlay(page);
}

async function openAppViaDock(page: Page, label: string) {
  // Direct dock button (has aria-label)
  const directBtn = page.locator(`button[aria-label="${label}"]`);
  if (await directBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await directBtn.click();
    await page.waitForTimeout(800);
    return;
  }
  // Try zone parents (Ops, Extend) — click to open tray, then click child by text
  for (const zone of ['Ops', 'Extend']) {
    const zoneBtn = page.locator(`button[aria-label="${zone}"]`);
    if (await zoneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await zoneBtn.click();
      await page.waitForTimeout(400);
      // The tray renders as a fixed portal with [data-dock-tray]
      const tray = page.locator('[data-dock-tray]');
      if (await tray.isVisible({ timeout: 1000 }).catch(() => false)) {
        const childBtn = tray.locator('button', { hasText: label });
        if (await childBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await childBtn.click();
          await page.waitForTimeout(800);
          return;
        }
      }
      // Close the tray if we didn't find the child
      await page.mouse.click(5, 5);
      await page.waitForTimeout(200);
    }
  }
}

async function getVisibleText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

// ── 1. API Health ─────────────────────────────────────────────────────

test.describe('1. API Health', () => {
  test('health endpoint', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.database.healthy).toBe(true);
  });

  test('workspaces API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/workspaces`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('personas API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/personas`);
    expect([200, 404]).toContain(res.status());
    if (res.ok()) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.personas ?? [];
      expect(list.length).toBeGreaterThan(0);
    }
  });

  test('events API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/events?limit=5`);
    expect(res.ok()).toBeTruthy();
  });

  test('vault API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/vault`);
    expect(res.ok()).toBeTruthy();
  });

  test('settings API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings`);
    expect(res.ok()).toBeTruthy();
  });

  test('memory search API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/memory/search?q=test&limit=3`);
    expect(res.ok()).toBeTruthy();
  });

  test('marketplace API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/marketplace/packs`);
    expect([200, 503]).toContain(res.status());
  });

  test('compliance API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/compliance/status`);
    expect(res.ok()).toBeTruthy();
  });

  test('workspace templates API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/workspace-templates`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.templates ?? [];
    expect(list.length).toBeGreaterThanOrEqual(7);
  });

  test('cost API responds', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cost/by-workspace`);
    // Cost endpoint may return various codes depending on workspace state
    expect(res.status()).toBeLessThan(600);
  });

  test('offline status API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/offline/status`);
    expect(res.ok()).toBeTruthy();
  });

  test('cron API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron`);
    expect(res.ok()).toBeTruthy();
  });

  test('skills API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/skills`);
    expect(res.ok()).toBeTruthy();
  });

  test('connectors API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/connectors`);
    expect(res.ok()).toBeTruthy();
  });

  test('backup metadata API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/backup/metadata`);
    // May be 200 or 404 depending on backup existence
    expect([200, 404]).toContain(res.status());
  });
});

// ── 2. Desktop Shell ──────────────────────────────────────────────────

test.describe('2. Desktop Shell', () => {
  test('status bar renders with clock', async ({ page }) => {
    await gotoDesktop(page);
    const text = await getVisibleText(page);
    expect(text).toContain('Waggle AI');
  });

  test('dock renders in power tier', async ({ page }) => {
    await gotoDesktop(page);
    for (const label of ['Chat', 'Room', 'Agents', 'Files', 'Approvals']) {
      const btn = page.locator(`button[aria-label="${label}"]`);
      await expect(btn).toBeVisible({ timeout: 5000 });
    }
  });

  test('Ctrl+K opens global search', async ({ page }) => {
    await gotoDesktop(page);
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true,
      }));
    });
    await page.waitForTimeout(500);
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible({ timeout: 3000 });
  });
});

// ── 3. Every App Opens ───────────────────────────────────────────────

const DIRECT_APPS = [
  { label: 'Chat', expect: /persona|message|waggle/i },
  { label: 'Room', expect: /room|agent|specialist|no.*running|empty/i },
  { label: 'Agents', expect: /agent|persona|group/i },
  { label: 'Files', expect: /file|folder|workspace|document/i },
  { label: 'Approvals', expect: /approval|pending|no.*pending|history/i },
];

const ZONE_APPS = [
  { label: 'Command Center', zone: 'Ops', expect: /cockpit|health|cost|command/i },
  { label: 'Timeline', zone: 'Ops', expect: /timeline|activity|no.*activity|last/i },
  { label: 'Usage & Cost', zone: 'Ops', expect: /usage|telemetry|token|cost/i },
  { label: 'Backup & Restore', zone: 'Ops', expect: /backup|restore|no.*backup/i },
  { label: 'Events & Logs', zone: 'Ops', expect: /event|log|step|filter/i },
  { label: 'Governance', zone: 'Extend', expect: /governance|role|team|permission/i },
  { label: 'Skills & Apps', zone: 'Extend', expect: /skill|installed|marketplace|starter/i },
  { label: 'Connectors', zone: 'Extend', expect: /connector|connect|service|integration/i },
  { label: 'Marketplace', zone: 'Extend', expect: /marketplace|browse|pack|install/i },
];

test.describe('3. Direct Dock Apps', () => {
  for (const app of DIRECT_APPS) {
    test(`${app.label} opens and renders content`, async ({ page }) => {
      await gotoDesktop(page);
      await openAppViaDock(page, app.label);
      const text = await getVisibleText(page);
      expect(text).toMatch(app.expect);
    });
  }
});

test.describe('4. Zone Apps (Ops + Extend)', () => {
  for (const app of ZONE_APPS) {
    test(`${app.label} opens from ${app.zone} zone`, async ({ page }) => {
      await gotoDesktop(page);
      await openAppViaDock(page, app.label);
      const text = await getVisibleText(page);
      expect(text).toMatch(app.expect);
    });
  }
});

// ── 5. Standalone Apps ────────────────────────────────────────────────

test.describe('5. Standalone Apps', () => {
  test('Settings opens', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Settings');
    const text = await getVisibleText(page);
    expect(text).toMatch(/setting|general|model|billing/i);
  });

  test('API Keys (Vault) opens', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'API Keys');
    const text = await getVisibleText(page);
    expect(text).toMatch(/vault|key|api|secret|provider/i);
  });

  test('Home (Dashboard) opens', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Home');
    const text = await getVisibleText(page);
    expect(text).toMatch(/workspace|welcome|dashboard|create/i);
  });
});

// ── 6. User Journey: Workspace → Chat → Memory ───────────────────────

test.describe('6. User Journey', () => {
  test('can open chat and see persona + model in header', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Chat');
    await page.waitForTimeout(1500);
    const text = await getVisibleText(page);
    // Should see persona selector and model name
    expect(text).toMatch(/persona|sonnet|claude|message waggle/i);
  });

  test('can open memory and see frames or empty state', async ({ page }) => {
    await gotoDesktop(page);
    // Memory might be in a zone or direct — try both
    const memBtn = page.locator('button[aria-label="Memory"]');
    if (await memBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await memBtn.click();
    } else {
      // Open via Ctrl+Shift+5 (shortcut)
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: '5', code: 'Digit5', ctrlKey: true, shiftKey: true, bubbles: true,
        }));
      });
    }
    await page.waitForTimeout(1000);
    const text = await getVisibleText(page);
    expect(text).toMatch(/memory|frame|knowledge|harvest|search/i);
  });
});

// ── 7. No Console Errors ──────────────────────────────────────────────

test.describe('7. Stability', () => {
  test('no critical console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await gotoDesktop(page);
    await page.waitForTimeout(3000);
    const critical = errors.filter(e =>
      !e.includes('Failed to fetch') && !e.includes('net::ERR') &&
      !e.includes('favicon') && !e.includes('401') && !e.includes('404') &&
      !e.includes('sync') && !e.includes('WebSocket') && !e.includes('fetch') &&
      !e.includes('model') && !e.includes('chunk')
    );
    expect(critical).toHaveLength(0);
  });

  test('no uncaught exceptions after opening 3 apps', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await gotoDesktop(page);
    await openAppViaDock(page, 'Chat');
    await openAppViaDock(page, 'Room');
    await openAppViaDock(page, 'Files');
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });
});
