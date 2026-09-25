/**
 * Unit pins for the TeamSync push guard in `applyToolResultSideEffects`: a
 * `save_memory` result in a team workspace is pushed only with the Team token
 * configured for the server that workspace is bound to.
 *
 * This moved here from team-integration's route pin (TD-CHAT-16 ruling 17).
 * On the real chat path, a workspace bound to another server fails the turn's
 * governance check before the model runs, so the route never reaches the guard.
 *
 * Loopback destinations with `WAGGLE_ALLOW_LOCAL_FETCH`, as in
 * `chat-teamsync-push-characterization`: the egress guard resolves a public
 * host before `fetch` is consulted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { applyToolResultSideEffects } from '../../src/local/routes/chat-tool-result-effects.js';
import { TurnRetention } from '../../src/local/routes/chat-turn-retention.js';

const SERVER_A = 'http://127.0.0.1:59998';
const SERVER_B = 'http://127.0.0.1:59997';

describe('applyToolResultSideEffects TeamSync push guard', () => {
  let tmpDir: string;
  let previousAllowLocal: string | undefined;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
    process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tool-result-effects-'));
    fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'remote-frame' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
    else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function configureTeamServer(url: string, token: string): void {
    const config = new WaggleConfig(tmpDir);
    config.setTeamServer({ url, token });
    config.save();
  }

  function saveMemoryIn(workspaceTeamServerUrl: string): void {
    const server = {
      localConfig: { dataDir: tmpDir },
      workspaceManager: {
        get: () => ({ id: 'ws-team', name: 'Team', teamId: 'team-a', teamServerUrl: workspaceTeamServerUrl }),
      },
    } as unknown as FastifyInstance;
    applyToolResultSideEffects({
      server,
      executionScopeId: 'ws-team',
      activeExecutionWorkspaceId: 'ws-team',
      sessionId: 'session-1',
      retention: new TurnRetention({
        allowMemoryPersistence: true, allowDerivedPersistence: true, allowResponseDecoration: true,
      }),
      sendEvent: () => {},
      name: 'save_memory',
      input: { content: 'Team decision' },
      result: 'Memory saved to workspace mind (frame #1)',
      isError: false,
    });
  }

  function authorizations(): Array<string | null> {
    return fetchSpy.mock.calls.map(([, init]) => new Headers((init as RequestInit | undefined)?.headers).get('authorization'));
  }

  it('pushes with the configured token when the workspace is bound to that server', async () => {
    configureTeamServer(SERVER_A, 'server-a-token');
    saveMemoryIn(SERVER_A);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${SERVER_A}/api/teams/team-a/entities`);
    expect(authorizations()).toEqual(['Bearer server-a-token']);
  });

  it('does not push a Team token configured for another server', async () => {
    configureTeamServer(SERVER_B, 'server-b-token');
    saveMemoryIn(SERVER_A);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
