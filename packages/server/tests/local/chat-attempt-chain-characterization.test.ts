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
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

function statusError(status: number, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { status, statusCode: status, ...extra });
}

describe('POST /api/chat attempt chain (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let attempts: AgentLoopConfig[];

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-attempt-chain-'));
    server = await buildLocalServer({ dataDir: tmpDir });
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
    attempts = [];
  });

  afterEach(async () => {
    delete server.agentRunner;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function runTurn(session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'In one sentence, what is a monorepo?', session, model: 'claude-sonnet-4-6' },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  const doneOf = (events: Array<{ event: string; data: string }>) => {
    const done = events.find(e => e.event === 'done');
    return done ? JSON.parse(done.data) as { content: string; toolsUsed: string[]; model?: string } : undefined;
  };

  it('retries a rotated attempt with the next key, not the failed one', async () => {
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(config);
      if (attempts.length === 1) throw statusError(429, 'Rate limit exceeded');
      return { content: 'rotated answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
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
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(agentConfig);
      if (!agentConfig.model.endsWith('claude-haiku-4-5')) throw statusError(401, 'Invalid API key');
      return { content: 'fallback answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const events = await runTurn('chain-pool-exhausted');
    expect(attempts.map(a => a.model.split('/').pop())).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5']);
    expect(events.some(e => e.event === 'model_switch')).toBe(true);
    expect(doneOf(events)?.content).toBe('fallback answer');
  });

  it("keeps a failed attempt's streamed tokens out of the answer's token events", async () => {
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(config);
      if (attempts.length === 1) {
        config.onToken?.('Discarded partial ');
        throw statusError(429, 'Rate limit exceeded');
      }
      config.onToken?.('ok ');
      config.onToken?.('answer');
      return { content: 'ok answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const events = await runTurn('chain-buffered-tokens');
    const tokens = events.filter(e => e.event === 'token').map(e => (JSON.parse(e.data) as { content: string }).content);
    // The successful attempt's own chunking survives only when the failed
    // attempt's buffer was discarded; otherwise the joined buffer no longer
    // equals the answer and the route falls back to one whole-answer token.
    expect(tokens).toEqual(['ok ', 'answer']);
  });

  it('reports tools a failed attempt used in the turn’s done event', async () => {
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(config);
      if (attempts.length === 1) throw statusError(429, 'Rate limit exceeded', { toolsUsed: ['search_memory'] });
      return { content: 'second answer', toolsUsed: ['list_skills'], usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const events = await runTurn('chain-failed-tools');
    expect(doneOf(events)?.toolsUsed).toEqual(['search_memory', 'list_skills']);
  });
});
