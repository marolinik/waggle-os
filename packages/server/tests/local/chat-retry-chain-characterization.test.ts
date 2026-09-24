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
 * The real agent loop runs against the fake provider (TD-CHAT-16): a stream
 * cut before `[DONE]` is the interruption, a 429 is the rate limit. The
 * pass-through loop spy counts the route's attempts and reads their configs;
 * it throws only the plain INCOMPLETE_COMPLETION, whose message no provider
 * reply produces.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';

/**
 * Pass-through spy on the real agent loop (TD-CHAT-16 ruling 2). It records
 * each attempt's `AgentLoopConfig` (the attempt count, model, key and token
 * budget the route hands the loop), and throws `failures[n]` on attempt n only
 * where that failure cannot come from a provider reply. Everything else runs
 * the real loop against the fake provider.
 */
const loopSpy = vi.hoisted(() => ({
  configs: [] as AgentLoopConfig[],
  failures: [] as unknown[],
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: AgentLoopConfig) => {
      const index = loopSpy.configs.push(config) - 1;
      const failure = loopSpy.failures[index];
      if (failure !== undefined) throw failure;
      return actual.runAgentLoop(config);
    },
  };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmReply,
} from '../helpers/fake-llm-provider.js';

/**
 * A stream cut before `[DONE]`. The loop reports it as INCOMPLETE_COMPLETION
 * with a message ending in the parenthesised stream-ended sentence: both halves
 * the safe-replay predicate `isRetryableStreamInterruption` needs.
 */
function streamInterruption(usedInput: number, usedOutput: number): FakeLlmReply {
  return { type: 'truncated_stream', content: 'partial', usage: { inputTokens: usedInput, outputTokens: usedOutput } };
}

const RETRY_STEP = 'Model response was interrupted — retrying once on the same model.';

describe('POST /api/chat primary attempt retry (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const attempts = loopSpy.configs;
  let provider: FakeLlmProvider | undefined;

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
    provider?.restore();
    provider = undefined;
    loopSpy.failures.length = 0;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  const SECOND_ATTEMPT: FakeLlmReply = {
    type: 'text', content: 'second attempt answered', usage: { inputTokens: 3, outputTokens: 4 },
  };

  /** Fails the first provider request with `first`; every later request answers. */
  function failFirstRequest(first: FakeLlmReply) {
    attempts.length = 0;
    provider = installFakeLlmProvider({ respond: [first, SECOND_ATTEMPT] });
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
    failFirstRequest(streamInterruption(3, 1));
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
    attempts.length = 0;
    loopSpy.failures[0] = plain;
    provider = installFakeLlmProvider({ respond: SECOND_ATTEMPT });
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
    // The first key is rate limited on every request, so the loop's own 429
    // retries run out and the attempt fails with a 429-carrying error.
    attempts.length = 0;
    let firstKey: string | null | undefined;
    provider = installFakeLlmProvider({
      respond: (request) => {
        firstKey ??= request.authorization;
        return request.authorization === firstKey ? { type: 'http_error', status: 429, message: 'Rate limit exceeded', headers: { 'retry-after': '0' } } : SECOND_ATTEMPT;
      },
    });
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
  it('hands the loop the server retry-backoff seam, which sees the policy wait', async () => {
    // TD-CHAT-16 retry clock: the route passes `server.llmRetryBackoffMs` into
    // every attempt's loop config. A 503 then an answer makes the loop back off
    // once, for the policy's 2s, which the seam turns into no wait at all.
    const policyWaits: number[] = [];
    server.llmRetryBackoffMs = (waitMs) => {
      policyWaits.push(waitMs);
      return 0;
    };
    attempts.length = 0;
    provider = installFakeLlmProvider({
      respond: [{ type: 'http_error', status: 503, message: 'overloaded' }, SECOND_ATTEMPT],
    });
    try {
      const started = Date.now();
      const { status, events } = await runTurn(
        'In one sentence, what is a monorepo?',
        `retry-backoff-seam-${Date.now()}`,
      );
      expect(status).toBe(200);
      expect(events.some(e => e.event === 'done')).toBe(true);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].retryBackoffMs).toBe(server.llmRetryBackoffMs);
      expect(policyWaits).toEqual([2_000]);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      delete server.llmRetryBackoffMs;
    }
  });
});
