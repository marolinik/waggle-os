import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BudgetExceededError,
  BudgetPricingUnavailableError,
  CostTracker,
  DEFAULT_MODEL_PRICING,
  type ModelPricing,
} from '../src/cost-tracker.js';

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

    it('uses provider rates for the live Gemini and Codex acceptance models', () => {
      expect(DEFAULT_MODEL_PRICING['google/gemini-2.5-flash'])
        .toEqual({ inputPer1k: 0.0003, outputPer1k: 0.0025 });
      expect(DEFAULT_MODEL_PRICING['openrouter/openai/gpt-5.3-codex'])
        .toEqual({ inputPer1k: 0.00175, outputPer1k: 0.014 });

      const tracker = new CostTracker();
      tracker.addUsage('google/gemini-2.5-flash', 1000, 1000);
      tracker.addUsage('openrouter/openai/gpt-5.3-codex', 1000, 1000);
      expect(tracker.getStats().estimatedCost).toBeCloseTo(0.01855, 6);
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

    it('treats unlisted Ollama models as local and free without a cloud-pricing warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const tracker = new CostTracker();
      tracker.addUsage('ollama/minimax-m2.7:cloud', 1000, 1000);

      expect(tracker.getStats().estimatedCost).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('getDailyTotal', () => {
    it('adds persisted carryover to in-process usage without double-seeding', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
      const tracker = new CostTracker();
      try {
        tracker.initializeDailyCarryover('2026-07-21', 6);
        tracker.initializeDailyCarryover('2026-07-21', 8);
        tracker.addUsage('claude-sonnet-4-6', 1000, 1000);

        expect(tracker.hasDailyCarryover('2026-07-21')).toBe(true);
        expect(tracker.getDailyTotal()).toBeCloseTo(6.018, 6);
      } finally {
        vi.useRealTimers();
      }
    });

    it('resets carryover and in-process usage at the next UTC day', () => {
      vi.useFakeTimers();
      const tracker = new CostTracker();
      try {
        vi.setSystemTime(new Date('2026-07-20T23:59:00.000Z'));
        tracker.initializeDailyCarryover('2026-07-20', 6);
        tracker.addUsage('claude-sonnet-4-6', 1000, 1000);

        vi.setSystemTime(new Date('2026-07-21T00:01:00.000Z'));
        expect(tracker.getDailyTotal()).toBe(0);
        expect(tracker.hasDailyCarryover('2026-07-21')).toBe(false);

        tracker.initializeDailyCarryover('2026-07-21', 2);
        tracker.addUsage('claude-sonnet-4-6', 2000, 1000);
        expect(tracker.getDailyTotal()).toBeCloseTo(2.021, 6);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('hard daily spend reservations', () => {
  const pricing: Record<string, ModelPricing> = {
    paid: { inputPer1k: 1, outputPer1k: 1 },
  };

  it('atomically prevents concurrent reservations from sharing the same capacity', async () => {
    const tracker = new CostTracker(pricing);
    tracker.setBudget(1, 'hard');

    const attempts = await Promise.allSettled([
      Promise.resolve().then(() => tracker.reserveModelSpend({
        model: 'paid', inputTokens: 400, maxOutputTokens: 200,
      })),
      Promise.resolve().then(() => tracker.reserveModelSpend({
        model: 'paid', inputTokens: 400, maxOutputTokens: 200,
      })),
    ]);

    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find(result => result.status === 'rejected')).toMatchObject({
      reason: expect.any(BudgetExceededError),
    });
    expect(tracker.getReservedDailyTotal()).toBeCloseTo(0.6, 6);
  });

  it('reconciles a conservative reservation to actual usage exactly once', () => {
    const tracker = new CostTracker(pricing);
    tracker.setBudget(1, 'hard');
    const reservation = tracker.reserveModelSpend({
      model: 'paid', inputTokens: 400, maxOutputTokens: 400, workspaceId: 'workspace-a',
    });

    tracker.reconcileModelSpend(reservation, { inputTokens: 100, outputTokens: 100 });
    tracker.reconcileModelSpend(reservation, { inputTokens: 900, outputTokens: 900 });

    expect(tracker.getReservedDailyTotal()).toBe(0);
    expect(tracker.getDailyTotal()).toBeCloseTo(0.2, 6);
    expect(tracker.getWorkspaceCost('workspace-a')).toBeCloseTo(0.2, 6);
    expect(() => tracker.reserveModelSpend({
      model: 'paid', inputTokens: 400, maxOutputTokens: 400,
    })).not.toThrow();
  });

  it('retains the conservative reservation after ambiguous provider failure', () => {
    const tracker = new CostTracker(pricing);
    tracker.setBudget(1, 'hard');
    const reservation = tracker.reserveModelSpend({
      model: 'paid', inputTokens: 500, maxOutputTokens: 500,
    });

    tracker.commitReservedModelSpend(reservation);

    expect(tracker.getReservedDailyTotal()).toBe(0);
    expect(tracker.getDailyTotal()).toBeCloseTo(1, 6);
    expect(() => tracker.reserveModelSpend({
      model: 'paid', inputTokens: 1, maxOutputTokens: 1,
    })).toThrow(BudgetExceededError);
  });

  it('allows explicitly verified free execution after the paid cap is exhausted', () => {
    const tracker = new CostTracker(pricing);
    tracker.setBudget(1, 'hard');
    const paid = tracker.reserveModelSpend({
      model: 'paid', inputTokens: 500, maxOutputTokens: 500,
    });
    tracker.commitReservedModelSpend(paid);

    const local = tracker.reserveModelSpend({
      model: 'unpriced-local-model',
      inputTokens: 10_000,
      maxOutputTokens: 10_000,
      billingClass: 'free',
    });
    tracker.reconcileModelSpend(local, { inputTokens: 10_000, outputTokens: 10_000 });

    expect(tracker.getDailyTotal()).toBeCloseTo(1, 6);
  });

  it('normalizes zero to disabled and rejects negative budgets', () => {
    const tracker = new CostTracker(pricing);

    tracker.setBudget(0, 'hard');
    expect(tracker.getBudget()).toEqual({ dailyBudgetUsd: null, mode: 'hard' });
    expect(() => tracker.setBudget(-1, 'hard')).toThrow(/non-negative finite/i);
  });

  it('preserves an explicit priced classification for ollama-prefixed routes', () => {
    const tracker = new CostTracker({
      'ollama/remote-paid': { inputPer1k: 1, outputPer1k: 1 },
    });
    tracker.setBudget(1, 'hard');
    const reservation = tracker.reserveModelSpend({
      model: 'ollama/remote-paid', inputTokens: 300, maxOutputTokens: 300,
      billingClass: 'priced',
    });

    tracker.reconcileModelSpend(reservation, { inputTokens: 100, outputTokens: 100 });

    expect(tracker.getDailyTotal()).toBeCloseTo(0.2, 6);
  });

  it('commits the reservation when provider usage is non-finite', () => {
    const tracker = new CostTracker(pricing);
    tracker.setBudget(1, 'hard');
    const reservation = tracker.reserveModelSpend({
      model: 'paid', inputTokens: 400, maxOutputTokens: 400,
    });

    tracker.reconcileModelSpend(reservation, { inputTokens: Number.NaN, outputTokens: 0 });

    expect(tracker.getDailyTotal()).toBeCloseTo(0.8, 6);
    expect(() => tracker.reserveModelSpend({
      model: 'paid', inputTokens: 200, maxOutputTokens: 1,
    })).toThrow(BudgetExceededError);
  });

  it('rejects non-finite direct usage before it can poison the ledger', () => {
    const tracker = new CostTracker(pricing);

    expect(() => tracker.addUsage('paid', Number.NaN, 0)).toThrow(/finite/i);
    expect(tracker.getDailyTotal()).toBe(0);
  });

  it('fails closed when hard mode lacks trusted pricing for a paid route', () => {
    const tracker = new CostTracker();
    tracker.setBudget(1, 'hard');

    expect(() => tracker.reserveModelSpend({
      model: 'openrouter/auto', inputTokens: 1, maxOutputTokens: 1,
      billingClass: 'priced',
    })).toThrow(BudgetPricingUnavailableError);
  });
});
