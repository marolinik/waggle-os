/**
 * Characterization pins for the attempt chain's per-attempt state and its
 * credential-rotation exits (TD-CHAT-3 slice 11), taken before that state
 * moves into its own object.
 *
 * `chat-retry-chain-characterization.test.ts` already pins one rotation on a
 * 429 and the same-model replay. These pin what nothing asserted:
 * - the rotated attempt carries the next key, not the failed one;
 * - an exhausted pool hands a non-retryable failure to the configured
 *   fallback model;
 * - a failed attempt's streamed tokens never shape the answer's token events;
 * - tools a failed attempt reported still appear in the turn's `done`.
 *
 * Each test builds its own server: `getCredentialPool` memoises one pool per
 * provider for the server's life, and a key put in cooldown by one test would
 * change the next test's path.
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16). The
 * pass-through loop spy counts the route's attempts and reads their configs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function statusError(status: number, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { status, statusCode: status, ...extra });
}

/** Rate-limits every request made with the first key it sees; answers the rest. */
function rateLimitFirstKey(answer: FakeLlmReply): (request: { authorization: string | null }) => FakeLlmReply {
  let firstKey: string | null | undefined;
  return (request) => {
    firstKey ??= request.authorization;
    return request.authorization === firstKey ? { type: 'http_error', status: 429, message: 'Rate limit exceeded', headers: { 'retry-after': '0' } } : answer;
  };
}

describe('POST /api/chat attempt chain (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const attempts = loopSpy.configs;
  let provider: FakeLlmProvider | undefined;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-attempt-chain-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // Scripted provider failures must not sleep through real backoff (TD-CHAT-16).
    server.llmRetryBackoffMs = () => 0;
    // Two keys before the first turn: the pool is memoised per provider.
    server.vault.set('anthropic', 'sk-chain-pin-1');
    server.vault.set('anthropic-2', 'sk-chain-pin-2');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
    attempts.length = 0;
    loopSpy.failures.length = 0;
  });

  afterEach(async () => {
    provider?.restore();
    provider = undefined;
    loopSpy.failures.length = 0;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function runTurn(session: string, message = 'In one sentence, what is a monorepo?') {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session, model: 'claude-sonnet-4-6' },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  const doneOf = (events: Array<{ event: string; data: string }>) => {
    const done = events.find(e => e.event === 'done');
    return done ? JSON.parse(done.data) as { content: string; toolsUsed: string[]; model?: string } : undefined;
  };

  it('retries a rotated attempt with the next key, not the failed one', async () => {
    provider = installFakeLlmProvider({
      respond: rateLimitFirstKey({ type: 'text', content: 'rotated answer', usage: { inputTokens: 1, outputTokens: 1 } }),
    });
    const events = await runTurn('chain-rotated-key');
    expect(doneOf(events)?.content).toBe('rotated answer');
    expect(attempts).toHaveLength(2);
    expect(attempts[0].litellmApiKey).toBeTruthy();
    expect(attempts[1].litellmApiKey).toBeTruthy();
    expect(attempts[1].litellmApiKey).not.toBe(attempts[0].litellmApiKey);
  });

  it('hands an exhausted pool to the configured fallback, even for a non-retryable failure', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('claude-haiku-4-5');
    config.save();
    provider = installFakeLlmProvider({
      respond: (request) => (request.model.endsWith('claude-haiku-4-5')
        ? { type: 'text', content: 'fallback answer', usage: { inputTokens: 1, outputTokens: 1 } }
        : { type: 'http_error', status: 401, message: 'Invalid API key' }),
    });
    const events = await runTurn('chain-pool-exhausted');
    expect(attempts.map(a => a.model.split('/').pop())).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5']);
    expect(events.some(e => e.event === 'model_switch')).toBe(true);
    expect(doneOf(events)?.content).toBe('fallback answer');
  });

  it("keeps a failed attempt's streamed tokens out of the answer's token events", async () => {
    // A provider cannot stream tokens and then answer 429, so the failed
    // attempt streams its tokens and is then cut before `[DONE]`: the route's
    // same-model replay, rather than rotation, discards them (TD-CHAT-16).
    provider = installFakeLlmProvider({
      respond: [
        { type: 'truncated_stream', content: 'Discarded partial ', usage: { inputTokens: 1, outputTokens: 1 } },
        { type: 'text', content: 'ok answer', chunks: ['ok ', 'answer'], usage: { inputTokens: 1, outputTokens: 1 } },
      ],
    });
    const events = await runTurn('chain-buffered-tokens');
    const tokens = events.filter(e => e.event === 'token').map(e => (JSON.parse(e.data) as { content: string }).content);
    // The successful attempt's own chunking survives only when the failed
    // attempt's buffer was discarded; otherwise the joined buffer no longer
    // equals the answer and the route falls back to one whole-answer token.
    expect(tokens).toEqual(['ok ', 'answer']);
  });

  it('reports tools a failed attempt used in the turn’s done event', async () => {
    // The failed attempt's tool report rides on the loop's error, which no
    // provider reply shapes: that attempt is scripted (ruling 2).
    loopSpy.failures[0] = statusError(429, 'Rate limit exceeded', { toolsUsed: ['search_memory'] });
    provider = installFakeLlmProvider({
      respond: [
        { type: 'tool_calls', calls: [{ name: 'list_skills' }] },
        { type: 'text', content: 'second answer', usage: { inputTokens: 1, outputTokens: 1 } },
      ],
    });
    // The success attempt must really run list_skills, so this turn asks for it:
    // a conversational question transmits no tools on the real path.
    const events = await runTurn('chain-failed-tools', 'Call list_skills exactly once.');
    expect(doneOf(events)?.toolsUsed).toEqual(['search_memory', 'list_skills']);
  });
});
