/**
 * P4 · LocalAdapter permissions roundtrip.
 *
 * Verifies the client side of the P4 refactor: getPermissions() hits the
 * right URL + deserializes defaultAutonomy, and savePermissions() passes
 * through the partial payload untouched. The server half is covered by
 * packages/server/tests/local/settings-permissions.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

describe('LocalAdapter permissions methods (P4)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function respondWith(payload: unknown, status = 200): void {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  describe('getPermissions', () => {
    it('GETs /api/settings/permissions and returns the body as-is', async () => {
      respondWith({
        defaultAutonomy: 'trusted',
        externalGates: ['git push'],
        workspaceOverrides: { 'ws-1': ['deploy'] },
      });
      const adapter = new LocalAdapter('http://test:1');
      const result = await adapter.getPermissions();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/api/settings/permissions');
      // GET — no explicit method or body. The adapter may still send default
      // request options (e.g. auth headers), so just assert the semantic opts.
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.body).toBeUndefined();

      expect(result).toEqual({
        defaultAutonomy: 'trusted',
        externalGates: ['git push'],
        workspaceOverrides: { 'ws-1': ['deploy'] },
      });
    });

    it('returns each enum value untouched', async () => {
      for (const level of ['normal', 'trusted', 'yolo'] as const) {
        respondWith({ defaultAutonomy: level, externalGates: [], workspaceOverrides: {} });
        const adapter = new LocalAdapter('http://test:1');
        const result = await adapter.getPermissions();
        expect(result.defaultAutonomy).toBe(level);
      }
    });
  });

  describe('savePermissions', () => {
    it('PUTs /api/settings/permissions with a JSON body containing the partial payload', async () => {
      respondWith({ defaultAutonomy: 'yolo', externalGates: [], workspaceOverrides: {} });
      const adapter = new LocalAdapter('http://test:1');
      await adapter.savePermissions({ defaultAutonomy: 'yolo' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/api/settings/permissions');
      expect(init?.method).toBe('PUT');
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body).toEqual({ defaultAutonomy: 'yolo' });
    });

    it('accepts partial updates — gates-only, no autonomy', async () => {
      respondWith({ defaultAutonomy: 'normal', externalGates: ['rm -rf'], workspaceOverrides: {} });
      const adapter = new LocalAdapter('http://test:1');
      await adapter.savePermissions({ externalGates: ['rm -rf'] });

      const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body ?? '{}'));
      expect(body).toEqual({ externalGates: ['rm -rf'] });
      expect(body).not.toHaveProperty('defaultAutonomy');
    });

    it('accepts the full triple (autonomy + gates + workspace overrides)', async () => {
      respondWith({ defaultAutonomy: 'trusted', externalGates: ['x'], workspaceOverrides: { w: ['y'] } });
      const adapter = new LocalAdapter('http://test:1');
      await adapter.savePermissions({
        defaultAutonomy: 'trusted',
        externalGates: ['x'],
        workspaceOverrides: { w: ['y'] },
      });
      const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body ?? '{}'));
      expect(body.defaultAutonomy).toBe('trusted');
      expect(body.externalGates).toEqual(['x']);
      expect(body.workspaceOverrides).toEqual({ w: ['y'] });
    });
  });
});
