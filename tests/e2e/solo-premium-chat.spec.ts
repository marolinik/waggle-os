import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Request, type Response } from '@playwright/test';

const RUN_LIVE_SOLO_CHAT = process.env.WAGGLE_E2E_SOLO_CHAT === '1';
const ENDPOINT = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_BASE_URL
  ?? 'http://10.33.0.153:4000/v1';
const MODEL = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_MODEL
  ?? 'openai-compatible/qwen3.8-flash-next';
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=simple';

interface SseEvent {
  event: string;
  data: Record<string, unknown> | string | null;
}

interface ChatWire {
  request: Request;
  response: Response;
  events: SseEvent[];
  done: Record<string, unknown>;
  tokenText: string;
}

interface HistoryMessage {
  role: string;
  content: string;
  model?: string;
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
    const rawData = lines
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
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

async function armChatWireCapture(page: Page): Promise<number> {
  return page.evaluate(() => {
    interface BrowserChatCapture {
      bodyText: string;
      error: string | null;
      settled: boolean;
      terminal: boolean;
    }
    interface BrowserChatCaptureRegistry {
      captures: BrowserChatCapture[];
      restore: (() => void) | null;
    }
    const scope = window as typeof window & {
      __waggleSoloChatCapture?: BrowserChatCaptureRegistry;
    };
    const registry = scope.__waggleSoloChatCapture ?? {
      captures: [],
      restore: null,
    };
    scope.__waggleSoloChatCapture = registry;
    registry.restore?.();

    const cursor = registry.captures.length;
    const originalFetch = window.fetch.bind(window);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      if (registry.restore === restore) registry.restore = null;
    };
    const isTerminalEventBlock = (block: string) => {
      const lines = block.split('\n');
      if (!lines.some(line => /^event:\s*(done|error)\s*$/.test(line))) return false;
      const dataLine = lines.find(line => /^data:\s?/.test(line));
      if (!dataLine) return false;
      try {
        JSON.parse(dataLine.replace(/^data:\s?/, ''));
        return true;
      } catch {
        return false;
      }
    };
    const hasTerminalEvent = (body: string, allowOpenBlock = false) => {
      const normalized = body.replace(/\r\n/g, '\n');
      const blocks = normalized.split('\n\n');
      const openBlock = blocks.pop() ?? '';
      if (blocks.some(isTerminalEventBlock)) return true;
      return allowOpenBlock
        && normalized.endsWith('\n')
        && isTerminalEventBlock(openBlock);
    };

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const method = (init?.method
        ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const rawUrl = input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : String(input);
      const isChatRequest = method === 'POST'
        && new URL(rawUrl, window.location.href).pathname === '/api/chat';
      try {
        const response = await originalFetch(input, init);
        const isSuccessfulSse = isChatRequest
          && response.ok
          && (response.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream');
        if (!isSuccessfulSse) return response;

        const capture: BrowserChatCapture = {
          bodyText: '',
          error: null,
          settled: false,
          terminal: false,
        };
        registry.captures.push(capture);
        try {
          const reader = response.clone().body?.getReader();
          if (!reader) {
            capture.error = 'Chat SSE response did not expose a readable body.';
            capture.settled = true;
          } else {
            void (async () => {
              const decoder = new TextDecoder('utf-8');
              try {
                while (true) {
                  const chunk = await reader.read();
                  if (chunk.done) {
                    capture.bodyText += decoder.decode();
                    if (hasTerminalEvent(capture.bodyText)) capture.terminal = true;
                    if (!capture.terminal) {
                      capture.error = 'Chat SSE response ended before a terminal event.';
                    }
                    capture.settled = true;
                    return;
                  }
                  capture.bodyText += decoder.decode(chunk.value, { stream: true });
                }
              } catch (error) {
                capture.terminal = hasTerminalEvent(capture.bodyText, true);
                if (!capture.terminal) {
                  capture.error = error instanceof Error ? error.message : String(error);
                }
                capture.settled = true;
              } finally {
                try { reader.releaseLock(); } catch { /* reader already released */ }
              }
            })();
          }
        } catch (error) {
          capture.error = error instanceof Error ? error.message : String(error);
          capture.settled = true;
        }
        restore();
        return response;
      } catch (error) {
        if (isChatRequest) restore();
        throw error;
      }
    };

    window.fetch = wrappedFetch;
    registry.restore = restore;
    return cursor;
  });
}

async function readCapturedChatBody(page: Page, cursor: number): Promise<string> {
  await page.waitForFunction((captureCursor) => {
    const scope = window as typeof window & {
      __waggleSoloChatCapture?: { captures: Array<{ settled: boolean }> };
    };
    return scope.__waggleSoloChatCapture?.captures[captureCursor]?.settled === true;
  }, cursor, { timeout: 120_000 });
  const capture = await page.evaluate((captureCursor) => {
    const scope = window as typeof window & {
      __waggleSoloChatCapture?: {
        captures: Array<{ bodyText: string; error: string | null; terminal: boolean }>;
      };
    };
    return scope.__waggleSoloChatCapture?.captures[captureCursor] ?? null;
  }, cursor);
  if (!capture) throw new Error('Chat wire capture did not observe a successful SSE response.');
  if (!capture.terminal) {
    throw new Error(capture.error ?? 'Chat wire capture ended before a terminal SSE event.');
  }
  return capture.bodyText;
}

async function disarmChatWireCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as typeof window & {
      __waggleSoloChatCapture?: { restore: (() => void) | null };
    };
    scope.__waggleSoloChatCapture?.restore?.();
  }).catch(() => {});
}

