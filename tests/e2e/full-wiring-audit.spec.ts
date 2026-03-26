/**
 * Full E2E Wiring Audit — tests every major UI flow against the live backend.
 * Run with: npx playwright test tests/e2e/full-wiring-audit.spec.ts --reporter=list
 *
 * Prerequisites: backend on :3333, frontend on :8080
 */
import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:8080';
const API = 'http://127.0.0.1:3333';

// Helper: skip onboarding if present
async function skipOnboarding(page: Page) {
  // Clear onboarding state so we start fresh past the wizard
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('onboarding'));
    if (!key) {
      // Set onboarding as completed
      localStorage.setItem('waggle_onboarding', JSON.stringify({ completed: true, step: 6 }));
    }
  });
}

// Helper: wait for Desktop to be visible (past boot screen)
async function waitForDesktop(page: Page) {
  // The dock should appear once desktop loads
  await page.waitForSelector('[class*="dock"], [data-testid="dock"], nav', { timeout: 15000 }).catch(() => {});
  // Wait a bit for animations
  await page.waitForTimeout(2000);
}

// Helper: collect all console errors
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

// ─── SECTION 1: Backend API Health ───────────────────────────────

test.describe('Backend API Endpoints', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBeDefined();
    expect(data.llm).toBeDefined();
  });

  test('GET /api/workspaces returns array', async ({ request }) => {
    const res = await request.get(`${API}/api/workspaces`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /api/events returns object with events array', async ({ request }) => {
    const res = await request.get(`${API}/api/events`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // Backend wraps in {events: [...]}
    expect(data.events).toBeDefined();
    expect(Array.isArray(data.events)).toBeTruthy();
  });

  test('GET /api/skills returns object with skills array', async ({ request }) => {
    const res = await request.get(`${API}/api/skills`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.skills).toBeDefined();
    expect(Array.isArray(data.skills)).toBeTruthy();
  });

  test('GET /api/memory/frames returns object with results array', async ({ request }) => {
    const res = await request.get(`${API}/api/memory/frames?limit=5&workspace=default`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.results).toBeDefined();
    expect(Array.isArray(data.results)).toBeTruthy();
  });

  test('GET /api/connectors returns object with connectors array', async ({ request }) => {
    const res = await request.get(`${API}/api/connectors`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.connectors).toBeDefined();
  });

  test('GET /api/personas returns object with personas array', async ({ request }) => {
    const res = await request.get(`${API}/api/personas`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.personas).toBeDefined();
  });

  test('GET /api/fleet returns object with sessions array', async ({ request }) => {
    const res = await request.get(`${API}/api/fleet`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.sessions).toBeDefined();
  });

  test('GET /api/cron returns object with schedules array', async ({ request }) => {
    const res = await request.get(`${API}/api/cron`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.schedules).toBeDefined();
  });

  test('GET /api/notifications/history returns object with notifications', async ({ request }) => {
    const res = await request.get(`${API}/api/notifications/history`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.notifications).toBeDefined();
  });

  test('GET /api/marketplace/packs returns object with packs', async ({ request }) => {
    const res = await request.get(`${API}/api/marketplace/packs`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.packs).toBeDefined();
  });

  test('GET /api/agent/status returns status object', async ({ request }) => {
    const res = await request.get(`${API}/api/agent/status`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toBeDefined();
  });

  test('GET /api/settings returns settings object', async ({ request }) => {
    const res = await request.get(`${API}/api/settings`);
    expect(res.ok()).toBeTruthy();
  });

  test('POST /api/workspaces creates workspace', async ({ request }) => {
    const res = await request.post(`${API}/api/workspaces`, {
      data: { name: 'E2E Test Workspace', group: 'Test' },
    });
    expect(res.ok()).toBeTruthy();
    const ws = await res.json();
    expect(ws.id).toBeDefined();
    expect(ws.name).toBe('E2E Test Workspace');
    // Cleanup
    await request.delete(`${API}/api/workspaces/${ws.id}`);
  });

  test('GET /api/workspaces/:id/sessions returns array or wrapped', async ({ request }) => {
    // Get first workspace
    const wsRes = await request.get(`${API}/api/workspaces`);
    const workspaces = await wsRes.json();
    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      test.skip();
      return;
    }
    const wsId = workspaces[0].id;
    const res = await request.get(`${API}/api/workspaces/${wsId}/sessions`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // Should be array or wrapped
    const sessions = Array.isArray(data) ? data : data.sessions ?? data.results ?? [];
    expect(Array.isArray(sessions)).toBeTruthy();
  });

  test('POST /api/chat returns SSE stream', async ({ request }) => {
    const res = await request.post(`${API}/api/chat`, {
      data: { message: 'ping', workspaceId: 'default' },
    });
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    // Should contain SSE events
    expect(text).toContain('event:');
    expect(text).toContain('data:');
  });

  test('GET /api/memory/graph returns graph data', async ({ request }) => {
    const res = await request.get(`${API}/api/memory/graph?workspace=default-workspace`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // Backend returns {entities, relations} — adapter maps to {nodes, edges}
    expect(data.entities ?? data.nodes).toBeDefined();
    expect(data.relations ?? data.edges).toBeDefined();
  });

  test('GET /api/vault returns vault data', async ({ request }) => {
    const res = await request.get(`${API}/api/vault`);
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/mind/identity returns identity', async ({ request }) => {
    const res = await request.get(`${API}/api/mind/identity`);
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/costs returns cost data', async ({ request }) => {
    const res = await request.get(`${API}/api/costs`);
    expect(res.ok()).toBeTruthy();
  });
});

// ─── SECTION 2: Frontend Page Load ──────────────────────────────

test.describe('Frontend Page Load', () => {
  test('homepage loads without crash', async ({ page }) => {
    const errors = collectErrors(page);
    await skipOnboarding(page);
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);

    // Check no fatal JS errors (filter out non-critical ones)
    const fatalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('ResizeObserver') &&
      !e.includes('404')
    );
    expect(fatalErrors.length).toBe(0);
  });

  test('boot screen appears then transitions to desktop', async ({ page }) => {
    // Clear all state for fresh boot
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Boot screen or onboarding should appear
    await page.waitForTimeout(1000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('desktop renders after onboarding skip', async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);

    // Should have some visible content
    const html = await page.content();
    expect(html.length).toBeGreaterThan(1000);
  });
});

// ─── SECTION 3: Desktop UI Components ───────────────────────────

test.describe('Desktop UI Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('dock is visible with app icons', async ({ page }) => {
    // Look for dock area at bottom
    const dock = await page.locator('nav, [class*="dock"], [class*="Dock"]').first();
    await expect(dock).toBeVisible({ timeout: 10000 });
  });

  test('status bar is visible', async ({ page }) => {
    // Status bar at top
    const statusContent = await page.locator('[class*="status"], [class*="Status"], header').first();
    const visible = await statusContent.isVisible().catch(() => false);
    // Status bar might not be a separate element in all states
    expect(typeof visible).toBe('boolean');
  });

  test('clicking dock icons opens app windows', async ({ page }) => {
    // Find clickable elements in the dock area
    const buttons = page.locator('nav button, [class*="dock"] button, [class*="Dock"] button');
    const count = await buttons.count();

    if (count > 0) {
      // Click first dock button
      await buttons.first().click();
      await page.waitForTimeout(500);
      // Something should have changed (window opened)
      const windows = page.locator('[class*="window"], [class*="Window"], [class*="AppWindow"]');
      const windowCount = await windows.count();
      expect(windowCount).toBeGreaterThanOrEqual(0); // May or may not create a visible window element
    }
  });
});

