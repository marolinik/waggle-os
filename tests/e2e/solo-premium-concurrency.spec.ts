import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const RUN_LIVE_CONCURRENCY = process.env.WAGGLE_E2E_SOLO_CONCURRENCY === '1';
const MODEL = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_MODEL
  ?? 'openai-compatible/qwen3.8-flash-next';
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=simple';

interface HistoryMessage {
  role: string;
  content: string;
}

interface CapturedChatStream {
  bodyText: string;
  modelRequestedAt: number | null;
  modelActivityAt: number | null;
  terminalAt: number | null;
  error: string | null;
}

interface SseEvent {
  event: string;
  data: Record<string, unknown> | null;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function parseSse(body: string): { events: SseEvent[]; errors: string[] } {
  const events: SseEvent[] = [];
  const errors: string[] = [];
  for (const block of body.split(/\r?\n\r?\n/).filter(Boolean)) {
    const lines = block.split(/\r?\n/);
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() ?? '';
    const rawData = lines.filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    if (!event || !rawData) continue;
    try {
      events.push({ event, data: JSON.parse(rawData) as Record<string, unknown> });
    } catch (error) {
      errors.push(`${event}: ${error instanceof Error ? error.message : String(error)}`);
      events.push({ event, data: null });
    }
  }
  return { events, errors };
}

async function armChatWireCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    type BrowserCapture = CapturedChatStream;
    interface BrowserCaptureState {
      capture: BrowserCapture | null;
      restore: () => void;
    }
    const scope = window as typeof window & { __waggleConcurrencyCapture?: BrowserCaptureState };
    scope.__waggleConcurrencyCapture?.restore();
    const originalFetch = window.fetch.bind(window);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const rawUrl = input instanceof Request
        ? input.url
        : input instanceof URL ? input.href : String(input);
      const isChat = method === 'POST'
        && new URL(rawUrl, window.location.href).pathname === '/api/chat';
      const response = await originalFetch(input, init);
      if (!isChat || !response.ok
        || !(response.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')) {
        return response;
      }

      const capture: BrowserCapture = {
        bodyText: '', modelRequestedAt: null, modelActivityAt: null, terminalAt: null, error: null,
      };
      scope.__waggleConcurrencyCapture!.capture = capture;
      const reader = response.clone().body?.getReader();
      if (!reader) {
        capture.error = 'Chat SSE response did not expose a readable body.';
        return response;
      }
      void (async () => {
        const decoder = new TextDecoder('utf-8');
        try {
          while (true) {
            const chunk = await reader.read();
            capture.bodyText += decoder.decode(chunk.value, { stream: !chunk.done });
            const normalized = capture.bodyText.replace(/\r\n/g, '\n');
            if (capture.modelRequestedAt === null
              && /event:\s*step\s*\ndata:[^\n]*"phase"\s*:\s*"model_requested"/.test(normalized)) {
              capture.modelRequestedAt = Date.now();
            }
            if (capture.modelActivityAt === null
              && /event:\s*step\s*\ndata:[^\n]*"phase"\s*:\s*"model_streaming"/.test(normalized)) {
              capture.modelActivityAt = Date.now();
            }
            if (capture.terminalAt === null
              && /event:\s*(?:done|error)\s*\ndata:[^\n]*\n\n/.test(normalized)) {
              capture.terminalAt = Date.now();
            }
            if (chunk.done) {
              if (capture.terminalAt === null) capture.error = 'Chat SSE ended without a terminal event.';
              return;
            }
          }
        } catch (error) {
          if (capture.terminalAt === null) {
            capture.error = error instanceof Error ? error.message : String(error);
          }
        } finally {
          try { reader.releaseLock(); } catch { /* already released */ }
        }
      })();
      return response;
    };
    scope.__waggleConcurrencyCapture = { capture: null, restore };
    window.fetch = wrappedFetch;
  });
}

async function readChatWireCapture(page: Page): Promise<CapturedChatStream> {
  await page.waitForFunction(() => {
    const scope = window as typeof window & {
      __waggleConcurrencyCapture?: { capture: CapturedChatStream | null };
    };
    const capture = scope.__waggleConcurrencyCapture?.capture;
    return capture?.terminalAt !== null || capture?.error !== null;
  }, undefined, { timeout: 120_000 });
  const capture = await page.evaluate(() => {
    const scope = window as typeof window & {
      __waggleConcurrencyCapture?: { capture: CapturedChatStream | null };
    };
    return scope.__waggleConcurrencyCapture?.capture ?? null;
  });
  if (!capture) throw new Error('Chat SSE capture did not observe a response.');
  if (capture.error) throw new Error(capture.error);
  return capture;
}

