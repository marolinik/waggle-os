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

async function readBrowserSessionToken(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session-token', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Session bootstrap failed: ${response.status}`);
    const body = await response.json() as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) throw new Error('Session bootstrap returned no token');
    return body.token;
  });
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function readHistory(page: Page, workspaceId: string, sessionId: string, token: string) {
  const response = await page.request.get(
    `/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`,
    { headers: authHeaders(token) },
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
  test.setTimeout(600_000);

  test('saves Qwen, chats, retries, discloses a tool and skill, and recalls memory in a new session', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const criticalRequestFailures: string[] = [];
    let workspaceId: string | null = null;
    let sessionToken: string | null = null;

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
      sessionToken = await readBrowserSessionToken(page);

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

      const settingsResponse = await page.request.get('/api/settings', { headers: authHeaders(sessionToken) });
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
        /Qwen3\.8/i,
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

      // This turn certifies provider transport, streaming, retry replacement,
      // and persistence. Model-quality arithmetic belongs in the persona
      // benchmark; keep the transport smoke deterministic across local models.
      const left = 12;
      const right = 12;
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

      await expect.poll(async () => (await readHistory(page, workspaceId!, session.id, sessionToken!)).length, {
        timeout: 15_000,
      }).toBe(2);
      const firstHistory = await readHistory(page, workspaceId, session.id, sessionToken);
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
      await expect.poll(async () => (await readHistory(page, workspaceId!, session.id, sessionToken!)).length, {
        timeout: 15_000,
      }).toBe(2);

      const authoritativeHistory = await readHistory(page, workspaceId, session.id, sessionToken);
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
      expect(await readHistory(page, workspaceId, session.id, sessionToken)).toHaveLength(2);

      const sessionsResponse = await page.request.get(`/api/workspaces/${workspaceId}/sessions`, {
        headers: authHeaders(sessionToken),
      });
      expect(sessionsResponse.ok()).toBe(true);
      const sessions = await sessionsResponse.json() as Array<{ id: string }>;
      expect(sessions.map(item => item.id)).toContain(session.id);

      const fileSentinel = `WAGGLE_TOOL_SENTINEL_${randomUUID()}`;
      const writeResponse = await page.request.post(
        `/api/workspaces/${workspaceId}/storage/write?path=sentinel.txt`,
        { data: { content: fileSentinel }, headers: authHeaders(sessionToken) },
      );
      expect(writeResponse.status(), await writeResponse.text().catch(() => '')).toBe(201);

      const toolPrompt = 'Use the read_file tool to read sentinel.txt, then report the exact file contents between FILE_START and FILE_END.';
      await composer.fill(toolPrompt);
      const toolWire = await captureChatTurn(page, async () => {
        await page.getByRole('button', { name: 'Send' }).click();
      });
      const toolEvents = toolWire.events.filter(event => event.event === 'tool');
      const toolResultEvents = toolWire.events.filter(event => event.event === 'tool_result');
      expect(toolEvents).toHaveLength(1);
      expect(toolEvents[0]?.data).toMatchObject({ name: 'read_file', input: { path: 'sentinel.txt' } });
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0]?.data).toMatchObject({
        name: 'read_file',
        result: fileSentinel,
        isError: false,
      });
      expect(toolWire.events.filter(event => event.event === 'error')).toHaveLength(0);
      expect(toolWire.done).toMatchObject({
        content: `FILE_START\n${fileSentinel}\nFILE_END`,
        toolsUsed: ['read_file'],
        contextMetrics: {
          packageMode: 'compact',
          toolSelectedCount: 1,
        },
      });
      expect(normalizeText(toolWire.tokenText)).toBe(normalizeText(String(toolWire.done.content)));

      const metrics = toolWire.done.contextMetrics as Record<string, number>;
      expect(metrics.toolCatalogCount).toBeGreaterThanOrEqual(metrics.toolEligibleCount);
      expect(metrics.toolEligibleCount).toBeGreaterThanOrEqual(metrics.toolSelectedCount);
      expect(metrics.toolOmittedCount).toBe(metrics.toolEligibleCount - metrics.toolSelectedCount);
      expect(metrics.toolSelectedCount).toBeLessThanOrEqual(14);
      expect(metrics.transmittedToolSchemaChars).toBeLessThanOrEqual(8_000);

      const activity = page.getByTestId('chat-activity').last();
      const activityToggle = activity.getByTestId('chat-activity-toggle');
      await expect(activity).toHaveAttribute('aria-busy', 'false');
      await expect(activityToggle).toContainText(/Used 1 tool/);
      if (await activityToggle.getAttribute('aria-expanded') === 'false') await activityToggle.click();
      const toolRow = activity.getByTestId('chat-tool-activity');
      await expect(toolRow).toHaveAttribute('data-tool-name', 'read_file');
      await expect(toolRow).toHaveAttribute('data-tool-status', 'done');
      const toolToggle = toolRow.getByTestId('chat-tool-activity-toggle');
      await expect(toolRow.getByTestId('chat-tool-activity-details')).toHaveCount(0);
      await toolToggle.click();
      await expect(toolRow.getByTestId('chat-tool-activity-details')).toContainText('"path": "sentinel.txt"');
      await expect(toolRow.getByTestId('chat-tool-activity-details')).toContainText(fileSentinel);

      const context = activity.getByTestId('chat-context-efficiency');
      await expect(context.getByTestId('chat-context-efficiency-details')).toHaveCount(0);
      await context.getByTestId('chat-context-efficiency-toggle').click();
      const contextDetails = context.getByTestId('chat-context-efficiency-details');
      await expect(contextDetails).toHaveAttribute('data-tool-selected-count', '1');
      await expect(contextDetails).toHaveAttribute('data-tool-eligible-count', String(metrics.toolEligibleCount));
      await expect(contextDetails).toHaveAttribute('data-tool-omitted-count', String(metrics.toolOmittedCount));
      await expect(contextDetails).toHaveAttribute('data-tool-schema-chars', String(metrics.transmittedToolSchemaChars));
      await expect(contextDetails).toContainText(
        `Prepared 1 of ${metrics.toolEligibleCount} eligible tools`,
      );
      await expect(contextDetails).toContainText('Compact prompt package');
      expect(await readAssistantFromUi(page)).toBe(normalizeText(`FILE_START\n${fileSentinel}\nFILE_END`));

      await expect.poll(async () => (await readHistory(page, workspaceId!, session.id, sessionToken!)).length, {
        timeout: 15_000,
      }).toBe(4);
      const toolHistory = await readHistory(page, workspaceId, session.id, sessionToken);
      expect(toolHistory.slice(-2).map(message => ({ role: message.role, content: normalizeText(message.content) })))
        .toEqual([
          { role: 'user', content: toolPrompt },
          { role: 'assistant', content: normalizeText(`FILE_START\n${fileSentinel}\nFILE_END`) },
        ]);

      let replayedChats = 0;
      const countReplay = (request: Request) => {
        if (request.method() === 'POST' && pathOf(request.url()) === '/api/chat') replayedChats += 1;
      };
      page.on('request', countReplay);
      const toolSessionUrl = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(toolSessionUrl);
      await expect(page.getByRole('textbox', { name: 'Message composer' })).toBeVisible();
      expect(await readAssistantFromUi(page)).toBe(normalizeText(`FILE_START\n${fileSentinel}\nFILE_END`));
      expect(await readHistory(page, workspaceId, session.id, sessionToken)).toHaveLength(4);
      expect(replayedChats).toBe(0);
      await expect(page.getByTestId('chat-context-efficiency')).toHaveCount(0);
      page.off('request', countReplay);

      const catalogResponse = await page.request.get('/api/skills/starter-pack/catalog', {
        headers: authHeaders(sessionToken),
      });
      expect(catalogResponse.ok(), await catalogResponse.text().catch(() => '')).toBe(true);
      const catalog = await catalogResponse.json() as {
        skills?: Array<{ id?: string; state?: string }>;
      };
      expect(catalog.skills?.find(skill => skill.id === 'decision-matrix')?.state)
        .toBe('active');
      const loadedSkillsResponse = await page.request.get('/api/skills', {
        headers: authHeaders(sessionToken),
      });
      expect(loadedSkillsResponse.ok(), await loadedSkillsResponse.text().catch(() => '')).toBe(true);
      const loadedSkillsBody = await loadedSkillsResponse.json() as {
        skills?: Array<{ name?: string; status?: string }>;
      } | Array<{ name?: string; status?: string }>;
      const loadedSkills = Array.isArray(loadedSkillsBody) ? loadedSkillsBody : loadedSkillsBody.skills ?? [];
      expect(loadedSkills).toContainEqual(expect.objectContaining({
        name: 'decision-matrix',
        status: 'active',
      }));

      const skillPrompt = 'Help me make a reliable weighted decision between Option A and Option B. Use criteria cost (weight 5), speed (3), and privacy (5). Score A as 4/3/5 and B as 2/5/4. Show the raw and weighted scores, checksums, totals, recommendation, weakest critical criterion, and sensitivity analysis on speed.';
      await composer.fill(skillPrompt);
      const skillWire = await captureChatTurn(page, async () => {
        await page.getByRole('button', { name: 'Send' }).click();
      });
      const skillStart = skillWire.events.filter(event => (
        event.event === 'tool'
        && typeof event.data === 'object'
        && event.data?.name === 'read_skill'
      ));
      const skillResult = skillWire.events.filter(event => (
        event.event === 'tool_result'
        && typeof event.data === 'object'
        && event.data?.name === 'read_skill'
      ));
      const calculatorStart = skillWire.events.filter(event => (
        event.event === 'tool'
        && typeof event.data === 'object'
        && event.data?.name === 'calculate_decision_matrix'
      ));
      const calculatorResult = skillWire.events.filter(event => (
        event.event === 'tool_result'
        && typeof event.data === 'object'
        && event.data?.name === 'calculate_decision_matrix'
      ));
      expect(skillWire.events
        .filter(event => (
          ['tool', 'tool_result'].includes(event.event)
          && typeof event.data === 'object'
          && ['read_skill', 'calculate_decision_matrix'].includes(String(event.data?.name))
        ))
        .map(event => `${event.event}:${String((event.data as Record<string, unknown>).name)}`))
        .toEqual([
          'tool:read_skill',
          'tool_result:read_skill',
          'tool:calculate_decision_matrix',
          'tool_result:calculate_decision_matrix',
        ]);
      expect(skillStart).toHaveLength(1);
      expect(skillStart[0]?.data).toMatchObject({ input: { name: 'decision-matrix' } });
      expect(skillResult).toHaveLength(1);
      expect(skillResult[0]?.data).toMatchObject({ isError: false });
      expect(calculatorStart).toHaveLength(1);
      expect(calculatorStart[0]?.data).toMatchObject({
        input: {
          criteria: [
            { name: 'cost', weight: 5 },
            { name: 'speed', weight: 3 },
            { name: 'privacy', weight: 5 },
          ],
          options: [
            { name: 'Option A', scores: [4, 3, 5] },
            { name: 'Option B', scores: [2, 5, 4] },
          ],
          sensitivityCriterion: 'speed',
        },
      });
      expect(calculatorResult).toHaveLength(1);
      expect(calculatorResult[0]?.data).toMatchObject({ isError: false });
      const skillGuidance = String(
        typeof skillResult[0]?.data === 'object' && skillResult[0]?.data
          ? skillResult[0].data.result ?? ''
          : '',
      );
      expect(skillGuidance).toContain('Decision Matrix — Weighted Option Comparison');
      expect(skillGuidance).toContain('calculate_decision_matrix');
      expect(skillGuidance).toContain('sole numeric authority');
      const calculatorGuidance = JSON.parse(String(
        typeof calculatorResult[0]?.data === 'object' && calculatorResult[0]?.data
          ? calculatorResult[0].data.result ?? ''
          : '',
      )) as {
        options?: Array<{ checksum?: string; total?: number }>;
        decision?: { winner?: string };
        sensitivity?: {
          tieWeight?: number;
          firstWholeNumberWeightWhereWinnerChanges?: number;
          winnerAtFirstWholeNumber?: string;
        };
      };
      expect(calculatorGuidance.options).toEqual(expect.arrayContaining([
        expect.objectContaining({ checksum: '20 + 9 + 25 = 54', total: 54 }),
        expect.objectContaining({ checksum: '10 + 15 + 20 = 45', total: 45 }),
      ]));
      expect(calculatorGuidance.decision?.winner).toBe('Option A');
      expect(calculatorGuidance.sensitivity).toMatchObject({
        tieWeight: 7.5,
        firstWholeNumberWeightWhereWinnerChanges: 8,
        winnerAtFirstWholeNumber: 'Option B',
      });
      const skillAnswer = normalizeText(String(skillWire.done.content ?? ''));
      expect(skillAnswer).toMatch(/Option A/i);
      expect(skillAnswer).toMatch(/20\s*\+\s*9\s*\+\s*25\s*=\s*(?:\*{2})?54(?:\*{2})?/);
      expect(skillAnswer).toMatch(/10\s*\+\s*15\s*\+\s*20\s*=\s*(?:\*{2})?45(?:\*{2})?/);
      expect(skillAnswer).toMatch(/recommend/i);
      expect(skillAnswer).toMatch(/sensitivity/i);
      expect(skillAnswer).toMatch(/7\.5/);
      expect(skillAnswer).toMatch(/\b8\b/);
      expect(skillWire.done.toolsUsed).toEqual(['read_skill', 'calculate_decision_matrix']);
      expect(skillWire.events.some(event => (
        event.event === 'step'
        && typeof event.data === 'object'
        && /auto-saved/i.test(String(event.data?.content ?? ''))
      ))).toBe(false);

      const skillActivity = page.getByTestId('chat-activity').last();
      const skillActivityToggle = skillActivity.getByTestId('chat-activity-toggle');
      if (await skillActivityToggle.getAttribute('aria-expanded') === 'false') await skillActivityToggle.click();
      const skillRow = skillActivity.locator('[data-testid="chat-tool-activity"][data-tool-name="read_skill"]');
      await expect(skillRow).toHaveAttribute('data-tool-status', 'done');
      await expect(skillRow.getByTestId('chat-tool-activity-details')).toHaveCount(0);
      await expect(skillRow.getByTestId('chat-tool-activity-toggle')).toContainText('Opened Decision Matrix skill');
      await skillRow.getByTestId('chat-tool-activity-toggle').click();
      await expect(skillRow.getByTestId('chat-tool-activity-details')).toContainText('"name": "decision-matrix"');
      await expect(skillRow.getByTestId('chat-tool-activity-details')).toContainText('sole numeric authority');
      await expect(skillRow.getByTestId('chat-tool-activity-details')).not.toContainText(/applied skill|used skill/i);
      const calculatorRow = skillActivity.locator('[data-testid="chat-tool-activity"][data-tool-name="calculate_decision_matrix"]');
      await expect(calculatorRow).toHaveAttribute('data-tool-status', 'done');
      await expect(calculatorRow.getByTestId('chat-tool-activity-toggle')).toContainText('Calculate Decision Matrix');
      await calculatorRow.getByTestId('chat-tool-activity-toggle').click();
      await expect(calculatorRow.getByTestId('chat-tool-activity-details')).toContainText('20 + 9 + 25 = 54');

      const memoryTopic = `pilot-${randomUUID().slice(0, 8)}`;
      const memorySecret = `ORCHID-${randomUUID().slice(0, 12).toUpperCase()}`;
      const decisionPrompt = `Let's go with ${memorySecret} as the ${memoryTopic} launch codename. We will use it for the internal pilot.`;
      await composer.fill(decisionPrompt);
      const decisionWire = await captureChatTurn(page, async () => {
        await page.getByRole('button', { name: 'Send' }).click();
      });

      let savedMemory: { content?: string; importance?: string; scope?: string; source?: string } | undefined;
      await expect.poll(async () => {
        const memoryResponse = await page.request.get(
          `/api/memory?mind=workspace&workspace=${encodeURIComponent(workspaceId!)}&q=${encodeURIComponent(memoryTopic)}`,
          { headers: authHeaders(sessionToken!) },
        );
        if (!memoryResponse.ok()) return false;
        const body = await memoryResponse.json() as {
          results?: Array<{ content?: string; importance?: string; scope?: string; source?: string }>;
        };
        savedMemory = body.results?.find(memory => memory.content?.includes(memorySecret));
        return Boolean(savedMemory);
      }, { timeout: 20_000 }).toBe(true);
      expect(savedMemory?.content).toContain(memorySecret);
      expect(savedMemory?.content).toMatch(/Decision:/i);
      expect(savedMemory?.content).not.toMatch(/<\/?think>/i);
      expect((savedMemory?.content ?? '').split(memorySecret)).toHaveLength(2);

      const recallSessionResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST'
        && pathOf(response.url()) === `/api/workspaces/${workspaceId}/sessions`
      ));
      await page.getByTestId('chat-agent-strip')
        .getByRole('button', { name: 'New session', exact: true })
        .click();
      const recallSessionResponse = await recallSessionResponsePromise;
      expect(recallSessionResponse.status(), await recallSessionResponse.text().catch(() => '')).toBe(201);
      const recallSession = await recallSessionResponse.json() as { id: string };
      await expect(page).toHaveURL(new RegExp(`session=${encodeURIComponent(recallSession.id)}(?:&|$)`));
      expect(await readHistory(page, workspaceId, recallSession.id, sessionToken)).toHaveLength(0);
      const recallSessionUrl = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(recallSessionUrl);

      const recallPrompt = `Search my saved memory for our ${memoryTopic} launch codename decision. What exact codename did we choose? Reply with only the codename. Do not write files or execute code.`;
      expect(recallPrompt).not.toContain(memorySecret);
      await page.getByRole('textbox', { name: 'Message composer' }).fill(recallPrompt);
      const recallWire = await captureChatTurn(page, async () => {
        await page.getByRole('button', { name: 'Send' }).click();
      });
      const recallPayload = JSON.parse(recallWire.request.postData() ?? '{}') as Record<string, unknown>;
      expect(recallPayload).toMatchObject({
        workspaceId,
        sessionId: recallSession.id,
        model: MODEL,
      });
      expect(String(recallPayload.message ?? '')).not.toContain(memorySecret);
      const recallReceipt = recallWire.events.find(event => (
        event.event === 'tool_result'
        && typeof event.data === 'object'
        && event.data?.name === 'search_memory'
      ));
      expect(recallReceipt?.data).toMatchObject({ isError: false });
      expect(String(
        typeof recallReceipt?.data === 'object' && recallReceipt.data
          ? recallReceipt.data.result ?? ''
          : '',
      )).toBe('Found one matching value in this workspace.');
      expect(recallWire.events.some(event => (
        typeof event.data === 'object'
        && event.data?.name === 'auto_recall'
      ))).toBe(false);
      expect(recallWire.done).toMatchObject({
        toolsUsed: ['search_memory'],
        memoryContext: { included: false, count: 0 },
      });
      expect(normalizeText(String(recallWire.done.content ?? '')).replace(/[.`]/g, '')).toBe(memorySecret);
      await expect(page.getByText('Memory brought forward', { exact: true })).toHaveCount(0);
      const recallActivity = page.getByTestId('chat-activity').last();
      const recallToggle = recallActivity.getByTestId('chat-activity-toggle');
      if (await recallToggle.getAttribute('aria-expanded') === 'false') await recallToggle.click();
      const recallRow = recallActivity.locator('[data-testid="chat-tool-activity"][data-tool-name="search_memory"]');
      await expect(recallRow).toHaveAttribute('data-tool-status', 'done');
      await expect(recallRow.getByTestId('chat-tool-activity-details')).toHaveCount(0);
      await expect(recallRow.getByTestId('chat-tool-activity-toggle')).toContainText('Searched memory');
      await recallRow.getByTestId('chat-tool-activity-toggle').click();
      await expect(recallRow.getByTestId('chat-tool-activity-details')).toContainText('Found one matching value in this workspace.');
      await expect(recallRow.getByTestId('chat-tool-activity-details')).not.toContainText(memoryTopic);
      await expect(recallRow.getByTestId('chat-tool-activity-details')).not.toContainText(memorySecret);
      expect(await readAssistantFromUi(page)).toContain(memorySecret);
      const recallHistory = await readHistory(page, workspaceId, recallSession.id, sessionToken);
      expect(recallHistory).toHaveLength(2);
      expect(recallHistory[0]).toMatchObject({ role: 'user', content: recallPrompt });
      const persistedRecall = normalizeText(recallHistory[1]?.content ?? '').replace(/[.`]/g, '');
      expect(persistedRecall).toBe(memorySecret);
      expect(recallHistory[1]?.content).not.toMatch(/<\/?think>/i);

      expect(pageErrors).toEqual([]);
      expect(criticalRequestFailures).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      if (workspaceId && sessionToken) {
        try {
          const cleanupResponse = await page.request.delete(`/api/workspaces/${workspaceId}`, {
            headers: authHeaders(sessionToken),
          });
          expect.soft(
            cleanupResponse.status(),
            `Workspace cleanup failed: ${cleanupResponse.status()} ${await cleanupResponse.text()}`,
          ).toBe(204);
        } catch (error) {
          expect.soft(String(error), 'Workspace cleanup request failed').toBe('');
        }
      }
    }
  });
});
