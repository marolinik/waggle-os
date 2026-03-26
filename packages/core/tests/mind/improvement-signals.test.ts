import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import {
  ImprovementSignalStore,
  type SignalCategory,
} from '../../src/mind/improvement-signals.js';

describe('ImprovementSignalStore', () => {
  let db: MindDB;
  let store: ImprovementSignalStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ImprovementSignalStore(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── record ─────────────────────────────────────────────────

  describe('record', () => {
    it('inserts a new signal on first record', () => {
      const signal = store.record('capability_gap', 'missing:pdf_reader');
      expect(signal.id).toBeDefined();
      expect(signal.category).toBe('capability_gap');
      expect(signal.pattern_key).toBe('missing:pdf_reader');
      expect(signal.count).toBe(1);
      expect(signal.surfaced).toBe(0);
    });

    it('increments count on duplicate (category, pattern_key)', () => {
      store.record('correction', 'tone:too_formal');
      store.record('correction', 'tone:too_formal');
      const signal = store.record('correction', 'tone:too_formal');
      expect(signal.count).toBe(3);
    });

    it('updates detail on upsert when new detail is non-empty', () => {
      store.record('correction', 'format:headers', 'Use ## not ###');
      const updated = store.record('correction', 'format:headers', 'Use h2 not h3');
      expect(updated.detail).toBe('Use h2 not h3');
    });

    it('preserves existing detail when new detail is empty', () => {
      store.record('correction', 'format:headers', 'Use ## not ###');
      const updated = store.record('correction', 'format:headers');
      expect(updated.detail).toBe('Use ## not ###');
    });

    it('stores metadata as JSON', () => {
      const signal = store.record('workflow_pattern', 'shape:research', undefined, {
        lastTask: 'analyze competitor',
        avgSteps: 4,
      });
      const parsed = JSON.parse(signal.metadata);
      expect(parsed.lastTask).toBe('analyze competitor');
      expect(parsed.avgSteps).toBe(4);
    });

    it('keeps different pattern_keys separate within same category', () => {
      store.record('capability_gap', 'missing:pdf_reader');
      store.record('capability_gap', 'missing:web_search');
      const gaps = store.getByCategory('capability_gap');
      expect(gaps).toHaveLength(2);
    });
  });

  // ── getByCategory ──────────────────────────────────────────

  describe('getByCategory', () => {
    it('returns only signals for the requested category', () => {
      store.record('capability_gap', 'missing:pdf');
      store.record('correction', 'tone:casual');
      store.record('capability_gap', 'missing:search');

      const gaps = store.getByCategory('capability_gap');
      expect(gaps).toHaveLength(2);
      expect(gaps.every(s => s.category === 'capability_gap')).toBe(true);
    });

    it('returns signals ordered by count descending', () => {
      store.record('correction', 'a');
      store.record('correction', 'b');
      store.record('correction', 'b');
      store.record('correction', 'b');
      store.record('correction', 'a');

      const corrections = store.getByCategory('correction');
      expect(corrections[0].pattern_key).toBe('b');
      expect(corrections[0].count).toBe(3);
      expect(corrections[1].pattern_key).toBe('a');
      expect(corrections[1].count).toBe(2);
    });

    it('returns empty array for category with no signals', () => {
      expect(store.getByCategory('workflow_pattern')).toEqual([]);
    });
  });

  // ── getActionable ──────────────────────────────────────────

  describe('getActionable', () => {
    it('returns signals above default thresholds', () => {
      // capability_gap threshold = 2
      store.record('capability_gap', 'missing:pdf');
      store.record('capability_gap', 'missing:pdf');

      const actionable = store.getActionable();
      expect(actionable).toHaveLength(1);
      expect(actionable[0].pattern_key).toBe('missing:pdf');
      expect(actionable[0].parsedMetadata).toBeDefined();
    });

    it('excludes signals below threshold', () => {
      // correction threshold = 3, only recorded twice
      store.record('correction', 'tone:casual');
      store.record('correction', 'tone:casual');

      const actionable = store.getActionable();
      expect(actionable).toHaveLength(0);
    });

    it('excludes already-surfaced signals', () => {
      store.record('capability_gap', 'missing:pdf');
      const signal = store.record('capability_gap', 'missing:pdf');
      store.markSurfaced(signal.id);

      const actionable = store.getActionable();
      expect(actionable).toHaveLength(0);
    });

    it('caps at 3 results (MAX_ACTIONABLE)', () => {
      for (let i = 0; i < 5; i++) {
        const key = `gap_${i}`;
        store.record('capability_gap', key);
        store.record('capability_gap', key);
      }

      const actionable = store.getActionable();
      expect(actionable.length).toBeLessThanOrEqual(3);
    });

    it('accepts custom thresholds', () => {
      store.record('correction', 'tone:casual'); // count = 1

      // Lower threshold to 1 — should now be actionable
      const actionable = store.getActionable({ correction: 1 });
      expect(actionable.some(s => s.pattern_key === 'tone:casual')).toBe(true);
    });

    it('includes parsedMetadata on results', () => {
      store.record('capability_gap', 'missing:pdf', undefined, { tool: 'pdf_reader' });
      store.record('capability_gap', 'missing:pdf');

      const actionable = store.getActionable();
      expect(actionable[0].parsedMetadata).toEqual({ tool: 'pdf_reader' });
    });
  });

  // ── markSurfaced ───────────────────────────────────────────

  describe('markSurfaced', () => {
    it('sets surfaced=1 and surfaced_at', () => {
      const signal = store.record('correction', 'tone:casual');
      store.markSurfaced(signal.id);

      const updated = store.get(signal.id);
      expect(updated?.surfaced).toBe(1);
      expect(updated?.surfaced_at).not.toBeNull();
    });
  });

  // ── getByKey ───────────────────────────────────────────────

  describe('getByKey', () => {
    it('returns signal by category + pattern_key', () => {
      store.record('workflow_pattern', 'shape:research');
      const found = store.getByKey('workflow_pattern', 'shape:research');
      expect(found).toBeDefined();
      expect(found?.pattern_key).toBe('shape:research');
    });

    it('returns undefined for non-existent key', () => {
      expect(store.getByKey('correction', 'nonexistent')).toBeUndefined();
    });
  });

  // ── ensureTable (backward compat) ──────────────────────────

  describe('ensureTable', () => {
    it('creates table even on databases without it in schema', () => {
      // The :memory: DB already has the table from schema.ts,
      // but ensureTable should handle it gracefully
      const store2 = new ImprovementSignalStore(db);
      const signal = store2.record('capability_gap', 'test:compat');
      expect(signal.count).toBe(1);
    });
  });
});
