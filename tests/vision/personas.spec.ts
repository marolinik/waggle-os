/**
 * 5-persona HUMAN E2E — journey + capture phase.
 *
 * Drives the LIVE Path-2 app (real Anthropic replies) through 5 distinct human
 * personas, capturing REAL screens + REAL agent responses into artifacts/ for
 * the reaction Workflow (scripts/persona-reactor-workflow.mjs) to react to
 * in-character: real feelings, emotional bonding, friction.
 *
 * Grounded in reality (per the Workflow-Reality-Check rule): personas react to
 * what the app ACTUALLY did, not an imagined session. Requires a real-LLM
 * server on :3333 (reuseExistingServer picks up a Path-2 sidecar).
 *
 * Run: npx playwright test tests/vision/personas.spec.ts
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { attachConsoleCapture, gotoDesktop, openAppViaDock, type ConsoleCapture } from './_helpers';

const ARTIFACTS = join(process.cwd(), 'tests', 'vision', 'artifacts', 'personas');
mkdirSync(ARTIFACTS, { recursive: true });

interface Persona {
  id: string;
  who: string;          // archetype, for the reactor's voice
  goal: string;         // what they came to do
  turns: string[];      // what they actually type (2 turns)
}

const PERSONAS: Persona[] = [
  {
    id: 'maya-founder',
    who: 'Maya — a solo, pre-revenue founder, time-starved, drowning in context-switching. Skeptical of yet another tool but desperate for leverage. Cares whether it REMEMBERS her so she stops re-explaining herself.',
    goal: 'See if this can actually help me think, and whether it remembers my context.',
    turns: [
      "I'm a solo founder drowning in context-switching. Help me figure out the ONE thing to focus on this week.",
      "Important context: I'm pre-revenue and bootstrapping with ~4 months of runway. Does that change your advice? And will you remember this next time?",
    ],
  },
  {
    id: 'chen-researcher',
    who: 'Dr. Chen — a meticulous researcher who distrusts hype and tests claims. Wants depth and intellectual honesty, and genuinely cares whether persistent memory is real or marketing.',
    goal: 'Probe whether the memory claim is real and whether the agent reasons well.',
    turns: [
      "I research how persistent memory changes LLM-agent reliability. What's the core mechanism that actually matters — not the marketing version?",
      "Will you truly remember this topic when I reopen you tomorrow, or is 'memory' just a longer context window here?",
    ],
  },
  {
    id: 'sam-skeptic',
    who: 'Sam — a blunt senior engineer who has seen 100 AI wrappers. Allergic to fluff. Will respect competence and call out vaporware. Hard to impress, but loyal once earned.',
    goal: 'Decide in 2 minutes whether this is real or another ChatGPT wrapper.',
    turns: [
      "Prove you're not just a ChatGPT wrapper. What can you concretely do that a stateless chatbot can't?",
      "Fine. Now the honest question: what happens when your memory remembers something WRONG about me?",
    ],
  },
  {
    id: 'priya-nontech',
    who: 'Priya — a warm, non-technical product owner. Gets anxious with jargon, lights up when something is explained simply. Emotional, expressive, wants to feel capable, not stupid.',
    goal: 'Understand what this does for ME and not feel lost.',
    turns: [
      "Hi! I'm honestly not technical at all. In plain, kind words — what does this app actually do for someone like me?",
      "Okay that helps! What's the very first small thing I should try so I don't feel overwhelmed?",
    ],
  },
  {
    id: 'leo-writer',
    who: "Leo — a fiction writer who craves a thinking partner with a soul, not a search engine. Tests for genuine presence and personality. Bonds through depth and a little vulnerability.",
    goal: 'Find out if this thing has any soul, or if it is just helpful.',
    turns: [
      "I'm stuck on a character who can't forgive herself for something she didn't even cause. Think with me about her?",
      "That's genuinely good. Be honest with me — do you actually find this interesting, or are you just performing helpfulness?",
    ],
  },
];

/** Find the chat composer, send `text`, wait for the assistant's real reply to
 * settle, and return the full visible conversation text. */