async function disarmChatWireCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as typeof window & { __waggleConcurrencyCapture?: { restore: () => void } };
    scope.__waggleConcurrencyCapture?.restore();
  }).catch(() => {});
}

function validateChatCapture(capture: CapturedChatStream): string {
  const parsed = parseSse(capture.bodyText);
  expect(parsed.errors).toEqual([]);
  expect(parsed.events.filter(event => event.event === 'error')).toEqual([]);
  expect(parsed.events.filter(event => event.event === 'done')).toHaveLength(1);
  const modelRequestEvents = parsed.events.filter(event => (
    event.event === 'step' && event.data?.phase === 'model_requested'
  ));
  expect(modelRequestEvents).toHaveLength(1);
  expect(modelRequestEvents[0].data).toEqual({
    content: 'Sending your request to the model…',
    phase: 'model_requested',
  });
  const modelActivityEvents = parsed.events.filter(event => (
    event.event === 'step' && event.data?.phase === 'model_streaming'
  ));
  expect(modelActivityEvents).toHaveLength(1);
  expect(modelActivityEvents[0].data).toEqual({
    content: 'Writing the answer…',
    phase: 'model_streaming',
  });
  expect(capture.bodyText).not.toContain('workspace_queue');
  expect(capture.modelRequestedAt).not.toBeNull();
  expect(capture.modelActivityAt).not.toBeNull();
  expect(capture.terminalAt).not.toBeNull();
  expect(capture.modelRequestedAt!).toBeLessThanOrEqual(capture.modelActivityAt!);
  expect(capture.modelActivityAt!).toBeLessThanOrEqual(capture.terminalAt!);
  const done = parsed.events.find(event => event.event === 'done')?.data;
  expect(done?.model).toBe(MODEL);
  expect(typeof done?.content).toBe('string');
  const tokenText = parsed.events
    .filter(event => event.event === 'token')
    .map(event => event.data?.content)
    .join('');
  expect(tokenText).toBe(done!.content);
  return normalizeText(done!.content as string);
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function readBrowserSessionToken(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session-token', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Session bootstrap failed: ${response.status}`);
    const body = await response.json() as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) throw new Error('Session bootstrap returned no token');
    return body.token;
  });
}

async function readHistory(
  page: Page,
  workspaceId: string,
  sessionId: string,
  token: string,
): Promise<HistoryMessage[]> {
  const response = await page.request.get(
    `/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`,
    { headers: authHeaders(token) },
  );
  expect(response.ok(), await response.text().catch(() => '')).toBe(true);
  const body = await response.json() as { sessionId: string; messages: HistoryMessage[] };
  expect(body.sessionId).toBe(sessionId);
  return body.messages;
}

async function readAssistantFromUi(page: Page): Promise<string> {
  await page.context().grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: new URL(page.url()).origin },
  );
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const turn = page.locator('[data-testid="chat-message"][data-message-role="assistant"]').last();
  await turn.hover();
  const copyButton = turn.getByTestId('chat-msg-copy');
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  for (let attempt = 0; attempt < 20; attempt++) {
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (copied) return normalizeText(copied);
    await page.waitForTimeout(100);
  }
  throw new Error('Copy did not expose the assistant response.');
}

function markerSequence(lane: 'A' | 'B', suffix: string): string[] {
  return Array.from({ length: 24 }, (_, index) => (
    `${lane}-${String(index + 1).padStart(2, '0')}-${suffix}`
  ));
}

