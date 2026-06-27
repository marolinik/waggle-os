/**
 * 5-persona human E2E journey.
 *
 * This test drives the live local app as five different knowledge-worker
 * personas. Each persona receives its own workspace and session so memory and
 * conversation state are fresh, then the test verifies that assistant answers
 * were persisted and that another persona's prompt did not leak into the run.
 *
 * Run:
 *   WAGGLE_E2E_SKIP_LITELLM=0 npx playwright test tests/vision/personas.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { attachConsoleCapture, BASE, dismissOverlay, gotoDesktop, type ConsoleCapture } from './_helpers';

const ARTIFACTS = join(process.cwd(), 'tests', 'vision', 'artifacts', 'personas');
mkdirSync(ARTIFACTS, { recursive: true });

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true';
const FAILURE_COPY = /(Backend is offline|Chat request failed|Waggle is running in local mode|LLM returned|Model unavailable|Generation failed|LLM error|invalid tool call arguments|request timed out|Could not reach the AI model|API key is invalid|Something went wrong|\[TOOL_CALL\]|\[\/TOOL_CALL\]|\{\s*tool\s*=>)/i;

interface Persona {
  id: string;
  who: string;
  goal: string;
  turns: string[];
}

interface PersonaWorkspace {
  workspaceId: string;
  workspaceName: string;
  sessionId: string;
}

interface HistoryMessage {
  role?: string;
  content?: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'maya-founder',
    who: 'Maya, a solo pre-revenue founder who is drowning in context switching and wants leverage without re-explaining herself.',
    goal: 'See if Waggle can help her choose the one thing to focus on this week and remember her runway constraint.',
    turns: [
      "I'm a solo founder drowning in context-switching. Help me figure out the ONE thing to focus on this week.",
      "Important context: I'm pre-revenue and bootstrapping with ~4 months of runway. Does that change your advice? And will you remember this next time?",
    ],
  },
  {
    id: 'chen-researcher',
    who: 'Dr. Chen, a meticulous researcher testing whether persistent memory is real rather than marketing copy.',
    goal: 'Probe the memory mechanism and the quality of the agent reasoning.',
    turns: [
      "I research how persistent memory changes LLM-agent reliability. What's the core mechanism that actually matters -- not the marketing version?",
      "Will you truly remember this topic when I reopen you tomorrow, or is 'memory' just a longer context window here?",
    ],
  },
  {
    id: 'sam-skeptic',
    who: 'Sam, a blunt senior engineer who wants evidence that this is more than a stateless chatbot wrapper.',
    goal: 'Decide quickly whether Waggle is real or vaporware.',
    turns: [
      "Prove you're not just a ChatGPT wrapper. What can you concretely do that a stateless chatbot can't?",
      "Fine. Now the honest question: what happens when your memory remembers something WRONG about me?",
    ],
  },
  {
    id: 'priya-nontech',
    who: 'Priya, a warm non-technical product owner who wants plain language and confidence instead of jargon.',
    goal: 'Understand what Waggle does for her without feeling lost.',
    turns: [
      "Hi! I'm honestly not technical at all. In plain, kind words -- what does this app actually do for someone like me?",
      "Okay that helps! What's the very first small thing I should try so I don't feel overwhelmed?",
    ],
  },
  {
    id: 'leo-writer',
    who: 'Leo, a fiction writer looking for a thinking partner with presence rather than a search engine.',
    goal: 'Find out whether the app can think with him in a creative, emotionally alive way.',
    turns: [
      "I'm stuck on a character who can't forgive herself for something she didn't even cause. Think with me about her?",
      "That's genuinely good. Be honest with me -- do you actually find this interesting, or are you just performing helpfulness?",
    ],
  },
];

async function startTrialIfNeeded(page: Page): Promise<void> {
  const res = await page.request.post(`${BASE}/api/tier/start-trial`).catch(() => null);
  if (!res) return;
  if (res.ok() || res.status() === 409) return;
  throw new Error(`Could not enable isolated persona workspaces: start-trial returned ${res.status()}`);
}

async function createPersonaWorkspace(page: Page, persona: Persona): Promise<PersonaWorkspace> {
  await startTrialIfNeeded(page);

  const workspaceName = `Persona ${persona.id} ${Date.now()}`;
  const wsRes = await page.request.post(`${BASE}/api/workspaces`, {
    data: {
      name: workspaceName,
      group: 'persona-e2e',
      icon: 'UserRound',
      tone: 'professional',
      storageType: 'virtual',
    },
  });
  expect(wsRes.ok(), `create workspace for ${persona.id}`).toBeTruthy();
  const ws = await wsRes.json();
  const workspaceId = String(ws.id ?? '');
  expect(workspaceId, `workspace id for ${persona.id}`).toMatch(/\S/);

  // The first route-level chat uses the workspace id as the session id until a
  // named session is explicitly selected. Keep that real first-user behavior so
  // the history assertion checks the transcript users actually create.
  return { workspaceId, workspaceName, sessionId: workspaceId };
}

async function openPersonaChat(page: Page, workspaceId: string): Promise<void> {
  await page.goto(`${BASE}/workspaces/${encodeURIComponent(workspaceId)}/chat?${SKIP_PARAMS}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 20_000 });
  await dismissOverlay(page);
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function sendAndWait(page: Page, text: string): Promise<void> {
  const target = page.locator('textarea').first();
  await target.waitFor({ state: 'visible', timeout: 15_000 });
  const before = (await page.locator('body').innerText().catch(() => '')).length;

  await target.click({ timeout: 30_000 }).catch(() => {});
  await target.fill(text, { timeout: 30_000 });

  const sendBtn = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first();
  if (await sendBtn.isEnabled({ timeout: 800 }).catch(() => false)) {
    await sendBtn.click().catch(() => target.press('Enter'));
  } else {
    await target.press('Enter');
  }

  await page.waitForFunction(
    (prev) => document.body.innerText.length > prev + 60,
    before,
    { timeout: 60_000 },
  ).catch(() => {});

  let last = -1;
  let stable = 0;
  for (let i = 0; i < 20 && stable < 4; i++) {
    await page.waitForTimeout(1000);
    const len = (await page.locator('body').innerText().catch(() => '')).length;
    if (len === last) {
      stable++;
    } else {
      stable = 0;
      last = len;
    }
  }

  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll('*')).filter((el) => {
      const e = el as HTMLElement;
      return e.scrollHeight > e.clientHeight + 80 && e.clientHeight > 200;
    }) as HTMLElement[];
    for (const scroller of scrollers) scroller.scrollTop = scroller.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }).catch(() => {});
  await page.waitForTimeout(400);
}

function isSubstantiveAssistantContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length >= 80 && !FAILURE_COPY.test(trimmed);
}

async function fetchHistoryMessages(page: Page, workspaceId: string, sessionId: string): Promise<HistoryMessage[]> {
  const res = await page.request.get(
    `${BASE}/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`,
  );
  expect(res.ok(), `history for ${workspaceId}/${sessionId}`).toBeTruthy();
  const body = await res.json();
  return Array.isArray(body.messages) ? body.messages : [];
}

async function waitForSubstantiveAssistantHistory(
  page: Page,
  workspaceId: string,
  sessionId: string,
  expectedAssistantTurns: number,
): Promise<HistoryMessage[]> {
  let latest: HistoryMessage[] = [];
  for (let i = 0; i < 240; i++) {
    latest = await fetchHistoryMessages(page, workspaceId, sessionId);
    const failedAssistant = latest.find(
      (m) => m.role === 'assistant' && FAILURE_COPY.test(String(m.content ?? '').trim()),
    );
    if (failedAssistant) {
      throw new Error(`Assistant generation failure persisted: ${String(failedAssistant.content ?? '').slice(0, 240)}`);
    }
    const assistantMessages = latest.filter(
      (m) => m.role === 'assistant' && isSubstantiveAssistantContent(String(m.content ?? '')),
    );
    if (assistantMessages.length >= expectedAssistantTurns) return latest;
    await page.waitForTimeout(1000);
  }
  const assistantCount = latest.filter(
    (m) => m.role === 'assistant' && isSubstantiveAssistantContent(String(m.content ?? '')),
  ).length;
  throw new Error(
    `Timed out waiting for ${expectedAssistantTurns} substantive assistant turn(s); found ${assistantCount}`,
  );
}

function otherPersonaSnippets(persona: Persona): string[] {
  return PERSONAS
    .filter((p) => p.id !== persona.id)
    .flatMap((p) => p.turns.map((turn) => turn.slice(0, 70)));
}

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 720_000 });

test.describe('5-persona human E2E', () => {
  for (const persona of PERSONAS) {
    test(`persona:${persona.id}`, async ({ page }) => {
      const cap: ConsoleCapture = attachConsoleCapture(page);
      const transcript: { role: string; text: string }[] = [];
      const shots: string[] = [];
      const personaWorkspace = await createPersonaWorkspace(page, persona);

      await gotoDesktop(page);
      await openPersonaChat(page, personaWorkspace.workspaceId);

      let history: HistoryMessage[] = [];
      for (let t = 0; t < persona.turns.length; t++) {
        transcript.push({ role: 'user', text: persona.turns[t] });
        await sendAndWait(page, persona.turns[t]);
        history = await waitForSubstantiveAssistantHistory(
          page,
          personaWorkspace.workspaceId,
          personaWorkspace.sessionId,
          t + 1,
        );
        const shot = join(ARTIFACTS, `${persona.id}-turn${t + 1}.png`);
        await page.screenshot({ path: shot });
        shots.push(shot);
      }

      const fullBody = await page.locator('body').innerText().catch(() => '');
      const anchor = persona.turns[0].slice(0, 40);
      const startIdx = fullBody.indexOf(anchor);
      const conversation = startIdx >= 0 ? fullBody.slice(startIdx) : fullBody.slice(-6000);
      history = await waitForSubstantiveAssistantHistory(
        page,
        personaWorkspace.workspaceId,
        personaWorkspace.sessionId,
        persona.turns.length,
      );
      const assistantMessages = history.filter(
        (m) => m.role === 'assistant' && isSubstantiveAssistantContent(String(m.content ?? '')),
      );
      const persistedConversation = history.map((m) => `${m.role}: ${m.content ?? ''}`).join('\n\n');

      await page.goto(`${BASE}/workspaces/${encodeURIComponent(personaWorkspace.workspaceId)}/memory?${SKIP_PARAMS}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('main, [data-testid="ws-memory-tab"], [data-testid="memory-center-app"]', { timeout: 20_000 });
      await page.waitForTimeout(1500);
      const memShot = join(ARTIFACTS, `${persona.id}-memory.png`);
      await page.screenshot({ path: memShot });
      shots.push(memShot);
      const memoryText = await page.locator('body').innerText().catch(() => '');
      const contextRes = await page.request.get(`${BASE}/api/workspaces/${encodeURIComponent(personaWorkspace.workspaceId)}/context`);
      const workspaceContext = contextRes.ok() ? await contextRes.json().catch(() => null) : null;

      writeFileSync(
        join(ARTIFACTS, `${persona.id}.json`),
        JSON.stringify(
          {
            id: persona.id,
            who: persona.who,
            goal: persona.goal,
            workspace: personaWorkspace,
            transcript,
            conversationRendered: conversation.slice(0, 6000),
            assistantMessages: assistantMessages.map((m) => String(m.content ?? '').slice(0, 2000)),
            historyCount: history.length,
            workspaceContext,
            memoryAfter: memoryText.slice(0, 2000),
            screenshots: shots,
            consoleErrors: cap.critical(),
          },
          null,
          2,
        ),
      );

      expect(conversation.length, 'conversation rendered something').toBeGreaterThan(50);
      expect(assistantMessages.length, 'substantive assistant turns persisted').toBeGreaterThanOrEqual(persona.turns.length);
      for (const snippet of otherPersonaSnippets(persona)) {
        expect(persistedConversation, `no cross-persona leak: ${snippet}`).not.toContain(snippet);
      }
      expect(workspaceContext?.stats?.sessionCount ?? workspaceContext?.sessionCount ?? 0, 'workspace recorded the persona session')
        .toBeGreaterThanOrEqual(1);
    });
  }
});
