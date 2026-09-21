import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { expect, test, type Page } from '@playwright/test';

const RUN_LIVE_SOLO_CHAT = process.env.WAGGLE_E2E_SOLO_CHAT === '1';
const OWNS_ISOLATED_SERVER = process.env.WAGGLE_E2E_REUSE_EXISTING_SERVER === '0';
const UPSTREAM_ENDPOINT = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_BASE_URL
  ?? 'http://10.33.0.153:4000/v1';
const MODEL = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_MODEL
  ?? 'openai-compatible/qwen3.8-flash-next';
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=simple';
const FAILURE_PREFIX = 'Generation failed: ';

interface HistoryMessage {
  role: string;
  content: string;
  model?: string;
}

interface ProxyHandle {
  port: number;
  server: Server;
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function forwardToUpstream(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const upstreamBase = new URL(UPSTREAM_ENDPOINT);
  const target = new URL(request.url ?? '/', upstreamBase.origin);
  const upstream = httpRequest(target, {
    method: request.method,
    headers: {
      ...request.headers,
      host: target.host,
    },
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', error => {
    if (response.headersSent || response.destroyed) {
      response.destroy(error);
      return;
    }
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: `Recovery proxy failed: ${error.message}` } }));
  });
  request.pipe(upstream);
}

async function startProxy(port = 0): Promise<ProxyHandle> {
  const server = createServer(forwardToUpstream);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Provider recovery proxy did not bind a TCP port.');
  }
  return { port: address.port, server };
}

async function stopProxy(handle: ProxyHandle | null): Promise<void> {
  if (!handle) return;
  handle.server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    handle.server.close(error => error ? reject(error) : resolve());
  });
}

async function readBrowserSessionToken(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session-token', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Session bootstrap failed: ${response.status}`);
    const body = await response.json() as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
      throw new Error('Session bootstrap returned no token.');
    }
    return body.token;
  });
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
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
  const body = await response.json() as { messages: HistoryMessage[] };
  return body.messages;
}

