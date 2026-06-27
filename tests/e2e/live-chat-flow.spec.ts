/**
 * Live Chat Flow — tests the REAL product loop with actual LLM calls.
 *
 * Requires: WAGGLE_E2E_LIVE_CHAT=1 and a deterministic live provider.
 * This is the test that proves the product actually works.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';
const RUN_LIVE_CHAT = process.env.WAGGLE_E2E_LIVE_CHAT === '1';

test.setTimeout(120_000);
test.skip(!RUN_LIVE_CHAT, 'Set WAGGLE_E2E_LIVE_CHAT=1 with a deterministic live provider to run live chat assertions.');

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
  await page.goto(`${BASE}/home?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="navigation"], main', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await dismissOverlay(page);
}

async function firstWorkspaceId(request: APIRequestContext): Promise<string> {
  const wsRes = await request.get(`${BASE}/api/workspaces`);
  const workspaces = await wsRes.json();
  expect(Array.isArray(workspaces)).toBeTruthy();
  expect(workspaces.length).toBeGreaterThan(0);
  return workspaces[0].id;
}

async function createChatTurn(request: APIRequestContext, workspaceId: string, message: string) {
  const res = await request.post(`${BASE}/api/chat`, {
    data: { message, workspaceId },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toContain('event:');
  expect(body.length).toBeGreaterThan(50);
}

// ── Verify LLM is available ───────────────────────────────────────────

test('LLM provider is healthy', async ({ request }) => {
  const res = await request.get(`${BASE}/health`);
  const data = await res.json();
  expect(data.llm.health).toBe('healthy');
  expect(data.llm.reachable).toBe(true);
});

// ── Core loop: send message → get response ────────────────────────────

test('send a message and get a real LLM response', async ({ page }) => {
  await gotoDesktop(page);

  // Open chat
  await page.locator('button[aria-label="Chat"]').click();
  await page.waitForSelector('textarea', { timeout: 15_000 });

  // Find the chat input
  const input = page.locator('textarea').first();
  await expect(input).toBeVisible({ timeout: 5000 });

  // Type a simple message
  await input.fill('Reply with exactly WAGGLE_TEST_OK and no other text.');
  await page.waitForTimeout(300);

  // Send (press Enter or click send button)
  await input.press('Enter');

  // Wait for the response — the agent should stream tokens back
  // Look for assistant message content appearing in the chat
  const response = page.locator('text=/WAGGLE_TEST_OK|waggle_test_ok|test.ok/i');
  await expect(response.first()).toBeVisible({ timeout: 90_000 });
});

// ── Memory save flow ──────────────────────────────────────────────────

test('agent response saves to session history', async ({ request }) => {
  const workspaceId = await firstWorkspaceId(request);
  await createChatTurn(request, workspaceId, 'Say WAGGLE_HISTORY_OK in one token.');

  const sessRes = await request.get(`${BASE}/api/workspaces/${workspaceId}/sessions`);
  const sessions = await sessRes.json();
  expect(Array.isArray(sessions)).toBeTruthy();
  expect(sessions.length).toBeGreaterThan(0);
});

// ── Chat streaming works ──────────────────────────────────────────────

test('chat SSE stream delivers tokens', async ({ request }) => {
  const workspaceId = await firstWorkspaceId(request);
  await createChatTurn(request, workspaceId, 'Say hello in one word.');
});