async function openWorkspaceChat(
  page: Page,
  workspaceId: string,
  sessionId: string,
  label: string,
): Promise<void> {
  const apiEvents: string[] = [];
  const onRequest = (request: { url(): string; method(): string }) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiEvents.push(`start ${request.method()} ${url.pathname}`);
  };
  const onResponse = (response: { url(): string; status(): number }) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) apiEvents.push(`done ${response.status()} ${url.pathname}`);
  };
  const onFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      apiEvents.push(`failed ${url.pathname}: ${request.failure()?.errorText ?? 'unknown'}`);
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  try {
    await page.goto(
      `/workspaces/${encodeURIComponent(workspaceId)}/chat?session=${encodeURIComponent(sessionId)}&${SKIP_PARAMS}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'Message composer' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`button[data-session-id="${sessionId}"]`))
      .toHaveAttribute('aria-current', 'true');
  } catch (error) {
    throw new Error(`${label} failed to open chat: ${error instanceof Error ? error.message : String(error)}\n${apiEvents.slice(-60).join('\n')}`);
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
  }
}

async function createSession(page: Page, workspaceId: string, token: string, title: string): Promise<string> {
  const response = await page.request.post(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
    { headers: authHeaders(token), data: { title } },
  );
  expect(response.status(), await response.text().catch(() => '')).toBe(201);
  const session = await response.json() as { id: string };
  expect(session.id).toMatch(/^session-/);
  return session.id;
}

test.describe('Windows Solo same-workspace concurrency', () => {
  test.skip(
    !RUN_LIVE_CONCURRENCY,
    'Set WAGGLE_E2E_SOLO_CONCURRENCY=1 to run two real local-model sessions.',
  );
  test.setTimeout(300_000);

  test('keeps two simultaneous Qwen sessions complete and isolated across reloads', async ({ page, context }) => {
    page.setDefaultTimeout(20_000);
    const secondPage = await context.newPage();
    secondPage.setDefaultTimeout(20_000);
    const suffix = randomUUID().slice(0, 8);
    const markersA = markerSequence('A', suffix);
    const markersB = markerSequence('B', suffix);
    const promptA = `Reply with exactly these tokens in this order, separated by one space, and nothing else: ${markersA.join(' ')}`;
    const promptB = `Reply with exactly these tokens in this order, separated by one space, and nothing else: ${markersB.join(' ')}`;
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    let token: string | null = null;
    let workspaceId: string | null = null;
    let sessionA: string | null = null;
    let sessionB: string | null = null;

    for (const candidate of [page, secondPage]) {
      candidate.on('pageerror', error => pageErrors.push(error.message));
      candidate.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
    }

    try {
      await page.goto(`/home?${SKIP_PARAMS}`, { waitUntil: 'domcontentloaded' });
      token = await readBrowserSessionToken(page);
      const settingsResponse = await page.request.get('/api/settings', { headers: authHeaders(token) });
      expect(settingsResponse.ok(), await settingsResponse.text().catch(() => '')).toBe(true);
      const settings = await settingsResponse.json() as { defaultModel?: string };
      expect(settings.defaultModel).toBe(MODEL);

      const workspaceResponse = await page.request.post('/api/workspaces', {
        headers: authHeaders(token),
        data: {
          name: `Concurrent Qwen ${suffix}`,
          group: 'Tests',
          model: MODEL,
          storageType: 'virtual',
        },
      });
      expect(workspaceResponse.status(), await workspaceResponse.text().catch(() => '')).toBe(201);
      const workspace = await workspaceResponse.json() as { id: string };
      workspaceId = workspace.id;

      [sessionA, sessionB] = await Promise.all([
        createSession(page, workspaceId, token, `Concurrent A ${suffix}`),
        createSession(secondPage, workspaceId, token, `Concurrent B ${suffix}`),
      ]);
      expect(sessionA).not.toBe(sessionB);

      await Promise.all([
        openWorkspaceChat(page, workspaceId, sessionA, 'tab A'),
        openWorkspaceChat(secondPage, workspaceId, sessionB, 'tab B'),
      ]);

      await page.getByRole('textbox', { name: 'Message composer' }).fill(promptA);
      await secondPage.getByRole('textbox', { name: 'Message composer' }).fill(promptB);
      await Promise.all([armChatWireCapture(page), armChatWireCapture(secondPage)]);
      const requestA = page.waitForRequest(request => (
        request.method() === 'POST' && pathOf(request.url()) === '/api/chat'
      ));
      const requestB = secondPage.waitForRequest(request => (
        request.method() === 'POST' && pathOf(request.url()) === '/api/chat'
      ));
      const responseA = page.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/chat'
      ));
      const responseB = secondPage.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/chat'
      ));

      await Promise.all([
        page.getByRole('button', { name: 'Send', exact: true }).click(),
        secondPage.getByRole('button', { name: 'Send', exact: true }).click(),
      ]);
      const [wireA, wireB, chatResponseA, chatResponseB] = await Promise.all([
        requestA, requestB, responseA, responseB,
      ]);
      for (const response of [chatResponseA, chatResponseB]) {
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type'] ?? '').toContain('text/event-stream');
      }
      expect(JSON.parse(wireA.postData() ?? '{}')).toMatchObject({
        workspaceId,
        sessionId: sessionA,
        model: MODEL,
        message: promptA,
      });
      expect(JSON.parse(wireB.postData() ?? '{}')).toMatchObject({
        workspaceId,
        sessionId: sessionB,
        model: MODEL,
        message: promptB,
      });

      const stopA = page.getByTestId('chat-stop-stream');
      const stopB = secondPage.getByTestId('chat-stop-stream');
      await expect.poll(async () => (
        await stopA.isVisible().catch(() => false)
        && await stopB.isVisible().catch(() => false)
      ), { timeout: 20_000, intervals: [50, 100, 250] }).toBe(true);

      const answerA = page.locator('[data-testid="chat-message"][data-message-role="assistant"]')
        .last().getByTestId('chat-message-content');
      const answerB = secondPage.locator('[data-testid="chat-message"][data-message-role="assistant"]')
        .last().getByTestId('chat-message-content');
      await expect(stopA).toBeHidden({ timeout: 120_000 });
      await expect(stopB).toBeHidden({ timeout: 120_000 });

      const [captureA, captureB] = await Promise.all([
        readChatWireCapture(page), readChatWireCapture(secondPage),
      ]);
      const canonicalA = validateChatCapture(captureA);
      const canonicalB = validateChatCapture(captureB);
      expect(canonicalA).toBe(markersA.join(' '));
      expect(canonicalB).toBe(markersB.join(' '));
      expect(Math.max(captureA.modelRequestedAt!, captureB.modelRequestedAt!))
        .toBeLessThan(Math.min(captureA.terminalAt!, captureB.terminalAt!));
      await Promise.all([disarmChatWireCapture(page), disarmChatWireCapture(secondPage)]);

      const visibleA = await readAssistantFromUi(page);
      const visibleB = await readAssistantFromUi(secondPage);
      expect(visibleA).toBe(canonicalA);
      expect(visibleB).toBe(canonicalB);
      expect(markersB.filter(marker => visibleA.includes(marker))).toEqual([]);
      expect(markersA.filter(marker => visibleB.includes(marker))).toEqual([]);

      await expect.poll(async () => (
        await readHistory(page, workspaceId!, sessionA!, token!)
      ).length, { timeout: 20_000 }).toBe(2);
      await expect.poll(async () => (
        await readHistory(secondPage, workspaceId!, sessionB!, token!)
      ).length, { timeout: 20_000 }).toBe(2);
      const historyA = await readHistory(page, workspaceId, sessionA, token);
      const historyB = await readHistory(secondPage, workspaceId, sessionB, token);
      expect(historyA.map(item => normalizeText(item.content))).toEqual([promptA, canonicalA]);
      expect(historyB.map(item => normalizeText(item.content))).toEqual([promptB, canonicalB]);

      await Promise.all([
        page.reload({ waitUntil: 'domcontentloaded' }),
        secondPage.reload({ waitUntil: 'domcontentloaded' }),
      ]);
      await Promise.all([
        expect(page.getByRole('textbox', { name: 'Message composer' }))
          .toBeVisible({ timeout: 30_000 }),
        expect(secondPage.getByRole('textbox', { name: 'Message composer' }))
          .toBeVisible({ timeout: 30_000 }),
      ]);
      await expect(page.locator(`button[data-session-id="${sessionA}"]`))
        .toHaveAttribute('aria-current', 'true');
      await expect(secondPage.locator(`button[data-session-id="${sessionB}"]`))
        .toHaveAttribute('aria-current', 'true');
      expect(await readAssistantFromUi(page)).toBe(canonicalA);
      expect(await readAssistantFromUi(secondPage)).toBe(canonicalB);
      const reloadedTextA = await page.locator('body').innerText();
      const reloadedTextB = await secondPage.locator('body').innerText();
      expect(markersB.filter(marker => reloadedTextA.includes(marker))).toEqual([]);
      expect(markersA.filter(marker => reloadedTextB.includes(marker))).toEqual([]);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      await Promise.all([disarmChatWireCapture(page), disarmChatWireCapture(secondPage)]);
      await secondPage.close();
      if (token && workspaceId) {
        await page.goto(`/home?${SKIP_PARAMS}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        const response = await page.request.delete(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
          headers: authHeaders(token),
        });
        expect.soft(response.status()).toBe(204);
      }
    }
  });
});
