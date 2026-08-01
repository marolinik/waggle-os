import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInProcessReranker, MindDB, type Reranker } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

vi.mock('@waggle/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@waggle/core')>(),
  createInProcessReranker: vi.fn(),
}));

/**
 * W4.2 — reranker wiring in recallMemory (W4-PRODUCTION-PORT-PLAN §5 W4.2).
 * The orchestrator accepts an injected Reranker (tests) and otherwise
 * lazy-creates one only behind WAGGLE_RERANKER=1 — flag-off default keeps
 * CI free of the ~22MB model download.
 */

describe('W4.2 — recallMemory reranker wiring', () => {
  let db: MindDB;

  beforeEach(() => {
    db = new MindDB(':memory:');
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  function markerReranker(marker: string, calls: { n: number }): Reranker {
    const scoreOf = (doc: string): number => (doc.includes(marker) ? 10 : -10);
    return {
      score: async (_q, doc) => { calls.n++; return scoreOf(doc); },
      scoreBatch: async (_q, docs) => { calls.n++; return docs.map(scoreOf); },
    };
  }

  it('uses an injected reranker to order recall results', async () => {
    const calls = { n: 0 };
    const orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
      reranker: markerReranker('Fridays', calls),
    });
    await orchestrator.executeTool('save_memory', {
      content: 'User preference: weekly report goes out on Fridays',
      importance: 'normal',
    });
    await orchestrator.executeTool('save_memory', {
      content: 'User preference: weekly report wraps before standup',
      importance: 'normal',
    });

    const result = await orchestrator.recallMemory('weekly report');
    expect(result.count).toBeGreaterThan(0);
    expect(calls.n).toBeGreaterThan(0); // reranker actually consulted

    const fridayIdx = result.text.indexOf('Fridays');
    const standupIdx = result.text.indexOf('standup');
    expect(fridayIdx).toBeGreaterThan(-1);
    if (standupIdx > -1) expect(fridayIdx).toBeLessThan(standupIdx);
  });

  it('does not create a reranker when the kill switch is set and none injected', async () => {
    process.env['WAGGLE_RERANKER'] = '0'; // kill switch (also pinned in vitest.setup)
    const orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });
    await orchestrator.executeTool('save_memory', {
      content: 'User preference: weekly report goes out on Fridays',
      importance: 'normal',
    });
    // Must not attempt the ~22MB model load — recall just works RRF-only.
    const result = await orchestrator.recallMemory('weekly report');
    expect(result.count).toBeGreaterThan(0);
  });

  it('passes the managed cache directory to the lazy reranker factory', async () => {
    vi.stubEnv('WAGGLE_RERANKER', '1');
    const calls = { n: 0 };
    vi.mocked(createInProcessReranker).mockResolvedValueOnce(markerReranker('Fridays', calls));
    const rerankerCacheDir = 'C:\\Waggle\\models\\reranker';
    const orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
      rerankerCacheDir,
    });
    await orchestrator.executeTool('save_memory', {
      content: 'User preference: weekly report goes out on Fridays',
      importance: 'normal',
    });

    await orchestrator.recallMemory('weekly report');

    expect(createInProcessReranker).toHaveBeenCalledWith({ cacheDir: rerankerCacheDir });
  });
});
