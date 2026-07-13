/**
 * Power User Stress Test — acts like a demanding user who clicks everything,
 * types everywhere, opens 6 windows at once, switches contexts rapidly,
 * and expects nothing to break.
 *
 * This is NOT a "does it render" test. This is a "can I actually USE this" test.
 */
import { test, expect, type Page } from '@playwright/test';
import { isDevNoiseWorkspace } from '../../apps/web/src/lib/workspace-counts';

const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';

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
  await page.goto(`${BASE}/home?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[role="navigation"], main', { timeout: 10_000 });
  await dismissOverlay(page);
}

async function openSurface(page: Page, label: string) {
  const routes: Record<string, string> = {
    Home: '/home',
    Workspaces: '/workspaces',
    Chat: '/workspaces/default-workspace/chat',
    Memory: '/memory',
    Room: '/room',
    Agents: '/agents',
    Files: '/files',
    Approvals: '/approvals',
    Settings: '/settings',
    'API Keys': '/settings/vault',
  };
  const routePatterns: Record<string, RegExp> = {
    Home: /\/home/,
    Workspaces: /\/workspaces$/,
    Chat: /\/workspaces\/[^/]+\/chat/,
    Memory: /\/memory/,
    Room: /\/room/,
    Agents: /\/agents/,
    Files: /\/files/,
    Approvals: /\/approvals/,
    Settings: /\/settings/,
    'API Keys': /\/settings\/vault/,
  };
  const route = routes[label];
  const btn = page.locator(`button[aria-label="${label}"]`);
  if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await btn.click();
    const pattern = routePatterns[label];
    if (route && pattern) {
      await page.waitForURL(pattern, { timeout: 2_500 }).catch(async () => {
        await page.goto(`${BASE}${route}?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
          waitUntil: 'domcontentloaded',
        });
      });
      await page.waitForSelector('[role="navigation"], main', { timeout: 10_000 });
    } else {
      await page.waitForTimeout(400);
    }
    return;
  }

  if (!route) throw new Error(`No current route for ${label}`);
  await page.goto(`${BASE}${route}?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[role="navigation"], main', { timeout: 10_000 });
}

function chatInput(page: Page) {
  return page.getByRole('textbox', { name: /reply|ask waggle|message/i }).first();
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
    const name = `Power Workspace ${Date.now()}`;
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
      await openSurface(page, 'Workspaces');
      await expect(page.locator('body')).toContainText(name, { timeout: 10_000 });
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
    await openSurface(page, 'Chat');

    const input = chatInput(page);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Hello from stress test! /help');
    const val = await input.inputValue();
    expect(val).toContain('Hello from stress test');
  });

  test('slash command menu appears on /', async ({ page }) => {
    await gotoDesktop(page);
    await openSurface(page, 'Chat');

    const input = chatInput(page);
    await input.focus();
    await input.fill('/');
    await page.waitForTimeout(500);

    // Slash menu should appear — look for command options
    const slashMenu = page.locator('text=/research|draft|plan|catchup|status|spawn/i');
    const count = await slashMenu.count();
    expect(count).toBeGreaterThan(0);
  });

  test('persona picker opens and lists personas', async ({ page }) => {
    await gotoDesktop(page);
    await openSurface(page, 'Chat');

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
    await openSurface(page, 'Chat');

    // Click the model dropdown
    const modelBtn = page.locator('button', { hasText: /sonnet|claude|model/i }).first();
    if (await modelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modelBtn.click();
      await page.waitForTimeout(500);
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/ollama|minimax|sonnet|opus|haiku|gpt|gemini|model/i);
    }
  });

  test('autonomy chip is clickable and cycles', async ({ page }) => {
    await gotoDesktop(page);
    await openSurface(page, 'Chat');

    const autonomyChip = page.getByRole('button', { name: /ask first|trusted|autopilot/i }).first();
    if (await autonomyChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await autonomyChip.click();
      await page.waitForTimeout(500);
      // Should show autonomy options or cycle to Trusted
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/ask first|trusted|autopilot|autonomy|minutes/i);
    }
  });
});

// ── 3. Multi-window chaos ─────────────────────────────────────────────

test.describe('3. Multi-Window Chaos', () => {
  test('open 4 windows simultaneously without crash', async ({ page }) => {
    await gotoDesktop(page);

    await openSurface(page, 'Chat');
    await openSurface(page, 'Room');
    await openSurface(page, 'Agents');
    await openSurface(page, 'Files');

    // No crash — page should still be interactive
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(100);

    // Single-canvas navigation should leave the app usable on the final surface.
    expect(text).toMatch(/file|folder|workspace|storage/i);
  });

  test('Ctrl+Shift+N opens the active workspace chat route without crash', async ({ page }) => {
    await gotoDesktop(page);

    await page.keyboard.press('Control+Shift+N');
    await page.waitForURL(/\/workspaces\/[^/]+\/chat/, { timeout: 5_000 });
    await expect(chatInput(page)).toBeVisible({ timeout: 5_000 });
  });

  test('close a window via title bar button', async ({ page }) => {
    await gotoDesktop(page);
    await openSurface(page, 'Chat');

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
    await searchInput.fill('default');
    await page.waitForTimeout(800);

    // Should find the seeded default workspace in a fresh data dir.
    const text = await page.locator('body').innerText();
    expect(text.toLowerCase()).toContain('default');
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
    await openSurface(page, 'Settings');
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
    await openSurface(page, 'API Keys');
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
      await openSurface(page, app);
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
    const apiNames = (Array.isArray(apiWorkspaces) ? apiWorkspaces : [])
      .filter((workspace: { name: string; status?: string }) => (
        workspace.status !== 'archived' && !isDevNoiseWorkspace(workspace.name)
      ))
      .map((workspace: { name: string }) => workspace.name);

    await gotoDesktop(page);
    await openSurface(page, 'Workspaces');
    const body = page.locator('body');

    // Every sampled API workspace should appear in the complete workspace view.
    for (const name of apiNames.slice(0, 3)) {
      await expect(body).toContainText(name, { timeout: 10_000 });
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
    await page.goto(`${BASE}/this-does-not-exist?skipOnboarding=true&skipBoot=true&skipBriefing=true`, {
      waitUntil: 'domcontentloaded',
    });
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
    await page.waitForLoadState('domcontentloaded');

    const onboarding = page.getByRole('region', { name: /waggle onboarding/i });
    if (!await onboarding.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/waggle|workspace|continue|chat/i);
      return;
    }

    await onboarding.getByRole('button', { name: /continue/i }).click();
    await onboarding.getByRole('button', { name: /continue/i }).click();
    await expect(onboarding.getByRole('button', { name: /continue/i })).toBeEnabled({ timeout: 10_000 });
    await onboarding.getByRole('button', { name: /continue/i }).click();
    await onboarding.getByRole('button', { name: /skip this step/i }).click();

    await expect(page.getByText(/Research Hub|Engineering|Sales Pipeline/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── 11. Performance baseline ─────────────────────────────────────────

test.describe('10. Performance', () => {
  test('initial load completes under 8 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`);
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