async function captureChatTurn(page: Page, trigger: () => Promise<void>): Promise<ChatWire> {
  const captureCursor = await armChatWireCapture(page);
  const requestPromise = page.waitForRequest(
    request => request.method() === 'POST' && pathOf(request.url()) === '/api/chat',
  );
  const responsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && pathOf(response.url()) === '/api/chat',
  );

  let request: Request;
  let response: Response;
  let body: string;
  try {
    await trigger();
    [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'] ?? '').toContain('text/event-stream');
    body = await readCapturedChatBody(page, captureCursor);
  } finally {
    await disarmChatWireCapture(page);
  }
  const parsed = parseSse(body);
  expect(parsed.errors).toEqual([]);
  const doneEvents = parsed.events.filter(event => event.event === 'done');
  expect(doneEvents).toHaveLength(1);
  const done = doneEvents[0].data as Record<string, unknown>;
  const tokenText = parsed.events
    .filter(event => event.event === 'token')
    .map(event => {
      const data = event.data;
      return typeof data === 'object' && data && typeof data.content === 'string'
        ? data.content
        : typeof data === 'string' ? data : '';
    })
    .join('');

  expect(tokenText.trim()).not.toBe('');
  expect(tokenText).toBe(done.content);
  expect(done.model).toBe(MODEL);
  return { request, response, events: parsed.events, done, tokenText };
}

async function readHistory(page: Page, workspaceId: string, sessionId: string) {
  const response = await page.request.get(
    `/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`,
  );
  expect(response.ok(), await response.text().catch(() => '')).toBe(true);
  const body = await response.json() as {
    sessionId: string;
    messages: HistoryMessage[];
  };
  expect(body.sessionId).toBe(sessionId);
  return body.messages;
}

async function readAssistantFromUi(page: Page): Promise<string> {
  await page.context().grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: new URL(page.url()).origin },
  );
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const copyButton = page.getByTestId('chat-msg-copy').last();
  await expect(copyButton).toBeVisible({ timeout: 30_000 });
  await copyButton.click();
  for (let attempt = 0; attempt < 20; attempt++) {
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (copied) return normalizeText(copied);
    await page.waitForTimeout(100);
  }
  throw new Error('Copy did not place the assistant response on the clipboard.');
}

