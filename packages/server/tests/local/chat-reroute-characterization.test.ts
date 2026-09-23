/**
 * Characterization tests for a slash command that asks to be rerouted through
 * the agent loop (TD-CHAT-25).
 *
 * A command answers `AGENT_LOOP_REROUTE_PREFIX + <message>`, and the route
 * runs the loop on `<message>`. Both flags that choose the path read the
 * rerouted message as a boolean, so an empty body counted as "no reroute".
 * Every shipped producer writes a non-empty body, so these pins register two
 * commands of their own.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AGENT_LOOP_REROUTE_PREFIX, type AgentLoopConfig, type AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

describe('POST /api/chat rerouted slash commands (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const runnerMessages: string[] = [];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-reroute-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      const last = config.messages[config.messages.length - 1] as { content?: unknown };
      runnerMessages.push(typeof last?.content === 'string' ? last.content : '');
      return { content: 'rerouted answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const registry = server.agentState.commandRegistry;
    registry.register({
      name: 'fullreroute', aliases: [], description: 'test', usage: '/fullreroute',
      handler: async () => `${AGENT_LOOP_REROUTE_PREFIX}Summarise the release notes.`,
    });
    registry.register({
      name: 'emptyreroute', aliases: [], description: 'test', usage: '/emptyreroute',
      handler: async () => AGENT_LOOP_REROUTE_PREFIX,
    });
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function turn(message: string, session: string) {
    runnerMessages.length = 0;
    resetRateLimiter(server);
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload: { message, session } });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  it('runs the agent loop on a rerouted message', async () => {
    const events = await turn('/fullreroute', 'reroute-full');
    expect(runnerMessages).toEqual(['Summarise the release notes.']);
    expect(events.some(e => e.event === 'done')).toBe(true);
  });

  it("answers an empty rerouted message through the loop, on the user's own command", async () => {
    // Until TD-CHAT-25 the turn ended with no answer and no done.
    const events = await turn('/emptyreroute', 'reroute-empty');
    expect(runnerMessages).toEqual(['/emptyreroute']);
    expect(events.some(e => e.event === 'done')).toBe(true);
  });
});
