/**
 * Characterization tests for the post-commit block in `routes/chat.ts`
 * (P4-07, docs/TESTING.md Safety Net Map).
 *
 * Everything in this block runs AFTER the response was committed: the assistant
 * history, the trace, the token stream and the `done` event have all been sent.
 * So its contract is that nothing in it can reach the client, whatever fails -
 * and the pins here are all shaped as "the turn is unchanged".
 *
 * The two halves need different harnesses, which is why they are split:
 *
 * - the observer's own failure: the workspace-name read that feeds the
 *   completion notification is not guarded, so a throwing `listWorkspaces`
 *   reaches it;
 * - the auto-save catch, reached through a spy on the orchestrator method.
 *
 * Both run the real agent loop against the fake provider (TD-CHAT-16).
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Orchestrator } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import { installFakeLlmProvider, type FakeLlmProvider } from '../helpers/fake-llm-provider.js';

describe('POST /api/chat post-commit block (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;
  let provider: FakeLlmProvider | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-postcommit-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-postcommit-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
    workspaceId = server.workspaceManager.create({
      name: `post-commit pin ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
    server.agentState.activeWorkspaceId = workspaceId;
  });

  afterEach(() => {
    provider?.restore();
    provider = undefined;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function runTurn(session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Say something short.',
        session,
        workspace: workspaceId,
        model: 'claude-sonnet-4-6',
      },
    });
    return { status: res.statusCode, events: parseSSE(res.body) };
  }

  /** Asserts the turn was delivered whole, whatever happened after commit. */
  function expectTurnUnaffected(
    status: number,
    events: Array<{ event: string; data: string }>,
    content: string,
  ): void {
    expect(status).toBe(200);
    // The model was reached: the setup-required reply also streams a done.
    expect(provider!.requests.length).toBeGreaterThan(0);
    expect(events.some(e => e.event === 'error')).toBe(false);
    const done = events.find(e => e.event === 'done');
    expect(done).toBeDefined();
    expect(JSON.parse(done!.data).content).toBe(content);
  }

  it('delivers the turn when the post-commit observer itself throws', async () => {
    // The workspace-name read that feeds the completion notification is
    // unguarded, so a failing `listWorkspaces` throws inside the observer -
    // after the response was committed. Only the outer catch sees it.
    const realListWorkspaces = server.agentState.listWorkspaces;
    server.agentState.listWorkspaces = () => {
      throw new Error('workspace registry unavailable');
    };
    provider = installFakeLlmProvider({
      respond: { type: 'text', content: 'committed answer', usage: { inputTokens: 1, outputTokens: 1 } },
    });

    try {
      const { status, events } = await runTurn(`post-commit-observer-${Date.now()}`);
      expectTurnUnaffected(status, events, 'committed answer');
    } finally {
      server.agentState.listWorkspaces = realListWorkspaces;
    }
  });

  it.each([
    ['a closed mind handle', 'database connection is not open'],
    ['any other failure', 'disk quota exceeded'],
  ])('delivers the turn when auto-save fails with %s', async (_label, message) => {
    // `isClosedDbError` splits these two into different log lines and NOTHING
    // else: both are swallowed, both leave the turn identical. The pin records
    // that the distinction is unobservable from any client-visible surface, so
    // a refactor that drops the branch would not fail a test here - only the
    // structured warning that exists to diagnose cache eviction would go quiet.
    const spy = vi.spyOn(Orchestrator.prototype, 'autoSaveFromExchange')
      .mockRejectedValue(new Error(message));
    provider = installFakeLlmProvider({
      respond: { type: 'text', content: 'real path answer', usage: { inputTokens: 4, outputTokens: 3 } },
    });

    const { status, events } = await runTurn(`post-commit-autosave-${Date.now()}`);
    expectTurnUnaffected(status, events, 'real path answer');
    // The seam really was reached: without this the pin would pass on a turn
    // that never attempted an auto-save at all.
    expect(spy).toHaveBeenCalled();
  });
});
