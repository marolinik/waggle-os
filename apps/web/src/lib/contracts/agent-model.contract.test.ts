/**
 * Contract test — GET /api/agent/model
 *
 * Incident: FR #3 (commit 2b6ffe1) — Chat model dropdown fell through to
 * stale settings.defaultModel because adapter.getModel() returned the whole
 * { model: "..." } object instead of the declared string.
 *
 * Fix: adapter.getModel() unwraps both the object shape and the bare-string
 * shape defensively.
 *
 * The server route is implemented in packages/server/src/local/routes/agent.ts
 * and currently returns { model: "<string>" } (object shape).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import LocalAdapter from '../adapter';

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

describe('GET /api/agent/model — adapter contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => fetchSpy.mockRestore());

  it('unwraps { model: "..." } object to a bare string (current server shape)', async () => {
    fetchSpy = mockFetch({ model: 'claude-sonnet-4-6' });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModel();

    expect(typeof result).toBe('string');
    expect(result).toBe('claude-sonnet-4-6');
  });

  it('passes a bare string through unchanged (future server-convergence shape)', async () => {
    fetchSpy = mockFetch('claude-sonnet-4-6');
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModel();

    expect(result).toBe('claude-sonnet-4-6');
  });

  it('returns empty string when model field is absent, not undefined (crash-safe)', async () => {
    fetchSpy = mockFetch({});
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModel();

    expect(result).toBe('');
    // Should be usable as a string key without crashing
    expect(typeof result).toBe('string');
  });

  it('returns empty string for null model field', async () => {
    fetchSpy = mockFetch({ model: null });
    const adapter = new LocalAdapter('http://test:9999');
    const result = await adapter.getModel();
    expect(result).toBe('');
  });

  it('result is always a string regardless of server shape', async () => {
    for (const body of [
      { model: 'claude-opus-4-7' },
      'claude-opus-4-7',
      {},
      { model: null },
    ]) {
      fetchSpy.mockRestore();
      fetchSpy = mockFetch(body);
      const adapter = new LocalAdapter('http://test:9999');
      const result = await adapter.getModel();
      expect(typeof result).toBe('string');
    }
  });
});
