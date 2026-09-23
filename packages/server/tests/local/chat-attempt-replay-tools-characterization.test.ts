/**
 * Characterization pin: a stream interruption is not replayed on the same model
 * when the turn offers tools (TD-CHAT-3, attempt policy).
 *
 * An injected `server.agentRunner` always receives an empty tool list, so this
 * condition is unreachable through that seam (TD-CHAT-16). The pin replaces
 * `runAgentLoop` through a module mock instead, the harness the tool-activity
 * pins use. The contrast pin keeps it honest: the same interruption on a
 * tool-free turn is replayed.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, parseSSE, resetRateLimiter } from '../test-utils.js';

const RETRY_STEP = 'Model response was interrupted — retrying once on the same model.';

function streamInterruption(): Error {
  const error = new Error(
    'Model stream ended early (stream ended before data: [DONE]); partial content was not accepted.',
  ) as Error & { code: string; usage: { inputTokens: number; outputTokens: number } };
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = { inputTokens: 1, outputTokens: 1 };
  return error;
}

describe('POST /api/chat interrupted-stream replay and tools (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let configs: AgentLoopConfig[];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-replay-tools-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  beforeEach(() => {
    configs = [];
    loop.runAgentLoop.mockReset();
    loop.runAgentLoop.mockImplementation(async (config: AgentLoopConfig): Promise<AgentResponse> => {
      configs.push(config);
      if (configs.length === 1) throw streamInterruption();
      return { content: 'replayed answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
  });

  async function runTurn(message: string, session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session, model: 'claude-sonnet-4-6' },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  const retried = (events: Array<{ event: string; data: string }>) => events
    .some(e => e.event === 'step' && JSON.parse(e.data).content === RETRY_STEP);

  it('replays the interruption on a tool-free turn', async () => {
    const events = await runTurn('In one sentence, what is a monorepo?', 'replay-no-tools');
    expect(configs[0].tools).toHaveLength(0);
    expect(configs).toHaveLength(2);
    expect(retried(events)).toBe(true);
  });

  it('does not replay the interruption when the turn offers tools', async () => {
    const events = await runTurn('Write hello into notes.txt', 'replay-with-tools');
    expect(configs[0].tools.length).toBeGreaterThan(0);
    expect(configs).toHaveLength(1);
    expect(retried(events)).toBe(false);
  });
});