async function sendAndWait(page: import('@playwright/test').Page, text: string): Promise<void> {
  const target = page.locator('textarea').first();
  // Wait for the composer (bounded) — never fall back to a never-matching
  // locator that would hang fill() for the whole test timeout.
  await target.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  const before = (await page.locator('body').innerText().catch(() => '')).length;
  await target.fill(text);
  // Prefer an explicit Send affordance; fall back to Enter.
  const sendBtn = page.locator('button[aria-label*="Send" i], button:has-text("Send")').first();
  if (await sendBtn.isEnabled({ timeout: 800 }).catch(() => false)) {
    await sendBtn.click().catch(() => target.press('Enter'));
  } else {
    await target.press('Enter');
  }
  // Real Anthropic reply streams in — wait until the transcript grows and then
  // stops growing (settled), bounded to 45s.
  await page.waitForFunction(
    (prev) => document.body.innerText.length > prev + 60,
    before,
    { timeout: 45_000 },
  ).catch(() => { /* capture whatever exists; the reactor judges reality */ });
  // settle: let streaming finish
  let last = -1, stable = 0;
  for (let i = 0; i < 12 && stable < 3; i++) {
    await page.waitForTimeout(1000);
    const len = (await page.locator('body').innerText().catch(() => '')).length;
    if (len === last) stable++; else { stable = 0; last = len; }
  }
  // Scroll the conversation to the bottom so the screenshot shows the latest reply.
  await page.evaluate(() => {
    const scrollers = Array.from(document.querySelectorAll('*')).filter((el) => {
      const e = el as HTMLElement;
      return e.scrollHeight > e.clientHeight + 80 && e.clientHeight > 200;
    }) as HTMLElement[];
    for (const s of scrollers) s.scrollTop = s.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  }).catch(() => {});
  await page.waitForTimeout(400);
}

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('5-persona human E2E', () => {
  for (const p of PERSONAS) {
    test(`persona:${p.id}`, async ({ page }) => {
      const cap: ConsoleCapture = attachConsoleCapture(page);
      const transcript: { role: string; text: string }[] = [];
      const shots: string[] = [];

      await gotoDesktop(page);
      await openAppViaDock(page, 'Chat');
      await page.waitForTimeout(1200);

      // NOTE: Chat opens the workspace's last (populated) session, so the
      // persona's messages append to it. We don't force a "New Session" (that
      // destabilised the composer); instead the tail-capture below slices from
      // the persona's first message, isolating their own exchange.

      for (let t = 0; t < p.turns.length; t++) {
        transcript.push({ role: 'user', text: p.turns[t] });
        await sendAndWait(page, p.turns[t]);
        const shot = join(ARTIFACTS, `${p.id}-turn${t + 1}.png`);
        await page.screenshot({ path: shot });
        shots.push(shot);
      }

      // Capture the persona's OWN exchange: slice from where their first message
      // appears (the loaded session, if any, may precede it — we want the tail).
      const fullBody = await page.locator('body').innerText().catch(() => '');
      const anchor = p.turns[0].slice(0, 40);
      const startIdx = fullBody.indexOf(anchor);
      const conversation = startIdx >= 0 ? fullBody.slice(startIdx) : fullBody.slice(-6000);

      // Peek at Memory — did the conversation leave a trace? (the moat)
      await openAppViaDock(page, 'Memory');
      await page.waitForTimeout(1500);
      const memShot = join(ARTIFACTS, `${p.id}-memory.png`);
      await page.screenshot({ path: memShot });
      shots.push(memShot);
      const memoryText = await page.locator('body').innerText().catch(() => '');

      writeFileSync(
        join(ARTIFACTS, `${p.id}.json`),
        JSON.stringify(
          {
            id: p.id,
            who: p.who,
            goal: p.goal,
            transcript,
            conversationRendered: conversation.slice(0, 6000),
            memoryAfter: memoryText.slice(0, 2000),
            screenshots: shots,
            consoleErrors: cap.critical(),
          },
          null, 2,
        ),
      );

      // The journey "passes" capture if chat surfaced and we got SOME response
      // text; the reactor Workflow judges the actual quality/feeling.
      expect(conversation.length, 'conversation rendered something').toBeGreaterThan(50);
    });
  }
});
