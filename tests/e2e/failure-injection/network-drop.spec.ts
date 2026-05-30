/**
 * Failure-injection · network-drop — mid-stream SSE connection loss on POST /api/chat.
 *
 * FAILURE PATH: the client (apps/web/src/lib/adapter.ts:336-388) consumes the
 * chat SSE stream via fetch().then(res.body.getReader()). When the underlying
 * network connection is dropped, one of two things happens:
 *
 *   (a) fetch()/reader.read() REJECTS  → useChat's catch block
 *       (apps/web/src/hooks/useChat.ts:264-275) appends an `error` ContentBlock
 *       rendered by chat-blocks/BlockRenderer.tsx:33-38 as a ⚠️ destructive
 *       message: "Backend is offline. Connect to a Waggle server to start chatting."
 *
 *   (b) the body simply ENDS without a `done` event → the reader yields
 *       done=true, the while loop at adapter.ts:360 exits, sendMessage()
 *       returns normally, and no error is shown but the partial tokens that DID
 *       arrive remain rendered (graceful truncation, no crash/hang).
 *
 * The client does NOT auto-retry (by design). These tests assert the RECOVERY /
 * ERROR contract for both shapes, plus that a user can re-send after a drop and
 * get a fresh, complete stream.
 *
 * Injection mechanism mirrors the page.route() pattern in spawn-agent-flow.spec.ts.
 * Runs against the existing :3333 webServer (WAGGLE_ECHO_MODE in CI → the server
 * streams a deterministic "local mode" echo response, used by the recovery test).
 *
 * Run: npx playwright test tests/e2e/failure-injection/network-drop.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';

test.setTimeout(60_000);

// ── Shared UI helpers — mirror the PROVEN boot/navigation flow in
// waggle-complete.spec.ts (test 14.8), not the stale live-chat-flow.spec.ts
// bypass. The onboarding key is `waggle:onboarding`; chat opens via the dock
// button (aria-label = view label) with a sidebar-by-text fallback. ──────

async function skipOnboarding(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7 }));
  });
}

async function waitForApp(page: Page) {
  await page.waitForSelector(
    '.waggle-app-shell, .waggle-sidebar, [role="navigation"], [class*="onboarding"]',
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(800);
}

async function dismissLoginBriefing(page: Page) {
  const startBtn = page.locator('button', { hasText: 'Start Working' });
  if (await startBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await startBtn.click();
    await page.waitForTimeout(500);
  }
}

async function navigateTo(page: Page, view: string) {
  const dockBtn = page.locator(`button[aria-label="${view}"]`);
  if (await dockBtn.isVisible().catch(() => false)) {
    await dockBtn.click();
    await page.waitForTimeout(400);
    return;
  }
  const sidebar = page.locator('[role="navigation"]');
  const btn = sidebar.locator('button', { hasText: view });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(400);
  }
}

async function gotoDesktop(page: Page) {
  await page.goto(`${BASE}/`);
  await skipOnboarding(page);
  await page.reload();
  await waitForApp(page);
  await dismissLoginBriefing(page);
}

async function openChatInput(page: Page) {
  await navigateTo(page, 'Chat');
  // Real placeholder: "Message Waggle... (/ for commands)" (ChatApp.tsx:1205)
  const input = page
    .locator('textarea[placeholder*="Message"], textarea[placeholder*="message"]')
    .first();
  await expect(input).toBeVisible({ timeout: 8000 });
  return input;
}

// A minimal, well-formed SSE payload that delivers exactly ONE token event and
// then ENDS — no `done` event. This simulates a connection dropped mid-stream
// AFTER at least one token has been delivered (requirement: abort after >=1
// token event). The adapter renders the token, then sees the stream close.
const PARTIAL_SSE_ONE_TOKEN =
  'event: token\ndata: {"content":"MIDSTREAM_TOKEN_PROBE "}\n\n';

// ── Test 1 · Hard drop (fetch rejects) → graceful error, no hang ───────

test('chat SSE connection dropped → shows offline error, does not hang or crash', async ({ page }) => {
  await gotoDesktop(page);
  const input = await openChatInput(page);

  // Inject the failure: abort the chat request at the network layer so the
  // client's fetch()/reader rejects → useChat catch path fires.
  await page.route('**/api/chat', (route) => route.abort('failed'));

  await input.fill('trigger a dropped stream');
  await input.press('Enter');

  // (2) The graceful error message must be shown. BlockRenderer renders the
  // error ContentBlock with text-destructive styling and the offline copy.
  const offlineError = page.locator('.text-destructive', { hasText: /Backend is offline/i });
  await expect(offlineError.first()).toBeVisible({ timeout: 15_000 });

  // (3) No hang: the composer must become usable again (loading state cleared
  // in useChat's finally). The input stays editable rather than spinning forever.
  await expect(input).toBeEditable({ timeout: 10_000 });

  // (3b) No crash: the desktop is still alive and the chat input still present.
  await expect(input).toBeVisible();
});

