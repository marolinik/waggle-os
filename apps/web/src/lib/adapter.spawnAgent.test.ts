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
          id: 'test-session',
          workspaceId: 'ws-1',
          status: 'running',
          startedAt: '2026-04-19T00:00:00Z',
        }),
        {
          status: 200,
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
      id: 'test-session',
      workspaceId: 'ws-1',
      status: 'running',
      startedAt: '2026-04-19T00:00:00Z',
    });
  });
});
