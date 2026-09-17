/**
 * Characterization tests for the primary-attempt retry and credential-rotation
 * chain in `routes/chat.ts` (P4-04, docs/TESTING.md Safety Net Map).
 *
 * TD-CHAT-10 records this as its own prerequisite: the attempt loop must be
 * characterized before any extraction touches it.
 *
 * Scope note: the MODEL FALLBACK half of the chain is already pinned elsewhere
 * (`chat-api.test.ts` and `persona-acceptance-prompt-budget.test.ts` both
 * assert `model_switch` counts across several routes), so this file pins only
 * the two steps nothing asserts today - the same-model replay after a stream
 * interruption, and the credential rotation that precedes any model switch.
 *
 * The seam is the `server.agentRunner` object seam: `runAgentAttempt` calls the
 * runner directly, so a shaped throw drives the branch without a provider.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
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
 * The exact error the safe-replay predicate recognises.
 *
 * `isRetryableStreamInterruption` is `INCOMPLETE_COMPLETION` AND a message
 * ending in the parenthesised stream-ended sentence, so both halves matter and
 * a plainer network error takes the throw path instead.
 */
function streamInterruption(usedInput: number, usedOutput: number): Error {
  const error = new Error(
    'Model stream ended early (stream ended before data: [DONE]); partial content was not accepted.',
  ) as Error & { code: string; usage: { inputTokens: number; outputTokens: number } };
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = { inputTokens: usedInput, outputTokens: usedOutput };
  return error;
}

const RETRY_STEP = 'Model response was interrupted — retrying once on the same model.';

describe('POST /api/chat primary attempt retry (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let attempts: AgentLoopConfig[];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-retry-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // Two keys before the first turn: `getCredentialPool` memoises the pool
    // per provider, so a second key added later would never be seen.
    server.vault.set('anthropic', 'sk-retry-pin');
    server.vault.set('anthropic-2', 'sk-retry-pin-2');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
  });

  afterEach(() => {
    delete server.agentRunner;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Fails attempt 1 with `error`, answers on every later attempt. */
  function failFirstAttempt(error: Error) {
    attempts = [];
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(config);
      if (attempts.length === 1) throw error;
      return {
        content: 'second attempt answered',
        toolsUsed: [],
        usage: { inputTokens: 3, outputTokens: 4 },
      };
    };
  }

  async function runTurn(message: string, session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session, model: 'claude-sonnet-4-6' },
    });
    return { status: res.statusCode, events: parseSSE(res.body) };
  }

  it('replays once on the same model after a stream interruption', async () => {
    failFirstAttempt(streamInterruption(3, 1));
    const { status, events } = await runTurn(
      'In one sentence, what is a monorepo?',
      `retry-replay-${Date.now()}`,
    );

    expect(status).toBe(200);
    expect(attempts.length).toBe(2);
    // Same model: this is a replay, not a fallback.
    expect(attempts[1].model).toBe(attempts[0].model);
    expect(events.some(e => e.event === 'model_switch')).toBe(false);
    expect(events.some(e => e.event === 'step' && JSON.parse(e.data).content === RETRY_STEP)).toBe(true);

    // The replay inherits what the failed attempt did not consume, so the
    // budget is not handed out twice.
    // The replay having happened at all proves the budget is a number: an
    // undefined `maxTokenBudget` makes the remaining budget 0 and refuses it.
    const consumed = 3 + 1;
    expect(typeof attempts[0].maxTokenBudget).toBe('number');
    expect(attempts[1].maxTokenBudget).toBe((attempts[0].maxTokenBudget as number) - consumed);
    expect(events.some(e => e.event === 'done')).toBe(true);
  });

  it('does not replay a plain failure', async () => {
    // Same code, wrong message shape: the predicate needs both halves, so this
    // one takes the throw path and whatever the chain does next.
    const plain = new Error('Model stream ended early.') as Error & { code: string };
    plain.code = 'INCOMPLETE_COMPLETION';
    failFirstAttempt(plain);
    const { status, events } = await runTurn(
      'In one sentence, what is a monorepo?',
      `retry-plain-${Date.now()}`,
    );

    expect(status).toBe(200);
    expect(events.some(e => e.event === 'step' && JSON.parse(e.data).content === RETRY_STEP)).toBe(false);
    // An incomplete completion is terminal in the outer catch: no fallback, no
    // credential rotation, one attempt only.
    expect(attempts.length).toBe(1);
  });

  it('rotates to the next credential before switching model', async () => {
    // A status-carrying failure is the pool's business: it reports the key,
    // takes the next one and replays on the SAME model. Only when the pool is
    // out of keys does the model fallback chain get a turn.
    const rateLimited = new Error('Rate limit exceeded') as Error & { status: number; statusCode: number };
    rateLimited.status = 429;
    rateLimited.statusCode = 429;
    failFirstAttempt(rateLimited);
    const { status, events } = await runTurn(
      'In one sentence, what is a monorepo?',
      `retry-rotate-${Date.now()}`,
    );

    expect(status).toBe(200);
    expect(events.some(e => e.event === 'step'
      && JSON.parse(e.data).content === 'API key rotated — retrying with next credential')).toBe(true);
    expect(attempts.length).toBe(2);
    // Rotation is a credential change, not a model change.
    expect(attempts[1].model).toBe(attempts[0].model);
    expect(events.some(e => e.event === 'model_switch')).toBe(false);
    expect(events.some(e => e.event === 'done')).toBe(true);
  });
});
