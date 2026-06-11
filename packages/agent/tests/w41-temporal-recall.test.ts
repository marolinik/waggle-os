import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { TEMPORAL_GUIDANCE } from '@waggle/hive-mind-core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * W4.1a — production port of the benchmark-proven temporal recall surface
 * (W4-PRODUCTION-PORT-PLAN-2026-06-11.md §5, components #1 + #2).
 *
 *  #1 Date rendering + TEMPORAL_GUIDANCE: recallMemory's rendered block carries
 *     a reference-date anchor line and the W1-grade temporal guidance fragment
 *     (granularity clause — the #1 LoCoMo temporal lever, 84.7 final).
 *  #2 Unconditional importance lane: critical/important frames reach recall on
 *     EVERY query (benchmark fetchImportantFrames K=5), not only on catch-up
 *     regex matches.
 */

describe('W4.1a — temporal recall surface + unconditional importance lane', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('#1 TEMPORAL_GUIDANCE upgraded to W1 wording', () => {
    it('carries the granularity clause and relative-date worked example', () => {
      // W1 failure mining: 22 ours-only temporal fails emitted a confident exact
      // ISO day 1-7 days off where a coarse answer would have been judged correct.
      expect(TEMPORAL_GUIDANCE).toMatch(/granularit/i);
      expect(TEMPORAL_GUIDANCE).toMatch(/confidently wrong exact day/i);
      // Worked relative-date arithmetic example (Memori instruction 5 lineage)
      expect(TEMPORAL_GUIDANCE).toMatch(/last year/i);
      // Latest-wins contradiction clause preserved from the shipped version
      expect(TEMPORAL_GUIDANCE).toMatch(/most recent version is correct/i);
    });
  });

  describe('#1 recallMemory renders anchor line + guidance', () => {
    it('includes the reference-date anchor and temporal guidance in the block', async () => {
      await orchestrator.executeTool('save_memory', {
        content: 'User preference: weekly report goes out on Fridays',
        importance: 'important',
      });

      const result = await orchestrator.recallMemory('weekly report');
      expect(result.count).toBeGreaterThan(0);
      expect(result.text).toContain('Reference date (most recent memory):');
      // The guidance fragment rides with the recalled block (not the global prompt)
      expect(result.text).toContain('timestamped [YYYY-MM-DD]');
    });

    it('anchor date equals the most recent rendered frame date', async () => {
      await orchestrator.executeTool('save_memory', {
        content: 'User preference: weekly report goes out on Fridays',
        importance: 'important',
      });
      const today = new Date().toISOString().slice(0, 10);
      const result = await orchestrator.recallMemory('weekly report');
      expect(result.text).toContain(`Reference date (most recent memory): ${today}`);
    });
  });

  describe('#2 unconditional importance lane', () => {
    it('recalls a critical frame on a semantically unrelated query', async () => {
      // Disjoint vocabulary: no keyword overlap with the query, so FTS cannot
      // surface it and MockEmbedder similarity is meaningless — only the
      // unconditional importance lane can deliver this frame.
      await orchestrator.executeTool('save_memory', {
        content: 'Production launch is locked for June 20',
        importance: 'critical',
      });

      const result = await orchestrator.recallMemory('favorite painting colors');
      expect(result.text).toContain('Production launch is locked for June 20');
    });

    it('does not duplicate a frame surfaced by both semantic and importance lanes', async () => {
      await orchestrator.executeTool('save_memory', {
        content: 'Production launch is locked for June 20',
        importance: 'critical',
      });

      const result = await orchestrator.recallMemory('production launch');
      const occurrences = result.text.split('Production launch is locked for June 20').length - 1;
      expect(occurrences).toBe(1);
    });

    it('importance lane respects the temporary/deprecated exclusion', async () => {
      // temporary frames must never re-enter the prompt as authoritative recall
      // (R2 sign-gate) — the lane SQL only selects critical/important, so a
      // temporary frame stays out even on unrelated queries.
      await orchestrator.executeTool('save_memory', {
        content: 'Scratch note: half-finished thought',
        importance: 'temporary',
      });

      const result = await orchestrator.recallMemory('favorite painting colors');
      expect(result.text).not.toContain('Scratch note');
    });
  });
});
