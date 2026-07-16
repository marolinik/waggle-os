/**
 * Canonical ten-persona production acceptance journey.
 *
 * Default matrix: 10 personas x 3 fresh workspace/session trials. Override the
 * repeat count with WAGGLE_PERSONA_REPEATS (1-10). This is intentionally a live
 * LLM suite; list/compile it cheaply with:
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
  parsePersonaRepeats,
  type PersonaAcceptanceCase,
} from './persona-cases';
import {
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
const REPEATS = parsePersonaRepeats(process.env.WAGGLE_PERSONA_REPEATS);
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true';
const FAILURE_COPY = /(?:Backend is offline|Chat request failed|Waggle is running in local mode|Model unavailable|Generation failed|LLM error|invalid tool call arguments|request timed out|Could not reach the AI model|API key is invalid|Something went wrong|\[TOOL_CALL\]|\[\/TOOL_CALL\])/i;
const seenWorkspaceIds = new Set<string>();
const seenSessionIds = new Set<string>();

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

interface ChatRequestPayload {
  workspaceId?: string;
  message?: string;
  sessionId?: string;
  persona?: string;
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
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

async function sendAndCapture(page: Page, prompt: string): Promise<WireTurn> {
  const target = page.locator('textarea').first();
  await target.waitFor({ state: 'visible', timeout: 15_000 });
  await target.fill(prompt, { timeout: 30_000 });

  const responsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/chat',
    { timeout: 180_000 },
  );
  const startedAt = Date.now();
  const sendButton = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first();
  if (await sendButton.isEnabled({ timeout: 800 }).catch(() => false)) {
    await sendButton.click().catch(() => target.press('Enter'));
  } else {
    await target.press('Enter');
  }

  try {
    const response = await responsePromise;
    const requestPayload = parseRequestPayload(response.request().postData());
    const body = await response.text();
    const completedAt = Date.now();
    const parsed = parseSse(body);
    const doneEvent = [...parsed.events].reverse().find(event => event.event === 'done');
    return {
      requestUrl: response.url(),
      requestPayload,
      httpStatus: response.status(),
      durationMs: completedAt - startedAt,
      events: parsed.events,
      parseErrors: parsed.errors,
      done: asRecord(doneEvent?.data),
      timedOut: false,
      transportError: null,
    };
  } catch (error) {
    return {
      requestUrl: `${BASE}/api/chat`,
      requestPayload: { message: prompt },
      httpStatus: 0,
      durationMs: Date.now() - startedAt,
      events: [],
      parseErrors: [],
      done: null,
      timedOut: true,
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchHistoryMessages(
  page: Page,
  workspaceId: string,
  sessionId: string,
): Promise<HistoryMessage[]> {
  const response = await page.request.get(
    `${BASE}/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`,
  ).catch(() => null);
  if (!response?.ok()) return [];
  const body = await response.json().catch(() => null) as { messages?: HistoryMessage[] } | null;
  return Array.isArray(body?.messages) ? body.messages : [];
}

async function waitForPersistedResponse(
  page: Page,
  workspaceId: string,
  sessionId: string,
  responseText: string,
): Promise<HistoryMessage[]> {
  let latest: HistoryMessage[] = [];
  for (let attempt = 0; attempt < 90; attempt++) {
    latest = await fetchHistoryMessages(page, workspaceId, sessionId);
    const assistant = [...latest].reverse().find(message => message.role === 'assistant');
    if (String(assistant?.content ?? '').trim() === responseText.trim()) return latest;
    await page.waitForTimeout(1_000);
  }
  return latest;
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
test.describe.configure({ timeout: 300_000 });

test.describe(`10-persona acceptance (${REPEATS} repeats each)`, () => {
  for (const persona of PERSONA_CASES) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      test(`persona:${persona.id}:repeat:${repeat}`, async ({ page }, testInfo) => {
        mkdirSync(ARTIFACTS, { recursive: true });
        const runStartedAt = new Date().toISOString();
        const consoleCapture: ConsoleCapture = attachConsoleCapture(page);
        const screenshotErrors: string[] = [];
        const screenshots: string[] = [];
        const workspace = await createPersonaWorkspace(page, persona, repeat);

        await gotoDesktop(page);
        await openPersonaChat(page, workspace.workspaceId);
        const wire = await sendAndCapture(page, persona.prompt);
        const requestPrompt = String(wire.requestPayload.message ?? '');
        const sessionId = String(wire.requestPayload.sessionId ?? '');
        const requestPersonaId = typeof wire.requestPayload.persona === 'string'
          ? wire.requestPayload.persona
          : null;
        expect(requestPrompt, 'exact browser prompt').toBe(persona.prompt);
        expect(wire.requestPayload.workspaceId, 'exact browser workspace').toBe(workspace.workspaceId);
        expect(sessionId, 'browser supplied a fresh session id').toMatch(/\S/);
        expect(seenSessionIds.has(sessionId), 'session id was not reused by another trial').toBe(false);
        seenSessionIds.add(sessionId);

        const responseText = String(wire.done?.content ?? '');
        const usage = asRecord(wire.done?.usage);
        const tokens = asRecord(wire.done?.tokens);
        const toolsUsed = Array.isArray(wire.done?.toolsUsed)
          ? wire.done.toolsUsed.filter((name): name is string => typeof name === 'string')
          : [];
        const inputTokens = numeric(usage?.inputTokens ?? usage?.prompt_tokens ?? tokens?.input);
        const outputTokens = numeric(usage?.outputTokens ?? usage?.completion_tokens ?? tokens?.output);
        const toolEvents = wire.events.filter(event => event.event === 'tool' || event.event === 'tool_result');

        const history = responseText
          ? await waitForPersistedResponse(page, workspace.workspaceId, sessionId, responseText)
          : await fetchHistoryMessages(page, workspace.workspaceId, sessionId);
        const persistedAssistant = [...history].reverse().find(message => message.role === 'assistant');
        const persistedResponse = String(persistedAssistant?.content ?? '');
        const persistedConversation = history
          .map(message => `${message.role ?? 'unknown'}: ${message.content ?? ''}`)
          .join('\n\n');
        const leakedSnippets = otherPersonaSnippets(persona)
          .filter(snippet => persistedConversation.includes(snippet));

        await scrollConversationToEnd(page);
        const stem = artifactName(persona, repeat, testInfo, workspace.workspaceId);
        const chatScreenshot = await captureScreenshot(
          page,
          join(ARTIFACTS, `${stem}-chat.png`),
          screenshotErrors,
        );
        if (chatScreenshot) screenshots.push(chatScreenshot);
        const renderedConversation = await page.locator('body').innerText().catch(() => '');

        await page.goto(
          `${BASE}/workspaces/${encodeURIComponent(workspace.workspaceId)}/memory?${SKIP_PARAMS}`,
          { waitUntil: 'domcontentloaded' },
        );
        const memoryJourneyOk = await page
          .waitForSelector('main, [data-testid="ws-memory-tab"], [data-testid="memory-center-app"]', { timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        await page.waitForTimeout(800);
        const memoryScreenshot = await captureScreenshot(
          page,
          join(ARTIFACTS, `${stem}-memory.png`),
          screenshotErrors,
        );
        if (memoryScreenshot) screenshots.push(memoryScreenshot);
        const memoryText = await page.locator('body').innerText().catch(() => '');
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
            || FAILURE_COPY.test(responseText),
          codeValidation: {
            pythonSyntaxValid: pythonValidation.syntaxValid,
            pythonImportsPresent: pythonValidation.importsPresent,
          },
        };
        const score = scorePersonaTrial(persona, evidence);
        const artifact = {
          schemaVersion: 2,
          runStartedAt,
          runCompletedAt: new Date().toISOString(),
          persona: {
            id: persona.id,
            label: persona.label,
            repeat,
            repeatCount: REPEATS,
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
            persistedExact: persistedResponse,
            httpStatus: wire.httpStatus,
            model: wire.done?.model ?? null,
            durationMs: wire.durationMs,
            tokens: { input: inputTokens, output: outputTokens },
            toolsUsed,
            toolEvents,
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

        expect(renderedConversation.length, 'browser rendered the conversation journey').toBeGreaterThan(50);
        expect(memoryJourneyOk, 'memory surface remained usable').toBe(true);
        expect(sessionCount, 'workspace context recorded the fresh session').toBeGreaterThanOrEqual(1);
        expect(leakedSnippets, 'no cross-persona prompt leaked into persisted history').toEqual([]);
        expect(
          score.passed,
          `persona ${persona.id} repeat ${repeat} scored ${score.score}/100; artifact: ${artifactPath}\n${JSON.stringify(score, null, 2)}`,
        ).toBe(true);
      });
    }
  }
});
