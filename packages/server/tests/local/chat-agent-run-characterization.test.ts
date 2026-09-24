/**
 * Characterization pins for the agent-loop callbacks the chat route hands its
 * runner (TD-CHAT-3 slice 15): the two whose effects had no executing test.
 * - `onGiveUp` surfaces the loop-guard's give-up copy as a `step` event.
 * - `onToolUse` publishes a `tool:called` Waggle signal for the turn's scope.
 *
 * The seam is `server.agentRunner`, which calls the callbacks the route
 * passed in its config.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

describe('POST /api/chat agent-loop callbacks (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-agent-run-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  beforeEach(() => resetRateLimiter(server));

  afterAll(async () => {
    server.agentRunner = undefined;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  const answer = (content: string): AgentResponse => ({
    content, toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 },
  });

  async function turn(session: string) {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message: 'Plan the launch week please', session },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  it('surfaces the loop-guard give-up copy as a step', async () => {
    server.agentRunner = async (config: AgentLoopConfig) => {
      config.onGiveUp?.('I stopped after repeated tool failures.');
      return answer('I stopped after repeated tool failures.');
    };
    const events = await turn('agent-run-give-up');
    const steps = events.filter(e => e.event === 'step').map(e => (JSON.parse(e.data) as { content: string }).content);
    expect(steps).toContain('I stopped after repeated tool failures.');
  });

  it('publishes a tool:called signal for the turn scope when a tool starts', async () => {
    server.agentRunner = async (config: AgentLoopConfig) => {
      config.onToolUse?.('list_skills', { filter: 'launch' });
      config.onToolResult?.('list_skills', { filter: 'launch' }, 'no skills');
      return answer('No skills match.');
    };
    await turn('agent-run-tool-signal');
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/waggle/signals?limit=200' });
    const { signals } = res.json() as { signals: Array<{ type: string; workspaceId: string; content: string }> };
    // A request naming no workspace runs in the server's active one.
    expect(signals).toContainEqual(expect.objectContaining({
      type: 'tool:called',
      workspaceId: server.agentState.activeWorkspaceId,
      content: 'list_skills({"filter":"launch"})',
    }));
  });
});
