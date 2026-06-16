import { describe, it, expect } from 'vitest';
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

describe('cost-tracker — Opus 4.7 / 4.8 pricing (Plan 05)', () => {
  it('knows claude-opus-4-8 at $5/$25 per MTok (0.005 / 0.025 per 1K)', () => {
    expect(DEFAULT_MODEL_PRICING['claude-opus-4-8']).toEqual({
      inputPer1k: 0.005,
      outputPer1k: 0.025,
    });
  });

  it('knows claude-opus-4-7 at $15/$75 per MTok (0.015 / 0.075 per 1K)', () => {
    expect(DEFAULT_MODEL_PRICING['claude-opus-4-7']).toEqual({
      inputPer1k: 0.015,
      outputPer1k: 0.075,
    });
  });

  it('does NOT fall back to Sonnet pricing for Opus 4.8', () => {
    const tracker = new CostTracker();
    // 1M in + 1M out at Opus 4.8 = $5 + $25 = $30. Sonnet fallback would be
    // $3 + $15 = $18 — so a wrong fallback is detectable here.
    const cost = tracker.calculateCost(1_000_000, 1_000_000, 'claude-opus-4-8');
    expect(cost).toBeCloseTo(30, 6);
  });
});
