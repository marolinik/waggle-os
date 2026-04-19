/**
 * Guards the snake_case → camelCase remap inside
 * LocalAdapter.getMemoryStats. Server emits {frameCount, entityCount,
 * relationCount}; the client contract exposes {frames, entities,
 * relations}. Before this test landed, the adapter returned `res.json()`
 * raw, so every consumer (useMemory, DashboardApp, Brain Health metric)
 * read `undefined` and displayed 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

describe('LocalAdapter.getMemoryStats', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function respondWith(payload: unknown): void {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('remaps server snake_case field names to the client contract', async () => {
    respondWith({
      personal: { frameCount: 100, entityCount: 20, relationCount: 15 },
      workspace: { frameCount: 5, entityCount: 2, relationCount: 1 },
      total: { frameCount: 105, entityCount: 22, relationCount: 16 },
    });
    const adapter = new LocalAdapter('http://test:1');
    const stats = await adapter.getMemoryStats();

    expect(stats.personal).toEqual({ frames: 100, entities: 20, relations: 15 });
    expect(stats.workspace).toEqual({ frames: 5, entities: 2, relations: 1 });
    expect(stats.total).toEqual({ frames: 105, entities: 22, relations: 16 });
  });

  it('coerces null workspace (no filter passed) to a zeroed object', async () => {
    respondWith({
      personal: { frameCount: 42, entityCount: 8, relationCount: 3 },
      workspace: null,
      total: { frameCount: 42, entityCount: 8, relationCount: 3 },
    });
    const adapter = new LocalAdapter('http://test:1');
    const stats = await adapter.getMemoryStats();

    expect(stats.workspace).toEqual({ frames: 0, entities: 0, relations: 0 });
    expect(stats.personal.frames).toBe(42);
  });

  it('tolerates already-camelCase payloads (future-proofing)', async () => {
    respondWith({
      personal: { frames: 7, entities: 3, relations: 1 },
      workspace: null,
      total: { frames: 7, entities: 3, relations: 1 },
    });
    const adapter = new LocalAdapter('http://test:1');
    const stats = await adapter.getMemoryStats();
    expect(stats.personal).toEqual({ frames: 7, entities: 3, relations: 1 });
  });

  it('returns zeroed stats on network / parse failure', async () => {
    fetchSpy.mockRejectedValue(new Error('boom'));
    const adapter = new LocalAdapter('http://test:1');
    const stats = await adapter.getMemoryStats();
    expect(stats.personal).toEqual({ frames: 0, entities: 0, relations: 0 });
    expect(stats.workspace).toEqual({ frames: 0, entities: 0, relations: 0 });
    expect(stats.total).toEqual({ frames: 0, entities: 0, relations: 0 });
  });

  it('treats missing fields as zero, not NaN', async () => {
    respondWith({
      personal: { frameCount: 10 }, // no entityCount / relationCount
      workspace: null,
      total: { frameCount: 10 },
    });
    const adapter = new LocalAdapter('http://test:1');
    const stats = await adapter.getMemoryStats();
    expect(stats.personal.entities).toBe(0);
    expect(stats.personal.relations).toBe(0);
    expect(Number.isNaN(stats.personal.entities)).toBe(false);
  });
});
