import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const RUN_LIVE_SOLO_AGENT = process.env.WAGGLE_E2E_SOLO_AGENT === '1';
const OWNS_ISOLATED_SERVER = process.env.WAGGLE_E2E_REUSE_EXISTING_SERVER === '0';
const ENDPOINT = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_BASE_URL
  ?? 'http://10.33.0.153:4000/v1';
const MODEL = process.env.WAGGLE_E2E_OPENAI_COMPATIBLE_MODEL
  ?? 'openai-compatible/qwen3.8-flash-next';
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=simple';

function pathOf(url: string): string {
  return new URL(url).pathname;
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

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

test.describe('Windows Solo premium saved-agent journey', () => {
  test.skip(
    !RUN_LIVE_SOLO_AGENT || !OWNS_ISOLATED_SERVER,
    'Set WAGGLE_E2E_SOLO_AGENT=1 and WAGGLE_E2E_REUSE_EXISTING_SERVER=0; this journey must own its disposable Waggle data dir.',
  );
  test.setTimeout(600_000);

  test('creates a Qwen agent, follows live progress, and opens its complete chat result', async ({ page }) => {
    page.setDefaultTimeout(15_000);
    const suffix = randomUUID().slice(0, 8);
    const agentName = `Qwen delivery ${suffix}`;
    const markers = [
      `AGENT-BEGIN-${suffix}`,
      `AGENT-MIDDLE-A-${suffix}`,
      `AGENT-MIDDLE-B-${suffix}`,
      `AGENT-END-${suffix}`,
    ];
    const task = `Reply with exactly these four tokens in this order, separated by one space, and put nothing after the final token: ${markers.join(' ')}`;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let token: string | null = null;
    let agentId: string | null = null;
    let sessionId: string | null = null;
    let workspaceId: string | null = null;

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      await page.goto(`/settings?${SKIP_PARAMS}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      token = await readBrowserSessionToken(page);

      const onboardingStatusResponse = await page.request.get('/api/onboarding/status', {
        headers: authHeaders(token),
      });
      expect(onboardingStatusResponse.ok(), await onboardingStatusResponse.text().catch(() => '')).toBe(true);
      const onboardingStatus = await onboardingStatusResponse.json() as { profileId?: string };
      expect(onboardingStatus.profileId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      const onboardingCompleteResponse = await page.request.post('/api/onboarding/complete', {
        data: { expectedProfileId: onboardingStatus.profileId },
        headers: authHeaders(token),
      });
      expect(onboardingCompleteResponse.ok(), await onboardingCompleteResponse.text().catch(() => '')).toBe(true);

      await page.getByRole('button', { name: /openai-compatible/i }).click();
      await page.getByLabel('Endpoint URL').fill(ENDPOINT);
      await page.getByRole('button', { name: 'Discover models' }).click();
      const discoveredModel = page.getByRole('combobox', { name: 'Model', exact: true });
      await expect(discoveredModel).toBeVisible({ timeout: 60_000 });
      await discoveredModel.selectOption(MODEL);
      await page.getByRole('button', { name: 'Verify & save' }).click();
      await expect(page.getByRole('status').filter({
        hasText: 'Verified and saved. This model is now your primary model.',
      })).toBeVisible({ timeout: 90_000 });

      const settingsResponse = await page.request.get('/api/settings', { headers: authHeaders(token) });
      expect(settingsResponse.ok(), await settingsResponse.text().catch(() => '')).toBe(true);
      const settings = await settingsResponse.json() as {
        defaultModel?: string;
        providers?: Record<string, { baseUrl?: string; models?: string[] }>;
      };
      expect(settings.defaultModel).toBe(MODEL);
      expect(settings.providers?.['openai-compatible']?.baseUrl).toBe(ENDPOINT);
      expect(settings.providers?.['openai-compatible']?.models).toContain(MODEL);

      await page.getByTestId('nav-agents').click();
      await expect(page).toHaveURL(/\/agents$/);
      await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();

      const workspacesResponse = await page.request.get('/api/workspaces', { headers: authHeaders(token) });
      expect(workspacesResponse.ok(), await workspacesResponse.text().catch(() => '')).toBe(true);
      const workspaces = await workspacesResponse.json() as Array<{ id: string; name: string }>;
      expect(workspaces.length).toBeGreaterThan(0);
      const workspace = workspaces.find(item => item.id === 'default') ?? workspaces[0];
      workspaceId = workspace.id;

      await page.getByTestId('route-transition')
        .getByRole('button', { name: 'New Agent', exact: true })
        .click();
      const builder = page.getByRole('dialog', { name: 'Agent Builder' });
      await expect(builder).toBeVisible();
      await builder.getByLabel('Name', { exact: true }).fill(agentName);
      await builder.getByLabel('Goal', { exact: true }).fill(task);
      await builder.getByTestId('agent-builder-next').click();

      await builder.getByRole('button', { name: 'Select model...', exact: true }).click();
      await builder.getByRole('button', { name: /qwen3\.8-flash-next/i }).click();
      await expect(builder).toContainText('qwen3.8-flash-next');
      await builder.getByTestId('agent-builder-next').click();

      const workspaceButton = builder.getByRole('button', { name: workspace.name, exact: true });
      await workspaceButton.click();
      await expect(workspaceButton).toHaveAttribute('aria-pressed', 'true');
      await builder.getByTestId('agent-builder-next').click();
      await builder.getByTestId('agent-builder-next').click();

      const review = builder.getByTestId('agent-builder-review');
      await expect(review).toContainText(agentName);
      await expect(review).toContainText(task);
      await expect(review).toContainText(MODEL);
      await expect(review).toContainText(workspace.name);

      const createResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST' && pathOf(response.url()) === '/api/agents'
      ));
      await builder.getByTestId('agent-builder-finish').click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status(), await createResponse.text().catch(() => '')).toBe(201);
      const created = await createResponse.json() as { agent: { id: string; model: string; workspaceIds?: string[] } };
      agentId = created.agent.id;
      expect(created.agent.model).toBe(MODEL);
      expect(created.agent.workspaceIds).toEqual([workspace.id]);

      const savedAgentResponse = await page.request.get(`/api/agents/${encodeURIComponent(agentId)}`, {
        headers: authHeaders(token),
      });
      expect(savedAgentResponse.ok(), await savedAgentResponse.text().catch(() => '')).toBe(true);
      const savedAgent = await savedAgentResponse.json() as {
        agent: { name: string; goal: string; model: string; workspaceIds?: string[] };
      };
      expect(savedAgent.agent).toMatchObject({
        name: agentName,
        goal: task,
        model: MODEL,
        workspaceIds: [workspace.id],
      });

      const detail = page.getByRole('dialog', { name: agentName });
      await expect(detail).toBeVisible();
      await expect(detail).toContainText(MODEL);
      await expect(detail).toContainText(workspace.name);

      const runResponsePromise = page.waitForResponse(response => (
        response.request().method() === 'POST'
        && pathOf(response.url()) === `/api/agents/${agentId}/run`
      ));
      await detail.getByRole('button', { name: 'Run', exact: true }).click();
      const runResponse = await runResponsePromise;
      expect(runResponse.status(), await runResponse.text().catch(() => '')).toBe(202);
      const handoff = await runResponse.json() as {
        runId: string;
        roomId: string;
        sessionId: string;
        workspaceId: string;
        statusUrl: string;
      };
      expect(handoff.runId).toMatch(/^run_/);
      expect(handoff.roomId).toMatch(/^room_/);
      expect(handoff.workspaceId).toBe(workspace.id);
      const statusPath = `/api/agent-runs/${encodeURIComponent(handoff.runId)}`;
      expect(handoff.statusUrl).toBe(statusPath);
      sessionId = handoff.sessionId;

      await expect(page).toHaveURL(new RegExp(`/room\\?room=${encodeURIComponent(handoff.roomId)}(?:&|$)`), {
        timeout: 15_000,
      });
      const runCard = page.locator(
        `[data-testid="canonical-worker-card"][data-run-id="${handoff.runId}"]`,
      );
      await expect(runCard).toBeVisible({ timeout: 30_000 });

      await expect.poll(async () => {
        const response = await page.request.get(statusPath, { headers: authHeaders(token!) });
        if (!response.ok()) return `http-${response.status()}`;
        const body = await response.json() as { run?: { status?: string; result?: { error?: string } } };
        const status = body.run?.status ?? 'missing';
        if (['failed', 'cancelled', 'interrupted'].includes(status)) {
          throw new Error(`Agent run ${status}: ${body.run?.result?.error ?? 'no error detail'}`);
        }
        return status;
      }, { timeout: 240_000, intervals: [500, 1_000, 2_000, 5_000] }).toBe('completed');

      const runStatusResponse = await page.request.get(statusPath, { headers: authHeaders(token) });
      expect(runStatusResponse.ok(), await runStatusResponse.text().catch(() => '')).toBe(true);
      const runStatusBody = await runStatusResponse.json() as {
        run: { result?: { summary?: string; sessionId?: string } };
      };
      const canonicalSummary = normalizeText(runStatusBody.run.result?.summary ?? '');
      expect(runStatusBody.run.result?.sessionId).toBe(handoff.sessionId);
      expect(canonicalSummary).toBe(markers.join(' '));

      await expect(runCard).toHaveAttribute('data-run-status', 'completed', { timeout: 30_000 });
      const visibleSummary = normalizeText(await runCard.getByTestId(`run-summary-${handoff.runId}`).innerText());
      expect(visibleSummary).toBe(canonicalSummary);

      const openResult = runCard.getByRole('link', { name: 'Open result in chat', exact: true });
      await expect(openResult).toHaveAttribute(
        'href',
        `/workspaces/${encodeURIComponent(workspace.id)}/chat?session=${encodeURIComponent(handoff.sessionId)}`,
      );
      await openResult.click();
      await expect(page).toHaveURL(new RegExp(
        `/workspaces/${encodeURIComponent(workspace.id)}/chat\\?session=${encodeURIComponent(handoff.sessionId)}$`,
      ));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const activeSession = page.locator(`button[data-session-id="${handoff.sessionId}"]`);
      await expect(activeSession).toHaveAttribute('aria-current', 'true');
      const assistantMessage = page.locator('[data-testid="chat-message"][data-message-role="assistant"]').last();
      await expect(assistantMessage).toBeVisible();
      expect(normalizeText(await assistantMessage.getByTestId('chat-message-content').innerText())).toBe(canonicalSummary);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      if (token && agentId) {
        const archiveResponse = await page.request.patch(`/api/agents/${agentId}`, {
          headers: authHeaders(token),
          data: { status: 'archived' },
        });
        expect.soft(archiveResponse.ok()).toBe(true);
        const archivedResponse = await page.request.get(`/api/agents/${encodeURIComponent(agentId)}`, {
          headers: authHeaders(token),
        });
        expect.soft(archivedResponse.ok()).toBe(true);
        if (archivedResponse.ok()) {
          const archived = await archivedResponse.json() as { agent?: { status?: string } };
          expect.soft(archived.agent?.status).toBe('archived');
        }
      }
      if (token && workspaceId && sessionId) {
        const cleanupResponse = await page.request.delete(
          `/api/sessions/${encodeURIComponent(sessionId)}?workspace=${encodeURIComponent(workspaceId)}`,
          { headers: authHeaders(token) },
        );
        expect.soft(cleanupResponse.status()).toBe(200);
        const sessionsResponse = await page.request.get(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
          { headers: authHeaders(token) },
        );
        expect.soft(sessionsResponse.ok()).toBe(true);
        if (sessionsResponse.ok()) {
          const sessions = await sessionsResponse.json() as Array<{ id?: string }>;
          expect.soft(sessions.some(session => session.id === sessionId)).toBe(false);
        }
      }
    }
  });
});