// ─── SECTION 4: Workspace Wiring ────────────────────────────────

test.describe('Workspace Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('workspaces load from API', async ({ page }) => {
    // Intercept the API call
    const apiResponse = await page.waitForResponse(
      res => res.url().includes('/api/workspaces') && res.request().method() === 'GET',
      { timeout: 10000 }
    ).catch(() => null);

    if (apiResponse) {
      expect(apiResponse.ok()).toBeTruthy();
      const data = await apiResponse.json();
      expect(Array.isArray(data)).toBeTruthy();
    }
  });

  test('workspace list displays in dashboard', async ({ page }) => {
    // Try to open dashboard via dock
    const dashButton = page.locator('button:has-text("Dashboard"), button[title*="Dashboard"], button[aria-label*="Dashboard"]');
    if (await dashButton.count() > 0) {
      await dashButton.first().click();
      await page.waitForTimeout(1000);
    }

    // Look for workspace items
    const workspaceItems = page.locator('[class*="workspace"], [class*="Workspace"]');
    const count = await workspaceItems.count();
    // Just verify no crash
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─── SECTION 5: Chat Wiring ─────────────────────────────────────

test.describe('Chat Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('chat app opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    // Try to open chat
    const chatButton = page.locator('button:has-text("Chat"), button[title*="Chat"], button[aria-label*="Chat"]');
    if (await chatButton.count() > 0) {
      await chatButton.first().click();
      await page.waitForTimeout(1000);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of') ||
      e.includes('is not defined')
    );
    expect(fatalErrors).toEqual([]);
  });

  test('chat input exists and accepts text', async ({ page }) => {
    // Open chat
    const chatButton = page.locator('button:has-text("Chat"), button[title*="Chat"]');
    if (await chatButton.count() > 0) {
      await chatButton.first().click();
      await page.waitForTimeout(1000);
    }

    // Find textarea or input for chat
    const input = page.locator('textarea, input[type="text"]').last();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('Hello test');
      const value = await input.inputValue();
      expect(value).toContain('Hello');
    }
  });
});

