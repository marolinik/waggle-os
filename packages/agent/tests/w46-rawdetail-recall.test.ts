import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, rawTurnHeader, type Reranker } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * W4.6 — RAWDETAIL lane rendering in recallMemory (plan component #10,
 * query side). Raw-turn frames are written by harvest (W4.6 write side);
 * here we seed them directly and assert: section renders LAST, CE-top
 * turn + dialogue neighbors included, kill switch + no-reranker skip.
 */

/** Deterministic fake CE: score = marker-word hit count. */
function markerReranker(marker: string): Reranker {
  return {
    scoreBatch: async (_q: string, docs: string[]) =>
      docs.map(d => (d.includes(marker) ? 1 : 0)),
  } as Reranker;
}

describe('W4.6 — recallMemory raw dialogue excerpts', () => {
  let db: MindDB;
  let frames: FrameStore;
  let gopId: string;
  let savedKill: string | undefined;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    gopId = new SessionStore(db).create().gop_id;
    savedKill = process.env['WAGGLE_RAWDETAIL'];
  });

  afterEach(() => {
    if (savedKill === undefined) delete process.env['WAGGLE_RAWDETAIL'];
    else process.env['WAGGLE_RAWDETAIL'] = savedKill;
    db.close();
  });

  function seedTurns(): void {
    const texts = [
      'we should plan the gallery visit for the weekend',
      'I loved the painting of a sunset with a pink sky',
      'it was hanging in the east wing near the entrance',
    ];
    texts.forEach((text, i) => {
      frames.createIFrame(
        gopId,
        `${rawTurnHeader('conv-x', i, i % 2 === 0 ? 'user' : 'assistant')}\n${text}`,
        'normal',
        'import',
        `2026-05-${String(10 + i).padStart(2, '0')}T12:00:00Z`,
      );
    });
  }

  it('renders the verbatim excerpts section with CE-top turn + neighbors, dated and speaker-tagged', async () => {
    seedTurns();
    const orchestrator = new Orchestrator({
      db, embedder: new MockEmbedder(), reranker: markerReranker('painting'),
    });
    const result = await orchestrator.recallMemory('which painting did I love?');

    const text = result.text;
    expect(text).toContain('## Raw dialogue excerpts (verbatim)');
    expect(text).toContain('painting of a sunset with a pink sky');
    // ±1 neighbors ride along
    expect(text).toContain('gallery visit');
    expect(text).toContain('east wing');
    // speaker + date prefixes — parenthesized speaker (colon-suffixed role
    // labels would collide with the injection scanner's smuggling patterns)
    expect(text).toMatch(/- \[2026-05-11\] \(assistant\) I loved the painting/);
    // rendered LAST — after every other section
    const rawIdx = text.indexOf('## Raw dialogue excerpts');
    for (const section of ['## Workspace Memory', '## Personal Memory', '## Memory Facts']) {
      const idx = text.indexOf(section);
      if (idx >= 0) expect(idx).toBeLessThan(rawIdx);
    }
  });

  it('counts raw excerpts in totalCount and surfaces them in recalled', async () => {
    seedTurns();
    const orchestrator = new Orchestrator({
      db, embedder: new MockEmbedder(), reranker: markerReranker('painting'),
    });
    const result = await orchestrator.recallMemory('which painting did I love?');
    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(result.recalled?.some(s => s.includes('pink sky'))).toBe(true);
  });

  it('WAGGLE_RAWDETAIL=0 kill switch suppresses the lane', async () => {
    seedTurns();
    process.env['WAGGLE_RAWDETAIL'] = '0';
    const orchestrator = new Orchestrator({
      db, embedder: new MockEmbedder(), reranker: markerReranker('painting'),
    });
    const result = await orchestrator.recallMemory('which painting did I love?');
    expect(result.text).not.toContain('## Raw dialogue excerpts');
  });

  it('skips the lane when no reranker is available (no CE floor → no lane)', async () => {
    seedTurns();
    process.env['WAGGLE_RERANKER'] = '0';
    try {
      const orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });
      const result = await orchestrator.recallMemory('which painting did I love?');
      expect(result.text).not.toContain('## Raw dialogue excerpts');
    } finally {
      delete process.env['WAGGLE_RERANKER'];
    }
  });

  it('raw turns surfaced as search snippets never double-render in the excerpts section', async () => {
    seedTurns();
    const orchestrator = new Orchestrator({
      db, embedder: new MockEmbedder(), reranker: markerReranker('painting'),
    });
    const result = await orchestrator.recallMemory('which painting did I love?');
    // the CE-top turn body must appear exactly once in the rendered block
    const occurrences = result.text.split('painting of a sunset with a pink sky').length - 1;
    expect(occurrences).toBe(1);
  });
});
