/**
 * Live Chat Flow — tests the REAL product loop with actual LLM calls.
 *
 * Requires: working API key in vault (Anthropic proxy).
 * This is the test that proves the product actually works.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';

test.setTimeout(60_000);

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
  await page.waitForTimeout(1500);

  // Find the chat input
  const input = page.locator('textarea[placeholder*="Message"], textarea[placeholder*="message"]').first();
  await expect(input).toBeVisible({ timeout: 5000 });

  // Type a simple message
  await input.fill('Reply with exactly: WAGGLE_TEST_OK');
  await page.waitForTimeout(300);

  // Send (press Enter or click send button)
  await input.press('Enter');

  // Wait for the response — the agent should stream tokens back
  // Look for assistant message content appearing in the chat
  const response = page.locator('text=/WAGGLE_TEST_OK|waggle_test_ok|test.ok/i');
  await expect(response.first()).toBeVisible({ timeout: 45_000 });
});

// ── Memory save flow ──────────────────────────────────────────────────

test('agent response saves to session history', async ({ request }) => {
  // After the chat test, verify session data exists
  const wsRes = await request.get(`${BASE}/api/workspaces`);
  const workspaces = await wsRes.json();
  expect(Array.isArray(workspaces)).toBeTruthy();

  if (workspaces.length > 0) {
    const sessRes = await request.get(`${BASE}/api/workspaces/${workspaces[0].id}/sessions`);
    const sessions = await sessRes.json();
    expect(Array.isArray(sessions)).toBeTruthy();
    // Should have at least one session from the chat test above
    expect(sessions.length).toBeGreaterThan(0);
  }
});

// ── Chat streaming works ──────────────────────────────────────────────

test('chat SSE stream delivers tokens', async ({ request }) => {
  const wsRes = await request.get(`${BASE}/api/workspaces`);
  const workspaces = await wsRes.json();
  if (!Array.isArray(workspaces) || workspaces.length === 0) return;

  const wsId = workspaces[0].id;

  // Send a chat message via API and verify we get SSE events
  const res = await request.post(`${BASE}/api/chat`, {
    data: {
      message: 'Say hello in one word.',
      workspaceId: wsId,
    },
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  // SSE stream should contain token events and a done event
  expect(body).toContain('event:');
  expect(body.length).toBeGreaterThan(50);
});
