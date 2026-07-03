import { describe, it, expect, vi, afterEach } from 'vitest';
import { CostTracker, DEFAULT_MODEL_PRICING, type ModelPricing } from '../src/cost-tracker.js';

describe('CostTracker', () => {
  const pricing: Record<string, ModelPricing> = {
    'claude-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015 },
    'claude-haiku': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  };

  it('tracks token usage per model', () => {
    const tracker = new CostTracker(pricing);
    tracker.addUsage('claude-sonnet', 1000, 500);
    tracker.addUsage('claude-sonnet', 2000, 300);
    const stats = tracker.getStats();
    expect(stats.totalInputTokens).toBe(3000);
    expect(stats.totalOutputTokens).toBe(800);
  });

  it('estimates cost', () => {
    const tracker = new CostTracker(pricing);
    tracker.addUsage('claude-sonnet', 1000, 1000);
    const stats = tracker.getStats();
    expect(stats.estimatedCost).toBeCloseTo(0.018, 4);
  });

  it('handles unknown models with fallback Sonnet pricing', () => {
    const tracker = new CostTracker(pricing);
    tracker.addUsage('unknown-model', 1000, 500);
    const stats = tracker.getStats();
    expect(stats.totalInputTokens).toBe(1000);
    // Fallback: Sonnet pricing ($0.003/1K in, $0.015/1K out)
    // 1K input = $0.003, 0.5K output = $0.0075 -> total $0.0105
    expect(stats.estimatedCost).toBeCloseTo(0.0105, 4);
  });

  it('formats summary', () => {
    const tracker = new CostTracker(pricing);
    tracker.addUsage('claude-sonnet', 1000, 500);
    const summary = tracker.formatSummary();
    expect(summary).toContain('1000');
    expect(summary).toContain('500');
    expect(summary).toContain('$');
  });

  describe('current model pricing', () => {
    afterEach(() => vi.restoreAllMocks());

    it('prices a known Opus-class model at Opus rates ($15/$75 per 1M)', () => {
      expect(DEFAULT_MODEL_PRICING['claude-opus-4-8']).toEqual({ inputPer1k: 0.015, outputPer1k: 0.075 });
      const tracker = new CostTracker();
      tracker.addUsage('claude-opus-4-8', 1000, 1000);
      // 1K in * $0.015 + 1K out * $0.075 = $0.09
      expect(tracker.getStats().estimatedCost).toBeCloseTo(0.09, 4);
    });

    it('includes current Sonnet and Haiku ids', () => {
      expect(DEFAULT_MODEL_PRICING['claude-sonnet-5']).toBeDefined();
      expect(DEFAULT_MODEL_PRICING['claude-haiku-4-5']).toBeDefined();
    });

    it('warns once and uses family-aware fallback for an unknown Opus id', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tracker = new CostTracker();
      const unknownOpus = `claude-opus-9-9-${Math.random().toString(36).slice(2)}`;
      tracker.addUsage(unknownOpus, 1000, 1000);
      tracker.addUsage(unknownOpus, 1000, 1000);
      const stats = tracker.getStats();
      // Opus fallback (not Sonnet): 2 * ($0.015 + $0.075) = $0.18, not $0.036.
      expect(stats.estimatedCost).toBeCloseTo(0.18, 4);
      // Loud warning fired, and only once for the same unknown model.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(unknownOpus);
    });
  });

  describe('getDailyTotal', () => {
    it('returns total cost across all models for current session', () => {
      const tracker = new CostTracker();
      tracker.addUsage('claude-sonnet-4-6', 1000, 500);
      tracker.addUsage('claude-sonnet-4-6', 2000, 1000);
      const total = tracker.getDailyTotal();
      expect(total).toBeGreaterThan(0);
      expect(total).toBe(tracker.getStats().estimatedCost);
    });
  });
});
