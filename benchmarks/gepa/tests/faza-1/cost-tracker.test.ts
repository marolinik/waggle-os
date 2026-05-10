/**
 * GEPA Faza 1 — cost tracker tests.
 *
 * Coverage targets:
 *   - Halt triggers: HARD_CAP_USD_BREACH ($100), INTERNAL_HALT_USD_BREACH ($80),
 *     SUPER_LINEAR_PROJECTION_BREACH (>30% over expected)
 *   - Audit cadence (every 20 evaluations)
 *   - Immutable state updates per coding-style.md
 *   - Projection multiplier 1.5× per brief §6.7
 */

import { describe, expect, it } from 'vitest';
import {
  HARD_CAP_USD,
  INTERNAL_HALT_USD,
  SUPER_LINEAR_MULTIPLIER,
  SUPER_LINEAR_OVERAGE_THRESHOLD,
  AUDIT_CADENCE_EVAL_COUNT,
  createCostTracker,
  recordEvaluation,
  checkHaltTriggers,
  shouldAudit,
} from '../../src/faza-1/cost-tracker.js';

describe('constants exposed for auditing', () => {
  it('HARD_CAP_USD = $100', () => {
    expect(HARD_CAP_USD).toBe(100.0);
  });
  it('INTERNAL_HALT_USD = $80', () => {
    expect(INTERNAL_HALT_USD).toBe(80.0);
  });
  it('SUPER_LINEAR_MULTIPLIER = 1.5 per brief §6.7', () => {
    expect(SUPER_LINEAR_MULTIPLIER).toBe(1.5);
  });
  it('SUPER_LINEAR_OVERAGE_THRESHOLD = 0.30 (30%)', () => {
    expect(SUPER_LINEAR_OVERAGE_THRESHOLD).toBe(0.30);
  });
  it('AUDIT_CADENCE_EVAL_COUNT = 20 per launch decision §A.7', () => {
    expect(AUDIT_CADENCE_EVAL_COUNT).toBe(20);
  });
});

describe('createCostTracker', () => {
  it('initializes with zero spend + projection = baseline × 1.5', () => {
    const t = createCostTracker(0.50);
    expect(t.cumulativeUsd).toBe(0);
    expect(t.evaluationCount).toBe(0);
    expect(t.projectionPerEvalUsd).toBe(0.75);  // 0.50 × 1.5
  });
});

describe('recordEvaluation — immutable updates', () => {
  it('returns new state object (does not mutate input)', () => {
    const before = createCostTracker(0.50);
    const after = recordEvaluation(before, 0.30);
    expect(before.cumulativeUsd).toBe(0);
    expect(before.evaluationCount).toBe(0);
    expect(after.cumulativeUsd).toBe(0.30);
    expect(after.evaluationCount).toBe(1);
    expect(before).not.toBe(after);
  });

  it('cumulative cost accumulates across multiple recordings', () => {
    let s = createCostTracker(0.50);
    s = recordEvaluation(s, 0.40);
    s = recordEvaluation(s, 0.60);
    s = recordEvaluation(s, 0.50);
    expect(s.cumulativeUsd).toBeCloseTo(1.50, 6);
    expect(s.evaluationCount).toBe(3);
  });
});

