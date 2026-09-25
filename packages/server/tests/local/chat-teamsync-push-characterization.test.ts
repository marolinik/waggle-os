/**
 * Characterization tests for the TeamSync push that follows a successful
 * `save_memory` in a team workspace (P4-08, docs/TESTING.md Safety Net Map).
 *
 * The push is fire-and-forget with a `.catch`, so it is NOT complete when the
 * turn is: the pins poll for the egress instead of asserting after `done`.
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16), which
 * scripts a real `save_memory` call; the tool-result handler then drives this
 * block. A `globalThis.fetch` capture sits behind the fake for the egress
 * itself. The destination has to survive
 * the team-server egress guard before `fetch` is consulted at all, so the URL
 * is https and is bound to the same base the workspace records.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { CognifyPipeline } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
} from '../helpers/fake-llm-provider.js';

/**
 * A loopback destination, not a public hostname.
 *
 * `fetchTeamServer` hands the URL to `safeFetch`, which resolves the host
 * through `assertUrlAllowed` BEFORE `globalThis.fetch` is consulted, and
 * refuses `fetchImpl` injection outright. A public name would make the pin
 * depend on live DNS and fail closed offline, with the failure swallowed by
 * the push's own `.catch`. A literal loopback address needs no resolution, and
 * `WAGGLE_ALLOW_LOCAL_FETCH` is what makes the guard accept it.
 */
const TEAM_SERVER_URL = 'http://127.0.0.1:59999';
const TEAM_SLUG = 'pin-team';

interface CapturedPush {
  method: string;
  url: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

describe('POST /api/chat TeamSync push (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;
  let originalFetch: typeof globalThis.fetch;
  let pushes: CapturedPush[];
  let previousAllowLocal: string | undefined;
  let provider: FakeLlmProvider | undefined;

  beforeAll(async () => {
    previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
    process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-teamsync-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    const config = new WaggleConfig(tmpDir);
    config.setTeamServer({
      url: TEAM_SERVER_URL,
      token: 'team-token-pin',
      userId: 'user-pin',
      displayName: 'Pin User',
    });
    config.save();
    workspaceId = server.workspaceManager.create({
      name: `teamsync pin ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
    // Team membership is set through `update`, so the pin does not depend on
    // which fields `create` happens to copy from its options.
    server.workspaceManager.update(workspaceId, {
      teamId: TEAM_SLUG,
      teamServerUrl: TEAM_SERVER_URL,
    });
    server.agentState.activeWorkspaceId = workspaceId;
    markFakeProviderHealthy(server);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    provider?.restore();
    provider = undefined;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
    else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Captures every team-server egress; everything else 404s. */
  function captureEgress() {
    pushes = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(TEAM_SERVER_URL)) {
        const headers = new Headers(init?.headers ?? {});
        pushes.push({
          method: String(init?.method ?? 'GET'),
          url,
          authorization: headers.get('authorization'),
          body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ id: 'remote-1' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    }) as typeof globalThis.fetch;
  }

  /**
   * The entity pushes only.
   *
   * A team workspace turn also fetches capability policies and forwards an
   * audit event to the same host, so counting every egress would count three
   * unrelated things and pass for the wrong reason.
   */
  const entityPushes = (): CapturedPush[] => pushes.filter(
    p => p.method === 'POST' && p.url.endsWith('/entities'),
  );

  /** The push is fire-and-forget, so the turn finishing proves nothing. */
  async function waitForPush(): Promise<void> {
    for (let attempt = 0; attempt < 50 && entityPushes().length === 0; attempt++) {
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /**
   * The model calls the real `save_memory` once, then answers. Installed after
   * `captureEgress`, so every non-model request reaches the capture.
   */
  function modelSaving(content = 'a decision worth keeping') {
    provider = installFakeLlmProvider({
      respond: (request) => (request.messages.some(m => m.role === 'tool')
        ? { type: 'text', content: 'saved', usage: { inputTokens: 1, outputTokens: 1 } }
        : { type: 'tool_calls', calls: [{ name: 'save_memory', args: { content } }] }),
      otherRequest: 'previous',
    });
  }

  /** The `save_memory` result the turn reported to the client. */
  let lastSaveResult: string | undefined;

  async function runTurn(session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Remember that the installer ships Windows first.',
        session,
        workspace: workspaceId,
        model: 'claude-sonnet-4-6',
      },
    });
    const saveResult = parseSSE(res.body)
      .filter(e => e.event === 'tool_result')
      .map(e => JSON.parse(e.data) as { name: string; result: string })
      .find(e => e.name === 'save_memory');
    lastSaveResult = saveResult?.result;
    return res.statusCode;
  }

  it('pushes a saved memory to the bound team server', async () => {
    captureEgress();
    modelSaving();
    const session = `teamsync-push-${Date.now()}`;
    expect(await runTurn(session)).toBe(200);
    await waitForPush();

    expect(entityPushes()).toHaveLength(1);
    const push = entityPushes()[0];
    expect(push.url).toBe(`${TEAM_SERVER_URL}/api/teams/${TEAM_SLUG}/entities`);
    expect(push.authorization).toBe('Bearer team-token-pin');
    expect(push.body.entityType).toBe('memory_frame');
    // The conversation grouping the remote side sees is the chat session, and
    // it arrives as the entity NAME: `frameToEntity` maps `gop_id` onto `name`,
    // so a reader looking for `gop_id` on the wire will not find it.
    // The session id is typed `string` and never nullish here, so the push
    // carries no fallback (TD-CHAT-40 removed a dead `?? 'unknown'`).
    expect(push.body.name).toBe(session);
    // The remote copy is the tool result, capped: a local write is not
    // reproduced verbatim without bound. Re-pinned on the real tool's result
    // (TD-CHAT-16 ruling 9); the injected runner fed 'Saved 1 memory.'.
    expect(lastSaveResult).toMatch(/^Memory saved to workspace mind \(/);
    expect((push.body.properties as { content?: unknown }).content).toBe(lastSaveResult);
  });

  it('pushes nothing when the save failed', async () => {
    captureEgress();
    // Fault-injected write (TD-CHAT-16 ruling 9): the real tool's mind write
    // throws, so its result is an error and the save counts as failed.
    vi.spyOn(CognifyPipeline.prototype, 'cognify').mockRejectedValue(new Error('could not write the frame'));
    // Distinct content: the earlier pin's frame would otherwise dedup this save.
    modelSaving('a second decision that fails to persist');
    expect(await runTurn(`teamsync-error-${Date.now()}`)).toBe(200);
    await waitForPush();

    // A failed local write must not become a remote one. The unrelated team
    // egress on the same host still happens, which is why this counts entity
    // pushes and not every request.
    expect(lastSaveResult).toMatch(/could not write the frame/);
    expect(entityPushes()).toHaveLength(0);
  });
});
