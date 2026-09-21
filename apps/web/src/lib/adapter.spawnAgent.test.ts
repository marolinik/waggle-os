/**
 * H-03 · P36 — LocalAdapter.spawnAgent submission wiring.
 *
 * The dock spawn-agent button opens SpawnAgentDialog; the dialog's submit
 * path calls `adapter.spawnAgent(...)` which must POST the task payload to
 * `/api/fleet/spawn`. This test pins the contract between the UI and the
 * server route so regressions in either side surface as a test failure.
 *
 * E2E coverage for the dock click → dialog open path lives in
 * tests/e2e/spawn-agent-flow.spec.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

describe('LocalAdapter.spawnAgent', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'run-1',
          runId: 'run-1',
          roomId: 'room-1',
          workspaceId: 'ws-1',
          sessionId: 'spawn-run-1',
          status: 'queued',
          statusUrl: '/api/agent-runs/run-1',
          resumable: false,
          task: 'test',
          persona: 'researcher',
          model: 'claude-sonnet-4-6',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs to /api/fleet/spawn with the full form payload', async () => {
    const adapter = new LocalAdapter('http://test-server:9999');

    await adapter.spawnAgent({
      task: 'Run a short sanity check',
      model: 'claude-sonnet-4-6',
      persona: 'researcher',
      parentWorkspaceId: 'ws-1',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe('http://test-server:9999/api/fleet/spawn');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      task: 'Run a short sanity check',
      model: 'claude-sonnet-4-6',
      persona: 'researcher',
      parentWorkspaceId: 'ws-1',
    });
  });

  it('POSTs a minimal payload when optional fields are omitted', async () => {
    const adapter = new LocalAdapter('http://test-server:9999');
    await adapter.spawnAgent({ task: 'minimal' });

    const [, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ task: 'minimal' });
    // Guards against accidental default injection server-side — undefined
    // optional keys must be dropped, not sent as explicit undefined/null.
    expect(body).not.toHaveProperty('model');
    expect(body).not.toHaveProperty('persona');
    expect(body).not.toHaveProperty('parentWorkspaceId');
  });

  it('returns the parsed server response', async () => {
    const adapter = new LocalAdapter('http://test-server:9999');
    const result = await adapter.spawnAgent({ task: 'test' });
    expect(result).toEqual({
      id: 'run-1',
      runId: 'run-1',
      roomId: 'room-1',
      workspaceId: 'ws-1',
      sessionId: 'spawn-run-1',
      status: 'queued',
      statusUrl: '/api/agent-runs/run-1',
      resumable: false,
      task: 'test',
      persona: 'researcher',
      model: 'claude-sonnet-4-6',
    });
  });

  it('rejects a legacy response without canonical run and Room identity', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ id: 'legacy-session', workspaceId: 'ws-1', status: 'running' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    const adapter = new LocalAdapter('http://test-server:9999');

    await expect(adapter.spawnAgent({ task: 'test' })).rejects.toThrow(
      'Agent started without a canonical Room identity',
    );
  });

  it.each([
    [
      'a missing Room identity',
      {
        runId: 'run-1', sessionId: 'session-1', workspaceId: 'ws-1',
        status: 'queued', statusUrl: '/api/agent-runs/run-1', resumable: false, task: 'test',
      },
      {},
    ],
    [
      'an untrusted status URL',
      {
        runId: 'run-1', roomId: 'room-1', sessionId: 'session-1', workspaceId: 'ws-1',
        status: 'queued', statusUrl: 'https://example.invalid/steal', resumable: false, task: 'test',
      },
      {},
    ],
    [
      'a different workspace than the requested workspace',
      {
        runId: 'run-1', roomId: 'room-1', sessionId: 'session-1', workspaceId: 'ws-other',
        status: 'queued', statusUrl: '/api/agent-runs/run-1', resumable: false, task: 'test',
      },
      { workspaceId: 'ws-1' },
    ],
  ])('rejects a successful saved-agent run with %s', async (_case, payload, opts) => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(payload), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }));
    const adapter = new LocalAdapter('http://test-server:9999');

    await expect(adapter.runAgent('agent-1', opts)).rejects.toThrow(
      'Agent run returned an invalid navigation handoff',
    );
  });

  it('accepts a canonical saved-agent navigation handoff', async () => {
    const adapter = new LocalAdapter('http://test-server:9999');

    await expect(adapter.runAgent('agent-1', { workspaceId: 'ws-1' })).resolves.toMatchObject({
      runId: 'run-1',
      roomId: 'room-1',
      sessionId: 'spawn-run-1',
      workspaceId: 'ws-1',
      statusUrl: '/api/agent-runs/run-1',
    });
  });

  it.each([
    ['runId', { runId: '../run-1' }],
    ['sessionId', { sessionId: 'session/1' }],
    ['workspaceId', { workspaceId: '' }],
    ['status', { status: 'finished' }],
    ['resumable', { resumable: 'false' }],
    ['task', { task: null }],
    ['canonical status path', { statusUrl: '/api/agent-runs/a-different-run' }],
  ])('rejects a handoff with an invalid %s', async (_field, patch) => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      runId: 'run-1',
      roomId: 'room-1',
      sessionId: 'session-1',
      workspaceId: 'ws-1',
      status: 'queued',
      statusUrl: '/api/agent-runs/run-1',
      resumable: false,
      task: 'test',
      ...patch,
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }));
    const adapter = new LocalAdapter('http://test-server:9999');

    await expect(adapter.runAgent('agent-1')).rejects.toThrow(
      'Agent run returned an invalid navigation handoff',
    );
  });
});
