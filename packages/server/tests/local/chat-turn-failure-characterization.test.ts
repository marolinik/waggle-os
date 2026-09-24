/**
 * Characterization pins for a chat turn that fails before its response is
 * committed (TD-CHAT-3 slice 15): the user-facing message and code each kind
 * of failure is mapped to, and the spend a failed injected-runner turn is
 * charged. The endpoint-outage mapping, the persisted failure turn, the raw
 * turn captured to memory and the abandoned trace are pinned elsewhere
 * (`chat-api.test.ts`, `chat-turn-execution-trace-characterization.test.ts`).
 *
 * The seam is `server.agentRunner`, which throws the failure under test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

describe('POST /api/chat failure before commit (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let failure: unknown;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-turn-failure-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      throw failure;
    };
  });

  beforeEach(() => resetRateLimiter(server));

  afterAll(async () => {
    server.agentRunner = undefined;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  async function errorEvents(thrown: unknown, session: string) {
    failure = thrown;
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
    ['an unclassified, unmarked Error', new Error('Provider said no'), 'Something went wrong. Try sending your message again.'],
    ['a non-Error throw', 'plain string', 'Something went wrong. Try sending your message again.'],
  ])('maps %s to its user-facing message with no code', async (_label, thrown, message) => {
    expect(await errorEvents(thrown, `failure-${_label.replace(/\W+/g, '-')}`)).toEqual([{ message }]);
  });

  it('forwards a daily-budget refusal code with its message', async () => {
    const refusal = Object.assign(new Error('Daily model budget reached'), { code: 'DAILY_MODEL_BUDGET_EXCEEDED' });
    expect(await errorEvents(refusal, 'failure-budget')).toEqual([
      { message: 'Daily model budget reached', code: 'DAILY_MODEL_BUDGET_EXCEEDED' },
    ]);
  });

  it('charges an injected runner the usage its failed attempt reported', async () => {
    const tracker = server.agentState.costTracker;
    const before = tracker.getDailyTotal();
    const incomplete = Object.assign(new Error('Model operation timed out'), {
      code: 'MODEL_OPERATION_TIMEOUT',
      usage: { inputTokens: 1_000, outputTokens: 500 },
    });
    await errorEvents(incomplete, 'failure-spend');
    expect(tracker.getDailyTotal()).toBeGreaterThan(before);
  });
});
