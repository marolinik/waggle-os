/**
 * Characterization test for the viewer rejection inside
 * `resolveChatWorkspacePaths` (routes/chat.ts).
 *
 * The same rule is written in three places: the security middleware, the chat
 * handler, and the path resolver. For an ordinary request the middleware
 * answers first, so the resolver's copy never runs — which is why it had no
 * test and reads as dead code.
 *
 * It is not dead. `WorkspaceManager.get` re-reads `workspace.json` on every
 * call, so a role downgrade that lands between the middleware's check and the
 * resolver's check is answered by the resolver alone. This pins that window.
 *
 * The two layers answer with the same `code` and different `error` strings, so
 * the assertion is on the string: without it the pin cannot tell which layer
 * replied, and would still pass if the resolver's copy were deleted.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth } from '../test-utils.js';
import { installFakeLlmProvider, type FakeLlmProvider } from '../helpers/fake-llm-provider.js';

describe('POST /api/chat viewer rejection inside the path resolver (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-viewer-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // A rejected viewer turn must never reach the model (TD-CHAT-16).
    provider = installFakeLlmProvider({ respond: { type: 'text', content: 'unreachable' } });
  });

  afterEach(() => {
    expect(provider.requests).toHaveLength(0);
  });

  afterAll(async () => {
    provider.restore();
    server.agentState.activeWorkspaceId = null;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('answers 403 when the role is downgraded after the middleware has checked it', async () => {
    const workspace = server.workspaceManager.create({
      name: 'viewer-toctou',
      group: 'test',
      directory: tmpDir,
    });
    server.workspaceManager.update(workspace.id, { teamId: 'viewer-toctou-team', teamRole: 'member' });
    expect(server.agentState.activateWorkspaceMind(workspace.id)).toBe(true);
    // No `workspace` in the body: the middleware resolves the active workspace
    // instead, which is what makes the resolver's id differ from the body's and
    // brings its viewer branch into play at all.
    server.agentState.activeWorkspaceId = workspace.id;

    const memberConfig = server.workspaceManager.get(workspace.id);
    const viewerConfig = { ...memberConfig, teamRole: 'viewer' };
    // This workspace is read five times per turn, verified by capturing the
    // caller of each read: the middleware's mutation check, then twice inside
    // the target resolver deriving the history and execution ids, then the path
    // resolver's own read, and finally the mind-availability check in that same
    // branch, which looks the workspace up again on its way through.
    //
    // The downgrade lands on the fourth, which is the read the viewer branch
    // decides on. Both counts are asserted below, so a change in the call
    // sequence fails this pin loudly instead of quietly pinning nothing.
    const READS_BEFORE_THE_PATH_RESOLVER = 3;
    const READS_PER_TURN = 5;
    let reads = 0;
    const original = server.workspaceManager.get.bind(server.workspaceManager);
    const getSpy = vi.spyOn(server.workspaceManager, 'get').mockImplementation((id: string) => {
      if (id !== workspace.id) return original(id);
      reads += 1;
      return (reads > READS_BEFORE_THE_PATH_RESOLVER ? viewerConfig : memberConfig) as ReturnType<typeof original>;
    });

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hi' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({
        // DEAD-IN-PRODUCTION for an unchanging role (the middleware answers
        // first); live for this window. Not an argument against removing the
        // duplication later — see TD-CHAT-9 and TD-CHAT-18.
        error: 'Viewers cannot send messages in team workspaces. Ask a team admin to upgrade your role.',
        code: 'VIEWER_READ_ONLY',
      });
      expect(reads).toBe(READS_PER_TURN);
    } finally {
      getSpy.mockRestore();
    }
  });

  it('lets the middleware answer when the role never changes', async () => {
    const workspace = server.workspaceManager.create({
      name: 'viewer-steady',
      group: 'test',
      directory: tmpDir,
    });
    server.workspaceManager.update(workspace.id, { teamId: 'viewer-steady-team', teamRole: 'viewer' });
    expect(server.agentState.activateWorkspaceMind(workspace.id)).toBe(true);
    server.agentState.activeWorkspaceId = workspace.id;

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi' },
    });

    expect(res.statusCode).toBe(403);
    // The other layer's wording, which is how this pin distinguishes them.
    expect(res.json()).toEqual({
      error: 'Viewers cannot modify team workspaces. Ask a team admin to upgrade your role.',
      code: 'VIEWER_READ_ONLY',
    });
  });
});
