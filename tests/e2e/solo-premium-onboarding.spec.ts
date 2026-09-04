import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { expect, test, type Page } from '@playwright/test';

const RUN_LIVE_SOLO_CHAT = process.env.WAGGLE_E2E_SOLO_CHAT === '1';
const CONFIGURED_ENDPOINT = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_BASE_URL
  ?? 'http://10.33.0.153:4000/v1';
const MODEL = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_MODEL
  ?? 'openai-compatible/qwen3.8-flash-next';
const USE_LOCAL_STUB = process.env.WAGGLE_E2E_ONBOARDING_STUB === '1';
let endpoint = CONFIGURED_ENDPOINT;
let localStub: Server | null = null;

interface SseEvent {
  event: string;
  data: Record<string, unknown> | null;
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
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

async function armFirstFeedbackObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = { waiting: false, stop: false, draft: false, activity: false };
    const record = () => {
      state.waiting ||= Boolean(document.querySelector('[data-testid="chat-first-response-indicator"]'));
      state.stop ||= Boolean(document.querySelector('[data-testid="chat-stop-stream"]'));
      state.draft ||= Array.from(document.querySelectorAll('[data-testid="chat-draft-content"]'))
        .some(node => Boolean(node.textContent?.trim()));
      state.activity ||= Array.from(document.querySelectorAll('button[aria-expanded]'))
        .some(node => /^(working|checking|recalling|checked saved memory)\b/i.test(node.textContent?.trim() ?? ''));
    };
    const observer = new MutationObserver(record);
    observer.observe(document.body, { attributes: true, characterData: true, childList: true, subtree: true });
    record();
    Object.assign(globalThis, {
      __waggleOnboardingFeedbackObserver: observer,
      __waggleOnboardingFeedbackState: state,
    });
  });
}

async function readFirstFeedback(page: Page): Promise<{
  waiting: boolean; stop: boolean; draft: boolean; activity: boolean;
}> {
  return page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __waggleOnboardingFeedbackObserver?: MutationObserver;
      __waggleOnboardingFeedbackState?: {
        waiting: boolean; stop: boolean; draft: boolean; activity: boolean;
      };
    };
    host.__waggleOnboardingFeedbackObserver?.disconnect();
    return host.__waggleOnboardingFeedbackState
      ?? { waiting: false, stop: false, draft: false, activity: false };
  });
}

async function armChatBodyCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = globalThis as typeof globalThis & {
      __waggleOnboardingChatBody?: Promise<{
        status: number; contentType: string; body: string;
      }>;
    };
    const originalFetch = window.fetch.bind(window);
    host.__waggleOnboardingChatBody = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out waiting for complete onboarding SSE')), 180_000);
      const hasTerminalEvent = (body: string) => body.replace(/\r\n/g, '\n')
        .split('\n\n')
        .some(block => {
          if (!/^event:\s*(done|error)\s*$/m.test(block)) return false;
          const data = block.split('\n').find(line => /^data:\s?/.test(line));
          if (!data) return false;
          try {
            JSON.parse(data.replace(/^data:\s?/, ''));
            return true;
          } catch {
            return false;
          }
        });
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await originalFetch(input, init);
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && new URL(url, window.location.href).pathname === '/api/chat') {
          const reader = response.clone().body?.getReader();
          if (!reader) {
            window.clearTimeout(timeout);
            window.fetch = originalFetch;
            reject(new Error('Onboarding SSE response did not expose a readable body'));
          } else {
            void (async () => {
              const decoder = new TextDecoder('utf-8');
              let body = '';
              try {
                while (true) {
                  const chunk = await reader.read();
                  if (chunk.done) {
                    body += decoder.decode();
                    throw new Error('Onboarding SSE ended before a terminal event');
                  }
                  body += decoder.decode(chunk.value, { stream: true });
                  if (hasTerminalEvent(body)) {
                    window.clearTimeout(timeout);
                    resolve({
                      status: response.status,
                      contentType: response.headers.get('content-type') ?? '',
                      body,
                    });
                    return;
                  }
                }
              } catch (error) {
                if (hasTerminalEvent(body)) {
                  window.clearTimeout(timeout);
                  resolve({
                    status: response.status,
                    contentType: response.headers.get('content-type') ?? '',
                    body,
                  });
                } else {
                  window.clearTimeout(timeout);
                  reject(error);
                }
              } finally {
                try { await reader.cancel(); } catch { /* original consumer may already have ended */ }
                try { reader.releaseLock(); } catch { /* reader already released */ }
                window.fetch = originalFetch;
              }
            })();
          }
        }
        return response;
      };
    });
  });
}

