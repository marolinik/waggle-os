/**
 * Characterization tests for the chat turn's slash-command routing
 * (TD-CHAT-3 slice 16).
 *
 * Every exit of the routing phase that ends the stream was reached by some
 * test except the two cancellation exits: a turn cancelled before routing
 * starts, and a turn cancelled while its canned reply streams. Both are
 * driven here by pausing the managed workspace session, which aborts the
 * turn signal the runtime phase joined to it.
 *
 * `server.agentRunner` is deliberately LEFT UNSET: the joined signal exists
 * only when the runtime phase runs, which is `!hasCustomRunner` gated.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { loadSessionMessages } from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

const PROXY_URL = 'http://proxy.test/v1';

describe('POST /api/chat slash-command routing (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const commandCalls: string[] = [];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-command-routing-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.localConfig.litellmUrl = PROXY_URL;
    server.vault.set('anthropic', 'sk-command-routing-pin');
    new WaggleConfig(tmpDir).save();
    const registry = server.agentState.commandRegistry;
    registry.register({
      name: 'pausehere', aliases: [], description: 'test', usage: '/pausehere',
      handler: async (_args, context) => {
        commandCalls.push('pausehere');
        // Cancels the turn after the command ran, before its reply streams.
        server.sessionManager.pause(context.workspaceId);
        return 'This reply is never streamed.';
      },
    });
    registry.register({
      name: 'pauselater', aliases: [], description: 'test', usage: '/pauselater',
      handler: async (_args, context) => {
        commandCalls.push('pauselater');
        // Cancels the turn on the next timer tick: after the reply's only
        // word is sent, while its per-word delay runs.
        setTimeout(() => server.sessionManager.pause(context.workspaceId), 0);
        return 'streamed';
      },
    });
    registry.register({
      name: 'recorded', aliases: [], description: 'test', usage: '/recorded',
      handler: async () => {
        commandCalls.push('recorded');
        return 'recorded reply';
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    commandCalls.length = 0;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  function createWorkspace(label: string): string {
    const workspaceId = server.workspaceManager.create({
      name: `${label} ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
    server.agentState.activeWorkspaceId = workspaceId;
    return workspaceId;
  }

  async function turn(message: string, workspaceId: string, session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, workspace: workspaceId, session, model: 'claude-sonnet-4-6' },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  it('streams nothing and persists no reply when the turn is cancelled while its command reply streams', async () => {
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'test', checkedAt: new Date().toISOString(),
    };
    const workspaceId = createWorkspace('cancelled command reply');
    const session = 'cancelled-command-reply';

    const events = await turn('/pausehere', workspaceId, session);
    server.sessionManager.resume(workspaceId);

    expect(commandCalls).toEqual(['pausehere']);
    // No token, no done, no error: the reply is abandoned before `done`.
    expect(events).toEqual([]);
    // The user turn was persisted before routing; the reply was not.
    expect(loadSessionMessages(tmpDir, workspaceId, session).map(m => [m.role, m.content]))
      .toEqual([['user', '/pausehere']]);
  });

  it('sends no done and persists no reply when the turn is cancelled after the last word streamed', async () => {
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'test', checkedAt: new Date().toISOString(),
    };
    const workspaceId = createWorkspace('cancelled after last word');
    const session = 'cancelled-after-last-word';

    const events = await turn('/pauselater', workspaceId, session);
    server.sessionManager.resume(workspaceId);

    expect(commandCalls).toEqual(['pauselater']);
    expect(events.map(e => [e.event, JSON.parse(e.data)])).toEqual([['token', { content: 'streamed ' }]]);
    expect(loadSessionMessages(tmpDir, workspaceId, session).map(m => [m.role, m.content]))
      .toEqual([['user', '/pauselater']]);
  });

  it('routes no command when the turn is cancelled before routing starts', async () => {
    // A tracked provider that is not healthy sends the turn through the
    // model-health probe, the last await before routing. The probe cancels
    // the turn and answers healthy.
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'degraded', detail: 'test', checkedAt: new Date().toISOString(),
    };
    const workspaceId = createWorkspace('cancelled before routing');
    const session = 'cancelled-before-routing';
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(PROXY_URL) && url.includes('/health/')) {
        server.sessionManager.pause(workspaceId);
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    });

    const events = await turn('/recorded', workspaceId, session);
    server.sessionManager.resume(workspaceId);

    expect(commandCalls).toEqual([]);
    expect(events).toEqual([]);
    expect(loadSessionMessages(tmpDir, workspaceId, session).map(m => [m.role, m.content]))
      .toEqual([['user', '/recorded']]);
  });
});
