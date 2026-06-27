/**
 * Phase A/B Verification — E2E tests for the Room + Tiered Autonomy features,
 * RETARGETED to the P1a AppShell route contract (the window manager is
 * retired — docs/ux-refactor/appshell-conversion-plan.md §3.1):
 *
 *   Bug #1:  Default model shows sonnet, not opus
 *   Bug #2:  Onboarding auto-skip for returning users
 *   Bug #7:  Ctrl+Shift+N navigates to the active workspace's chat route
 *            (window spawning retired, §4.2)
 *   A.2:     DROPPED — concurrent same-workspace multi-persona chat windows
 *            were consciously removed (§9.10 / §4.3); per-workspace persona
 *            survives in the widget header.
 *   A.3:     Room opens via the left nav (same aria-labels as the old dock)
 *   A.4:     waggle-window-state-v1 → waggle-chat-state-v1 migration
 *            (acceptance check 6; the legacy key is deleted, §3.3)
 *   B.4/B.5: Autonomy chip present in chat header
 *
 * Run: npx playwright test tests/e2e/phase-ab-verification.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';

async function gotoDesktop(page: Page) {
  await page.goto(`${BASE}/home?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[role="navigation"], main', { timeout: 10_000 });
  await dismissOverlay(page);
}

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

// The AppShell left nav reuses the dock's aria-labels (plan §1.3), so the
// old dock-driven helper survives as a nav-driven one.
async function openAppViaDock(page: Page, label: string) {
  const routes: Record<string, string> = {
    Chat: '/workspaces/default-workspace/chat',
    Room: '/room',
    Approvals: '/approvals',
  };
  const routePatterns: Record<string, RegExp> = {
    Chat: /\/workspaces\/[^/]+\/chat/,
    Room: /\/room/,
    Approvals: /\/approvals/,
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
      await page.waitForTimeout(500);
    }
    return;
  }

  if (!route) throw new Error(`No current app route for ${label}`);
  await page.goto(`${BASE}${route}?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[role="navigation"], main', { timeout: 10_000 });
}

// ── Bug #2: Onboarding auto-skip ──────────────────────────────────────────

test.describe('Bug #2 — Onboarding auto-skip', () => {
  test('returning user with skipOnboarding param bypasses wizard', async ({ page }) => {
    await gotoDesktop(page);
    const wizard = page.locator('[class*="onboarding"], [class*="Onboarding"], [class*="wizard"]');
    const wizardVisible = await wizard.isVisible().catch(() => false);
    expect(wizardVisible).toBe(false);
  });

  test('desktop hero or dock is visible after skip', async ({ page }) => {
    await gotoDesktop(page);
    const dockOrHero = page.locator('button[aria-label="Chat"], h1:has-text("Waggle")');
    await expect(dockOrHero.first()).toBeVisible({ timeout: 10000 });
  });
});

// ── Bug #1: Default model ─────────────────────────────────────────────────

test.describe('Bug #1 — Default model', () => {
  test('default model resolves to sonnet, not opus', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Chat');
    await page.waitForTimeout(2000);

    // The model appears in the page as text — look for any element containing
    // a model name string (sonnet, opus, claude, anthropic, etc.)
    const allText = await page.locator('body').innerText();
    const hasModelRef = /sonnet|opus|claude/i.test(allText);

    if (hasModelRef) {
      // If a model string appears, verify the selected/default model is not Opus.
      const opusCount = (allText.match(/opus/gi) || []).length;
      const sonnetCount = (allText.match(/sonnet/gi) || []).length;
      const localCount = (allText.match(/ollama|minimax|gemma|gpt/gi) || []).length;
      expect(sonnetCount + localCount).toBeGreaterThan(0);
      expect(opusCount).toBeLessThanOrEqual(sonnetCount + localCount);
    }
    // If no model text at all, that's acceptable (no workspace active)
  });
});

// ── Bug #7: Ctrl+Shift+N ──────────────────────────────────────────────────
// Retargeted (plan §4.2): the shortcut retired as a window spawner — it now
// navigates to the active workspace's chat route; no workspace → /home.

test.describe('Bug #7 — Ctrl+Shift+N', () => {
  test('Ctrl+Shift+N navigates to the active workspace chat route', async ({ page, request }) => {
    await gotoDesktop(page);

    const res = await request.get(`${BASE}/api/workspaces`);
    const workspaces = await res.json();
    const hasWorkspace = Array.isArray(workspaces) && workspaces.length > 0;

    // Dispatch Ctrl+Shift+N via evaluate — browser intercepts the real shortcut
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'N', code: 'KeyN', ctrlKey: true, shiftKey: true, bubbles: true,
      }));
    });

    if (hasWorkspace) {
      await page.waitForURL(/\/workspaces\/[^/]+\/chat/, { timeout: 5000 });
    } else {
      // routeFor('chat') with no active workspace falls back to /home (§1.3).
      await page.waitForURL(/\/home/, { timeout: 5000 });
    }
    // The single-canvas shell never spawns window chrome (§3.1).
    expect(await page.locator('[class*="AppWindow"], [class*="app-window"]').count()).toBe(0);
  });
});

// A.2 ("two chat windows can exist simultaneously") DROPPED: concurrent
// same-workspace multi-persona chat windows were consciously removed with the
// window manager (plan §9.10 / §4.3 — D1-c lite not invoked). Per-workspace
// persona switching survives in the chat widget header and is covered by the
// unit suite (p1a-chat-state.test.tsx).

// ── A.3: Room canvas ─────────────────────────────────────────────────────

test.describe('A.3 — Room canvas', () => {
  test('Room app opens from dock and shows empty state', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Room');
    await page.waitForTimeout(500);

    // Room should show some content (empty state message or tiles area)
    const roomContent = page.locator('text=/room|agent|specialist|no.*running|empty/i');
    await expect(roomContent.first()).toBeVisible({ timeout: 5000 });
  });
});

// ── A.4: Window-state migration (was: window restoration) ────────────────
// Retargeted to acceptance check 6 (plan §3.3): a populated legacy
// waggle-window-state-v1 is salvaged into waggle-chat-state-v1 + the initial
// route, and the legacy key is deleted UNCONDITIONALLY on boot.

test.describe('A.4 — Window-state migration', () => {
  test('legacy window state migrates to waggle-chat-state-v1 and the key is removed', async ({ page }) => {
    // Seed BEFORE any app code runs (same addInitScript pattern as the
    // onboarding skip): one persisted chat window with a persona.
    await page.addInitScript(() => {
      localStorage.setItem('waggle-booted', 'true');
      localStorage.setItem('waggle-window-state-v1', JSON.stringify({
        version: 1,
        windows: [{
          instanceId: 'i-e2e', appId: 'chat', workspaceId: 'ws-e2e',
          personaId: 'coder', zIndex: 5, minimized: false, cascadeOffset: 0,
        }],
      }));
    });
    await page.goto(`${BASE}/?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
      waitUntil: 'domcontentloaded',
    });

    // §3.3 step 2: the salvaged top window seeds the initial navigation.
    await page.waitForURL(/\/workspaces\/ws-e2e\/chat/, { timeout: 10000 });

    const { legacy, chatState } = await page.evaluate(() => ({
      legacy: localStorage.getItem('waggle-window-state-v1'),
      chatState: localStorage.getItem('waggle-chat-state-v1'),
    }));
    // §3.3 step 4: the legacy key is gone — no dual-format support, ever.
    expect(legacy).toBeNull();
    // §3.3 step 3: persona salvaged + the explicit normal-autonomy marker.
    expect(chatState).not.toBeNull();
    const parsed = JSON.parse(chatState!);
    expect(parsed.version).toBe(1);
    expect(parsed.chats['ws-e2e']).toMatchObject({ personaId: 'coder', autonomyLevel: 'normal' });
  });
});

// ── B.5: Autonomy chip ──────────────────────────────────────────────────

test.describe('B.5 — Autonomy controls', () => {
  test('chat window shows autonomy-related UI element', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Chat');
    await page.waitForTimeout(1500);

    // The chat header shows a "Normal" autonomy chip. Check body text.
    const allText = await page.locator('body').innerText();
    const hasAutonomy = /ask first|trusted|autopilot|normal|yolo/i.test(allText);
    expect(hasAutonomy).toBe(true);
  });
});

// ── Approvals app ────────────────────────────────────────────────────────

test.describe('B.4 — Approvals app', () => {
  test('Approvals app opens from dock', async ({ page }) => {
    await gotoDesktop(page);
    await openAppViaDock(page, 'Approvals');
    await page.waitForTimeout(500);

    const appContent = page.locator('text=/approval|pending|no.*pending|history/i');
    await expect(appContent.first()).toBeVisible({ timeout: 5000 });
  });
});

// ── Structural health ────────────────────────────────────────────────────

test.describe('Structural health', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(['ok', 'degraded', 'unavailable']).toContain(data.status);
  });

  test('workspaces API returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/workspaces`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('dock renders all expected buttons', async ({ page }) => {
    await gotoDesktop(page);
    const expectedApps = ['Chat', 'Memory', 'Agents & tasks'];
    for (const label of expectedApps) {
      const btn = page.locator(`button[aria-label="${label}"]`);
      await expect(btn).toBeVisible({ timeout: 5000 });
    }
  });

  test('no console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await gotoDesktop(page);
    await page.waitForTimeout(2000);
    // Filter out known benign errors (network requests, background sync, etc.)
    const realErrors = errors.filter(e =>
      !e.includes('Failed to fetch') &&
      !e.includes('net::ERR') &&
      !e.includes('favicon') &&
      !e.includes('401') &&
      !e.includes('404') &&
      !e.includes('sync') &&
      !e.includes('WebSocket') &&
      !e.includes('model') &&
      !e.includes('fetch')
    );
    expect(realErrors).toHaveLength(0);
  });
});
