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
} from '../../src/faza-1/fitness.js';
import {
  type CandidateMetrics,
  type ShapeName,
  QWEN_TARGETED_SHAPES,
  NON_QWEN_SHAPES,
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
