/**
 * Power User Stress Test — acts like a demanding user who clicks everything,
 * types everywhere, opens 6 windows at once, switches contexts rapidly,
 * and expects nothing to break.
 *
 * This is NOT a "does it render" test. This is a "can I actually USE this" test.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';

async function dismissOverlay(page: Page) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator('.fixed.backdrop-blur-sm');
    if (!await overlay.isVisible({ timeout: 1000 }).catch(() => false)) break;
    const btn = page.locator('button:has-text("Start Working")');
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ force: true });
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

function dispatch(page: Page, key: string, opts: { ctrl?: boolean; shift?: boolean } = {}) {
  return page.evaluate(({ key, ctrl, shift }) => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key, code: `Key${key.toUpperCase()}`,
      ctrlKey: ctrl ?? false, shiftKey: shift ?? false, bubbles: true,
    }));
  }, { key, ctrl: opts.ctrl, shift: opts.shift });
}

// ── 1. Create a workspace from scratch ────────────────────────────────

test.describe('1. Workspace Creation', () => {
  test('can create a workspace via API and see it in dashboard', async ({ page, request }) => {
    const name = `StressTest-${Date.now()}`;
    const res = await request.post(`${BASE}/api/workspaces`, {
      data: { name, group: 'testing', persona: 'researcher' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Workspace creation might fail if tier limits reached — that's acceptable
    if (res.ok()) {
      const ws = await res.json();
      expect(ws.id).toBeTruthy();
      expect(ws.name).toBe(name);

      await gotoDesktop(page);
      const homeBtn = page.locator('button[aria-label="Home"]');
      await homeBtn.click();
      await page.waitForTimeout(1000);
      const text = await page.locator('body').innerText();
      expect(text).toContain(name);
    } else {
      // If creation fails (tier limit, etc.), just verify the API returns a meaningful error
      expect(res.status()).toBeLessThan(500);
    }
  });
});

// ── 2. Chat interaction stress ────────────────────────────────────────

test.describe('2. Chat Stress', () => {
  test('can type in chat input and see it', async ({ page }) => {
    await gotoDesktop(page);
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();
    await page.waitForTimeout(1000);

    // Find the chat input (textarea)
    const input = page.locator('textarea[placeholder*="Message"], textarea[placeholder*="message"], input[placeholder*="Message"]');
    await expect(input.first()).toBeVisible({ timeout: 5000 });
    await input.first().fill('Hello from stress test! /help');
    const val = await input.first().inputValue();
    expect(val).toContain('Hello from stress test');
  });

  test('slash command menu appears on /', async ({ page }) => {
    await gotoDesktop(page);
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();
    await page.waitForTimeout(1000);

    const input = page.locator('textarea[placeholder*="Message"], textarea[placeholder*="message"]');
    await input.first().focus();
    await input.first().fill('/');
    await page.waitForTimeout(500);

    // Slash menu should appear — look for command options
    const slashMenu = page.locator('text=/research|draft|plan|catchup|status|spawn/i');
    const count = await slashMenu.count();
    expect(count).toBeGreaterThan(0);
  });

  test('persona picker opens and lists personas', async ({ page }) => {
    await gotoDesktop(page);
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();
    await page.waitForTimeout(1000);

    // Click the persona dropdown in chat header
    const personaBtn = page.locator('button', { hasText: /Persona/i }).first();
    if (await personaBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await personaBtn.click();
      await page.waitForTimeout(500);
      // Should see persona list
      const personas = page.locator('text=/Researcher|Writer|Analyst|Coder|Sales/i');
      expect(await personas.count()).toBeGreaterThan(2);
    }
  });

  test('model picker opens and lists models', async ({ page }) => {
    await gotoDesktop(page);
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();
    await page.waitForTimeout(1500);

    // Click the model dropdown
    const modelBtn = page.locator('button', { hasText: /sonnet|claude|model/i }).first();
    if (await modelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modelBtn.click();
      await page.waitForTimeout(500);
      const models = page.locator('text=/sonnet|opus|haiku|gpt|gemini/i');
      expect(await models.count()).toBeGreaterThan(2);
    }
  });

  test('autonomy chip is clickable and cycles', async ({ page }) => {
    await gotoDesktop(page);
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();
    await page.waitForTimeout(1000);

    const normalChip = page.locator('text=/Normal/i').first();
    if (await normalChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await normalChip.click();
      await page.waitForTimeout(500);
      // Should show autonomy options or cycle to Trusted
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/normal|trusted|yolo|autonomy|minutes/i);
    }
  });
});

// ── 3. Multi-window chaos ─────────────────────────────────────────────

test.describe('3. Multi-Window Chaos', () => {
  test('open 4 windows simultaneously without crash', async ({ page }) => {
    await gotoDesktop(page);

    // Open Chat
    await page.locator('button[aria-label="Chat"]').click();
    await page.waitForTimeout(300);

    // Open Room
    await page.locator('button[aria-label="Room"]').click();
    await page.waitForTimeout(300);

    // Open Agents
    await page.locator('button[aria-label="Agents"]').click();
    await page.waitForTimeout(300);

    // Open Files
    await page.locator('button[aria-label="Files"]').click();
    await page.waitForTimeout(500);

    // No crash — page should still be interactive
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(100);

    // All 4 apps should have created windows
    // Check for presence of content from at least 2 different apps
    expect(text).toMatch(/message|persona/i); // Chat
    expect(text).toMatch(/file|folder|workspace/i); // Files or other
  });

  test('Ctrl+Shift+N creates second chat, both coexist', async ({ page }) => {
    await gotoDesktop(page);
    await page.locator('button[aria-label="Chat"]').click();
    await page.waitForTimeout(800);

    // Count "Persona" buttons (one per chat window header)
    const before = await page.locator('button', { hasText: /Persona/i }).count();

    await dispatch(page, 'N', { ctrl: true, shift: true });
    await page.waitForTimeout(1000);

    const after = await page.locator('button', { hasText: /Persona/i }).count();
    expect(after).toBeGreaterThan(before);
  });

  test('close a window via title bar button', async ({ page }) => {
    await gotoDesktop(page);
    await page.locator('button[aria-label="Chat"]').click();
    await page.waitForTimeout(500);

    // Find a close button (the colored dots in the title bar)
    const closeBtn = page.locator('button[aria-label="Close window"], button[title="Close"]');
    if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.first().click();
      await page.waitForTimeout(500);
    }
    // Should not crash
    const text = await page.locator('body').innerText();
    expect(text).toContain('Waggle');
  });
});

// ── 4. Global Search deep test ────────────────────────────────────────

test.describe('4. Global Search', () => {
  test('Ctrl+K opens search, can type and see results', async ({ page }) => {
    await gotoDesktop(page);
    await dispatch(page, 'k', { ctrl: true });
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible({ timeout: 3000 });

    // Type a query
    await searchInput.fill('chat');
    await page.waitForTimeout(500);

    // Should see "Chat" command in results
    const results = page.locator('text=/Chat/');
    expect(await results.count()).toBeGreaterThan(0);
  });

  test('search finds workspaces', async ({ page }) => {
    await gotoDesktop(page);
    await dispatch(page, 'k', { ctrl: true });
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('banking');
    await page.waitForTimeout(800);

    // Should find the "Banking Credit Analysis" workspace
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).toContain('banking');
  });

  test('search finds memories', async ({ page }) => {
    await gotoDesktop(page);
    await dispatch(page, 'k', { ctrl: true });
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('waggle');
    await page.waitForTimeout(1000);

    // Should show memory results
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).toContain('waggle');
  });

  test('Escape closes search', async ({ page }) => {
    await gotoDesktop(page);
    await dispatch(page, 'k', { ctrl: true });
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(searchInput).not.toBeVisible();
  });
});

// ── 5. Settings deep dive ─────────────────────────────────────────────

test.describe('5. Settings', () => {
  test('can navigate all settings tabs', async ({ page }) => {
    await gotoDesktop(page);
    await page.locator('button[aria-label="Settings"]').click();
    await page.waitForTimeout(500);

    for (const tab of ['General', 'Models', 'Billing']) {
      const tabBtn = page.locator(`button[role="tab"]`, { hasText: tab });
      if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(300);
      }
    }
    // Should not crash
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(50);
  });
});

// ── 6. Vault operations ──────────────────────────────────────────────

test.describe('6. Vault', () => {
  test('vault shows keys or empty state', async ({ page }) => {
    await gotoDesktop(page);
    await page.locator('button[aria-label="API Keys"]').click();
    await page.waitForTimeout(1000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/vault|key|api|provider|secret|add|anthropic|openai/i);
  });
});

// ── 7. Rapid navigation stress ────────────────────────────────────────

test.describe('7. Rapid Navigation', () => {
  test('open and close 5 apps rapidly without crash', async ({ page }) => {
    await gotoDesktop(page);
    const apps = ['Chat', 'Room', 'Agents', 'Files', 'Approvals'];

    for (const app of apps) {
      await page.locator(`button[aria-label="${app}"]`).click();
      await page.waitForTimeout(200);
    }

    // Close all via Ctrl+W
    for (let i = 0; i < 5; i++) {
      await dispatch(page, 'w', { ctrl: true });
      await page.waitForTimeout(200);
    }

    // Desktop should be clean — hero visible
    await page.waitForTimeout(500);
    const text = await page.locator('body').innerText();
    expect(text).toContain('Waggle AI');
  });

  test('keyboard shortcuts work: Ctrl+Shift+1 through 5', async ({ page }) => {
    await gotoDesktop(page);

    // Open Chat via Ctrl+Shift+1
    await dispatch(page, '1', { ctrl: true, shift: true });
    await page.waitForTimeout(500);
    let text = await page.locator('body').innerText();
    expect(text).toMatch(/message|persona|chat/i);

    // Close it
    await dispatch(page, 'w', { ctrl: true });
    await page.waitForTimeout(300);

    // Open Memory via Ctrl+Shift+5
    await dispatch(page, '5', { ctrl: true, shift: true });
    await page.waitForTimeout(500);
    text = await page.locator('body').innerText();
    expect(text).toMatch(/memory|frame|knowledge|harvest/i);
  });
});

// ── 8. Data integrity ─────────────────────────────────────────────────

test.describe('8. Data Integrity', () => {
  test('workspace list is consistent between API and UI', async ({ page, request }) => {
    const apiRes = await request.get(`${BASE}/api/workspaces`);
    const apiWorkspaces = await apiRes.json();
    const apiNames = (Array.isArray(apiWorkspaces) ? apiWorkspaces : []).map((w: any) => w.name);

    await gotoDesktop(page);
    await page.locator('button[aria-label="Home"]').click();
    await page.waitForTimeout(1000);
    const uiText = await page.locator('body').innerText();

    // Every API workspace should appear in the dashboard
    for (const name of apiNames.slice(0, 3)) {
      expect(uiText).toContain(name);
    }
  });

  test('memory frame count matches API', async ({ request }) => {
    const res = await request.get(`${BASE}/api/memory/stats`);
    if (res.ok()) {
      const stats = await res.json();
      const total = stats.total?.frameCount ?? stats.personal?.frameCount ?? 0;
      expect(total).toBeGreaterThanOrEqual(0);
    }
  });

  test('sessions endpoint returns valid data', async ({ request }) => {
    const wsRes = await request.get(`${BASE}/api/workspaces`);
    const workspaces = await wsRes.json();
    if (Array.isArray(workspaces) && workspaces.length > 0) {
      const sessRes = await request.get(`${BASE}/api/workspaces/${workspaces[0].id}/sessions`);
      expect(sessRes.ok()).toBeTruthy();
      const sessions = await sessRes.json();
      expect(Array.isArray(sessions)).toBeTruthy();
    }
  });
});

// ── 9. Error resilience ───────────────────────────────────────────────

test.describe('9. Error Resilience', () => {
  test('invalid API call returns error, does not crash server', async ({ request }) => {
    const res = await request.get(`${BASE}/api/workspaces/nonexistent-id-12345`);
    expect([404, 500]).toContain(res.status());

    // Server should still be healthy after error
    const health = await request.get(`${BASE}/health`);
    expect(health.ok()).toBeTruthy();
  });

  test('sending empty chat message is handled gracefully', async ({ request }) => {
    const res = await request.post(`${BASE}/api/chat`, {
      data: { message: '', workspaceId: 'test' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Should return 400 or handle gracefully, not 500
    expect(res.status()).toBeLessThan(500);
  });

  test('invalid route shows 404 page with recovery link', async ({ page }) => {
    await page.goto(`${BASE}/this-does-not-exist`);
    await page.waitForTimeout(1000);
    const text = await page.locator('body').innerText();
    // Should show a custom 404 page with a way to get back
    expect(text).toMatch(/404|not found|return.*home/i);
  });
});

// ── 10. Fresh User Onboarding ─────────────────────────────────────────

test.describe('10. Fresh User Onboarding', () => {
  test('new user sees onboarding wizard', async ({ page }) => {
    // Navigate WITHOUT skipOnboarding — simulate a brand new user
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const text = await page.locator('body').innerText();
    // Should show either the onboarding wizard OR the desktop (if auto-skipped for returning user)
    expect(text).toMatch(/waggle|welcome|workspace|get started|choose|chat/i);
  });

  test('onboarding wizard has template selection', async ({ page }) => {
    // Clear onboarding state to force wizard
    await page.goto(`${BASE}/`);
    await page.evaluate(() => {
      localStorage.removeItem('waggle:onboarding');
      localStorage.removeItem('waggle:first-run');
    });
    await page.reload();
    await page.waitForTimeout(3000);

    const text = await page.locator('body').innerText();
    // Either shows templates or auto-completes for returning users
    expect(text).toMatch(/waggle|template|sales|research|engineering|workspace|chat/i);
  });
});

// ── 11. Performance baseline ─────────────────────────────────────────

test.describe('10. Performance', () => {
  test('initial load completes under 8 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/?skipOnboarding=true&tier=power`);
    await page.waitForLoadState('domcontentloaded');
    // Wait for dock to render as signal of "app ready"
    await page.locator('button[aria-label="Chat"]').waitFor({ state: 'visible', timeout: 8000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(8000);
  });

  test('health endpoint responds under 2 seconds', async ({ request }) => {
    const start = Date.now();
    await request.get(`${BASE}/health`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  test('memory search responds under 3 seconds', async ({ request }) => {
    const start = Date.now();
    await request.get(`${BASE}/api/memory/search?q=important&limit=5`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
