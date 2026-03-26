import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, ImprovementSignalStore } from '@waggle/core';
import {
  recordCapabilityGap,
  analyzeAndRecordCorrection,
  recordWorkflowPattern,
  buildAwarenessSummary,
  formatAwarenessPrompt,
  markSummarySurfaced,
} from '../src/improvement-detector.js';

describe('improvement-detector', () => {
  let db: MindDB;
  let store: ImprovementSignalStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ImprovementSignalStore(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── recordCapabilityGap ────────────────────────────────────

  describe('recordCapabilityGap', () => {
    it('records a capability gap signal', () => {
      recordCapabilityGap(store, 'pdf_reader', 'user asked to read a PDF');
      const gaps = store.getByCategory('capability_gap');
      expect(gaps).toHaveLength(1);
      expect(gaps[0].pattern_key).toBe('missing:pdf_reader');
      expect(gaps[0].count).toBe(1);
    });

    it('increments count on repeated gap', () => {
      recordCapabilityGap(store, 'web_search');
      recordCapabilityGap(store, 'web_search');
      const gaps = store.getByCategory('capability_gap');
      expect(gaps).toHaveLength(1);
      expect(gaps[0].count).toBe(2);
    });
  });

  // ── analyzeAndRecordCorrection ─────────────────────────────

  describe('analyzeAndRecordCorrection', () => {
    it('returns null for non-correction messages', () => {
      const result = analyzeAndRecordCorrection(store, 'Please write a sorting function');
      expect(result).toBeNull();
      expect(store.getByCategory('correction')).toHaveLength(0);
    });

    it('detects and records a correction', () => {
      const result = analyzeAndRecordCorrection(
        store,
        "No, that's wrong. I told you to use markdown headers.",
      );
      expect(result).not.toBeNull();
      expect(result!.patternKey).toBeDefined();
      const corrections = store.getByCategory('correction');
      expect(corrections).toHaveLength(1);
    });

    it('records both durable and task-local corrections', () => {
      analyzeAndRecordCorrection(store, "No, always use shorter responses. I said keep it brief.");
      analyzeAndRecordCorrection(store, "No, not that. Just use a list this time.");

      const corrections = store.getByCategory('correction');
      expect(corrections.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── recordWorkflowPattern ──────────────────────────────────

  describe('recordWorkflowPattern', () => {
    it('records a workflow pattern', () => {
      recordWorkflowPattern(store, 'research', 'analyze competitor pricing');
      const patterns = store.getByCategory('workflow_pattern');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_key).toBe('shape:research');
    });

    it('increments on repeated task shapes', () => {
      recordWorkflowPattern(store, 'research', 'analyze competitor pricing');
      recordWorkflowPattern(store, 'research', 'investigate market trends');
      recordWorkflowPattern(store, 'research', 'review latest papers');
      const patterns = store.getByCategory('workflow_pattern');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(3);
    });
  });

  // ── buildAwarenessSummary ──────────────────────────────────

  describe('buildAwarenessSummary', () => {
    it('returns empty summary when no actionable signals', () => {
      const summary = buildAwarenessSummary(store);
      expect(summary.totalActionable).toBe(0);
      expect(summary.capabilityGaps).toEqual([]);
      expect(summary.corrections).toEqual([]);
      expect(summary.workflowPatterns).toEqual([]);
    });

    it('includes capability gaps above threshold', () => {
      // Default threshold for capability_gap is 2
      recordCapabilityGap(store, 'pdf_reader');
      recordCapabilityGap(store, 'pdf_reader');

      const summary = buildAwarenessSummary(store);
      expect(summary.capabilityGaps).toHaveLength(1);
      expect(summary.capabilityGaps[0].toolName).toBe('pdf_reader');
      expect(summary.capabilityGaps[0].occurrences).toBe(2);
      expect(summary.capabilityGaps[0].suggestion).toContain('pdf_reader');
    });

    it('includes corrections above threshold', () => {
      // Default threshold for correction is 3
      for (let i = 0; i < 3; i++) {
        store.record('correction', 'tone:too_formal', 'Keep responses casual');
      }

      const summary = buildAwarenessSummary(store);
      expect(summary.corrections).toHaveLength(1);
      expect(summary.corrections[0].patternKey).toBe('tone:too_formal');
      expect(summary.corrections[0].occurrences).toBe(3);
    });

    it('includes recent workflow patterns above threshold', () => {
      // Default threshold for workflow_pattern is 3
      for (let i = 0; i < 3; i++) {
        recordWorkflowPattern(store, 'research', 'investigate topic');
      }

      const summary = buildAwarenessSummary(store);
      expect(summary.workflowPatterns).toHaveLength(1);
      expect(summary.workflowPatterns[0].patternKey).toBe('shape:research');
    });

    it('excludes stale workflow patterns', () => {
      // Manually insert a workflow_pattern with old last_seen
      const raw = db.getDatabase();
      raw.prepare(`
        INSERT INTO improvement_signals (category, pattern_key, count, last_seen)
        VALUES ('workflow_pattern', 'shape:old_task', 5, datetime('now', '-30 days'))
      `).run();

      const summary = buildAwarenessSummary(store);
      expect(summary.workflowPatterns).toHaveLength(0);
    });

    it('respects total cap of 3 actionable signals', () => {
      // Create many signals above threshold
      for (let i = 0; i < 5; i++) {
        const key = `missing:tool_${i}`;
        store.record('capability_gap', key);
        store.record('capability_gap', key);
      }

      const summary = buildAwarenessSummary(store);
      expect(summary.totalActionable).toBeLessThanOrEqual(3);
    });
  });

  // ── formatAwarenessPrompt ──────────────────────────────────

  describe('formatAwarenessPrompt', () => {
    it('returns null for empty summary', () => {
      const summary = buildAwarenessSummary(store);
      expect(formatAwarenessPrompt(summary)).toBeNull();
    });

    it('formats capability gaps into prompt text', () => {
      recordCapabilityGap(store, 'pdf_reader');
      recordCapabilityGap(store, 'pdf_reader');

      const summary = buildAwarenessSummary(store);
      const prompt = formatAwarenessPrompt(summary);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('## Improvement Signals');
      expect(prompt).toContain('pdf_reader');
      expect(prompt).toContain('Missing capabilities');
    });

    it('formats corrections into prompt text', () => {
      for (let i = 0; i < 3; i++) {
        store.record('correction', 'tone:too_formal', 'Keep it casual');
      }

      const summary = buildAwarenessSummary(store);
      const prompt = formatAwarenessPrompt(summary);
      expect(prompt).toContain('Behavioral adjustments');
      expect(prompt).toContain('casual');
    });

    it('formats workflow patterns into prompt text', () => {
      for (let i = 0; i < 3; i++) {
        recordWorkflowPattern(store, 'compare', 'compare options');
      }

      const summary = buildAwarenessSummary(store);
      const prompt = formatAwarenessPrompt(summary);
      expect(prompt).toContain('Recurring workflows');
      expect(prompt).toContain('compare');
    });
  });

  // ── markSummarySurfaced ────────────────────────────────────

  describe('markSummarySurfaced', () => {
    it('marks all signals in summary as surfaced', () => {
      recordCapabilityGap(store, 'pdf_reader');
      recordCapabilityGap(store, 'pdf_reader');

      const summary = buildAwarenessSummary(store);
      expect(summary.capabilityGaps).toHaveLength(1);

      markSummarySurfaced(store, summary);

      // Should not appear in next summary
      const summary2 = buildAwarenessSummary(store);
      expect(summary2.capabilityGaps).toHaveLength(0);
      expect(summary2.totalActionable).toBe(0);
    });
  });
});
