/**
 * Characterization tests for the resources one chat turn holds and releases in
 * `routes/chat.ts` (TD-CHAT-3 prerequisite, docs/TESTING.md Safety Net Map).
 *
 * Seven hoisted mutable variables track what a turn acquired so the outer
 * `finally` can release it on every exit: the request hook registry and its
 * `pre:tool` unregister function, the workspace-session activity lease, the
 * chat runtime, the workspace turn scope, and two mind-cache pins (a named
 * workspace's turn pin, a request-owned shared mind's pin). The `finally`
 * releases them in a fixed order, the lease last and only after the SSE stream
 * has ended.
 *
 * The existing net pinned the lease alone (released exactly once, after the
 * terminal signal and assistant message are persisted). Nothing pinned the
 * scope, the pins, the hook or the order. These pins observe each release
 * through a wrapper and write it to one shared log, so the ORDER is pinned as
 * well as the count.
 *
 * Not pinned here: the chat-runtime release (`releaseChatRuntime` decrements a
 * closure-private cache, so it is not observable from outside), and the
 * request-owned shared-mind pin (a turn naming `default` and a turn naming no
 * workspace both resolve to the managed default workspace, so a plain request
 * does not reach that branch).
 *
 * The seam is `runAgentLoop` mocked at the module boundary: every resource
 * except the hook registry is acquired only when no custom runner is installed.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MindDB } from '@waggle/core';
import { HookRegistry, type AgentLoopConfig, type AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSseJson as parseSse } from '../test-utils.js';

const testState = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: testState.runAgentLoop };
});

vi.mock('../../src/local/model-availability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/local/model-availability.js')>();
  return {
    ...actual,
    resolveUsableModel: async (_server: FastifyInstance, requestedModel: string) => requestedModel,
  };
});

vi.mock('../../src/local/services/optimizer-service.js', () => ({
  getOptimizerService: async () => ({
    expandWithChoices: async () => ({ expanded: null, clarifyingQuestions: null, intent: 'request' }),
  }),
}));

const MODEL = 'openrouter/anthropic/claude-sonnet-5';
const MESSAGE = 'Draft a short agenda for the launch review with the team.';

describe('POST /api/chat turn teardown (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let log: string[];

  const answer = async (config: AgentLoopConfig): Promise<AgentResponse> => {
    config.onToken?.('Agenda drafted.');
    return { content: 'Agenda drafted.', toolsUsed: [], usage: { inputTokens: 10, outputTokens: 10 } };
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-teardown-'));
    new MindDB(path.join(tmpDir, 'personal.mind')).close();
    testState.runAgentLoop.mockImplementation(answer);
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimiter(server);
    testState.runAgentLoop.mockReset().mockImplementation(answer);
    log = [];
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Wraps every release the route can make observable, writing each to `log`. */
  function observeReleases(): void {
    const on = HookRegistry.prototype.on;
    vi.spyOn(HookRegistry.prototype, 'on').mockImplementation(function (this: HookRegistry, event, fn) {
      const unregister = on.call(this, event, fn);
      return () => {
        log.push(`hook:${event}`);
        unregister();
      };
    });

    const coordinator = server.agentState.workspaceTurnCoordinator;
    const createScope = coordinator.createScope.bind(coordinator);
    vi.spyOn(coordinator, 'createScope').mockImplementation((root, signal) => {
      const scope = createScope(root, signal);
      const release = scope.release.bind(scope);
      scope.release = async () => {
        log.push('scope');
        await release();
      };
      return scope;
    });

    const mindRelease = server.mindCache.release.bind(server.mindCache);
    vi.spyOn(server.mindCache, 'release').mockImplementation((id: string) => {
      log.push(`mind:${id}`);
      mindRelease(id);
    });

    const acquireActivity = server.sessionManager.acquireActivity.bind(server.sessionManager);
    vi.spyOn(server.sessionManager, 'acquireActivity').mockImplementation((id: string) => {
      const lease = acquireActivity(id);
      if (!lease) return lease;
      return {
        session: lease.session,
        release: () => {
          log.push('lease');
          lease.release();
        },
      };
    });
  }

  async function chat(session: string, workspace?: string) {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: MESSAGE,
        model: MODEL,
        persona: 'general-purpose',
        session,
        ...(workspace ? { workspace } : {}),
      },
    });
    expect(res.statusCode).toBe(200);
    return parseSse(res.body);
  }

  function namedWorkspace(name: string): string {
    return server.workspaceManager.create({ name, group: 'Test' }).id;
  }

  it('named workspace, answered turn: unregisters the hook first, then scope, turn mind pin, lease last', async () => {
    const workspace = namedWorkspace('Teardown answered');
    observeReleases();

    const events = await chat('teardown-answered', workspace);

    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(log).toEqual(['hook:pre:tool', 'scope', `mind:${workspace}`, 'lease']);
  });

  it('named workspace, failed turn: the finally unregisters the hook after the pin, lease still last', async () => {
    const workspace = namedWorkspace('Teardown failed');
    testState.runAgentLoop.mockImplementation(async () => {
      throw new Error('forced teardown failure');
    });
    observeReleases();

    const events = await chat('teardown-failed', workspace);

    expect(events.some(e => e.event === 'done')).toBe(false);
    expect(log).toEqual(['scope', `mind:${workspace}`, 'hook:pre:tool', 'lease']);
  });

  it('the `default` alias is the managed default workspace: the same order as any named workspace', async () => {
    observeReleases();

    const events = await chat('teardown-default-alias', 'default');

    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(log).toEqual(['hook:pre:tool', 'scope', 'mind:default-workspace', 'lease']);
  });

  it('a turn that names no workspace also runs in the managed default workspace', async () => {
    observeReleases();

    const events = await chat('teardown-pathless');

    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(log).toEqual(['hook:pre:tool', 'scope', 'mind:default-workspace', 'lease']);
  });

  it('a lease that cannot be acquired fails the turn before any other resource is held', async () => {
    const workspace = namedWorkspace('Teardown paused');
    observeReleases();
    vi.mocked(server.sessionManager.acquireActivity).mockImplementation(() => undefined);

    const events = await chat('teardown-no-lease', workspace);

    expect(events.find(e => e.event === 'error')?.data.message).toBe(`Workspace "${workspace}" is not ready for chat.`);
    expect(testState.runAgentLoop).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });
});
