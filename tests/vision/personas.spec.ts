/**
 * Canonical ten-persona production acceptance journey.
 *
 * Acceptance matrix: exactly 10 personas x 3 fresh workspace/session trials,
 * with no retries. A smaller diagnostic run requires both
 * WAGGLE_PERSONA_NON_GATING_DEBUG=1 and WAGGLE_PERSONA_REPEATS (1-10).
 * This is intentionally a live LLM suite; list/compile it cheaply with:
 *   npx playwright test tests/vision/personas.spec.ts --list
 * Run the expensive matrix only with a real provider:
 *   WAGGLE_E2E_SKIP_LITELLM=0 npx playwright test tests/vision/personas.spec.ts
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PERSONA_CASES,
  resolvePersonaRunMode,
  type PersonaAcceptanceCase,
} from './persona-cases';
import {
  containsFailureCopy,
  scorePersonaTrial,
  validatePythonSyntax,
  type CapturedSseEvent,
  type PersonaTrialEvidence,
} from './persona-scorer';
import {
  attachConsoleCapture,
  BASE,
  dismissOverlay,
  gotoDesktop,
  type ConsoleCapture,
} from './_helpers';

const ARTIFACTS = join(process.cwd(), 'output', 'playwright', 'personas');
const RUN_MODE = resolvePersonaRunMode(
  process.env.WAGGLE_PERSONA_NON_GATING_DEBUG,
  process.env.WAGGLE_PERSONA_REPEATS,
);
const REPEATS = RUN_MODE.repeats;
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true';
const seenWorkspaceIds = new Set<string>();
const seenSessionIds = new Set<string>();
const CONTEXT_METRIC_KEYS = [
  'agentLatencyMs',
  'estimatedSystemPromptTokens',
  'estimatedToolSchemaTokens',
  'finalSystemPromptChars',
  'packageMode',
  'providerInputTokens',
  'providerOutputTokens',
  'selectorLatencyMs',
  'timeToFirstTokenMs',
  'toolCatalogCount',
  'toolEligibleCount',
  'toolOmittedCount',
  'toolSelectedCount',
  'totalServerLatencyMs',
  'transmittedToolSchemaChars',
] as const;
type NumericContextMetricKey = Exclude<(typeof CONTEXT_METRIC_KEYS)[number], 'packageMode'>;

interface WorkspaceRecord {
  id?: string;
  name?: string;
  personaId?: string | null;
}

interface PersonaWorkspace {
  workspaceId: string;
  workspaceName: string;
  personaPersisted: boolean;
  created: WorkspaceRecord;
  persisted: WorkspaceRecord;
}

interface HistoryMessage {
  role?: string;
  content?: string;
  persona?: string;
  personaId?: string;
}

interface HistoryResponse {
  sessionId: string;
  messages: HistoryMessage[];
}

interface ChatRequestPayload {
  workspaceId?: string;
  message?: string;
  sessionId?: string;
  persona?: string;
}

interface ApprovalAutoDenial {
  observedAt: string;
  cardText: string;
  screenshotPath: string | null;
  screenshotError: string | null;
  requestId: string | null;
  requestUrl: string | null;
  requestBody: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  transportError: string | null;
}

interface SendAndCaptureOptions {
  bodyTimeoutMs: number;
  approvalScreenshotPrefix: string;
}

interface WireTurn {
  requestUrl: string;
  requestPayload: ChatRequestPayload;
  httpStatus: number;
  durationMs: number;
  events: CapturedSseEvent[];
  parseErrors: string[];
  done: Record<string, unknown> | null;
  timedOut: boolean;
  transportError: string | null;
  approvalAutoDenials: ApprovalAutoDenial[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function finiteContextMetric(
  metrics: Record<string, unknown> | null,
  key: NumericContextMetricKey,
): number {
  const value = metrics?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function reconstructTokenStream(events: readonly CapturedSseEvent[]): string {
  return events
    .filter(event => event.event === 'token')
    .map((event) => {
      const data = asRecord(event.data);
      return typeof data?.content === 'string'
        ? data.content
        : typeof event.data === 'string' ? event.data : '';
    })
    .join('');
}

function parseSse(body: string): { events: CapturedSseEvent[]; errors: string[] } {
  const events: CapturedSseEvent[] = [];
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
      events.push({ event, data: JSON.parse(rawData), rawData });
    } catch (error) {
      errors.push(`${event}: ${error instanceof Error ? error.message : String(error)}`);
      events.push({ event, data: null, rawData });
    }
  }
  return { events, errors };
}

function parseRequestPayload(raw: string | null): ChatRequestPayload {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ChatRequestPayload;
  } catch {
    return {};
  }
}

async function startTrialIfNeeded(page: Page): Promise<void> {
  const response = await page.request.post(`${BASE}/api/tier/start-trial`).catch(() => null);
  if (!response || response.ok() || response.status() === 409) return;
  throw new Error(`Could not enable persona workspaces: start-trial returned ${response.status()}`);
}

async function createPersonaWorkspace(
  page: Page,
  persona: PersonaAcceptanceCase,
  repeat: number,
): Promise<PersonaWorkspace> {
  await startTrialIfNeeded(page);
  const nonce = randomUUID().slice(0, 8);
  const workspaceName = `Persona acceptance ${persona.id} r${repeat} ${nonce}`;
  const createResponse = await page.request.post(`${BASE}/api/workspaces`, {
    data: {
      name: workspaceName,
      group: 'persona-acceptance',
      personaId: persona.id,
      icon: 'UserRound',
      tone: 'professional',
      storageType: 'virtual',
    },
  });
  expect(createResponse.ok(), `create workspace for ${persona.id} repeat ${repeat}`).toBeTruthy();
  const created = await createResponse.json() as WorkspaceRecord;
  const workspaceId = String(created.id ?? '');
  expect(workspaceId, 'workspace id').toMatch(/\S/);
  expect(created.personaId, 'POST response carries canonical personaId').toBe(persona.id);
  expect(seenWorkspaceIds.has(workspaceId), 'fresh workspace id').toBe(false);
  seenWorkspaceIds.add(workspaceId);

  const persistedResponse = await page.request.get(
    `${BASE}/api/workspaces/${encodeURIComponent(workspaceId)}`,
  );
  expect(persistedResponse.ok(), 'read created workspace').toBeTruthy();
  const persisted = await persistedResponse.json() as WorkspaceRecord;
  expect(persisted.personaId, 'workspace persisted canonical personaId').toBe(persona.id);

  return {
    workspaceId,
    workspaceName,
    personaPersisted: created.personaId === persona.id && persisted.personaId === persona.id,
    created,
    persisted,
  };
}

async function openPersonaChat(page: Page, workspaceId: string): Promise<void> {
  await page.goto(`${BASE}/workspaces/${encodeURIComponent(workspaceId)}/chat?${SKIP_PARAMS}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 20_000 });
  await dismissOverlay(page);
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
}

function remainingDeadlineMs(deadlineAt: number, operation: string, capMs = Number.MAX_SAFE_INTEGER): number {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new Error(`Chat response body deadline expired while ${operation}.`);
  }
  return Math.max(1, Math.min(capMs, remainingMs));
}

async function settleBeforeDeadline<T>(
  deadlineAt: number,
  operation: string,
  run: () => Promise<T>,
  capMs = Number.MAX_SAFE_INTEGER,
): Promise<T> {
  const timeoutMs = remainingDeadlineMs(deadlineAt, operation, capMs);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Chat response body deadline expired while ${operation}.`)),
      timeoutMs,
    );
    void run().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function appendTransportError(denial: ApprovalAutoDenial, message: string): void {
  denial.transportError = denial.transportError
    ? `${denial.transportError} ${message}`
    : message;
}

async function captureBodyWithApprovalDenials(
  page: Page,
  bodyPromise: Promise<Buffer>,
  deadlineAt: number,
  screenshotPrefix: string,
  approvalAutoDenials: ApprovalAutoDenial[],
): Promise<Buffer> {
  const settledBody = bodyPromise.then(
    body => ({ kind: 'body' as const, body }),
    error => ({ kind: 'error' as const, error }),
  );
  const approvalGate = page.locator('[data-testid="chat-approval-gate"]').first();

  while (true) {
    const remainingMs = remainingDeadlineMs(deadlineAt, 'waiting for stream completion');

    const outcome = await Promise.race([
      settledBody,
      page.waitForTimeout(Math.min(100, remainingMs)).then(() => ({ kind: 'poll' as const })),
    ]);
    const approvalVisible = await settleBeforeDeadline(
      deadlineAt,
      'checking the approval card',
      () => approvalGate.isVisible(),
      500,
    );
    if (!approvalVisible) {
      if (outcome.kind === 'body') return outcome.body;
      if (outcome.kind === 'error') throw outcome.error;
      continue;
    }

    await approvalGate.scrollIntoViewIfNeeded({
      timeout: remainingDeadlineMs(deadlineAt, 'scrolling to the approval card', 1_000),
    }).catch(() => {});
    const cardText = (await approvalGate.innerText({
      timeout: remainingDeadlineMs(deadlineAt, 'reading the approval card', 1_000),
    }).catch(() => '')).trim();
    const observedAt = new Date().toISOString();
    const screenshotPath = `${screenshotPrefix}-${approvalAutoDenials.length + 1}.png`;
    let capturedPath: string | null = screenshotPath;
    let screenshotError: string | null = null;
    try {
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        timeout: remainingDeadlineMs(deadlineAt, 'capturing the approval card', 3_000),
      });
    } catch (error) {
      capturedPath = null;
      screenshotError = error instanceof Error ? error.message : String(error);
    }

    const denial: ApprovalAutoDenial = {
      observedAt,
      cardText,
      screenshotPath: capturedPath,
      screenshotError,
      requestId: null,
      requestUrl: null,
      requestBody: null,
      responseStatus: null,
      responseBody: null,
      transportError: null,
    };
    approvalAutoDenials.push(denial);
    const denialResponsePromise = page.waitForResponse(
      response => response.request().method() === 'POST'
        && new URL(response.url()).pathname.startsWith('/api/approval/'),
      { timeout: remainingDeadlineMs(deadlineAt, 'waiting for the denial receipt', 5_000) },
    ).catch(() => null);
    try {
      await approvalGate.getByRole('button', { name: 'Not now', exact: true }).click({
        timeout: remainingDeadlineMs(deadlineAt, 'clicking Not now', 3_000),
      });
    } catch (error) {
      appendTransportError(
        denial,
        `Approval denial click failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    const denialResponse = await denialResponsePromise;
    const requestUrl = denialResponse?.url() ?? null;
    const requestId = requestUrl
      ? decodeURIComponent(new URL(requestUrl).pathname.split('/').filter(Boolean).at(-1) ?? '') || null
      : null;
    denial.requestId = requestId;
    denial.requestUrl = requestUrl;
    denial.requestBody = denialResponse?.request().postData() ?? null;
    denial.responseStatus = denialResponse?.status() ?? null;
    if (denialResponse) {
      try {
        denial.responseBody = await settleBeforeDeadline(
          deadlineAt,
          'reading the denial receipt',
          () => denialResponse.text(),
          3_000,
        );
      } catch (error) {
        appendTransportError(
          denial,
          `Approval denial response could not be read: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      appendTransportError(denial, 'No matching approval-denial response was observed.');
    }
    await approvalGate.waitFor({
      state: 'hidden',
      timeout: remainingDeadlineMs(deadlineAt, 'waiting for the approval card to close', 5_000),
    }).catch((error) => {
      appendTransportError(
        denial,
        `Approval card did not close: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}

async function sendAndCapture(
  page: Page,
  prompt: string,
  options: SendAndCaptureOptions,
): Promise<WireTurn> {
  const target = page.locator('textarea').first();
  const startedAt = Date.now();
  const deadlineAt = startedAt + options.bodyTimeoutMs;
  const approvalAutoDenials: ApprovalAutoDenial[] = [];
  let requestUrl = `${BASE}/api/chat`;
  let requestPayload: ChatRequestPayload = { message: prompt };
  let httpStatus = 0;
  try {
    await target.waitFor({ state: 'visible', timeout: 15_000 });
    await target.fill(prompt, { timeout: 30_000 });
    const responseResult = page.waitForResponse(
      response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/chat',
      { timeout: remainingDeadlineMs(deadlineAt, 'waiting for chat response headers') },
    ).then(
      response => ({ response, error: null }),
      error => ({ response: null, error }),
    );
    const sendButton = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first();
    if (await sendButton.isEnabled({ timeout: 800 }).catch(() => false)) {
      await sendButton.click().catch(() => target.press('Enter'));
    } else {
      await target.press('Enter');
    }

    const responseOutcome = await responseResult;
    if (responseOutcome.error) throw responseOutcome.error;
    const response = responseOutcome.response;
    if (!response) throw new Error('Chat response headers were not captured.');
    requestUrl = response.url();
    requestPayload = parseRequestPayload(response.request().postData());
    httpStatus = response.status();
    // Playwright's response.text() can honor a missing/legacy HTTP charset and
    // mojibake UTF-8 punctuation on Windows. The chat wire contract is UTF-8;
    // decode the captured bytes explicitly so wire, UI, and persisted evidence
    // are compared without a test-harness encoding artifact.
    const body = (await captureBodyWithApprovalDenials(
      page,
      response.body(),
      deadlineAt,
      options.approvalScreenshotPrefix,
      approvalAutoDenials,
    )).toString('utf8');
    const completedAt = Date.now();
    const parsed = parseSse(body);
    const doneEvent = [...parsed.events].reverse().find(event => event.event === 'done');
    return {
      requestUrl,
      requestPayload,
      httpStatus,
      durationMs: completedAt - startedAt,
      events: parsed.events,
      parseErrors: parsed.errors,
      done: asRecord(doneEvent?.data),
      timedOut: false,
      transportError: null,
      approvalAutoDenials,
    };
  } catch (error) {
    return {
      requestUrl,
      requestPayload,
      httpStatus,
      durationMs: Date.now() - startedAt,
      events: [],
      parseErrors: [],
      done: null,
      timedOut: true,
      transportError: error instanceof Error ? error.message : String(error),
      approvalAutoDenials,
    };
  }
}

async function fetchHistoryMessages(
  page: Page,
  workspaceId: string,
  sessionId: string,
): Promise<HistoryResponse | null> {
  const response = await page.request.get(
    `${BASE}/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`,
  ).catch(() => null);
  if (!response?.ok()) return null;
  const body = await response.json().catch(() => null) as {
    sessionId?: string;
    messages?: HistoryMessage[];
  } | null;
  if (!body || !Array.isArray(body.messages)) return null;
  return {
    sessionId: String(body.sessionId ?? ''),
    messages: body.messages,
  };
}

async function waitForPersistedResponse(
  page: Page,
  workspaceId: string,
  sessionId: string,
  promptText: string,
  responseText: string,
): Promise<HistoryResponse | null> {
  let latest: HistoryResponse | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    latest = await fetchHistoryMessages(page, workspaceId, sessionId);
    const messages = latest?.messages ?? [];
    if (
      latest?.sessionId === sessionId
      && messages.length === 2
      && messages[0]?.role === 'user'
      && normalizeText(String(messages[0]?.content ?? '')) === normalizeText(promptText)
      && messages[1]?.role === 'assistant'
      && normalizeText(String(messages[1]?.content ?? '')) === normalizeText(responseText)
    ) return latest;
    await page.waitForTimeout(250);
  }
  return latest;
}

async function readRenderedAssistantResponse(page: Page): Promise<string> {
  try {
    await page.context().grantPermissions(
      ['clipboard-read', 'clipboard-write'],
      { origin: new URL(BASE).origin },
    );
    await page.evaluate(() => navigator.clipboard.writeText(''));
    const copyButton = page.locator('[data-testid="chat-msg-copy"]').last();
    await copyButton.waitFor({ state: 'visible', timeout: 10_000 });
    await copyButton.click();
    for (let attempt = 0; attempt < 20; attempt++) {
      const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      if (copied) return copied;
      await page.waitForTimeout(100);
    }
  } catch {
    // The hard UI assertion below reports the missing rendered response.
  }
  return '';
}

function otherPersonaSnippets(persona: PersonaAcceptanceCase): string[] {
  return PERSONA_CASES
    .filter(candidate => candidate.id !== persona.id)
    .map(candidate => candidate.prompt.slice(0, 80));
}

async function scrollConversationToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll('*')).filter(element => {
      const node = element as HTMLElement;
      return node.scrollHeight > node.clientHeight + 80 && node.clientHeight > 200;
    }) as HTMLElement[];
    for (const scroller of scrollers) scroller.scrollTop = scroller.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }).catch(() => {});
  await page.waitForTimeout(400);
}

async function captureScreenshot(page: Page, path: string, errors: string[]): Promise<string | null> {
  try {
    await page.screenshot({ path, fullPage: true });
    return path;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function artifactName(
  persona: PersonaAcceptanceCase,
  repeat: number,
  testInfo: TestInfo,
  workspaceId: string,
): string {
  const safeWorkspaceId = workspaceId.replace(/[^a-z0-9_-]/gi, '-');
  return `${persona.id}-repeat-${repeat}-retry-${testInfo.retry}-${safeWorkspaceId}`;
}

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 300_000, retries: 0 });

test('persona harness safely denies an approval card while the response body is pending', async ({ page }) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.route('https://persona.test/api/approval/mock-request', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, approved: false }),
  }));
  await page.setContent([
    '<div data-testid="chat-approval-gate">',
    '<span>Approve before I continue</span>',
    '<code>run_code</code>',
    '<button onclick="fetch(\'https://persona.test/api/approval/mock-request\',{method:\'POST\',body:\'{&quot;approved&quot;:false}\'}).then(()=>this.parentElement.remove())">Not now</button>',
    '</div>',
  ].join(''));

  const approvalAutoDenials: ApprovalAutoDenial[] = [];
  const simulatedBody = page.locator('[data-testid="chat-approval-gate"]')
    .waitFor({ state: 'detached' })
    .then(() => Buffer.from('event: done\ndata: {"content":"denied safely"}\n\n'));
  const body = await captureBodyWithApprovalDenials(
    page,
    simulatedBody,
    Date.now() + 3_000,
    join(ARTIFACTS, 'harness-approval-denied'),
    approvalAutoDenials,
  );

  expect(body.toString('utf8')).toContain('denied safely');
  expect(approvalAutoDenials).toHaveLength(1);
  expect(approvalAutoDenials[0]).toMatchObject({
    cardText: expect.stringContaining('run_code'),
    screenshotError: null,
    requestId: 'mock-request',
    requestBody: '{"approved":false}',
    responseStatus: 200,
    transportError: null,
  });
  expect(approvalAutoDenials[0]?.screenshotPath).toMatch(/harness-approval-denied-1\.png$/);
});

test('persona harness drains a visible approval card before returning an already-settled body', async ({ page }) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.route('https://persona.test/api/approval/settled-request', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, approved: false }),
  }));
  await page.setContent([
    '<div data-testid="chat-approval-gate">',
    '<code>bash</code>',
    '<button onclick="fetch(\'https://persona.test/api/approval/settled-request\',{method:\'POST\'}).then(()=>this.parentElement.remove())">Not now</button>',
    '</div>',
  ].join(''));

  const approvalAutoDenials: ApprovalAutoDenial[] = [];
  const body = await captureBodyWithApprovalDenials(
    page,
    Promise.resolve(Buffer.from('settled body')),
    Date.now() + 3_000,
    join(ARTIFACTS, 'harness-approval-settled'),
    approvalAutoDenials,
  );

  expect(body.toString('utf8')).toBe('settled body');
  expect(approvalAutoDenials).toHaveLength(1);
  expect(approvalAutoDenials[0]).toMatchObject({
    requestId: 'settled-request',
    responseStatus: 200,
    transportError: null,
  });
});

test('persona harness preserves denial evidence and exits at the absolute body deadline', async ({ page }) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.setContent([
    '<div data-testid="chat-approval-gate">',
    '<code>run_code</code>',
    '<button onclick="this.parentElement.remove()">Not now</button>',
    '</div>',
  ].join(''));

  const approvalAutoDenials: ApprovalAutoDenial[] = [];
  const startedAt = Date.now();
  await expect(captureBodyWithApprovalDenials(
    page,
    new Promise<Buffer>(() => {}),
    startedAt + 800,
    join(ARTIFACTS, 'harness-approval-deadline'),
    approvalAutoDenials,
  )).rejects.toThrow(/deadline expired/i);

  expect(Date.now() - startedAt).toBeLessThan(2_000);
  expect(approvalAutoDenials).toHaveLength(1);
  expect(approvalAutoDenials[0]).toMatchObject({
    cardText: expect.stringContaining('run_code'),
    requestId: null,
    responseStatus: null,
    transportError: expect.stringContaining('No matching approval-denial response'),
  });
});

test.describe(`10-persona ${RUN_MODE.gating ? 'acceptance' : 'NON-GATING DEBUG'} (${REPEATS} repeats each)`, () => {
  test.beforeAll(async ({ request }) => {
    const response = await request.get(`${BASE}/api/personas`);
    expect(response.ok(), 'live persona catalog is available before acceptance trials').toBe(true);
    const body = await response.json() as { personas?: Array<{ id?: string }> };
    const livePersonaIds = new Set((body.personas ?? []).map(persona => persona.id));
    expect(
      PERSONA_CASES.filter(persona => !livePersonaIds.has(persona.id)).map(persona => persona.id),
      'every acceptance persona exists in the live /api/personas catalog',
    ).toEqual([]);
  });

  for (const persona of PERSONA_CASES) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      test(`persona:${persona.id}:repeat:${repeat}`, async ({ page }, testInfo) => {
        mkdirSync(ARTIFACTS, { recursive: true });
        const runStartedAt = new Date().toISOString();
        const consoleCapture: ConsoleCapture = attachConsoleCapture(page);
        const screenshotErrors: string[] = [];
        const screenshots: string[] = [];
        const workspace = await createPersonaWorkspace(page, persona, repeat);
        const stem = artifactName(persona, repeat, testInfo, workspace.workspaceId);

        await gotoDesktop(page);
        await openPersonaChat(page, workspace.workspaceId);
        const wire = await sendAndCapture(page, persona.prompt, {
          bodyTimeoutMs: persona.maxDurationMs + 15_000,
          approvalScreenshotPrefix: join(ARTIFACTS, `${stem}-approval-denied`),
        });
        for (const denial of wire.approvalAutoDenials) {
          if (denial.screenshotPath) screenshots.push(denial.screenshotPath);
          if (denial.screenshotError) screenshotErrors.push(denial.screenshotError);
        }
        const requestPrompt = String(wire.requestPayload.message ?? '');
        const sessionId = String(wire.requestPayload.sessionId ?? '');
        const requestPersonaId = typeof wire.requestPayload.persona === 'string'
          ? wire.requestPayload.persona
          : null;
        expect(requestPrompt, 'exact browser prompt').toBe(persona.prompt);
        expect(wire.requestPayload.workspaceId, 'exact browser workspace').toBe(workspace.workspaceId);
        expect(sessionId, 'browser supplied a fresh session id').toMatch(/\S/);
        expect(requestPersonaId, 'browser requested the exact case persona').toBe(persona.id);
        expect(seenSessionIds.has(sessionId), 'session id was not reused by another trial').toBe(false);
        seenSessionIds.add(sessionId);

        const responseText = String(wire.done?.content ?? '');
        const doneEventCount = wire.events.filter(event => event.event === 'done').length;
        const tokenStreamResponse = reconstructTokenStream(wire.events);
        const usage = asRecord(wire.done?.usage);
        const tokens = asRecord(wire.done?.tokens);
        const toolsUsed = Array.isArray(wire.done?.toolsUsed)
          ? wire.done.toolsUsed.filter((name): name is string => typeof name === 'string')
          : [];
        const inputTokens = numeric(usage?.inputTokens ?? usage?.prompt_tokens ?? tokens?.input);
        const outputTokens = numeric(usage?.outputTokens ?? usage?.completion_tokens ?? tokens?.output);
        const contextMetrics = asRecord(wire.done?.contextMetrics);
        const toolCatalogCount = finiteContextMetric(contextMetrics, 'toolCatalogCount');
        const toolEligibleCount = finiteContextMetric(contextMetrics, 'toolEligibleCount');
        const toolSelectedCount = finiteContextMetric(contextMetrics, 'toolSelectedCount');
        const toolOmittedCount = finiteContextMetric(contextMetrics, 'toolOmittedCount');
        const transmittedToolSchemaChars = finiteContextMetric(contextMetrics, 'transmittedToolSchemaChars');
        const estimatedToolSchemaTokens = finiteContextMetric(contextMetrics, 'estimatedToolSchemaTokens');
        const finalSystemPromptChars = finiteContextMetric(contextMetrics, 'finalSystemPromptChars');
        const estimatedSystemPromptTokens = finiteContextMetric(contextMetrics, 'estimatedSystemPromptTokens');
        const selectorLatencyMs = finiteContextMetric(contextMetrics, 'selectorLatencyMs');
        const timeToFirstTokenMs = finiteContextMetric(contextMetrics, 'timeToFirstTokenMs');
        const agentLatencyMs = finiteContextMetric(contextMetrics, 'agentLatencyMs');
        const totalServerLatencyMs = finiteContextMetric(contextMetrics, 'totalServerLatencyMs');
        const providerInputTokens = finiteContextMetric(contextMetrics, 'providerInputTokens');
        const providerOutputTokens = finiteContextMetric(contextMetrics, 'providerOutputTokens');
        const packageMode = typeof contextMetrics?.packageMode === 'string'
          ? contextMetrics.packageMode
          : '';
        const toolEvents = wire.events.filter(event => event.event === 'tool' || event.event === 'tool_result');

        const historyResponse = responseText
          ? await waitForPersistedResponse(
            page,
            workspace.workspaceId,
            sessionId,
            persona.prompt,
            responseText,
          )
          : await fetchHistoryMessages(page, workspace.workspaceId, sessionId);
        const history = historyResponse?.messages ?? [];
        const persistedUser = history.find(message => message.role === 'user');
        const persistedAssistant = [...history].reverse().find(message => message.role === 'assistant');
        const persistedPrompt = String(persistedUser?.content ?? '');
        const persistedResponse = String(persistedAssistant?.content ?? '');
        const persistedConversation = history
          .map(message => `${message.role ?? 'unknown'}: ${message.content ?? ''}`)
          .join('\n\n');
        const leakedSnippets = otherPersonaSnippets(persona)
          .filter(snippet => persistedConversation.includes(snippet));

        await scrollConversationToEnd(page);
        const chatScreenshot = await captureScreenshot(
          page,
          join(ARTIFACTS, `${stem}-chat.png`),
          screenshotErrors,
        );
        if (chatScreenshot) screenshots.push(chatScreenshot);
        const renderedConversation = await page.locator('body').innerText().catch(() => '');
        const renderedAssistantResponse = await readRenderedAssistantResponse(page);

        await page.goto(
          `${BASE}/workspaces/${encodeURIComponent(workspace.workspaceId)}/memory?${SKIP_PARAMS}`,
          { waitUntil: 'domcontentloaded' },
        );
        const memorySurface = page
          .locator('[data-testid="ws-memory-tab"], [data-testid="memory-center-app"]')
          .first();
        const memoryJourneyOk = await memorySurface
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        await page.waitForTimeout(800);
        const memoryScreenshot = await captureScreenshot(
          page,
          join(ARTIFACTS, `${stem}-memory.png`),
          screenshotErrors,
        );
        if (memoryScreenshot) screenshots.push(memoryScreenshot);
        const memoryText = memoryJourneyOk
          ? await memorySurface.innerText().catch(() => '')
          : '';
        const contextResponse = await page.request.get(
          `${BASE}/api/workspaces/${encodeURIComponent(workspace.workspaceId)}/context`,
        ).catch(() => null);
        const workspaceContext = contextResponse?.ok()
          ? await contextResponse.json().catch(() => null) as Record<string, unknown> | null
          : null;
        const contextStats = asRecord(workspaceContext?.stats);
        const sessionCount = numeric(contextStats?.sessionCount ?? workspaceContext?.sessionCount);

        const pythonValidation = validatePythonSyntax(responseText);
        const criticalBrowserErrors = [
          ...consoleCapture.critical(),
          ...consoleCapture.pageErrors,
          ...screenshotErrors,
        ];
        const evidence: PersonaTrialEvidence = {
          prompt: requestPrompt,
          response: responseText,
          persistedResponse,
          expectedWorkspaceId: workspace.workspaceId,
          requestWorkspaceId: String(wire.requestPayload.workspaceId ?? ''),
          requestSessionId: sessionId,
          persistedSessionId: historyResponse?.sessionId ?? '',
          persistedPrompt,
          persistedMessageCount: history.length,
          tokenStreamResponse,
          doneEventCount,
          renderedAssistantResponse,
          memoryEvidencePresent: memoryJourneyOk && memoryText.trim().length > 0,
          sseEvents: wire.events,
          toolsUsed,
          durationMs: wire.durationMs,
          inputTokens,
          outputTokens,
          personaPersisted: workspace.personaPersisted,
          requestPersonaId,
          workspaceLeak: leakedSnippets.length > 0,
          completed: wire.done !== null,
          timedOut: wire.timedOut,
          corrupted: wire.httpStatus !== 200
            || wire.parseErrors.length > 0
            || criticalBrowserErrors.length > 0
            || inputTokens <= 0
            || outputTokens <= 0
            || containsFailureCopy(responseText),
          codeValidation: {
            pythonSyntaxValid: pythonValidation.syntaxValid,
            pythonImportsPresent: pythonValidation.importsPresent,
          },
        };
        const score = scorePersonaTrial(persona, evidence);
        const artifact = {
          schemaVersion: 5,
          runStartedAt,
          runCompletedAt: new Date().toISOString(),
          persona: {
            id: persona.id,
            label: persona.label,
            repeat,
            repeatCount: REPEATS,
            gating: RUN_MODE.gating,
          },
          workspace,
          request: {
            url: wire.requestUrl,
            payload: wire.requestPayload,
            exactPrompt: requestPrompt,
            sessionId,
            personaId: requestPersonaId,
          },
          response: {
            exact: responseText,
            tokenStreamExact: tokenStreamResponse,
            renderedAssistantExact: renderedAssistantResponse,
            persistedExact: persistedResponse,
            persistedPromptExact: persistedPrompt,
            persistedSessionId: historyResponse?.sessionId ?? null,
            persistedMessageCount: history.length,
            doneEventCount,
            httpStatus: wire.httpStatus,
            model: wire.done?.model ?? null,
            durationMs: wire.durationMs,
            tokens: { input: inputTokens, output: outputTokens },
            contextMetrics,
            toolsUsed,
            toolEvents,
            approvalEvents: wire.events.filter(
              event => event.event === 'approval_required' || event.event === 'approval_request',
            ),
            approvalAutoDenials: wire.approvalAutoDenials,
            sseEvents: wire.events,
            parseErrors: wire.parseErrors,
            transportError: wire.transportError,
          },
          journey: {
            renderedConversation,
            history,
            historyCount: history.length,
            workspaceContext,
            sessionCount,
            memoryJourneyOk,
            memoryText,
            leakedSnippets,
          },
          codeValidation: pythonValidation,
          screenshots,
          browser: {
            consoleErrors: consoleCapture.errors,
            criticalConsoleErrors: consoleCapture.critical(),
            pageErrors: consoleCapture.pageErrors,
            networkFailures: consoleCapture.networkFailures,
            screenshotErrors,
          },
          score,
        };
        const artifactPath = join(ARTIFACTS, `${stem}.json`);
        writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
        await testInfo.attach('persona-acceptance-score', {
          body: Buffer.from(JSON.stringify(score, null, 2)),
          contentType: 'application/json',
        });

        expect(wire.httpStatus, 'chat request succeeded').toBe(200);
        expect(wire.timedOut, 'chat request completed before the timeout').toBe(false);
        expect(wire.parseErrors, 'every SSE event was valid JSON').toEqual([]);
        expect(doneEventCount, 'SSE stream emitted exactly one done event').toBe(1);
        expect(normalizeText(tokenStreamResponse), 'SSE token stream was non-empty').not.toBe('');
        expect(
          normalizeText(tokenStreamResponse),
          'reconstructed SSE tokens exactly matched the done response',
        ).toBe(normalizeText(responseText));
        expect(
          normalizeText(renderedAssistantResponse),
          'rendered assistant message exactly matched the SSE token stream',
        ).toBe(normalizeText(tokenStreamResponse));
        expect(historyResponse?.sessionId, 'history echoed the exact browser session id').toBe(sessionId);
        expect(
          history.map(message => ({
            role: message.role,
            content: normalizeText(String(message.content ?? '')),
          })),
          'history persisted exactly the submitted user prompt and visible assistant response',
        ).toEqual([
          { role: 'user', content: normalizeText(persona.prompt) },
          { role: 'assistant', content: normalizeText(responseText) },
        ]);
        expect(memoryJourneyOk, 'memory surface remained usable').toBe(true);
        expect(memoryText.trim().length, 'memory-specific surface rendered substantive evidence').toBeGreaterThan(0);
        expect(sessionCount, 'workspace context recorded the fresh session').toBeGreaterThanOrEqual(1);
        expect(leakedSnippets, 'no cross-persona prompt leaked into persisted history').toEqual([]);
        expect(
          Object.keys(contextMetrics ?? {}).sort(),
          'done.contextMetrics exposes exactly the approved aggregate fields',
        ).toEqual([...CONTEXT_METRIC_KEYS].sort());
        for (const [name, value] of [
          ['toolCatalogCount', toolCatalogCount],
          ['toolEligibleCount', toolEligibleCount],
          ['toolSelectedCount', toolSelectedCount],
          ['toolOmittedCount', toolOmittedCount],
          ['transmittedToolSchemaChars', transmittedToolSchemaChars],
          ['estimatedToolSchemaTokens', estimatedToolSchemaTokens],
          ['finalSystemPromptChars', finalSystemPromptChars],
          ['estimatedSystemPromptTokens', estimatedSystemPromptTokens],
          ['providerInputTokens', providerInputTokens],
          ['providerOutputTokens', providerOutputTokens],
        ] as const) {
          expect(Number.isInteger(value), `${name} is an integer`).toBe(true);
        }
        expect(toolCatalogCount, 'catalog count is non-negative').toBeGreaterThanOrEqual(0);
        expect(toolEligibleCount, 'eligible count is non-negative').toBeGreaterThanOrEqual(0);
        expect(toolSelectedCount, 'selected count may be zero but never negative').toBeGreaterThanOrEqual(0);
        expect(toolOmittedCount, 'omitted count is non-negative').toBeGreaterThanOrEqual(0);
        expect(toolCatalogCount, 'catalog includes every eligible tool').toBeGreaterThanOrEqual(toolEligibleCount);
        expect(toolEligibleCount, 'eligible set includes every selected tool').toBeGreaterThanOrEqual(toolSelectedCount);
        expect(toolOmittedCount, 'omitted count exactly reconciles eligible and selected tools')
          .toBe(toolEligibleCount - toolSelectedCount);
        expect(toolSelectedCount, 'selector respects the 14-tool cap').toBeLessThanOrEqual(14);
        expect(transmittedToolSchemaChars, 'transmitted schema chars are non-negative').toBeGreaterThanOrEqual(0);
        expect(transmittedToolSchemaChars, 'selector respects the 8000-character schema cap').toBeLessThanOrEqual(8_000);
        expect(
          transmittedToolSchemaChars === 0,
          'tool schemas are omitted exactly when no tools are selected',
        ).toBe(toolSelectedCount === 0);
        expect(estimatedToolSchemaTokens, 'tool schema token estimate exactly matches chars / 4')
          .toBe(Math.ceil(transmittedToolSchemaChars / 4));
        expect(finalSystemPromptChars, 'final system prompt is non-empty').toBeGreaterThan(0);
        expect(estimatedSystemPromptTokens, 'final system prompt token estimate is positive').toBeGreaterThan(0);
        expect(estimatedSystemPromptTokens, 'system prompt token estimate exactly matches chars / 4')
          .toBe(Math.ceil(finalSystemPromptChars / 4));
        expect(typeof contextMetrics?.packageMode, 'prompt package mode is present').toBe('string');
        expect(packageMode, 'production prompt package mode is non-empty').not.toBe('');
        expect(packageMode, 'production turns never use the injected-runner package mode').not.toBe('custom');
        for (const [name, value] of [
          ['selectorLatencyMs', selectorLatencyMs],
          ['timeToFirstTokenMs', timeToFirstTokenMs],
          ['agentLatencyMs', agentLatencyMs],
          ['totalServerLatencyMs', totalServerLatencyMs],
        ] as const) {
          expect(Number.isFinite(value), `${name} is finite`).toBe(true);
          expect(value, `${name} is non-negative`).toBeGreaterThanOrEqual(0);
        }
        expect(selectorLatencyMs, 'selector completes before the first token').toBeLessThanOrEqual(timeToFirstTokenMs);
        expect(timeToFirstTokenMs, 'first token arrives before server completion').toBeLessThanOrEqual(totalServerLatencyMs);
        expect(agentLatencyMs, 'agent execution completes within total server latency').toBeLessThanOrEqual(totalServerLatencyMs);
        expect(providerInputTokens, 'provider input tokens match parsed usage').toBe(inputTokens);
        expect(providerOutputTokens, 'provider output tokens match parsed usage').toBe(outputTokens);
        expect(providerInputTokens, 'provider input tokens are positive').toBeGreaterThan(0);
        expect(providerOutputTokens, 'provider output tokens are positive').toBeGreaterThan(0);
        if (RUN_MODE.gating) {
          expect(
            score.passed,
            `persona ${persona.id} repeat ${repeat} scored ${score.score}/100; artifact: ${artifactPath}\n${JSON.stringify(score, null, 2)}`,
          ).toBe(true);
        } else {
          testInfo.annotations.push({
            type: 'non-gating-debug',
            description: `Score ${score.score}/100 was recorded but not acceptance-gated.`,
          });
        }
      });
    }
  }
});
