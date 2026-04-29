/**
 * GEPA Faza 1 — fitness function tests.
 *
 * Coverage targets per manifest v7 §amendment_2_integration.scaffold_test_coverage_NEW_requirements:
 *   - 5 retrieval engagement boundary cases (1.49 / 1.50 / 1.99 / 2.00 / 2.50)
 *   - 5 shape-routing tests (claude/gpt/generic-simple excluded; qwen-thinking/qwen-non-thinking included)
 *   - Cost penalty: zero overage + positive overage scenarios
 *   - End-to-end computeFitness invariants on both Qwen and non-Qwen shapes
 *
 * §F.5 false-positive guard tests live in acceptance.test.ts (separate module).
 */

import { describe, expect, it } from 'vitest';
import {
  computeRetrievalEngagementBonus,
  computeCostPenalty,
  computeFitness,
  RETRIEVAL_ENGAGEMENT_BANDS,
  computeTier2RetrievalBonus,
  computeTieredFitness,
  computeDeltaFloorVerdict,
  TIER_2_BONUS_CAP,
  TIER_2_BONUS_PER_PP,
  TIER_3_BONUS_FULL_INVARIANCE,
  TIER_3_ANCHOR_COUNT_FULL,
  DELTA_FLOOR_THRESHOLDS,
} from '../../src/faza-1/fitness.js';
import {
  type CandidateMetrics,
  type ShapeName,
  QWEN_TARGETED_SHAPES,
  NON_QWEN_SHAPES,
  NULL_BASELINE_PER_SHAPE,
  NULL_BASELINE_AGGREGATE,
} from '../../src/faza-1/types.js';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<CandidateMetrics> & Pick<CandidateMetrics, 'shape'>): CandidateMetrics {
  return {
    candidateId: overrides.candidateId ?? `${overrides.shape}-test-candidate`,
    shape: overrides.shape,
    evaluations: overrides.evaluations ?? [],
    trioStrictPassRateII: overrides.trioStrictPassRateII ?? 0.5,
    trioStrictPassRateI: overrides.trioStrictPassRateI ?? 0.5,
    meanRetrievalCallsPerTask: overrides.meanRetrievalCallsPerTask ?? 1.5,
    meanCostUsd: overrides.meanCostUsd ?? 0.5,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// computeRetrievalEngagementBonus — Amendment 2 §3 binding boundary tests
// ───────────────────────────────────────────────────────────────────────────

describe('computeRetrievalEngagementBonus — Amendment 2 §3 boundary cases', () => {
  // Per manifest v7 §amendment_2_integration.scaffold_test_coverage_NEW_requirements
  // mandatory_boundary_tests block — these 5 cases are BINDING contract tests.

  it('qwen-thinking, mean retrieval_calls = 1.49 → expect bonus = -0.05', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 1.49)).toBe(-0.05);
  });

  it('qwen-thinking, mean retrieval_calls = 1.50 → expect bonus = 0.00 (lower threshold inclusive)', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 1.50)).toBe(0.0);
  });

  it('qwen-thinking, mean retrieval_calls = 1.99 → expect bonus = 0.00', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 1.99)).toBe(0.0);
  });

  it('qwen-thinking, mean retrieval_calls = 2.00 → expect bonus = +0.05 (upper threshold inclusive)', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 2.00)).toBe(0.05);
  });

  it('qwen-thinking, mean retrieval_calls = 2.50 → expect bonus = +0.05', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 2.50)).toBe(0.05);
  });

  // Symmetry check on qwen-non-thinking (other Qwen-targeted shape)
  it('qwen-non-thinking exhibits identical band behavior to qwen-thinking', () => {
    expect(computeRetrievalEngagementBonus('qwen-non-thinking', 1.49)).toBe(-0.05);
    expect(computeRetrievalEngagementBonus('qwen-non-thinking', 1.50)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('qwen-non-thinking', 2.00)).toBe(0.05);
  });

  // Edge cases beyond the 5 mandatory boundaries — defensive coverage
  it('handles 0 retrieval calls (extreme low)', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 0)).toBe(-0.05);
  });

  it('handles very high retrieval calls (extreme high)', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 10.0)).toBe(0.05);
  });

  it('exposes binding band constants for external auditing', () => {
    expect(RETRIEVAL_ENGAGEMENT_BANDS.upperThreshold).toBe(2.0);
    expect(RETRIEVAL_ENGAGEMENT_BANDS.lowerThreshold).toBe(1.5);
    expect(RETRIEVAL_ENGAGEMENT_BANDS.bonusPlus).toBe(0.05);
    expect(RETRIEVAL_ENGAGEMENT_BANDS.bonusZero).toBe(0.0);
    expect(RETRIEVAL_ENGAGEMENT_BANDS.bonusMinus).toBe(-0.05);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Shape-routing tests — Amendment 2 §3 mandatory_routing_tests
// ───────────────────────────────────────────────────────────────────────────

describe('shape-routing — Amendment 2 §3 retrieval engagement excluded for non-Qwen shapes', () => {
  // Per Amendment 2 §3 rationale: "Phase 4.5 finding is Qwen-specific. Opus
  // shape does NOT have the gap. Applying retrieval-engagement bonus uniformly
  // across all shapes would distort fitness for shapes that don't have the
  // underlying behavioral problem."

  it('claude shape: bonus computation NOT applied (excluded)', () => {
    expect(computeRetrievalEngagementBonus('claude', 0)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('claude', 1.49)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('claude', 2.50)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('claude', 100)).toBe(0.0);
  });

  it('gpt shape: bonus computation NOT applied (excluded)', () => {
    expect(computeRetrievalEngagementBonus('gpt', 0)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('gpt', 1.49)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('gpt', 2.50)).toBe(0.0);
  });

  it('generic-simple shape: bonus computation NOT applied (excluded)', () => {
    expect(computeRetrievalEngagementBonus('generic-simple', 0)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('generic-simple', 1.49)).toBe(0.0);
    expect(computeRetrievalEngagementBonus('generic-simple', 2.50)).toBe(0.0);
  });

  it('qwen-thinking shape: bonus computation IS applied', () => {
    expect(computeRetrievalEngagementBonus('qwen-thinking', 1.49)).toBe(-0.05);
    expect(computeRetrievalEngagementBonus('qwen-thinking', 2.50)).toBe(0.05);
  });

  it('qwen-non-thinking shape: bonus computation IS applied', () => {
    expect(computeRetrievalEngagementBonus('qwen-non-thinking', 1.49)).toBe(-0.05);
    expect(computeRetrievalEngagementBonus('qwen-non-thinking', 2.50)).toBe(0.05);
  });

  it('shape-class set membership matches manifest v7 declaration', () => {
    // Manifest v7 §metric_operationalization.retrieval_engagement_bonus.applies_to_shapes
    expect(QWEN_TARGETED_SHAPES.has('qwen-thinking')).toBe(true);
    expect(QWEN_TARGETED_SHAPES.has('qwen-non-thinking')).toBe(true);
    expect(QWEN_TARGETED_SHAPES.has('claude')).toBe(false);
    expect(QWEN_TARGETED_SHAPES.has('gpt')).toBe(false);
    expect(QWEN_TARGETED_SHAPES.has('generic-simple')).toBe(false);

    // Manifest v7 §metric_operationalization.retrieval_engagement_bonus.excluded_shapes
    expect(NON_QWEN_SHAPES.has('claude')).toBe(true);
    expect(NON_QWEN_SHAPES.has('gpt')).toBe(true);
    expect(NON_QWEN_SHAPES.has('generic-simple')).toBe(true);
    expect(NON_QWEN_SHAPES.has('qwen-thinking')).toBe(false);
    expect(NON_QWEN_SHAPES.has('qwen-non-thinking')).toBe(false);
  });

  it('partition: every ShapeName is in exactly one set (no overlap, no gap)', () => {
    const all: ShapeName[] = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'];
    for (const s of all) {
      const inQwen = QWEN_TARGETED_SHAPES.has(s);
      const inNonQwen = NON_QWEN_SHAPES.has(s);
      expect(inQwen !== inNonQwen).toBe(true);  // exactly one
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// computeCostPenalty
// ───────────────────────────────────────────────────────────────────────────

describe('computeCostPenalty — brief §3.1 0.5pp per $0.10 above baseline median', () => {
  it('returns 0 when candidate cost equals baseline median', () => {
    expect(computeCostPenalty(0.50, 0.50)).toBe(0.0);
  });

  it('returns 0 when candidate cost below baseline median', () => {
    expect(computeCostPenalty(0.30, 0.50)).toBe(0.0);
  });

  it('returns 0.005 (0.5pp) for $0.10 overage', () => {
    expect(computeCostPenalty(0.60, 0.50)).toBeCloseTo(0.005, 6);
  });

  it('returns 0.025 (2.5pp) for $0.50 overage', () => {
    expect(computeCostPenalty(1.00, 0.50)).toBeCloseTo(0.025, 6);
  });

  it('returns 0.05 (5pp) for $1.00 overage', () => {
    expect(computeCostPenalty(1.50, 0.50)).toBeCloseTo(0.05, 6);
  });

  it('handles fractional overage', () => {
    expect(computeCostPenalty(0.55, 0.50)).toBeCloseTo(0.0025, 6);  // $0.05 overage = 0.25pp
  });
});

// ───────────────────────────────────────────────────────────────────────────
// computeFitness — end-to-end aggregate
// ───────────────────────────────────────────────────────────────────────────

describe('computeFitness — Qwen-targeted shape branch', () => {
  it('applies retrieval engagement bonus + cost penalty for qwen-thinking', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.50,
      meanRetrievalCallsPerTask: 2.0,  // expect +0.05 bonus
      meanCostUsd: 0.60,                // expect +0.005 cost penalty (vs 0.50 baseline)
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });

    expect(result.trioStrictPassRateII).toBe(0.50);
    expect(result.retrievalEngagementBonus).toBe(0.05);
    expect(result.costPenalty).toBeCloseTo(0.005, 6);
    expect(result.fitness).toBeCloseTo(0.50 + 0.05 - 0.005, 6);
    expect(result.retrievalEngagementApplied).toBe(true);
  });

  it('applies negative retrieval engagement bonus when below 1.5', () => {
    const candidate = makeCandidate({
      shape: 'qwen-non-thinking',
      trioStrictPassRateII: 0.30,
      meanRetrievalCallsPerTask: 1.0,  // expect -0.05 bonus
      meanCostUsd: 0.50,                // no cost overage
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });

    expect(result.retrievalEngagementBonus).toBe(-0.05);
    expect(result.fitness).toBeCloseTo(0.30 - 0.05 - 0.0, 6);
    expect(result.retrievalEngagementApplied).toBe(true);
  });

  it('zero band: candidate retrieves in [1.5, 2.0) gets neutral bonus', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.40,
      meanRetrievalCallsPerTask: 1.7,
      meanCostUsd: 0.50,
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });
    expect(result.retrievalEngagementBonus).toBe(0.0);
    expect(result.fitness).toBe(0.40);
  });
});

describe('computeFitness — non-Qwen shape branch', () => {
  it('claude shape: no retrieval engagement bonus regardless of retrieval_calls', () => {
    const candidate = makeCandidate({
      shape: 'claude',
      trioStrictPassRateII: 0.60,
      meanRetrievalCallsPerTask: 2.5,  // would be +0.05 if Qwen, but excluded for claude
      meanCostUsd: 0.50,
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });
    expect(result.retrievalEngagementBonus).toBe(0.0);
    expect(result.fitness).toBe(0.60);
    expect(result.retrievalEngagementApplied).toBe(false);
  });

  it('gpt shape: no retrieval engagement bonus regardless of retrieval_calls', () => {
    const candidate = makeCandidate({
      shape: 'gpt',
      trioStrictPassRateII: 0.45,
      meanRetrievalCallsPerTask: 0.5,  // would be -0.05 if Qwen, excluded for gpt
      meanCostUsd: 0.50,
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });
    expect(result.retrievalEngagementBonus).toBe(0.0);
    expect(result.fitness).toBe(0.45);
    expect(result.retrievalEngagementApplied).toBe(false);
  });

  it('generic-simple shape: cost penalty still applies, but no retrieval bonus', () => {
    const candidate = makeCandidate({
      shape: 'generic-simple',
      trioStrictPassRateII: 0.70,
      meanRetrievalCallsPerTask: 3.0,
      meanCostUsd: 1.00,  // $0.50 overage → 2.5pp penalty
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });
    expect(result.retrievalEngagementBonus).toBe(0.0);
    expect(result.costPenalty).toBeCloseTo(0.025, 6);
    expect(result.fitness).toBeCloseTo(0.70 - 0.025, 6);
  });
});

describe('computeFitness — invariants', () => {
  it('retrievalEngagementApplied flag matches QWEN_TARGETED_SHAPES membership', () => {
    const shapes: ShapeName[] = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'];
    for (const shape of shapes) {
      const result = computeFitness({
        candidate: makeCandidate({ shape, meanRetrievalCallsPerTask: 1.5, meanCostUsd: 0.5 }),
        baselineMedianCostUsd: 0.5,
      });
      expect(result.retrievalEngagementApplied).toBe(QWEN_TARGETED_SHAPES.has(shape));
    }
  });

  it('fitness components sum to fitness within floating point tolerance', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.55,
      meanRetrievalCallsPerTask: 2.1,
      meanCostUsd: 0.65,
    });
    const result = computeFitness({ candidate, baselineMedianCostUsd: 0.50 });
    const expected = result.trioStrictPassRateII + result.retrievalEngagementBonus - result.costPenalty;
    expect(result.fitness).toBeCloseTo(expected, 10);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Amendment 7 — Tier 2 retrieval bonus (continuous)
// ───────────────────────────────────────────────────────────────────────────

describe('Amendment 7 — computeTier2RetrievalBonus (continuous formula)', () => {
  it('returns 0 for non-Qwen shape regardless of retrieval delta', () => {
    expect(computeTier2RetrievalBonus('claude', 2.0, 1.0)).toBe(0);
    expect(computeTier2RetrievalBonus('gpt', 5.0, 1.0)).toBe(0);
    expect(computeTier2RetrievalBonus('generic-simple', 3.0, 1.0)).toBe(0);
  });

  it('returns 0 for Qwen-targeted shape when delta ≤ 0 (no negative bonus)', () => {
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.0, 1.5)).toBe(0);
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.12, 1.12)).toBe(0); // exact zero delta
    expect(computeTier2RetrievalBonus('qwen-non-thinking', 1.20, 1.25)).toBe(0); // small negative
  });

  it('formula: 0.05 bonus per pp above baseline (1pp = 0.01 absolute)', () => {
    // baseline 1.12, candidate 1.13 = +0.01 = +1pp → 0.05 bonus
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.13, 1.12)).toBeCloseTo(0.05, 10);
    // baseline 1.12, candidate 1.14 = +0.02 = +2pp → 0.10 bonus
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.14, 1.12)).toBeCloseTo(0.10, 10);
    // baseline 1.12, candidate 1.15 = +0.03 = +3pp → 0.15 bonus
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.15, 1.12)).toBeCloseTo(0.15, 10);
    // baseline 1.12, candidate 1.16 = +0.04 = +4pp → 0.20 bonus
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.16, 1.12)).toBeCloseTo(0.20, 10);
    // baseline 1.12, candidate 1.17 = +0.05 = +5pp → 0.25 (cap)
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.17, 1.12)).toBeCloseTo(0.25, 10);
  });

  it('cap holds at +5pp absolute and beyond (cap = 0.25)', () => {
    expect(computeTier2RetrievalBonus('qwen-thinking', 1.20, 1.12)).toBe(TIER_2_BONUS_CAP);
    expect(computeTier2RetrievalBonus('qwen-thinking', 2.00, 1.12)).toBe(TIER_2_BONUS_CAP);
    expect(computeTier2RetrievalBonus('qwen-thinking', 5.00, 1.12)).toBe(TIER_2_BONUS_CAP);
    expect(computeTier2RetrievalBonus('qwen-non-thinking', 1.30, 1.25)).toBe(TIER_2_BONUS_CAP);
  });

  it('Tier 2 weight constants match Amendment 7 §fitness_function_tiered.tier_2', () => {
    expect(TIER_2_BONUS_PER_PP).toBe(0.05);
    expect(TIER_2_BONUS_CAP).toBe(0.25);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Amendment 7 — computeTieredFitness (Tier 1/2/3 + saturated regime aggregate)
// ───────────────────────────────────────────────────────────────────────────

describe('Amendment 7 — computeTieredFitness', () => {
  it('Tier 1 = NULL pass rate delta in pp (signed)', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.95,
      meanRetrievalCallsPerTask: 1.12,
    });
    const result = computeTieredFitness({
      candidate,
      nullBaselinePassRateII: 0.875,
      nullBaselineMeanRetrievalCallsPerTask: 1.12,
      mutationValidatorPassed: true,
      saturatedRegime: true,
    });
    expect(result.tier1DeltaPP).toBeCloseTo(7.5, 10); // 0.95 - 0.875 = 0.075 = 7.5pp
  });

  it('Tier 1 negative when candidate regresses below NULL baseline', () => {
    const candidate = makeCandidate({
      shape: 'claude',
      trioStrictPassRateII: 0.75,
      meanRetrievalCallsPerTask: 1.12,
    });
    const result = computeTieredFitness({
      candidate,
      nullBaselinePassRateII: 0.875,
      nullBaselineMeanRetrievalCallsPerTask: 1.12,
      mutationValidatorPassed: true,
      saturatedRegime: true,
    });
    expect(result.tier1DeltaPP).toBeCloseTo(-12.5, 10); // 0.75 - 0.875 = -0.125 = -12.5pp
  });

  it('Tier 2 only applies to Qwen-targeted shapes', () => {
    for (const shape of ['claude', 'gpt', 'generic-simple'] as const) {
      const result = computeTieredFitness({
        candidate: makeCandidate({ shape, meanRetrievalCallsPerTask: 5.0 }),
        nullBaselinePassRateII: 0.875,
        nullBaselineMeanRetrievalCallsPerTask: 1.12,
        mutationValidatorPassed: true,
        saturatedRegime: true,
      });
      expect(result.tier2RetrievalBonus).toBe(0);
    }
  });

  it('Tier 3 = 0.10 if mutation validator passed; 0 otherwise', () => {
    const base = {
      candidate: makeCandidate({ shape: 'claude' }),
      nullBaselinePassRateII: 0.875,
      nullBaselineMeanRetrievalCallsPerTask: 1.12,
      saturatedRegime: true,
    };
    expect(computeTieredFitness({ ...base, mutationValidatorPassed: true }).tier3CellSemanticInvarianceBonus).toBe(
      TIER_3_BONUS_FULL_INVARIANCE,
    );
    expect(computeTieredFitness({ ...base, mutationValidatorPassed: false }).tier3CellSemanticInvarianceBonus).toBe(0);
  });

  it('cellSemanticAnchorInvarianceCount: 7 if validator passed; 0 otherwise', () => {
    const base = {
      candidate: makeCandidate({ shape: 'claude' }),
      nullBaselinePassRateII: 0.875,
      nullBaselineMeanRetrievalCallsPerTask: 1.12,
      saturatedRegime: true,
    };
    expect(computeTieredFitness({ ...base, mutationValidatorPassed: true }).cellSemanticAnchorInvarianceCount).toBe(
      TIER_3_ANCHOR_COUNT_FULL,
    );
    expect(computeTieredFitness({ ...base, mutationValidatorPassed: false }).cellSemanticAnchorInvarianceCount).toBe(0);
  });

  it('aggregateSaturatedRegime = tier_2 + tier_3 (Tier 1 NOT included)', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.95, // would give tier1 = 7.5pp
      meanRetrievalCallsPerTask: 1.15, // 1.12 baseline → +3pp → tier2 = 0.15
    });
    const result = computeTieredFitness({
      candidate,
      nullBaselinePassRateII: 0.875,
      nullBaselineMeanRetrievalCallsPerTask: 1.12,
      mutationValidatorPassed: true, // tier3 = 0.10
      saturatedRegime: true,
    });
    expect(result.aggregateSaturatedRegime).toBeCloseTo(0.15 + 0.10, 10); // 0.25
    expect(result.aggregateSaturatedRegime).not.toBeCloseTo(7.5 + 0.15 + 0.10, 1); // tier1 not in aggregate
  });

  it('saturatedRegimeApplied flag mirrors input', () => {
    const base = {
      candidate: makeCandidate({ shape: 'claude' }),
      nullBaselinePassRateII: 0.875,
      nullBaselineMeanRetrievalCallsPerTask: 1.12,
      mutationValidatorPassed: true,
    };
    expect(computeTieredFitness({ ...base, saturatedRegime: true }).saturatedRegimeApplied).toBe(true);
    expect(computeTieredFitness({ ...base, saturatedRegime: false }).saturatedRegimeApplied).toBe(false);
  });

  it('NULL_BASELINE_PER_SHAPE constants match Checkpoint A v2 §B.2 pinned values', () => {
    expect(NULL_BASELINE_PER_SHAPE.claude.trioStrictPassRateII).toBe(0.875);
    expect(NULL_BASELINE_PER_SHAPE['qwen-thinking'].trioStrictPassRateII).toBe(0.875);
    expect(NULL_BASELINE_PER_SHAPE['qwen-non-thinking'].trioStrictPassRateII).toBe(1.0);
    expect(NULL_BASELINE_PER_SHAPE.gpt.trioStrictPassRateII).toBe(0.75);
    expect(NULL_BASELINE_PER_SHAPE['generic-simple'].trioStrictPassRateII).toBe(0.875);
    expect(NULL_BASELINE_AGGREGATE.trioStrictPassRateII).toBe(0.875);
    expect(NULL_BASELINE_AGGREGATE.meanRetrievalCallsPerTask).toBe(1.12);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Amendment 7 — computeDeltaFloorVerdict (3 OR-gated thresholds)
// ───────────────────────────────────────────────────────────────────────────

describe('Amendment 7 — computeDeltaFloorVerdict (§gen_1_pre_registered_delta_floor)', () => {
  it('PROCEED if threshold 1 (aggregate Tier 1 ≥+3pp) passes alone', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.910, // +3.5pp vs 0.875 NULL
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: { 'qwen-thinking': 1.12 }, // no Qwen retrieval signal
      qwenShapeNullBaselineRetrievalMeans: { 'qwen-thinking': 1.12 },
      qwenAggregateTier2Bonus: 0,
    });
    expect(verdict.threshold1AggregateTier1).toBe('PASS');
    expect(verdict.threshold1ValuePP).toBeCloseTo(3.5, 10);
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('FAIL');
    expect(verdict.threshold3CompoundTier1PlusTier2).toBe('FAIL');
    expect(verdict.overallVerdict).toBe('PROCEED');
  });

  it('PROCEED if threshold 2 (Qwen retrieval ≥+0.10) passes alone', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.875, // exactly NULL → 0pp (fails threshold 1 ≥+3pp)
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: { 'qwen-thinking': 1.30 }, // 1.30 - 1.12 = +0.18 ≥ 0.10
      qwenShapeNullBaselineRetrievalMeans: { 'qwen-thinking': 1.12 },
      qwenAggregateTier2Bonus: 0, // not enough for threshold 3
    });
    expect(verdict.threshold1AggregateTier1).toBe('FAIL');
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('PASS');
    expect(verdict.threshold2MaxDeltaAbsolute).toBeCloseTo(0.18, 10);
    expect(verdict.overallVerdict).toBe('PROCEED');
  });

  it('PROCEED if threshold 3 (Tier 1 ≥0pp AND Tier 2 ≥0.05) passes alone', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.880, // +0.5pp ≥ 0pp; fails threshold 1 ≥+3pp
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: { 'qwen-thinking': 1.13 }, // +0.01 < 0.10 — fails threshold 2
      qwenShapeNullBaselineRetrievalMeans: { 'qwen-thinking': 1.12 },
      qwenAggregateTier2Bonus: 0.05, // ≥ 0.05
    });
    expect(verdict.threshold1AggregateTier1).toBe('FAIL');
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('FAIL');
    expect(verdict.threshold3CompoundTier1PlusTier2).toBe('PASS');
    expect(verdict.overallVerdict).toBe('PROCEED');
  });

  it('HALT_INVESTIGATE if all three thresholds fail', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.870, // -0.5pp — fails threshold 1 + threshold 3 (Tier 1 < 0pp)
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: { 'qwen-thinking': 1.13 }, // +0.01 < 0.10
      qwenShapeNullBaselineRetrievalMeans: { 'qwen-thinking': 1.12 },
      qwenAggregateTier2Bonus: 0.04, // < 0.05
    });
    expect(verdict.threshold1AggregateTier1).toBe('FAIL');
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('FAIL');
    expect(verdict.threshold3CompoundTier1PlusTier2).toBe('FAIL');
    expect(verdict.overallVerdict).toBe('HALT_INVESTIGATE');
  });

  it('threshold 1 exact-boundary: 3.0pp passes (≥+3pp inclusive with EPSILON)', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.905, // +3.0pp exactly
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: {},
      qwenShapeNullBaselineRetrievalMeans: {},
      qwenAggregateTier2Bonus: 0,
    });
    expect(verdict.threshold1AggregateTier1).toBe('PASS');
    expect(verdict.threshold1ValuePP).toBeCloseTo(3.0, 10);
  });

  it('threshold 2 exact-boundary: +0.10 absolute passes (≥+0.10 inclusive with EPSILON)', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.875,
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: { 'qwen-thinking': 1.22 }, // 1.22 - 1.12 = +0.10 exact
      qwenShapeNullBaselineRetrievalMeans: { 'qwen-thinking': 1.12 },
      qwenAggregateTier2Bonus: 0,
    });
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('PASS');
    expect(verdict.threshold2MaxDeltaAbsolute).toBeCloseTo(0.10, 10);
  });

  it('threshold 2 takes max delta across multiple Qwen shapes', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.875,
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: {
        'qwen-thinking': 1.13,        // +0.01
        'qwen-non-thinking': 1.40,    // +0.15
      },
      qwenShapeNullBaselineRetrievalMeans: {
        'qwen-thinking': 1.12,
        'qwen-non-thinking': 1.25,
      },
      qwenAggregateTier2Bonus: 0,
    });
    expect(verdict.threshold2MaxDeltaAbsolute).toBeCloseTo(0.15, 10);
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('PASS');
  });

  it('handles empty Qwen data: threshold 2 max delta = 0 (FAIL since 0 < 0.10)', () => {
    const verdict = computeDeltaFloorVerdict({
      aggregateTrioStrictPassRateII: 0.875,
      aggregateNullBaselinePassRateII: 0.875,
      qwenShapeRetrievalMeans: {},
      qwenShapeNullBaselineRetrievalMeans: {},
      qwenAggregateTier2Bonus: 0,
    });
    expect(verdict.threshold2MaxDeltaAbsolute).toBe(0);
    expect(verdict.threshold2QwenRetrievalAbsolute).toBe('FAIL');
  });

  it('Δ-floor threshold constants match Amendment 7 §gen_1_pre_registered_delta_floor', () => {
    expect(DELTA_FLOOR_THRESHOLDS.threshold1AggregateTier1PP).toBe(3);
    expect(DELTA_FLOOR_THRESHOLDS.threshold2QwenRetrievalAbsolute).toBe(0.10);
    expect(DELTA_FLOOR_THRESHOLDS.threshold3Tier1MinPP).toBe(0);
    expect(DELTA_FLOOR_THRESHOLDS.threshold3Tier2MinBonus).toBe(0.05);
  });
});