// ── Test 2 · Mid-stream truncation (token then close) → token kept, no crash ──

test('chat SSE truncated after one token → partial token rendered, no hang or crash', async ({ page }) => {
  await gotoDesktop(page);
  const input = await openChatInput(page);

  // Fulfill a partial stream: one real token event, then the body ends with no
  // `done` event — i.e. the connection dropped mid-stream after a token landed.
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: PARTIAL_SSE_ONE_TOKEN,
    }),
  );

  await input.fill('trigger a truncated stream');
  await input.press('Enter');

  // (1) The token that arrived before the drop must be rendered (proves the drop
  // happened mid-token, not before any data).
  await expect(page.locator('text=MIDSTREAM_TOKEN_PROBE').first()).toBeVisible({ timeout: 15_000 });

  // (3) No hang: reader hit done=true, sendMessage() returned, loading cleared —
  // the composer is editable again.
  await expect(input).toBeEditable({ timeout: 10_000 });

  // (3b) No crash, no infinite loop: desktop + input still present.
  await expect(input).toBeVisible();
});

// ── Test 3 · Recovery — re-send after a drop yields a fresh complete stream ──

test('user can re-send after a dropped stream and get a new complete response', async ({ page }) => {
  await gotoDesktop(page);
  const input = await openChatInput(page);

  // First attempt: drop the connection.
  await page.route('**/api/chat', (route) => route.abort('failed'));
  await input.fill('first attempt that will be dropped');
  await input.press('Enter');

  const offlineError = page.locator('.text-destructive', { hasText: /Backend is offline/i });
  await expect(offlineError.first()).toBeVisible({ timeout: 15_000 });
  await expect(input).toBeEditable({ timeout: 10_000 });

  // Snapshot state after the drop so we can assert the RETRY changes it:
  //  - assistant bubbles use justify-start (user = justify-end) — ChatApp.tsx:1075.
  //    There is no test-id on message rows, so this flex class is the stable
  //    structural signal for "an assistant turn rendered".
  //  - the count of offline-error blocks must NOT grow on the (now-succeeding) retry.
  const assistantBubbles = page.locator('.flex.justify-start');
  const assistantBubblesBeforeRetry = await assistantBubbles.count();
  const offlineErrorsBeforeRetry = await offlineError.count();

  // Clear the injected failure so the real :3333 server handles the retry.
  await page.unroute('**/api/chat');

  // (4) Re-send — the real server handles it. The recovery CONTRACT is mode-
  // independent: the composer settles (request completed, no hang), a new
  // assistant turn renders, and NO new offline error appears. We deliberately
  // do NOT assert the echo-only "local mode" string: a live LLM proxy (LiteLLM
  // on :4000) takes precedence over WAGGLE_ECHO_MODE and returns real model
  // output, so that copy would make the test environment-dependent.
  await input.fill('retry attempt after recovery — please respond');
  await input.press('Enter');

  // Composer re-enables once the stream settles (proves no hang in either mode).
  await expect(input).toBeEditable({ timeout: 45_000 });

  // A new assistant turn rendered after the recovery re-send.
  await expect.poll(
    async () => assistantBubbles.count(),
    { timeout: 45_000, message: 'expected a new assistant response after recovery re-send' },
  ).toBeGreaterThan(assistantBubblesBeforeRetry);

  // The retry must NOT have produced a new "Backend is offline" error.
  expect(await offlineError.count()).toBe(offlineErrorsBeforeRetry);
});
