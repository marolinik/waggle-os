/**
 * Characterization tests for the regulated-content disclaimer block in
 * `routes/chat.ts` (CA-6, docs/ARCHITECTURE.md Layer Map).
 *
 * The rule is a three-way conjunction spread across two modules and one
 * handler-local map: the persona must have an entry in `REGULATED_DISCLAIMER_MAP`,
 * `isRegulatedContent` must find at least two domain keywords in the reply, and
 * `hasRegulatedDisclaimer` must NOT already find a disclaimer in it. Only the
 * detector halves were pinned before this file; the map and the append decision
 * had no test at any level, so CA-6 could not move them without first recording
 * what they do today.
 *
 * The pin is HTTP-observable by necessity, not by preference: the map is a
 * `const` inside the handler body, so there is no unit seam to reach it that the
 * move itself would not have to create first. An injected `agentRunner` makes
 * the `done` event content isolate this block exactly - the two neighbouring
 * appenders (the `/schedule` nudge and the grounding hedge) are both
 * `!hasCustomRunner` gated and never run here.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

/** Splits an SSE body into its `event:`/`data:` pairs. */
function parseSSE(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  for (const block of raw.split(/\n\n/).filter(Boolean)) {
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event || data) events.push({ event, data });
  }
  return events;
}

/**
 * The exact strings the handler appends today, one per regulated persona.
 * Spelled out here rather than imported, so that a change to the map fails this
 * file instead of silently agreeing with it.
 */
const HR_DISCLAIMER = '\n\n---\n*This is general HR guidance, not legal advice. Consult your legal team for binding decisions.*';
const LEGAL_DISCLAIMER = '\n\n---\n*This is AI-assisted legal analysis, not legal advice. This does not create an attorney-client relationship. Consult a licensed attorney for binding legal guidance.*';
const FINANCE_DISCLAIMER = '\n\n---\n*Financial figures are estimates based on available data. Verify with your accountant or financial advisor before making decisions.*';

describe('POST /api/chat regulated-content disclaimer (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-disclaimer-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-disclaimer-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
    workspaceId = server.workspaceManager.create({
      name: `disclaimer pin ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
    server.agentState.activeWorkspaceId = workspaceId;
  });

  afterEach(() => {
    delete server.agentRunner;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Runs one turn whose reply is exactly `reply`, under `persona`. */
  async function replyUnder(persona: string | undefined, reply: string): Promise<string> {
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => ({
      content: reply,
      toolsUsed: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Summarize that for me.',
        session: `disclaimer-${persona ?? 'none'}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        workspace: workspaceId,
        model: 'claude-sonnet-4-6',
        ...(persona ? { persona } : {}),
      },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    expect(events.some(e => e.event === 'error')).toBe(false);
    const done = events.find(e => e.event === 'done');
    expect(done).toBeDefined();
    return JSON.parse(done!.data).content as string;
  }

  // -- The rule fires --------------------------------------------------

  it.each([
    [
      'hr-manager',
      'Revise the leave policy so employment terms read consistently.',
      HR_DISCLAIMER,
    ],
    [
      'legal-professional',
      'The contract clause on liability should be narrowed before signature.',
      LEGAL_DISCLAIMER,
    ],
    [
      'finance-owner',
      'The budget forecast holds if hiring stays where it is.',
      FINANCE_DISCLAIMER,
    ],
  ])('appends the %s disclaimer to substantive regulated content', async (persona, reply, disclaimer) => {
    // Two domain keywords is the whole bar `isRegulatedContent` sets, and each
    // reply above clears it. The appended text is asserted whole: it is the
    // user-visible half of the rule, and paraphrasing it would be a behavior
    // change no other test would catch.
    expect(await replyUnder(persona, reply)).toBe(reply + disclaimer);
  });

  // -- The rule declines -----------------------------------------------

  it('does not append twice when the reply already carries a disclaimer', async () => {
    // `hasRegulatedDisclaimer` is the suppression half. Its own pins cover the
    // detector; this records that the handler actually consults it.
    const reply = 'The contract clause on liability is unusual. This is not legal advice.';
    expect(await replyUnder('legal-professional', reply)).toBe(reply);
  });

  it('leaves a regulated persona alone when the content is not substantive', async () => {
    // One keyword, not two - `isRegulatedContent` returns false and the reply
    // is delivered exactly as the model produced it.
    const reply = 'Send me the contract when you have it.';
    expect(await replyUnder('legal-professional', reply)).toBe(reply);
  });

  it('leaves an unregulated persona alone however regulated the content reads', async () => {
    // The map is the outermost guard: a persona with no entry never reaches
    // either detector, so the same text that triggers under
    // `legal-professional` passes through untouched here.
    const reply = 'The contract clause on liability should be narrowed before signature.';
    expect(await replyUnder('general-purpose', reply)).toBe(reply);
  });

  it('leaves a turn with no persona at all alone', async () => {
    // `activePersonaId` falls back to the workspace default, which this
    // workspace does not set, so the guard short-circuits on null.
    const reply = 'The budget forecast holds if hiring stays where it is.';
    expect(await replyUnder(undefined, reply)).toBe(reply);
  });
});