test.describe('Windows Solo premium chat journey', () => {
  test.skip(!RUN_LIVE_SOLO_CHAT, 'Set WAGGLE_E2E_SOLO_CHAT=1 to run the real local-model journey.');
  test.setTimeout(240_000);

  test('saves Qwen, creates a blank workspace/session, chats, retries, and reloads cleanly', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const criticalRequestFailures: string[] = [];
    let workspaceId: string | null = null;

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      const pathname = pathOf(request.url());
      const failure = request.failure()?.errorText ?? 'request failed';
      if (
        ['/api/settings', '/api/settings/test-compatible', '/api/workspaces', '/api/chat'].includes(pathname)
        && !/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)
      ) {
        criticalRequestFailures.push(`${request.method()} ${pathname}: ${failure}`);
      }
    });

    try {
      await page.goto(`/settings?${SKIP_PARAMS}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

      await page.getByRole('button', { name: /openai-compatible/i }).click();
      await page.getByLabel('Endpoint URL').fill(ENDPOINT);
      await page.getByRole('button', { name: 'Discover models' }).click();
      const discoveredModel = page.getByRole('combobox', { name: 'Model', exact: true });
      await expect(discoveredModel).toBeVisible({ timeout: 60_000 });
      await discoveredModel.selectOption(MODEL);
      await page.getByRole('button', { name: 'Verify & save' }).click();
      const savedStatus = page.getByRole('status').filter({
        hasText: 'Verified and saved. This model is now your primary model.',
      });
      await expect(savedStatus).toBeVisible({ timeout: 90_000 });

      const settingsResponse = await page.request.get('/api/settings');
      expect(settingsResponse.ok(), await settingsResponse.text().catch(() => '')).toBe(true);
      const settings = await settingsResponse.json() as {
        defaultModel?: string;
        providers?: Record<string, { baseUrl?: string; models?: string[] }>;
      };
      expect(settings.defaultModel).toBe(MODEL);
      expect(settings.providers?.['openai-compatible']?.baseUrl).toBe(ENDPOINT);
      expect(settings.providers?.['openai-compatible']?.models).toContain(MODEL);

      await page.getByTestId('sidebar-workspace').click();
      const switcher = page.getByRole('dialog', { name: /switch workspace/i });
      await expect(switcher).toBeVisible();
      await switcher.getByRole('button', { name: /new workspace/i }).click();

      const createDialog = page.getByRole('dialog', { name: /create workspace/i });
      await expect(createDialog).toBeVisible();
      const workspaceName = `Qwen PM ${randomUUID().slice(0, 8)}`;
      await createDialog.getByLabel('What project or area is this for?').fill(workspaceName);
      const workspaceResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/workspaces'
      ));
      await createDialog.getByRole('button', { name: 'Create workspace', exact: true }).click();
      const workspaceResponse = await workspaceResponsePromise;
      expect(workspaceResponse.status(), await workspaceResponse.text().catch(() => '')).toBe(201);
      const workspace = await workspaceResponse.json() as { id: string; name: string };
      workspaceId = workspace.id;
      expect(workspace.name).toBe(workspaceName);
      await expect(createDialog).toBeHidden();

      await page.getByTestId('nav-chat').click();
      await page.waitForURL(new RegExp(`/workspaces/${workspaceId}/chat(?:\\?|$)`));
      await expect(page.locator(
        `[data-testid="chat-widget-slot"][data-workspace-id="${workspaceId}"]`,
      )).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Message composer' })).toBeVisible();

      await expect(page.locator('button[title^="Waggle picked the model"]')).toContainText(
        /Qwen3\.8 Flash Next/i,
        { timeout: 20_000 },
      );

      const sessionResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST'
        && pathOf(response.url()) === `/api/workspaces/${workspaceId}/sessions`
      ));
      await page.getByTestId('chat-agent-strip')
        .getByRole('button', { name: 'New session', exact: true })
        .click();
      const sessionResponse = await sessionResponsePromise;
      expect(sessionResponse.status(), await sessionResponse.text().catch(() => '')).toBe(201);
      const session = await sessionResponse.json() as { id: string };
      expect(session.id).toMatch(/^session-/);
      await expect(page).toHaveURL(new RegExp(`session=${encodeURIComponent(session.id)}(?:&|$)`));

      const left = 137;
      const right = 29;
      const expectedAnswer = String(left * right);
      const prompt = `Without tools, calculate ${left} multiplied by ${right}. Reply with only the integer.`;
      expect(prompt).not.toContain(expectedAnswer);
      const composer = page.getByRole('textbox', { name: 'Message composer' });
      await composer.fill(prompt);
      await page.evaluate(() => {
        const state = {
          waiting: false,
          stop: false,
          draft: false,
          activity: false,
        };
        const record = () => {
          state.waiting ||= Boolean(document.querySelector('[data-testid="chat-first-response-indicator"]'));
          state.stop ||= Boolean(document.querySelector('[data-testid="chat-stop-stream"]'));
          state.draft ||= Array.from(document.querySelectorAll('[data-testid="chat-draft-content"]'))
            .some(node => Boolean(node.textContent?.trim()));
          state.activity ||= Array.from(document.querySelectorAll('button[aria-expanded]'))
            .some(node => /^(working|checking|recalling|checked saved memory)\b/i.test(node.textContent?.trim() ?? ''));
        };
        const observer = new MutationObserver(record);
        observer.observe(document.body, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
        record();
        const host = globalThis as typeof globalThis & {
          __waggleFirstFeedbackObserver?: MutationObserver;
          __waggleFirstFeedbackState?: typeof state;
        };
        host.__waggleFirstFeedbackObserver = observer;
        host.__waggleFirstFeedbackState = state;
      });
      const firstWire = await captureChatTurn(page, async () => {
        await page.getByRole('button', { name: 'Send' }).click();
      });
      const firstFeedback = await page.evaluate(() => {
        const host = globalThis as typeof globalThis & {
          __waggleFirstFeedbackObserver?: MutationObserver;
          __waggleFirstFeedbackState?: {
            waiting: boolean;
            stop: boolean;
            draft: boolean;
            activity: boolean;
          };
        };
        host.__waggleFirstFeedbackObserver?.disconnect();
        return host.__waggleFirstFeedbackState ?? {
          waiting: false,
          stop: false,
          draft: false,
          activity: false,
        };
      });
      expect(firstFeedback.waiting || firstFeedback.stop).toBe(true);
      expect(firstFeedback.waiting || firstFeedback.draft || firstFeedback.activity).toBe(true);
      const firstPayload = JSON.parse(firstWire.request.postData() ?? '{}') as Record<string, unknown>;
      expect(firstPayload).toMatchObject({
        message: prompt,
        workspaceId,
        sessionId: session.id,
        model: MODEL,
      });
      expect(firstPayload.retry).not.toBe(true);
      expect(normalizeText(String(firstWire.done.content ?? ''))).toContain(expectedAnswer);
      expect(normalizeText(String(firstWire.done.content ?? ''))).not.toBe(normalizeText(prompt));
      expect(await readAssistantFromUi(page)).toBe(normalizeText(String(firstWire.done.content)));

      await expect.poll(async () => (await readHistory(page, workspaceId!, session.id)).length, {
        timeout: 15_000,
      }).toBe(2);
      const firstHistory = await readHistory(page, workspaceId, session.id);
      expect(firstHistory.map(message => ({ role: message.role, content: normalizeText(message.content) })))
        .toEqual([
          { role: 'user', content: prompt },
          { role: 'assistant', content: normalizeText(String(firstWire.done.content)) },
        ]);

      const retryWire = await captureChatTurn(page, async () => {
        await page.getByTestId('chat-msg-retry').last().click();
      });
      const retryPayload = JSON.parse(retryWire.request.postData() ?? '{}') as Record<string, unknown>;
      expect(retryPayload).toMatchObject({
        message: prompt,
        workspaceId,
        sessionId: session.id,
        model: MODEL,
        retry: true,
        retryTarget: {
          kind: 'assistant-pair',
          expectedMessageCount: 2,
          expectedAssistantContent: String(firstWire.done.content ?? ''),
        },
      });
      const retryContent = normalizeText(String(retryWire.done.content ?? ''));
      expect(retryContent).toContain(expectedAnswer);
      await expect.poll(async () => (await readHistory(page, workspaceId!, session.id)).length, {
        timeout: 15_000,
      }).toBe(2);

      const authoritativeHistory = await readHistory(page, workspaceId, session.id);
      expect(authoritativeHistory.map(message => ({ role: message.role, content: normalizeText(message.content) })))
        .toEqual([
          { role: 'user', content: prompt },
          { role: 'assistant', content: retryContent },
        ]);

      const sessionUrl = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(sessionUrl);
      await expect(page.getByRole('textbox', { name: 'Message composer' })).toBeVisible();
      expect(await readAssistantFromUi(page)).toBe(retryContent);
      expect(await readHistory(page, workspaceId, session.id)).toHaveLength(2);

      const sessionsResponse = await page.request.get(`/api/workspaces/${workspaceId}/sessions`);
      expect(sessionsResponse.ok()).toBe(true);
      const sessions = await sessionsResponse.json() as Array<{ id: string }>;
      expect(sessions.map(item => item.id)).toContain(session.id);

      expect(pageErrors).toEqual([]);
      expect(criticalRequestFailures).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      if (workspaceId) {
        await page.request.delete(`/api/workspaces/${workspaceId}`).catch(() => undefined);
      }
    }
  });
});
