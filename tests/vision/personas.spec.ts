/**
 * Canonical ten-persona production acceptance journey.
 *
 * Acceptance matrix: exactly 10 personas x 3 fresh workspace/session trials,
 * with no retries. A smaller diagnostic run requires both
 * WAGGLE_PERSONA_NON_GATING_DEBUG=1 and WAGGLE_PERSONA_REPEATS (1-10).
 * This is intentionally a live LLM suite; list/compile it cheaply with:
 *   npx playwright test tests/vision/personas.spec.ts --list
 * Run the expensive matrix through the built-in proxy with a real provider:
 *   WAGGLE_E2E_SKIP_LITELLM=1 npx playwright test tests/vision/personas.spec.ts
 */
import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import {
  PERSONA_CASES,
  resolvePersonaRunMode,
  type PersonaAcceptanceCase,
} from './persona-cases';
import {
  containsFailureCopy,
  extractMarkdownCodeSegments,
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
  redactDiagnosticText,
  redactDiagnosticUrl,
  type ConsoleCapture,
} from './_helpers';

const ARTIFACTS = resolve(
  process.env.WAGGLE_PERSONA_ARTIFACT_DIR
    ?? join(process.cwd(), 'output', 'playwright', 'personas'),
);
const ACCEPTANCE_RUN_ID = process.env.WAGGLE_PERSONA_RUN_ID?.trim() || null;
const EXPECTED_LLM_PROVIDER = process.env.WAGGLE_PERSONA_EXPECTED_LLM_PROVIDER?.trim() || null;
const EXPECTED_LLM_DETAIL = process.env.WAGGLE_PERSONA_EXPECTED_LLM_DETAIL?.trim() || null;

function gitOutput(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

const SOURCE_REVISION = gitOutput(['rev-parse', 'HEAD']);
const RELEVANT_WORKTREE_STATUS = gitOutput([
  'status',
  '--porcelain',
  '--untracked-files=all',
  '--',
  '.',
  ':(exclude)output/**',
  ':(exclude)test-results/**',
  ':(exclude)playwright-report/**',
  ':(exclude).playwright-cli/**',
]);
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

function normalizeEol(value: string): string {
  return value.replace(/\r\n?/g, '\n');
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
      errors.push(redactDiagnosticText(
        `${event}: ${error instanceof Error ? error.message : String(error)}`,
      ));
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
  const sanitized = redactDiagnosticText(message);
  denial.transportError = denial.transportError
    ? `${denial.transportError} ${sanitized}`
    : sanitized;
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
      __wagglePersonaChatCapture?: BrowserChatCaptureRegistry;
    };
    const registry = scope.__wagglePersonaChatCapture ?? {
      captures: [],
      restore: null,
    };
    scope.__wagglePersonaChatCapture = registry;
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
          const clone = response.clone();
          const reader = clone.body?.getReader();
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

async function readCapturedChatBody(
  page: Page,
  cursor: number,
  deadlineAt: number,
): Promise<Buffer> {
  await page.waitForFunction((captureCursor) => {
    const scope = window as typeof window & {
      __wagglePersonaChatCapture?: {
        captures: Array<{ settled: boolean }>;
      };
    };
    return scope.__wagglePersonaChatCapture?.captures[captureCursor]?.settled === true;
  }, cursor, {
    timeout: remainingDeadlineMs(deadlineAt, 'capturing the chat wire response'),
  });
  const capture = await page.evaluate((captureCursor) => {
    const scope = window as typeof window & {
      __wagglePersonaChatCapture?: {
        captures: Array<{
          bodyText: string;
          error: string | null;
          terminal: boolean;
        }>;
      };
    };
    return scope.__wagglePersonaChatCapture?.captures[captureCursor] ?? null;
  }, cursor);
  if (!capture) throw new Error('Chat wire capture did not observe a successful SSE response.');
  if (!capture.terminal) {
    throw new Error(capture.error ?? 'Chat wire capture ended before a terminal SSE event.');
  }
  return Buffer.from(capture.bodyText, 'utf8');
}

async function disarmChatWireCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as typeof window & {
      __wagglePersonaChatCapture?: { restore: (() => void) | null };
    };
    scope.__wagglePersonaChatCapture?.restore?.();
  }).catch(() => {});
}

function isTimeoutFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /(?:timed out|timeout|deadline expired)/i.test(message);
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
      screenshotError = redactDiagnosticText(error instanceof Error ? error.message : String(error));
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
    denial.requestUrl = requestUrl ? redactDiagnosticUrl(requestUrl) : null;
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
  let requestUrl = redactDiagnosticUrl(`${BASE}/api/chat`);
  let requestPayload: ChatRequestPayload = { message: prompt };
  let httpStatus = 0;
  let captureCursor: number | null = null;
  try {
    await target.waitFor({ state: 'visible', timeout: 15_000 });
    await target.fill(prompt, { timeout: 30_000 });
    captureCursor = await armChatWireCapture(page);
    const requestResult = page.waitForRequest(
      request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/chat',
      { timeout: remainingDeadlineMs(deadlineAt, 'waiting for chat request') },
    ).then(
      request => ({ request, error: null }),
      error => ({ request: null, error }),
    );
    const isChatResponse = (response: Response) =>
      response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/chat';
    const firstResponseResult = page.waitForResponse(
      isChatResponse,
      { timeout: remainingDeadlineMs(deadlineAt, 'waiting for chat response headers') },
    ).then(
      response => ({ response, error: null }),
      error => ({ response: null, error }),
    );
    let observedChatResponses = 0;
    const retryResponseResult = page.waitForResponse(
      response => {
        if (!isChatResponse(response)) return false;
        observedChatResponses += 1;
        return observedChatResponses === 2;
      },
      { timeout: 0 },
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

    const [requestOutcome, firstResponseOutcome] = await Promise.all([requestResult, firstResponseResult]);
    if (requestOutcome.request) {
      requestUrl = redactDiagnosticUrl(requestOutcome.request.url());
      requestPayload = parseRequestPayload(requestOutcome.request.postData());
    }
    if (firstResponseOutcome.error) throw firstResponseOutcome.error;
    let response = firstResponseOutcome.response;
    if (!response) throw new Error('Chat response headers were not captured.');
    httpStatus = response.status();
    if (response.status() === 401) {
      const retryWaitMs = remainingDeadlineMs(
        deadlineAt,
        'waiting for the authorized chat retry',
        20_000,
      );
      const retryOutcome = await Promise.race([
        retryResponseResult,
        page.waitForTimeout(retryWaitMs).then(() => {
          throw new Error('Chat request remained unauthorized after HTTP 401; no retry response arrived.');
        }),
      ]);
      if (retryOutcome.error) throw retryOutcome.error;
      if (!retryOutcome.response) {
        throw new Error('Authorized chat retry response headers were not captured.');
      }
      response = retryOutcome.response;
    }
    if (!requestOutcome.request) {
      requestUrl = redactDiagnosticUrl(response.url());
      requestPayload = parseRequestPayload(response.request().postData());
    }
    httpStatus = response.status();
    const responseContentType = response.headers()['content-type'] ?? '';
    if (!response.ok() || !responseContentType.toLowerCase().includes('text/event-stream')) {
      throw new Error(
        `Chat response was HTTP ${httpStatus} with content type ${responseContentType || '(missing)'}.`,
      );
    }
    // Playwright's response.text() can honor a missing/legacy HTTP charset and
    // mojibake UTF-8 punctuation on Windows. The chat wire contract is UTF-8;
    // decode the captured bytes explicitly so wire, UI, and persisted evidence
    // are compared without a test-harness encoding artifact.
    const body = (await captureBodyWithApprovalDenials(
      page,
      readCapturedChatBody(page, captureCursor, deadlineAt),
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
      timedOut: isTimeoutFailure(error),
      transportError: redactDiagnosticText(error instanceof Error ? error.message : String(error)),
      approvalAutoDenials,
    };
  } finally {
    if (captureCursor !== null) await disarmChatWireCapture(page);
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

async function readCopiedAssistantResponse(page: Page): Promise<string> {
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

interface VisibleAssistantEvidence {
  text: string;
  codeSegments: string[];
}

async function readVisibleAssistantEvidence(page: Page): Promise<VisibleAssistantEvidence> {
  const copyButton = page.getByTestId('chat-msg-copy').last();
  await copyButton.waitFor({ state: 'visible', timeout: 10_000 });
  const turn = copyButton.locator('xpath=ancestor::div[contains(@class,"group/turn")][1]');
  const content = turn.locator('xpath=.//div[contains(@class,"group/msg")][1]');
  await content.waitFor({ state: 'visible', timeout: 10_000 });
  return {
    text: await content.innerText(),
    codeSegments: await content.locator('code').allTextContents(),
  };
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
    errors.push(redactDiagnosticText(error instanceof Error ? error.message : String(error)));
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

test('persona harness distinguishes transport failures from response deadlines', () => {
  expect(isTimeoutFailure(new Error(
    'response.body: Protocol error (Network.getResponseBody): No data found for resource',
  ))).toBe(false);
  expect(isTimeoutFailure(new Error(
    'Chat response body deadline expired while waiting for stream completion.',
  ))).toBe(true);
});

test('persona harness captures completed SSE when the browser consumer cancels after done', async ({ page }) => {
  const responsePrefix = [
    'event: token',
    'data: {"content":"captured"}',
    '',
    'event: done',
  ].join('\n') + '\n';
  const terminalDataLine = 'data: {"content":"captured"}\n';
  const terminalData = 'data: {"content":"captured"}\n\n';
  const duplicateTerminal = 'event: done\ndata: {"content":"captured"}\n\n';
  const server = createServer((request, response) => {
    if (request.url === '/api/chat') {
      let requestBody = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { requestBody += chunk; });
      request.on('end', () => {
        const message = (JSON.parse(requestBody) as { message?: string }).message;
        if (message === 'http failure' || message?.startsWith('auth ')) {
          const status = message === 'http failure' ? 500 : 401;
          response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: `synthetic ${status}` }));
          return;
        }
        response.writeHead(200, {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'content-type': 'text/event-stream; charset=utf-8',
        });
        response.flushHeaders();
        response.write(responsePrefix);
        const splitBeforeDelimiter = message === 'capture split terminal';
        const sendTerminal = setTimeout(
          () => response.write(splitBeforeDelimiter ? terminalDataLine : terminalData),
          25,
        );
        const completeTransport = setTimeout(
          () => response.end(splitBeforeDelimiter ? '\n' : duplicateTerminal),
          200,
        );
        response.once('close', () => {
          clearTimeout(sendTerminal);
          clearTimeout(completeTransport);
        });
      });
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end([
      '<textarea></textarea>',
      '<button aria-label="Send">Send</button>',
      '<script>',
      'document.querySelector("button").addEventListener("click", async () => {',
      '  const message = document.querySelector("textarea").value;',
      '  const controller = new AbortController();',
      '  const send = () => fetch("/api/chat", {',
      '    method: "POST",',
      '    headers: { "content-type": "application/json" },',
      '    body: JSON.stringify({ message }),',
      '    signal: controller.signal,',
      '  });',
      '  let response = await send();',
      '  if (response.status === 401 && message !== "auth refresh failure") response = await send();',
      '  const reader = response.body.getReader();',
      '  const decoder = new TextDecoder();',
      '  let body = "";',
      '  while (true) {',
      '    const chunk = await reader.read();',
      '    if (chunk.done) break;',
      '    body += decoder.decode(chunk.value, { stream: true });',
      '    if (/event: done\\r?\\ndata: [^\\n]+\\r?\\n/.test(body)) {',
      '      if (message === "capture split terminal") controller.abort();',
      '      await reader.cancel();',
      '      break;',
      '    }',
      '  }',
      '});',
      '</script>',
    ].join(''));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Synthetic chat server did not bind.');
    await page.goto(`http://127.0.0.1:${address.port}`);

    const splitWire = await sendAndCapture(page, 'capture split terminal', {
      bodyTimeoutMs: 3_000,
      approvalScreenshotPrefix: join(ARTIFACTS, 'harness-split-terminal'),
    });
    expect(splitWire.transportError).toBeNull();
    expect(splitWire.timedOut).toBe(false);
    expect(splitWire.done).toMatchObject({ content: 'captured' });
    expect(splitWire.events.filter(event => event.event === 'done')).toHaveLength(1);

    const wire = await sendAndCapture(page, 'capture this', {
      bodyTimeoutMs: 3_000,
      approvalScreenshotPrefix: join(ARTIFACTS, 'harness-cancelled-stream'),
    });

    expect(wire.transportError).toBeNull();
    expect(wire.timedOut).toBe(false);
    expect(wire.done).toMatchObject({ content: 'captured' });
    expect(wire.events.filter(event => event.event === 'done')).toHaveLength(2);

    const httpFailure = await sendAndCapture(page, 'http failure', {
      bodyTimeoutMs: 3_000,
      approvalScreenshotPrefix: join(ARTIFACTS, 'harness-http-failure'),
    });
    expect(httpFailure.requestPayload.message).toBe('http failure');
    expect(httpFailure.httpStatus).toBe(500);
    expect(httpFailure.timedOut).toBe(false);
    expect(httpFailure.transportError).toContain(
      'HTTP 500 with content type application/json; charset=utf-8',
    );

    const authFailure = await sendAndCapture(page, 'auth retry failure', {
      bodyTimeoutMs: 3_000,
      approvalScreenshotPrefix: join(ARTIFACTS, 'harness-auth-retry-failure'),
    });
    expect(authFailure.httpStatus).toBe(401);
    expect(authFailure.timedOut).toBe(false);
    expect(authFailure.transportError).toContain('HTTP 401');

    const authRefreshFailure = await sendAndCapture(page, 'auth refresh failure', {
      bodyTimeoutMs: 800,
      approvalScreenshotPrefix: join(ARTIFACTS, 'harness-auth-refresh-failure'),
    });
    expect(authRefreshFailure.httpStatus).toBe(401);
    expect(authRefreshFailure.timedOut).toBe(false);
    expect(authRefreshFailure.transportError).toContain('remained unauthorized after HTTP 401');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
});

test.describe(`10-persona ${RUN_MODE.gating ? 'acceptance' : 'NON-GATING DEBUG'} (${REPEATS} repeats each)`, () => {
  test.beforeAll(async ({ request }) => {
    if (RUN_MODE.gating) {
      expect(
        process.env.WAGGLE_E2E_REUSE_EXISTING_SERVER,
        'paid acceptance requires a freshly built server (WAGGLE_E2E_REUSE_EXISTING_SERVER=0)',
      ).toBe('0');
      expect(ACCEPTANCE_RUN_ID, 'paid acceptance requires WAGGLE_PERSONA_RUN_ID').toMatch(/\S/);
      expect(
        EXPECTED_LLM_PROVIDER,
        'paid acceptance requires WAGGLE_PERSONA_EXPECTED_LLM_PROVIDER',
      ).toMatch(/\S/);
      expect(
        EXPECTED_LLM_DETAIL,
        'paid acceptance requires WAGGLE_PERSONA_EXPECTED_LLM_DETAIL',
      ).toMatch(/\S/);
    }
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
        const estimatedCostUsd = numeric(wire.done?.cost);
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

        const runtimeHealthResponse = await page.request.get(`${BASE}/health`).catch(() => null);
        const runtimeHealth = runtimeHealthResponse?.ok()
          ? await runtimeHealthResponse.json().catch(() => null) as Record<string, unknown> | null
          : null;
        const runtimeLlm = asRecord(runtimeHealth?.llm);
        const runtimeLlmHealthy = runtimeHealthResponse?.ok() === true
          && runtimeLlm?.health === 'healthy'
          && (!EXPECTED_LLM_PROVIDER || runtimeLlm?.provider === EXPECTED_LLM_PROVIDER)
          && (!EXPECTED_LLM_DETAIL
            || String(runtimeLlm?.detail ?? '').includes(EXPECTED_LLM_DETAIL));

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
        const copiedAssistantResponse = await readCopiedAssistantResponse(page);
        const visibleAssistant = await readVisibleAssistantEvidence(page);
        const expectedCodeSegments = extractMarkdownCodeSegments(responseText);

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
        const criticalNetworkFailures = consoleCapture.networkFailures.filter(
          failure => !/net::ERR_ABORTED/i.test(failure),
        );
        const criticalBrowserErrors = [
          ...consoleCapture.critical(),
          ...consoleCapture.pageErrors,
          ...criticalNetworkFailures,
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
          // Kept as the exact copied source for scorer/backward compatibility;
          // visible DOM fidelity is captured and asserted separately below.
          renderedAssistantResponse: copiedAssistantResponse,
          visibleAssistantText: visibleAssistant.text,
          visibleCodeSegments: visibleAssistant.codeSegments,
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
            || !runtimeLlmHealthy
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
          schemaVersion: 7,
          runId: ACCEPTANCE_RUN_ID,
          runStartedAt,
          runCompletedAt: new Date().toISOString(),
          source: {
            gitRevision: SOURCE_REVISION,
            relevantWorkingTreeClean: RELEVANT_WORKTREE_STATUS === '',
            relevantWorkingTreeStatus: RELEVANT_WORKTREE_STATUS?.split(/\r?\n/).filter(Boolean) ?? null,
          },
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
            renderedAssistantExact: copiedAssistantResponse,
            copiedAssistantExact: copiedAssistantResponse,
            visibleAssistantTextExact: visibleAssistant.text,
            expectedCodeSegmentsExact: expectedCodeSegments,
            visibleCodeSegmentsExact: visibleAssistant.codeSegments,
            persistedExact: persistedResponse,
            persistedPromptExact: persistedPrompt,
            persistedSessionId: historyResponse?.sessionId ?? null,
            persistedMessageCount: history.length,
            doneEventCount,
            httpStatus: wire.httpStatus,
            model: wire.done?.model ?? null,
            estimatedCostUsd,
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
          runtime: {
            healthStatus: runtimeHealthResponse?.status() ?? null,
            health: runtimeHealth,
            llmHealthy: runtimeLlmHealthy,
            expectedProvider: EXPECTED_LLM_PROVIDER,
            expectedDetail: EXPECTED_LLM_DETAIL,
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
            criticalNetworkFailures,
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
        expect(runtimeHealthResponse?.ok(), 'runtime health endpoint responded after the provider turn').toBe(true);
        expect(runtimeLlm?.health, 'runtime LLM health is verified after the provider turn').toBe('healthy');
        if (EXPECTED_LLM_PROVIDER) {
          expect(runtimeLlm?.provider, 'runtime used the required LLM provider path')
            .toBe(EXPECTED_LLM_PROVIDER);
        }
        if (EXPECTED_LLM_DETAIL) {
          expect(String(runtimeLlm?.detail ?? ''), 'runtime verified the required provider detail')
            .toContain(EXPECTED_LLM_DETAIL);
        }
        expect(criticalNetworkFailures, 'browser had no non-aborted network failures').toEqual([]);
        expect(doneEventCount, 'SSE stream emitted exactly one done event').toBe(1);
        expect(normalizeText(tokenStreamResponse), 'SSE token stream was non-empty').not.toBe('');
        expect(
          normalizeText(tokenStreamResponse),
          'reconstructed SSE tokens exactly matched the done response',
        ).toBe(normalizeText(responseText));
        expect(
          normalizeText(copiedAssistantResponse),
          'copy action preserved the exact SSE token stream',
        ).toBe(normalizeText(tokenStreamResponse));
        expect(
          visibleAssistant.text.trim(),
          'assistant response rendered substantive visible DOM text',
        ).not.toBe('');
        expect(
          visibleAssistant.codeSegments.map(normalizeEol),
          'visible inline and fenced code exactly matched the response Markdown',
        ).toEqual(expectedCodeSegments.map(normalizeEol));
        if (persona.id === 'coder' || persona.id === 'data-engineer') {
          expect(
            expectedCodeSegments.length,
            `${persona.id} response included code that was verified in the visible DOM`,
          ).toBeGreaterThan(0);
        }
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
          expect(estimatedCostUsd, 'Waggle returned a positive paid-call cost estimate').toBeGreaterThan(0);
        }
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