async function readChatBodyCapture(page: Page): Promise<{
  status: number; contentType: string; body: string;
}> {
  return page.evaluate(async () => {
    const host = globalThis as typeof globalThis & {
      __waggleOnboardingChatBody?: Promise<{
        status: number; contentType: string; body: string;
      }>;
    };
    if (!host.__waggleOnboardingChatBody) throw new Error('Onboarding SSE capture was not armed');
    return host.__waggleOnboardingChatBody;
  });
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

async function readAssistantFromUi(page: Page): Promise<string> {
  await page.context().grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: new URL(page.url()).origin },
  );
  await page.evaluate(() => navigator.clipboard.writeText(''));
  const copyButton = page.getByTestId('chat-msg-copy').last();
  await expect(copyButton).toBeVisible({ timeout: 120_000 });
  await copyButton.click();
  await expect.poll(
    () => page.evaluate(() => navigator.clipboard.readText()).catch(() => ''),
    { timeout: 5_000 },
  ).not.toBe('');
  return (await page.evaluate(() => navigator.clipboard.readText())).trim();
}

test.describe('Windows Solo premium first-run onboarding', () => {
  test.skip(!RUN_LIVE_SOLO_CHAT, 'Set WAGGLE_E2E_SOLO_CHAT=1 to run the real local-model journey.');
  test.setTimeout(600_000);
  // A retry would reuse the same already-onboarded server process/data dir and
  // no longer exercise a first-run journey. This gate owns one clean lifetime.
  test.describe.configure({ retries: 0 });

  test.beforeAll(async () => {
    if (!USE_LOCAL_STUB) return;
    localStub = createServer(async (request, response) => {
      if (request.method === 'GET' && request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ object: 'list', data: [{ id: MODEL.replace(/^openai-compatible\//, '') }] }));
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/chat/completions') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          stream?: boolean;
          messages?: Array<{ content?: string }>;
        };
        const prompt = body.messages?.at(-1)?.content ?? '';
        const marker = prompt.match(/WAGGLE_READY_[a-f0-9]{8}/)?.[0] ?? 'WAGGLE_READY_STUB';
        if (body.stream) {
          const content = [
            '1. Define the launch outcome and the customer evidence required.',
            '2. Prepare the smallest testable release and assign each owner.',
            `3. Run the acceptance checklist, record issues, and decide go or no-go. ${marker}`,
          ].join('\n');
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
          response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
          response.end('data: [DONE]\n\n');
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          id: 'chatcmpl-onboarding-stub',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Model ready.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Not found' } }));
    });
    await new Promise<void>((resolve, reject) => {
      localStub!.once('error', reject);
      localStub!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = localStub.address();
    if (!address || typeof address === 'string') throw new Error('Onboarding stub did not bind a TCP port');
    endpoint = `http://127.0.0.1:${address.port}/v1`;
  });

  test.afterAll(async () => {
    if (!localStub) return;
    await new Promise<void>((resolve, reject) => localStub!.close(error => error ? reject(error) : resolve()));
    localStub = null;
  });

  test('takes a fresh data dir past stale browser state to a complete Qwen answer', async ({ page }) => {
    const marker = `WAGGLE_READY_${randomUUID().slice(0, 8)}`;
    const firstTask = `Create a concise three-step checklist for starting a Solo product launch. Use three numbered or bulleted lines and end with ${marker}. Do not use tools.`;
    const consoleErrors: string[] = [];
    const expectedRecoveryConsoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    let workspaceId: string | null = null;
    let sessionToken: string | null = null;
    let onboardingStatusAttempts = 0;
    let injectedOnboardingFailures = 0;
    let releaseOnboardingStatus = false;
    const startedAt = Date.now();

    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (message.text() === 'Failed to load resource: net::ERR_CONNECTION_REFUSED') {
        expectedRecoveryConsoleErrors.push(message.text());
        return;
      }
      consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      const pathname = pathOf(request.url());
      const failure = request.failure()?.errorText ?? 'request failed';
      if (
        ['/api/settings', '/api/settings/test-compatible', '/api/workspaces', '/api/chat'].includes(pathname)
        && !/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)
      ) {
        requestFailures.push(`${request.method()} ${pathname}: ${failure}`);
      }
    });
    page.on('request', request => {
      if (request.method() === 'GET' && pathOf(request.url()) === '/api/onboarding/status') {
        onboardingStatusAttempts += 1;
      }
    });

    try {
      await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('waggle:onboarding', JSON.stringify({
          completed: true,
          step: 7,
          tier: 'simple',
          workspaceId: 'stale-workspace',
        }));
        localStorage.setItem('waggle:tooltips_done', 'true');
        sessionStorage.clear();
      });
      await page.route('**/api/onboarding/status', async route => {
        if (releaseOnboardingStatus) {
          await route.continue();
          return;
        }
        injectedOnboardingFailures += 1;
        await route.abort('connectionrefused');
      });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const recovery = page.getByRole('status').filter({
        hasText: 'Waiting for your local Waggle service',
      });
      await expect(recovery).toBeVisible({ timeout: 30_000 });
      await expect(recovery).toContainText(
        'Your workspace stays protected until Waggle confirms the active profile.',
      );
      await expect(page.getByRole('region', { name: 'Waggle onboarding' })).toHaveCount(0);
      expect(JSON.parse(await page.evaluate(() => (
        localStorage.getItem('waggle:onboarding') ?? '{}'
      )))).toMatchObject({
        completed: true,
        step: 7,
        workspaceId: 'stale-workspace',
      });
      expect(onboardingStatusAttempts).toBeGreaterThanOrEqual(1);

      const firstStatusResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'GET' && pathOf(response.url()) === '/api/onboarding/status'
      ));
      const retryConnection = recovery.getByRole('button', { name: 'Retry Connection' });
      await expect(retryConnection).toBeEnabled();
      releaseOnboardingStatus = true;
      await retryConnection.click();
      const firstStatusResponse = await firstStatusResponsePromise;
      expect(firstStatusResponse.ok(), await firstStatusResponse.text().catch(() => '')).toBe(true);
      const firstStatus = await firstStatusResponse.json() as {
        completed: boolean;
        source: string;
        profileId?: string;
      };
      expect(firstStatus).toMatchObject({ completed: false, source: 'none' });
      expect(firstStatus.profileId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      await expect(recovery).toHaveCount(0);
      expect(onboardingStatusAttempts).toBeGreaterThanOrEqual(2);

      const onboarding = page.getByRole('region', { name: 'Waggle onboarding' });
      await expect(onboarding).toBeVisible({ timeout: 30_000 });
      expect(JSON.parse(await page.evaluate(() => (
        localStorage.getItem('waggle:onboarding') ?? '{}'
      )))).toEqual({ completed: false, step: 0, profileId: firstStatus.profileId });
      expect(await page.evaluate(() => localStorage.getItem('waggle:tooltips_done'))).toBeNull();
      sessionToken = await readBrowserSessionToken(page);
      const auth = { Authorization: `Bearer ${sessionToken}` };

      await onboarding.getByRole('button', { name: 'Continue →' }).click();
      await onboarding.getByLabel('Name').fill('Qwen Pilot');
      await onboarding.getByLabel('Role').fill('Product manager');
      await onboarding.getByRole('button', { name: 'Continue →' }).click();
      await expect(onboarding.getByRole('heading', { name: 'Connect a model' })).toBeVisible();
      const continueWithModel = onboarding.getByRole('button', { name: 'Continue', exact: true });
      await expect(continueWithModel).toBeDisabled();

      await onboarding.getByRole('button', { name: /openai-compatible/i }).click();
      await onboarding.getByLabel('Endpoint URL').fill(endpoint);
      await onboarding.getByRole('button', { name: 'Discover models' }).click();
      const modelSelect = onboarding.getByRole('combobox', { name: 'Model', exact: true });
      await expect(modelSelect).toBeVisible({ timeout: 60_000 });
      await modelSelect.selectOption(MODEL);
      await onboarding.getByRole('button', { name: 'Verify & save' }).click();
      await expect(onboarding.getByRole('status').filter({
        hasText: 'Verified and saved. This model is now your primary model.',
      })).toBeVisible({ timeout: 90_000 });
      const settingsResponse = await page.request.get('/api/settings', { headers: auth });
      expect(settingsResponse.ok(), await settingsResponse.text().catch(() => '')).toBe(true);
      expect(await settingsResponse.json()).toMatchObject({
        defaultModel: MODEL,
        providers: {
          'openai-compatible': { baseUrl: endpoint, models: expect.arrayContaining([MODEL]) },
        },
      });
      await expect(continueWithModel).toBeEnabled({ timeout: 30_000 });
      await expect(onboarding.getByText(/not responding/i)).toHaveCount(0);
      await continueWithModel.click();

      await onboarding.getByRole('button', { name: 'Skip this step →' }).click();
      const workspaceResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/workspaces'
      ));
      await onboarding.getByRole('button', { name: /blank workspace/i }).click();
      const workspaceResponse = await workspaceResponsePromise;
      expect(workspaceResponse.status(), await workspaceResponse.text().catch(() => '')).toBe(201);
      const workspace = await workspaceResponse.json() as {
        id: string; name: string; templateId?: string; personaId?: string;
      };
      workspaceId = workspace.id;
      expect(workspace).toMatchObject({
        name: 'Blank Workspace',
        templateId: 'blank',
        personaId: 'general-purpose',
      });

      await expect(onboarding.getByRole('heading', { name: "What's first?" })).toBeVisible();
      await onboarding.getByLabel('First task').fill(firstTask);
      const chatRequestPromise = page.waitForRequest(request => (
        request.method() === 'POST' && pathOf(request.url()) === '/api/chat'
      ));
      const chatResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/chat'
      ));
      await armFirstFeedbackObserver(page);
      await armChatBodyCapture(page);
      await onboarding.getByRole('button', { name: /let's go/i }).click();
      const [chatRequest, chatResponse, chatBody] = await Promise.all([
        chatRequestPromise,
        chatResponsePromise,
        readChatBodyCapture(page),
      ]);
      expect(chatResponse.status()).toBe(200);
      expect(chatResponse.headers()['content-type'] ?? '').toContain('text/event-stream');
      expect(chatBody).toMatchObject({ status: 200 });
      expect(chatBody.contentType).toContain('text/event-stream');
      const parsed = parseSse(chatBody.body);
      expect(parsed.errors).toEqual([]);
      const doneEvents = parsed.events.filter(event => event.event === 'done');
      expect(doneEvents).toHaveLength(1);
      const done = doneEvents[0]?.data ?? {};
      const tokenText = parsed.events.filter(event => event.event === 'token')
        .map(event => String(event.data?.content ?? '')).join('');
      expect(tokenText.length).toBeGreaterThan(0);
      expect(normalizeText(tokenText)).toBe(normalizeText(String(done.content ?? '')));
      expect(done.toolsUsed).toEqual([]);
      const payload = JSON.parse(chatRequest.postData() ?? '{}') as Record<string, unknown>;
      expect(payload).toMatchObject({ workspaceId, message: firstTask, model: MODEL });
      expect(typeof payload.sessionId).toBe('string');
      const sessionId = String(payload.sessionId);

      await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}/chat`));
      const assistant = normalizeText(await readAssistantFromUi(page));
      expect(assistant).toBe(normalizeText(String(done.content ?? '')));
      expect(assistant).toContain(marker);
      expect(assistant).not.toMatch(/<\/?think>/i);
      expect(assistant.length).toBeGreaterThan(100);
      expect(assistant.length).toBeLessThan(1_000);
      expect(assistant.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])/gm)?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(assistant.split(marker)).toHaveLength(2);
      const firstFeedback = await readFirstFeedback(page);
      expect(firstFeedback.waiting || firstFeedback.stop).toBe(true);
      expect(firstFeedback.waiting || firstFeedback.draft || firstFeedback.activity).toBe(true);

      await expect.poll(async () => {
        const response = await page.request.get(
          `/api/history?workspace=${encodeURIComponent(workspaceId!)}&session=${encodeURIComponent(sessionId)}`,
          { headers: auth },
        );
        if (!response.ok()) return [];
        const body = await response.json() as { messages?: Array<{ role: string; content: string; model?: string }> };
        return body.messages ?? [];
      }, { timeout: 30_000 }).toEqual([
        expect.objectContaining({ role: 'user', content: firstTask }),
        expect.objectContaining({ role: 'assistant', content: assistant, model: MODEL }),
      ]);

      const sessionsResponse = await page.request.get(`/api/workspaces/${workspaceId}/sessions`, {
        headers: auth,
      });
      expect(sessionsResponse.ok(), await sessionsResponse.text().catch(() => '')).toBe(true);
      const sessions = await sessionsResponse.json() as Array<{ id: string }>;
      expect(sessions.map(item => item.id)).toContain(sessionId);
      expect(new URL(page.url()).searchParams.get('session')).toBe(sessionId);

      const completedStatus = await page.request.get('/api/onboarding/status', { headers: auth });
      expect(completedStatus.ok(), await completedStatus.text().catch(() => '')).toBe(true);
      expect(await completedStatus.json()).toMatchObject({
        completed: true,
        source: 'flag',
        profileId: firstStatus.profileId,
      });
      expect(Date.now() - startedAt).toBeLessThan(180_000);
      expect(injectedOnboardingFailures).toBeGreaterThanOrEqual(1);
      expect(expectedRecoveryConsoleErrors).toHaveLength(injectedOnboardingFailures);
      expect(pageErrors).toEqual([]);
      expect(requestFailures).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      if (workspaceId && sessionToken) {
        const cleanup = await page.request.delete(`/api/workspaces/${workspaceId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        expect.soft(cleanup.status(), await cleanup.text().catch(() => '')).toBe(204);
      }
    }
  });
});
