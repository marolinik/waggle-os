/**
 * Characterization pins for a chat turn that fails before its response is
 * committed (TD-CHAT-3 slice 15): the user-facing message and code each kind
 * of failure is mapped to, and the spend a failed turn is charged. The
 * endpoint-outage mapping, the persisted failure turn, the raw turn captured to
 * memory and the abandoned trace are pinned elsewhere (`chat-api.test.ts`,
 * `chat-turn-execution-trace-characterization.test.ts`).
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16). The message
 * mapping pins classify the raw value the loop throws, which no provider reply
 * produces verbatim, so they throw it through the pass-through loop spy
 * (ruling 2). The budget refusal and the failure spend run the real path.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Pass-through spy on the real loop; throws `failWith` when it is set. */
const loopSpy = vi.hoisted(() => ({ failWith: undefined as unknown, armed: false }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: AgentLoopConfig) => {
      if (loopSpy.armed) throw loopSpy.failWith;
      return actual.runAgentLoop(config);
    },
  };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
} from '../helpers/fake-llm-provider.js';

describe('POST /api/chat failure before commit (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-turn-failure-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // Scripted provider failures must not sleep through real backoff (TD-CHAT-16).
    server.llmRetryBackoffMs = () => 0;
    markFakeProviderHealthy(server);
    provider = installFakeLlmProvider({ respond: { type: 'text', content: 'unused' } });
  });

  beforeEach(() => {
    resetRateLimiter(server);
    loopSpy.armed = false;
    loopSpy.failWith = undefined;
  });

  afterAll(async () => {
    loopSpy.armed = false;
    provider.restore();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  /** Throws `thrown` from the loop on every attempt, through the spy. */
  async function errorEvents(thrown: unknown, session: string) {
    loopSpy.armed = true;
    loopSpy.failWith = thrown;
    return turnErrors(session);
  }

  async function turnErrors(session: string) {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message: 'Summarise the launch plan please', session },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    expect(events.some(e => e.event === 'done')).toBe(false);
    return events.filter(e => e.event === 'error').map(e => JSON.parse(e.data) as Record<string, unknown>);
  }

  it.each([
    ['401', new Error('Request failed with 401'), 'API key is invalid or expired. Update it in Settings > API Keys.'],
    ['Unauthorized', new Error('Unauthorized'), 'API key is invalid or expired. Update it in Settings > API Keys.'],
    ['timeout', new Error('upstream timeout'), 'The request timed out. The model may be overloaded — try again in a moment.'],
    ['ETIMEDOUT', new Error('connect ETIMEDOUT'), 'The request timed out. The model may be overloaded — try again in a moment.'],
    ['context_length', new Error('context_length_exceeded'), 'The conversation is too long for the model. Try clearing the chat and starting fresh.'],
    ['too many tokens', new Error('too many tokens in request'), 'The conversation is too long for the model. Try clearing the chat and starting fresh.'],
    ['an unclassified Error', new Error('Provider said no'), 'Provider said no'],
    ['a non-Error throw', 'plain string', 'Something went wrong. Try sending your message again.'],
  ])('maps %s to its user-facing message with no code', async (_label, thrown, message) => {
    expect(await errorEvents(thrown, `failure-${_label.replace(/\W+/g, '-')}`)).toEqual([{ message }]);
  });

  // Re-pinned on the production path (TD-CHAT-16 ruling 3). The injected-runner
  // version charged a thrown MODEL_OPERATION_TIMEOUT's usage in the route
  // (`chat-turn-failure.ts`, `hasCustomRunner` only); in production the loop
  // charges every provider response it received, through the turn's spend
  // budget, before the failure reaches the route.
  it('charges the usage a failed turn\'s provider responses reported', async () => {
    const tracker = server.agentState.costTracker;
    const before = tracker.getDailyTotal();
    // Both the attempt and its same-model replay are cut before [DONE].
    provider.respondWith({
      type: 'truncated_stream', content: 'partial', usage: { inputTokens: 1_000, outputTokens: 500 },
    });
    try {
      const errors = await turnErrors('failure-spend');
      expect(errors).toHaveLength(1);
    } finally {
      provider.respondWith({ type: 'text', content: 'unused' });
    }
    expect(tracker.getDailyTotal()).toBeGreaterThan(before);
  });
});

describe('POST /api/chat daily-budget refusal before commit (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-turn-budget-'));
    // The hard cap is read when the server is built, so it is saved first.
    const config = new WaggleConfig(tmpDir);
    config.setDailyBudget(0.000001);
    config.setBudgetHardCap(true);
    config.save();
    server = await buildLocalServer({ dataDir: tmpDir });
    // Scripted provider failures must not sleep through real backoff (TD-CHAT-16).
    server.llmRetryBackoffMs = () => 0;
    markFakeProviderHealthy(server);
    provider = installFakeLlmProvider({ respond: { type: 'text', content: 'over budget' } });
  });

  afterAll(async () => {
    provider.restore();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  it('forwards a daily-budget refusal code with its message', async () => {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message: 'Summarise the launch plan please', session: 'failure-budget' },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    expect(events.some(e => e.event === 'done')).toBe(false);
    const errors = events.filter(e => e.event === 'error').map(e => JSON.parse(e.data) as Record<string, unknown>);
    // The refusal is the real hard cap's, so the forwarded message is its own
    // wording rather than the synthetic 'Daily model budget reached' the
    // injected runner threw (TD-CHAT-16 plan §6b). The code and the verbatim
    // forwarding are what this pins.
    expect(errors).toEqual([
      { message: 'Daily budget exceeded: $0.0000 / $0.00 (hard cap)', code: 'DAILY_MODEL_BUDGET_EXCEEDED' },
    ]);
    // Refused before any model call.
    expect(provider.requests).toHaveLength(0);
  });
});
