/**
 * Characterization pin: the system prompt a fallback attempt was built with is
 * the one the turn reports in `done.contextMetrics` (TD-CHAT-3 slice 12).
 *
 * `configForModelAttempt` rebuilds the prompt for each attempt's model and
 * writes it back to the handler, where the `done` metrics read it. Through
 * the injected `server.agentRunner` seam no prompt is rebuilt, so this pin
 * replaces `runAgentLoop` through a module mock instead.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, parseSSE, resetRateLimiter } from '../test-utils.js';

function unavailable(): Error {
  return Object.assign(new Error('Service unavailable'), { status: 503, statusCode: 503 });
}

describe('POST /api/chat fallback attempt prompt (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-attempt-prompt-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-prompt-pin-1');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('claude-haiku-4-5');
    config.save();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it("reports the fallback attempt's system prompt in done.contextMetrics", async () => {
    const configs: AgentLoopConfig[] = [];
    loop.runAgentLoop.mockImplementation(async (config: AgentLoopConfig): Promise<AgentResponse> => {
      configs.push(config);
      if (configs.length === 1) throw unavailable();
      return { content: 'fallback answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'In one sentence, what is a monorepo?', session: 'prompt-pin', model: 'claude-sonnet-4-6' },
    });
    const events = parseSSE(res.body);
    const done = events.find(e => e.event === 'done');
    expect(done, JSON.stringify(events.filter(e => e.event === 'error'))).toBeDefined();
    const metrics = (JSON.parse(done!.data) as { contextMetrics: { finalSystemPromptChars: number } }).contextMetrics;
    expect(configs.length).toBeGreaterThanOrEqual(2);
    const last = configs[configs.length - 1];
    expect(metrics.finalSystemPromptChars).toBe(last.systemPrompt.length);
    // The fallback's prompt differs from the primary's, so the metric can
    // only match if the fallback attempt wrote its prompt back.
    expect(last.systemPrompt).not.toBe(configs[0].systemPrompt);
  });
});