test.describe('Windows Solo provider outage and recovery', () => {
  test.skip(
    !RUN_LIVE_SOLO_CHAT || !OWNS_ISOLATED_SERVER,
    'Set WAGGLE_E2E_SOLO_CHAT=1 and WAGGLE_E2E_REUSE_EXISTING_SERVER=0; this journey must own its disposable Waggle data dir.',
  );
  test.describe.configure({ retries: 0 });
  test.setTimeout(600_000);

  let proxy: ProxyHandle | null = null;

  test.beforeAll(async () => {
    proxy = await startProxy();
  });

  test.afterAll(async () => {
    await stopProxy(proxy);
    proxy = null;
  });

  test('recovers the exact failed turn without raw errors, wrong auth advice, or duplicates', async ({ page }, testInfo) => {
    if (!proxy) throw new Error('Provider recovery proxy is not running.');
    const proxyPort = proxy.port;
    const endpoint = `http://127.0.0.1:${proxyPort}/v1`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let workspaceId: string | null = null;
    let sessionToken: string | null = null;

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      await page.goto(`/settings?${SKIP_PARAMS}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      sessionToken = await readBrowserSessionToken(page);

      await page.getByRole('button', { name: /openai-compatible/i }).click();
      await page.getByLabel('Endpoint URL').fill(endpoint);
      await page.getByRole('button', { name: 'Discover models' }).click();
      const modelSelect = page.getByRole('combobox', { name: 'Model', exact: true });
      await expect(modelSelect).toBeVisible({ timeout: 60_000 });
      await modelSelect.selectOption(MODEL);
      await page.getByRole('button', { name: 'Verify & save' }).click();
      await expect(page.getByRole('status').filter({
        hasText: 'Verified and saved. This model is now your primary model.',
      })).toBeVisible({ timeout: 90_000 });

      await page.getByTestId('sidebar-workspace').click();
      const switcher = page.getByRole('dialog', { name: /switch workspace/i });
      await switcher.getByRole('button', { name: /new workspace/i }).click();
      const createDialog = page.getByRole('dialog', { name: /create workspace/i });
      const workspaceName = `Recovery PM ${randomUUID().slice(0, 8)}`;
      await createDialog.getByLabel('What project or area is this for?').fill(workspaceName);
      const workspaceResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/workspaces'
      ));
      await createDialog.getByRole('button', { name: 'Create workspace', exact: true }).click();
      const workspaceResponse = await workspaceResponsePromise;
      expect(workspaceResponse.status(), await workspaceResponse.text().catch(() => '')).toBe(201);
      workspaceId = (await workspaceResponse.json() as { id: string }).id;

      await page.getByTestId('nav-chat').click();
      await page.waitForURL(new RegExp(`/workspaces/${workspaceId}/chat(?:\\?|$)`));
      const sessionResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST'
        && pathOf(response.url()) === `/api/workspaces/${workspaceId}/sessions`
      ));
      await page.getByTestId('chat-agent-strip')
        .getByRole('button', { name: 'New session', exact: true })
        .click();
      const sessionResponse = await sessionResponsePromise;
      expect(sessionResponse.status(), await sessionResponse.text().catch(() => '')).toBe(201);
      const sessionId = (await sessionResponse.json() as { id: string }).id;
      const composer = page.getByRole('textbox', { name: 'Message composer' });

      const baselinePrompt = `Reply with the exact marker WAGGLE_RECOVERY_READY_${randomUUID().slice(0, 8)} and no tools.`;
      await composer.fill(baselinePrompt);
      await page.getByRole('button', { name: 'Send' }).click();
      await expect.poll(async () => (
        await readHistory(page, workspaceId!, sessionId, sessionToken!)
      ).length, { timeout: 120_000 }).toBe(2);
      const baselineHistory = await readHistory(page, workspaceId, sessionId, sessionToken);
      expect(baselineHistory[0]).toMatchObject({ role: 'user', content: baselinePrompt });
      expect(baselineHistory[1]?.role).toBe('assistant');
      expect(baselineHistory[1]?.content.trim()).not.toBe('');
      expect(baselineHistory[1]?.content.startsWith(FAILURE_PREFIX)).toBe(false);

      await stopProxy(proxy);
      proxy = null;
      const recoveryMarker = `WAGGLE_RECOVERED_${randomUUID().slice(0, 8)}`;
      const outagePrompt = `After service recovery, reply with the exact marker ${recoveryMarker} and no tools.`;
      const outageRequestPromise = page.waitForRequest(request => (
        request.method() === 'POST' && pathOf(request.url()) === '/api/chat'
      ));
      await composer.fill(outagePrompt);
      await page.getByRole('button', { name: 'Send' }).click();
      const outageRequest = await outageRequestPromise;
      expect(JSON.parse(outageRequest.postData() ?? '{}')).toMatchObject({
        message: outagePrompt,
        workspaceId,
        sessionId,
        model: MODEL,
      });

      const errorBlock = page.getByTestId('chat-error-block').last();
      await expect(errorBlock).toBeVisible({ timeout: 90_000 });
      await expect(errorBlock.locator('span').first()).toHaveText(
        'The model endpoint is not responding. It may be down or restarting. Check Settings > Models, then try again.',
      );
      await expect(errorBlock.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
      await expect(errorBlock.getByRole('button', { name: 'Open model settings', exact: true })).toBeVisible();
      await expect(errorBlock.getByRole('button', { name: /open api key settings/i })).toHaveCount(0);
      await expect(errorBlock).not.toContainText(/ECONNREFUSED|fetch failed|retry cap|502/i);

      await expect.poll(async () => (
        await readHistory(page, workspaceId!, sessionId, sessionToken!)
      ).length, { timeout: 15_000 }).toBe(4);
      const failedHistory = await readHistory(page, workspaceId, sessionId, sessionToken);
      expect(failedHistory.at(-2)).toMatchObject({ role: 'user', content: outagePrompt });
      expect(failedHistory.at(-1)?.content).toBe(
        `${FAILURE_PREFIX}The model endpoint is not responding. It may be down or restarting. Check Settings > Models, then try again.`,
      );

      proxy = await startProxy(proxyPort);
      await expect.poll(async () => {
        const response = await page.request.get('/v1/health/readiness');
        return response.status();
      }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(200);

      const retryRequestPromise = page.waitForRequest(request => (
        request.method() === 'POST' && pathOf(request.url()) === '/api/chat'
      ));
      await errorBlock.getByRole('button', { name: 'Retry', exact: true }).click();
      const retryRequest = await retryRequestPromise;
      expect(JSON.parse(retryRequest.postData() ?? '{}')).toMatchObject({
        message: outagePrompt,
        workspaceId,
        sessionId,
        model: MODEL,
        retry: true,
        retryTarget: {
          kind: 'assistant-pair',
          expectedMessageCount: 4,
          expectedAssistantContent: failedHistory.at(-1)?.content,
        },
      });

      await expect.poll(async () => {
        const history = await readHistory(page, workspaceId!, sessionId, sessionToken!);
        return history.length === 4
          && history.at(-1)?.role === 'assistant'
          && !history.at(-1)!.content.startsWith(FAILURE_PREFIX);
      }, { timeout: 120_000 }).toBe(true);
      const recoveredHistory = await readHistory(page, workspaceId, sessionId, sessionToken);
      expect(recoveredHistory.slice(0, -2)).toEqual(failedHistory.slice(0, -2));
      expect(recoveredHistory.at(-2)).toMatchObject({ role: 'user', content: outagePrompt });
      expect(recoveredHistory.at(-1)?.content).toContain(recoveryMarker);
      expect(recoveredHistory.filter(message => message.content === outagePrompt)).toHaveLength(1);

      const sessionUrl = page.url();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(sessionUrl);
      await expect.poll(async () => (
        await readHistory(page, workspaceId!, sessionId, sessionToken!)
      ), { timeout: 30_000 }).toEqual(recoveredHistory);
      await expect(page.getByTestId('chat-error-block')).toHaveCount(0);
      await expect(page.getByTestId('chat-message')).toHaveCount(4);
      await expect(
        page.locator('[data-testid="chat-message"][data-message-role="assistant"]')
          .last()
          .getByTestId('chat-message-content'),
      ).toContainText(recoveryMarker);

      const receipt = {
        endpoint,
        model: MODEL,
        outageRequest: JSON.parse(outageRequest.postData() ?? '{}'),
        retryRequest: JSON.parse(retryRequest.postData() ?? '{}'),
        failedHistory,
        recoveredHistory,
      };
      const receiptPath = testInfo.outputPath('provider-recovery-receipt.json');
      await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      await testInfo.attach('provider-recovery-receipt', {
        path: receiptPath,
        contentType: 'application/json',
      });
      await page.screenshot({
        path: testInfo.outputPath('provider-recovery-final.png'),
        fullPage: true,
      });

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      if (!proxy) proxy = await startProxy(proxyPort).catch(() => null);
      if (workspaceId && sessionToken) {
        const cleanup = await page.request.delete(`/api/workspaces/${workspaceId}`, {
          headers: authHeaders(sessionToken),
        }).catch(() => null);
        if (cleanup) expect.soft(cleanup.status()).toBe(204);
      }
    }
  });
});