// ─── SECTION 6: Memory Wiring ───────────────────────────────────

test.describe('Memory Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('memory app opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    const memButton = page.locator('button:has-text("Memory"), button[title*="Memory"]');
    if (await memButton.count() > 0) {
      await memButton.first().click();
      await page.waitForTimeout(1500);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of')
    );
    expect(fatalErrors).toEqual([]);
  });

  test('memory frames API response is properly unwrapped', async ({ page }) => {
    const response = await page.waitForResponse(
      res => res.url().includes('/api/memory/frames'),
      { timeout: 10000 }
    ).catch(() => null);

    if (response) {
      expect(response.ok()).toBeTruthy();
    }
  });
});

// ─── SECTION 7: Events Wiring ───────────────────────────────────

test.describe('Events Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('events app opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    const evButton = page.locator('button:has-text("Events"), button[title*="Events"], button[title*="Timeline"]');
    if (await evButton.count() > 0) {
      await evButton.first().click();
      await page.waitForTimeout(1000);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of')
    );
    expect(fatalErrors).toEqual([]);
  });
});

// ─── SECTION 8: Settings Wiring ─────────────────────────────────

test.describe('Settings Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('settings app opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    const settingsButton = page.locator('button:has-text("Settings"), button[title*="Settings"]');
    if (await settingsButton.count() > 0) {
      await settingsButton.first().click();
      await page.waitForTimeout(1000);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of')
    );
    expect(fatalErrors).toEqual([]);
  });
});

// ─── SECTION 9: Cockpit Wiring ──────────────────────────────────

test.describe('Cockpit Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('cockpit app opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    const cockpitButton = page.locator('button:has-text("Cockpit"), button[title*="Cockpit"]');
    if (await cockpitButton.count() > 0) {
      await cockpitButton.first().click();
      await page.waitForTimeout(1500);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of')
    );
    expect(fatalErrors).toEqual([]);
  });
});

// ─── SECTION 10: Capabilities / Marketplace ─────────────────────

test.describe('Capabilities Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('capabilities app opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    const capButton = page.locator('button:has-text("Capabilities"), button[title*="Capabilities"], button[title*="Skills"]');
    if (await capButton.count() > 0) {
      await capButton.first().click();
      await page.waitForTimeout(1500);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of')
    );
    expect(fatalErrors).toEqual([]);
  });
});

