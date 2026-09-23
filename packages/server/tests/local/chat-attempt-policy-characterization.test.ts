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
 * The seam is `server.agentRunner`; primary and fallback are local Ollama
 * models, made visible through a fetch spy on `/api/tags`.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, parseSSE, resetRateLimiter } from '../test-utils.js';

const PRIMARY = 'ollama/attempt-primary';
const FALLBACK = 'ollama/attempt-fallback';
const RETRY_STEP = 'Model response was interrupted — retrying once on the same model.';

/** The exact error the safe-replay predicate recognises (see the retry-chain pins). */
function streamInterruption(usedInput: number, usedOutput: number): Error {
  const error = new Error(
    'Model stream ended early (stream ended before data: [DONE]); partial content was not accepted.',
  ) as Error & { code: string; usage: { inputTokens: number; outputTokens: number } };
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = { inputTokens: usedInput, outputTokens: usedOutput };
  return error;
}

describe('POST /api/chat attempt policy (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let attempts: AgentLoopConfig[];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-attempt-policy-'));
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(PRIMARY);
    config.setFallbackModel(FALLBACK);
    config.save();
    server = await buildLocalServer({ dataDir: tmpDir });
  }, 30_000);

  beforeEach(() => {
    attempts = [];
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
    vi.restoreAllMocks();
    delete server.agentRunner;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Runs attempt 1 with `first`; every later attempt answers. */
  function firstAttempt(first: (config: AgentLoopConfig) => Promise<AgentResponse>) {
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(config);
      if (attempts.length === 1) return first(config);
      return { content: 'later attempt answered', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
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
    firstAttempt(async () => {
      throw new Error('Could not reach the model endpoint after 3 attempts (fetch failed).');
    });
    const events = await runTurn('What is 19 * 23?', 'attempt-fallback-contrast');
    expect(attempts.map(a => a.model)).toEqual(['attempt-primary', 'attempt-fallback']);
    expect(events.some(e => e.event === 'done')).toBe(true);
  });

  it('ends the turn on an empty answer after a tool ran, without the configured fallback', async () => {
    firstAttempt(async () => ({ content: ' ', toolsUsed: ['search_memory'], usage: { inputTokens: 1, outputTokens: 1 } }));
    const events = await runTurn('What is 19 * 23?', 'attempt-empty-after-tool');
    expect(attempts.map(a => a.model)).toEqual(['attempt-primary']);
    expect(events.some(e => e.event === 'error')).toBe(true);
    expect(events.some(e => e.event === 'done')).toBe(false);
  });

  // Assertions about the attempt config stay outside the runner: a throw inside
  // it is just another failed attempt to the route, so it could never fail a pin.
  it('does not replay an interruption that used up the token budget', async () => {
    firstAttempt(async (config) => {
      throw streamInterruption(Number(config.maxTokenBudget), 0);
    });
    const events = await runTurn('In one sentence, what is a monorepo?', 'attempt-budget-spent');
    expect(typeof attempts[0].maxTokenBudget).toBe('number');
    expect(attempts[0].tools).toHaveLength(0);
    expect(attempts).toHaveLength(1);
    expect(events.some(e => e.event === 'step' && JSON.parse(e.data).content === RETRY_STEP)).toBe(false);
  });
});