describe('checkHaltTriggers — HARD_CAP_USD_BREACH', () => {
  it('triggers at $100.01', () => {
    const s = { cumulativeUsd: 100.01, evaluationCount: 200, projectionPerEvalUsd: 0.50 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('HARD_CAP_USD_BREACH');
    expect(r.message).toContain('HARD CAP BREACH');
  });

  it('does NOT trigger at $100.00 exactly (boundary inclusive of pass)', () => {
    const s = { cumulativeUsd: 100.00, evaluationCount: 200, projectionPerEvalUsd: 0.50 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).not.toBe('HARD_CAP_USD_BREACH');
    // It will trigger INTERNAL_HALT since $100 > $80, but not HARD_CAP
    expect(r.haltReason).toBe('INTERNAL_HALT_USD_BREACH');
  });

  it('takes precedence over INTERNAL_HALT (most severe first)', () => {
    const s = { cumulativeUsd: 105.0, evaluationCount: 200, projectionPerEvalUsd: 0.50 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('HARD_CAP_USD_BREACH');
  });
});

describe('checkHaltTriggers — INTERNAL_HALT_USD_BREACH', () => {
  it('triggers at $80.01', () => {
    const s = { cumulativeUsd: 80.01, evaluationCount: 160, projectionPerEvalUsd: 0.50 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('INTERNAL_HALT_USD_BREACH');
  });

  it('does NOT trigger at $80.00 exactly', () => {
    const s = { cumulativeUsd: 80.00, evaluationCount: 160, projectionPerEvalUsd: 0.50 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).not.toBe('INTERNAL_HALT_USD_BREACH');
  });
});

describe('checkHaltTriggers — SUPER_LINEAR_PROJECTION_BREACH', () => {
  it('triggers when actual exceeds expected by >30%', () => {
    // 10 evals × $0.75/eval projection = $7.50 expected; actual $10 = 33% over
    const s = { cumulativeUsd: 10.0, evaluationCount: 10, projectionPerEvalUsd: 0.75 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('SUPER_LINEAR_PROJECTION_BREACH');
    expect(r.overageFraction).toBeCloseTo(0.333, 2);
  });

  it('does NOT trigger when actual is exactly at projection', () => {
    const s = { cumulativeUsd: 7.50, evaluationCount: 10, projectionPerEvalUsd: 0.75 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('NONE');
    expect(r.overageFraction).toBe(0);
  });

  it('does NOT trigger when overage is exactly at 30% threshold (boundary inclusive of pass)', () => {
    // Expected $7.50, actual $9.75 = 30% over exactly
    const s = { cumulativeUsd: 9.75, evaluationCount: 10, projectionPerEvalUsd: 0.75 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('NONE');
  });

  it('does NOT trigger before any eval recorded (no expected baseline)', () => {
    const s = { cumulativeUsd: 0, evaluationCount: 0, projectionPerEvalUsd: 0.75 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('NONE');
  });

  it('takes precedence below INTERNAL_HALT (super-linear can fire while still under $80)', () => {
    // Expected $1.50 at 2 evals × $0.75; actual $5 = 233% over → super-linear breach
    const s = { cumulativeUsd: 5.0, evaluationCount: 2, projectionPerEvalUsd: 0.75 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('SUPER_LINEAR_PROJECTION_BREACH');
    expect(r.cumulativeUsd).toBeLessThan(INTERNAL_HALT_USD);
  });
});

describe('shouldAudit — audit cadence', () => {
  it('returns false at evaluationCount = 0', () => {
    expect(shouldAudit({ cumulativeUsd: 0, evaluationCount: 0, projectionPerEvalUsd: 0.5 })).toBe(false);
  });

  it('returns true at evaluationCount = 20 (first audit boundary)', () => {
    expect(shouldAudit({ cumulativeUsd: 10, evaluationCount: 20, projectionPerEvalUsd: 0.5 })).toBe(true);
  });

  it('returns true at every multiple of 20', () => {
    for (const n of [40, 60, 80, 100, 200]) {
      expect(shouldAudit({ cumulativeUsd: n / 2, evaluationCount: n, projectionPerEvalUsd: 0.5 })).toBe(true);
    }
  });

  it('returns false at non-boundary counts', () => {
    for (const n of [1, 5, 19, 21, 39, 99]) {
      expect(shouldAudit({ cumulativeUsd: n / 2, evaluationCount: n, projectionPerEvalUsd: 0.5 })).toBe(false);
    }
  });
});

describe('end-to-end Faza 1 cost projection', () => {
  it('expected total $100.50 reaches HARD_CAP_USD_BREACH (Amendment 1 §4 tight margin)', () => {
    // Simulate Faza 1 expected breakdown reaching $100.50
    let s = createCostTracker(0.50);  // baseline $0.50/eval
    // 50 corpus + 40 NULL + 120 Gen 1 + 25 held-out = 235 evaluations × roughly $0.43/eval
    // For test purposes just simulate hitting $100.50
    s = { ...s, cumulativeUsd: 100.50, evaluationCount: 235 };
    const r = checkHaltTriggers(s);
    expect(r.haltReason).toBe('HARD_CAP_USD_BREACH');
  });
});
