/**
 * Characterization tests for the chat turn's session-runtime acquisition
 * (TD-CHAT-3 slice 16).
 *
 * The phase assigns two values the handler's outer `finally` and `sendEvent`
 * read even when the phase throws midway: the workspace activity lease and
 * the turn signal joined to the workspace session's abort. These pins drive
 * the two exits no other test reached: a workspace session that is already
 * aborted when its lease is taken, and a request-scoped runtime that cannot
 * be built.
 *
 * `server.agentRunner` is deliberately LEFT UNSET: the phase is gated on
 * `!hasCustomRunner`, so an injected runner would skip it.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { loadSessionMessages } from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

describe('POST /api/chat session-runtime acquisition (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-session-runtime-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-session-runtime-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  function createWorkspace(label: string): string {
    return server.workspaceManager.create({
      name: `${label} ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
  }

  it('ends the turn silently and still releases the lease when the workspace session is already aborted', async () => {
    const workspaceId = createWorkspace('aborted session');
    server.agentState.activeWorkspaceId = workspaceId;
    const sessionManager = server.sessionManager;
    const realAcquireActivity = sessionManager.acquireActivity;
    let releases = 0;
    // The lease is real; its session is aborted the moment it is taken, so
    // the joined turn signal is already aborted when the phase checks it.
    sessionManager.acquireActivity = (id: string) => {
      const lease = realAcquireActivity.call(sessionManager, id);
      if (!lease) return lease;
      lease.session.abortController.abort(new Error('workspace closed under the turn'));
      return {
        session: lease.session,
        release: () => {
          releases += 1;
          lease.release();
        },
      };
    };

    const coordinator = server.agentState.workspaceTurnCoordinator;
    const realCreateScope = coordinator.createScope;
    let scopesCreated = 0;
    coordinator.createScope = (...args: Parameters<typeof realCreateScope>) => {
      scopesCreated += 1;
      return realCreateScope.apply(coordinator, args);
    };

    const session = 'session-aborted';
    let res: Awaited<ReturnType<typeof injectWithAuth>>;
    try {
      resetRateLimiter(server);
      res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hello', workspace: workspaceId, session, model: 'claude-sonnet-4-6' },
      });
    } finally {
      sessionManager.acquireActivity = realAcquireActivity;
      coordinator.createScope = realCreateScope;
    }

    expect(res.statusCode).toBe(200);
    // The failure path runs, but `sendEvent` reads the joined signal the
    // phase assigned, which is aborted, so not even the error frame is sent.
    expect(parseSSE(res.body)).toEqual([]);
    // The outer finally released the lease the phase took before it threw.
    expect(releases).toBe(1);
    // The phase stopped at the aborted signal, before the workspace turn scope.
    expect(scopesCreated).toBe(0);
    // No turn reached history: the phase precedes the history load.
    expect(loadSessionMessages(tmpDir, workspaceId, session)).toEqual([]);
  });

  it('fails the turn closed when the request-scoped runtime cannot be built', async () => {
    // No workspace named: the request-scoped branch builds a runtime on the
    // personal mind.
    server.agentState.activeWorkspaceId = null;
    const realBuildTools = server.agentState.buildToolsForSession;
    server.agentState.buildToolsForSession = () => {
      throw new Error('tool pool unavailable');
    };

    let res: Awaited<ReturnType<typeof injectWithAuth>>;
    try {
      resetRateLimiter(server);
      res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hello', session: 'request-scoped-failure', model: 'claude-sonnet-4-6' },
      });
    } finally {
      server.agentState.buildToolsForSession = realBuildTools;
    }

    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    // The internal cause is replaced by this sentence and is the whole stream.
    expect(events.map(e => e.event)).toEqual(['error']);
    expect(JSON.parse(events[0]!.data)).toEqual({ message: 'Chat workspace is not ready.' });
  });
});
