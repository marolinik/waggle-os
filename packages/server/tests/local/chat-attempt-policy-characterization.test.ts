/**
 * Characterization tests for the attempt-policy decisions in the chat
 * handler's model attempt chain (TD-CHAT-3).
 *
 * `chat-retry-chain-characterization.test.ts` pins the same-model replay and
 * the credential rotation; `smart-router-chat.test.ts` pins the budget and
 * fallback order. These pin the exits nothing executed: an empty answer after a
 * tool ran is terminal (no configured fallback), and a stream interruption is
 * not replayed when the failed attempt used up the token budget. The
 * tools-offered case needs the `runAgentLoop` module mock, because an injected
 * runner always gets an empty tool list: it lives in
 * `chat-attempt-replay-tools-characterization.test.ts`.
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16); primary and
 * fallback are local Ollama models, made visible through a fetch spy on
 * `/api/tags`. The pass-through loop spy counts the route's attempts and reads
 * their configs.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pass-through spy on the real agent loop (TD-CHAT-16 ruling 2). It records
 * each attempt's `AgentLoopConfig`, and throws `failures[n]` on attempt n only
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
import { injectWithAuth, parseSSE, resetRateLimiter } from '../test-utils.js';
import {
  installFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmReply,
} from '../helpers/fake-llm-provider.js';

const PRIMARY = 'ollama/attempt-primary';
const FALLBACK = 'ollama/attempt-fallback';
const RETRY_STEP = 'Model response was interrupted — retrying once on the same model.';


describe('POST /api/chat attempt policy (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const attempts = loopSpy.configs;
  let provider: FakeLlmProvider | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-attempt-policy-'));
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(PRIMARY);
    config.setFallbackModel(FALLBACK);
    config.save();
    server = await buildLocalServer({ dataDir: tmpDir });
  }, 30_000);

  beforeEach(() => {
    attempts.length = 0;
    resetRateLimiter(server);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [{ name: 'attempt-primary' }, { name: 'attempt-fallback' }],
        }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });
  });

  afterEach(() => {
    provider?.restore();
    provider = undefined;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  const LATER_ATTEMPT: FakeLlmReply = {
    type: 'text', content: 'later attempt answered', usage: { inputTokens: 1, outputTokens: 1 },
  };

  /**
   * Answers attempt 1's provider requests with `first` and every later
   * attempt's with LATER_ATTEMPT. The suite's `/api/tags` spy stays behind the
   * fake for everything that is not a model call.
   */
  function firstAttempt(first: (request: { index: number }) => FakeLlmReply) {
    provider = installFakeLlmProvider({
      respond: (request) => (attempts.length <= 1 ? first(request) : LATER_ATTEMPT),
      otherRequest: 'previous',
    });
  }

  async function runTurn(message: string, session: string) {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  it('falls back to the configured model after a retryable failure', async () => {
    // The contrast case: the same harness does reach the fallback, so the
    // single-attempt pins below are not an artifact of a missing fallback.
    // The primary endpoint refuses every connection, so the loop's own network
    // retries run out ("Could not reach the model endpoint ...").
    firstAttempt(() => ({ type: 'network_error', message: 'fetch failed' }));
    const events = await runTurn('What is 19 * 23?', 'attempt-fallback-contrast');
    expect(attempts.map(a => a.model)).toEqual(['attempt-primary', 'attempt-fallback']);
    expect(events.some(e => e.event === 'done')).toBe(true);
  });

  it('ends the turn on an empty answer after a tool ran, without the configured fallback', async () => {
    // The tool must really run, so the turn asks for a memory search: a bare
    // arithmetic question transmits no tools on the real path.
    firstAttempt(({ index }) => (index === 0
      ? { type: 'tool_calls', calls: [{ name: 'search_memory', args: { query: 'launch plan' } }] }
      : { type: 'text', content: ' ', usage: { inputTokens: 1, outputTokens: 1 } }));
    const events = await runTurn('Search my memory for the launch plan.', 'attempt-empty-after-tool');
    expect(attempts.map(a => a.model)).toEqual(['attempt-primary']);
    expect(events.some(e => e.event === 'error')).toBe(true);
    expect(events.some(e => e.event === 'done')).toBe(false);
  });

  // Assertions about the attempt config stay outside the runner: a throw inside
  // it is just another failed attempt to the route, so it could never fail a pin.
  it('does not replay an interruption that used up the token budget', async () => {
    // The cut stream reports usage equal to the whole budget the route gave it.
    firstAttempt(() => ({
      type: 'truncated_stream',
      content: 'partial',
      usage: { inputTokens: Number(attempts[0].maxTokenBudget), outputTokens: 0 },
    }));
    const events = await runTurn('In one sentence, what is a monorepo?', 'attempt-budget-spent');
    expect(typeof attempts[0].maxTokenBudget).toBe('number');
    expect(attempts[0].tools).toHaveLength(0);
    expect(attempts).toHaveLength(1);
    expect(events.some(e => e.event === 'step' && JSON.parse(e.data).content === RETRY_STEP)).toBe(false);
  });
});