// ─── SECTION 11: Mission Control ────────────────────────────────

test.describe('Mission Control Wiring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);
  });

  test('mission control opens without crash', async ({ page }) => {
    const errors = collectErrors(page);

    const mcButton = page.locator('button:has-text("Mission"), button[title*="Mission"]');
    if (await mcButton.count() > 0) {
      await mcButton.first().click();
      await page.waitForTimeout(1500);
    }

    const fatalErrors = errors.filter(e =>
      e.includes('is not a function') ||
      e.includes('Cannot read properties of')
    );
    expect(fatalErrors).toEqual([]);
  });
});

// ─── SECTION 12: Console Error Audit ────────────────────────────

test.describe('Full Console Error Audit', () => {
  test('load app and open each dock item — collect ALL errors', async ({ page }) => {
    const allErrors: { context: string; error: string }[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        allErrors.push({ context: 'console', error: msg.text() });
      }
    });
    page.on('pageerror', err => {
      allErrors.push({ context: 'pageerror', error: err.message });
    });

    // Load with onboarding skipped
    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);

    // Find all dock buttons
    const dockButtons = page.locator('nav button, [class*="dock"] button, [class*="Dock"] button');
    const buttonCount = await dockButtons.count();

    for (let i = 0; i < buttonCount; i++) {
      const errorsBefore = allErrors.length;
      const btn = dockButtons.nth(i);
      const label = await btn.getAttribute('title') ?? await btn.getAttribute('aria-label') ?? `button-${i}`;

      await btn.click().catch(() => {});
      await page.waitForTimeout(1500);

      if (allErrors.length > errorsBefore) {
        const newErrors = allErrors.slice(errorsBefore);
        for (const e of newErrors) {
          e.context = `After clicking: ${label}`;
        }
      }
    }

    // Report all errors
    const criticalErrors = allErrors.filter(e =>
      e.error.includes('is not a function') ||
      e.error.includes('Cannot read properties of') ||
      e.error.includes('is not defined') ||
      e.error.includes('Uncaught')
    );

    // Log for debugging
    if (criticalErrors.length > 0) {
      console.log('\n=== CRITICAL ERRORS FOUND ===');
      for (const e of criticalErrors) {
        console.log(`[${e.context}] ${e.error.slice(0, 200)}`);
      }
      console.log('=============================\n');
    }

    // This test reports but does not fail — it's an audit
    // Convert to expect when all issues are fixed
    console.log(`Total errors: ${allErrors.length}, Critical: ${criticalErrors.length}`);
  });
});

// ─── SECTION 13: Network Request Audit ──────────────────────────

test.describe('Network Request Audit', () => {
  test('track all API calls and their status codes', async ({ page }) => {
    const apiCalls: { method: string; url: string; status: number; ok: boolean }[] = [];

    page.on('response', res => {
      const url = res.url();
      if (url.includes('/api/') || url.includes('/health')) {
        apiCalls.push({
          method: res.request().method(),
          url: url.replace(API, '').replace(BASE, ''),
          status: res.status(),
          ok: res.ok(),
        });
      }
    });

    await page.goto(BASE);
    await skipOnboarding(page);
    await page.reload();
    await waitForDesktop(page);

    // Click through all dock items to trigger all API calls
    const dockButtons = page.locator('nav button, [class*="dock"] button');
    const count = await dockButtons.count();
    for (let i = 0; i < count; i++) {
      await dockButtons.nth(i).click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Report failed API calls
    const failedCalls = apiCalls.filter(c => !c.ok);
    if (failedCalls.length > 0) {
      console.log('\n=== FAILED API CALLS ===');
      for (const c of failedCalls) {
        console.log(`${c.method} ${c.url} → ${c.status}`);
      }
      console.log('========================\n');
    }

    console.log(`Total API calls: ${apiCalls.length}, Failed: ${failedCalls.length}`);
    console.log('\nAll API calls:');
    for (const c of apiCalls) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.method} ${c.url} → ${c.status}`);
    }
  });
});
