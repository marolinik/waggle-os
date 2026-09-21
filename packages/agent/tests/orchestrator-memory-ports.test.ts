import { describe, it, expect } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import type { FrameStorePort, MemorySearchPort } from '../src/memory-ports.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * CA-3, the other half: the pins prove the inversion changed nothing, and these
 * prove it bought something. Before it, no test could substitute a store — the
 * `Orchestrator` constructor built its own, so the only seam was the database
 * underneath them.
 *
 * These use in-memory fakes that touch no SQLite at all. If a future change
 * re-hardcodes a layer, the fake stops being consulted and these fail.
 */

/** A frame store that keeps everything in an array. No database, no schema. */
function fakeFrameStore(): FrameStorePort & { written: string[] } {
  const written: string[] = [];
  const frame = (content: string) =>
    ({
      id: written.length,
      frame_type: 'I',
      gop_id: 'fake',
      t: 0,
      base_frame_id: null,
      content,
      importance: 'normal',
      source: 'user_stated',
      access_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      last_accessed: null,
      metadata: '{}',
      content_hash: 'fake',
    }) as unknown as ReturnType<FrameStorePort['createIFrame']>;

  return {
    written,
    createIFrame: (_gopId, content) => {
      written.push(content);
      return frame(content);
    },
    createPFrame: (_gopId, content) => {
      written.push(content);
      return frame(content);
    },
    getById: () => undefined,
    getLatestIFrame: () => undefined,
    getRecent: () => [],
    findDuplicate: () => null,
    update: () => undefined,
    setMetadata: () => undefined,
  };
}

describe('CA-3 — the seam the inversion opened', () => {
  it('a fake frame store receives the writes and the database stays empty', () => {
    const db = new MindDB(':memory:');
    const frames = fakeFrameStore();
    const orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
      layers: { frames },
    });

    orchestrator.getFrames().createIFrame('gop-fake', 'written to the fake');

    expect(frames.written).toEqual(['written to the fake']);
    expect(orchestrator.getMemoryStats().frameCount).toBe(0);

    db.close();
  });

  it('an unsupplied layer still gets the production implementation', () => {
    const db = new MindDB(':memory:');
    const orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
      layers: { frames: fakeFrameStore() },
    });

    const session = orchestrator.getSessions().create();

    expect(session.gop_id).toBeTruthy();
    expect(orchestrator.getMemoryStats().sessionCount).toBe(1);

    db.close();
  });

  it('recall runs through an injected search port instead of the real index', async () => {
    const db = new MindDB(':memory:');
    const searched: string[] = [];
    const search: MemorySearchPort = {
      search: async (query) => {
        searched.push(query);
        return [];
      },
      indexFrame: async () => {},
    };
    const orchestrator = new Orchestrator({ db, embedder: new MockEmbedder(), layers: { search } });

    // recallMemory has an empty-mind fast path that returns before searching,
    // and a catch-up branch that ranks by importance rather than searching —
    // so the mind needs one frame and the query must not be a catch-up phrase.
    const session = orchestrator.getSessions().create();
    orchestrator.getFrames().createIFrame(session.gop_id, 'invoice numbering scheme');

    await orchestrator.recallMemory('invoice numbering', 5);

    expect(searched).toEqual(['invoice numbering']);

    db.close();
  });

  it('a workspace mind can be activated with an injected layer too', async () => {
    const db = new MindDB(':memory:');
    const workspaceDb = new MindDB(':memory:');
    const orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });

    const searched: string[] = [];
    const search: MemorySearchPort = {
      search: async (query) => {
        searched.push(query);
        return [];
      },
      indexFrame: async () => {},
    };

    orchestrator.setWorkspaceMind(workspaceDb, { search });
    const session = orchestrator.getSessions().create();
    orchestrator.getFrames().createIFrame(session.gop_id, 'personal frame');

    await orchestrator.recallMemory('invoice numbering', 5);

    expect(searched).toEqual(['invoice numbering']);

    db.close();
    workspaceDb.close();
  });
});
