/**
 * Contract test — GET /api/fleet
 *
 * Incident: FR #16 (commit aef42a9) — MissionControlApp crashed on
 * `.toLocaleString()` of undefined because the server emits
 * { durationMs, tokensUsed } but FleetSession declares { duration, tokenUsage }.
 *
 * Fix: adapter.getFleet() normalises both field-name variants.
 *
 * Server emit shape verified from:
 *   packages/server/src/local/routes/fleet.ts  GET /api/fleet
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalAdapter from '../adapter';
import type { FleetSession } from '../types';

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Exact shape of one session entry as assembled by fleet.ts getActive() map.
 * Fields: workspaceId, workspaceName, personaId, model, status,
 *         lastActivity, durationMs, toolCount, tokensUsed, costEstimate.
 */
const SERVER_SESSION_EMIT = {
  workspaceId: 'ws-research',
  workspaceName: 'Research Hub',
  personaId: 'researcher',
  model: 'claude-sonnet-4-6',
  status: 'active',
  lastActivity: 1714500000000,
  durationMs: 12500,
  toolCount: 7,
  tokensUsed: 4200,
  costEstimate: 0.0126,
};

/** Server response envelope — fleet.ts returns { sessions, count, maxSessions }. */
const SERVER_FLEET_RESPONSE = {
  sessions: [SERVER_SESSION_EMIT],
  count: 1,
  maxSessions: 3,
};

/** Pre-normalised variant — server could converge to declared names later. */
const SERVER_SESSION_ALREADY_NORMALISED = {
  workspaceId: 'ws-1',
  workspaceName: 'WS 1',
  model: 'claude-sonnet-4-6',
  status: 'active',
  duration: 5000,
  toolCount: 2,
  tokenUsage: 800,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/fleet — adapter contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => fetchSpy.mockRestore());

  it('normalises server durationMs / tokensUsed to the declared FleetSession shape', async () => {
    fetchSpy = mockFetch(SERVER_FLEET_RESPONSE);
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getFleet();

    expect(result).toHaveLength(1);
    const session = result[0];

    // Client contract fields must be present and numeric
    expect(typeof session.duration).toBe('number');
    expect(typeof session.tokenUsage).toBe('number');
    expect(session.duration).toBe(12500);
    expect(session.tokenUsage).toBe(4200);

    // .toLocaleString() must not throw (the crash from FR #16)
    expect(() => session.tokenUsage.toLocaleString()).not.toThrow();
    expect(() => session.duration.toLocaleString()).not.toThrow();
  });

  it('also accepts the already-normalised field names (server-side convergence path)', async () => {
    fetchSpy = mockFetch({ sessions: [SERVER_SESSION_ALREADY_NORMALISED] });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getFleet();

    expect(result[0].duration).toBe(5000);
    expect(result[0].tokenUsage).toBe(800);
  });

  it('result satisfies the FleetSession TypeScript contract', async () => {
    fetchSpy = mockFetch(SERVER_FLEET_RESPONSE);
    const adapter = new LocalAdapter('http://test:9999');
    const result: FleetSession[] = await adapter.getFleet();

    for (const s of result) {
      expect(typeof s.workspaceId).toBe('string');
      expect(typeof s.workspaceName).toBe('string');
      expect(typeof s.status).toBe('string');
      expect(typeof s.duration).toBe('number');
      expect(typeof s.toolCount).toBe('number');
      expect(typeof s.model).toBe('string');
      expect(typeof s.tokenUsage).toBe('number');
    }
  });

  it('handles an empty sessions list without throwing', async () => {
    fetchSpy = mockFetch({ sessions: [], count: 0, maxSessions: 3 });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getFleet();
    expect(result).toEqual([]);
  });

  it('missing durationMs / tokensUsed fall back to 0, not undefined (crash-safe)', async () => {
    fetchSpy = mockFetch({ sessions: [{ workspaceId: 'ws-x', status: 'idle' }] });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getFleet();
    expect(result[0].duration).toBe(0);
    expect(result[0].tokenUsage).toBe(0);
    expect(() => result[0].tokenUsage.toLocaleString()).not.toThrow();
  });

  it('workspaceName falls back to workspaceId when absent', async () => {
    fetchSpy = mockFetch({ sessions: [{ workspaceId: 'ws-fallback', status: 'idle' }] });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getFleet();
    expect(result[0].workspaceName).toBe('ws-fallback');
  });
});
