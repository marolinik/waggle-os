/**
 * GEPA Faza 1 — acceptance validator tests.
 *
 * Coverage targets per manifest v7 §amendment_2_integration.scaffold_test_coverage_NEW_requirements
 * mandatory_acceptance_tests:
 *   - §F.5 FAIL: Qwen candidate with trio_strict delta = +6pp AND mean retrieval = 1.4 → REJECTED
 *   - §F.5 PASS path: Qwen candidate with trio_strict delta = +6pp AND mean retrieval = 1.7 → ACCEPTED
 *
 * Plus comprehensive coverage of §F condition 1 (third update) for both Qwen and non-Qwen branches.
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateCandidate,
  TRIO_STRICT_DELTA_THRESHOLD_PP,
  QWEN_RETRIEVAL_ENGAGEMENT_FLOOR,
  QWEN_FALSE_POSITIVE_RETRIEVAL_FLOOR,
} from '../../src/faza-1/acceptance.js';
import { type CandidateMetrics, type ShapeName } from '../../src/faza-1/types.js';

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
// MANDATORY: §F.5 false-positive guard tests per Amendment 2 §5
// ───────────────────────────────────────────────────────────────────────────

describe('§F.5 false-positive evolution guard — mandatory Amendment 2 acceptance tests', () => {
  it('Qwen candidate, trio_strict delta = +6pp, mean retrieval = 1.4 → REJECTED', () => {
    // baseline = 0.20, candidate = 0.26 → delta = +6pp ≥ 5pp threshold
    // retrieval = 1.4 < 1.5 false-positive floor → §F.5 triggers
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.26,
      meanRetrievalCallsPerTask: 1.4,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });

    expect(verdict.trioStrictDeltaPP).toBeCloseTo(6.0, 6);
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(true);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('REJECTED §F.5 false-positive guard');
  });

  it('Qwen candidate, trio_strict delta = +6pp, mean retrieval = 1.7 → ACCEPTED', () => {
    // baseline = 0.20, candidate = 0.26 → delta = +6pp
    // retrieval = 1.7 ≥ 1.7 floor (engagement gap closed) → §F.5 does NOT trigger
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.26,
      meanRetrievalCallsPerTask: 1.7,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });

    expect(verdict.trioStrictDeltaPP).toBeCloseTo(6.0, 6);
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(false);
    expect(verdict.condition1Pass).toBe(true);
    expect(verdict.accepted).toBe(true);
    expect(verdict.reason).toContain('PASS §F.1');
  });

  it('§F.5 boundary: retrieval = 1.49 → REJECTED (just below floor)', () => {
    const candidate = makeCandidate({
      shape: 'qwen-non-thinking',
      trioStrictPassRateII: 0.30,  // delta = +10pp
      meanRetrievalCallsPerTask: 1.49,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(true);
    expect(verdict.accepted).toBe(false);
  });

  it('§F.5 boundary: retrieval = 1.50 → §F.5 NOT triggered (exact floor inclusive)', () => {
    // 1.50 ≥ 1.50 false-positive floor → guard does not fire
    // But 1.50 < 1.70 §F.1 Qwen floor → condition 1 still fails on different criterion
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.30,  // delta = +10pp
      meanRetrievalCallsPerTask: 1.50,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(false);
    expect(verdict.condition1Pass).toBe(false);  // fails Qwen retrieval floor 1.7
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('FAIL §F.1 Qwen retrieval floor');
  });

  it('§F.5 does NOT trigger when delta < threshold even if retrieval low (Qwen)', () => {
    // delta = +3pp < 5pp threshold → guard not even evaluated
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.23,
      meanRetrievalCallsPerTask: 1.0,  // low, but delta below threshold
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(false);
    expect(verdict.condition1Pass).toBe(false);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('FAIL §F.1 trio_strict delta');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §F.5 does NOT apply to non-Qwen shapes
// ───────────────────────────────────────────────────────────────────────────

describe('§F.5 scoping — only applies to Qwen-targeted shapes', () => {
  it('claude shape with delta = +6pp + retrieval = 0.5 → ACCEPTED (no false-positive guard)', () => {
    const candidate = makeCandidate({
      shape: 'claude',
      trioStrictPassRateII: 0.26,
      meanRetrievalCallsPerTask: 0.5,  // would trigger §F.5 if Qwen, but doesn't apply here
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(false);
    expect(verdict.condition1Pass).toBe(true);
    expect(verdict.accepted).toBe(true);
  });

  it('gpt shape with delta = +5pp + retrieval = 0 → ACCEPTED', () => {
    const candidate = makeCandidate({
      shape: 'gpt',
      trioStrictPassRateII: 0.25,
      meanRetrievalCallsPerTask: 0,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(false);
    expect(verdict.accepted).toBe(true);
  });

  it('generic-simple shape: only trio_strict delta matters, no retrieval requirement', () => {
    const candidate = makeCandidate({
      shape: 'generic-simple',
      trioStrictPassRateII: 0.30,
      meanRetrievalCallsPerTask: 1.0,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.accepted).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §F condition 1 trio_strict delta — basic threshold tests
// ───────────────────────────────────────────────────────────────────────────

describe('§F condition 1 — trio_strict delta threshold (≥+5pp)', () => {
  it('delta = +5pp exactly (boundary inclusive) → condition 1 PASS for non-Qwen', () => {
    const candidate = makeCandidate({
      shape: 'claude',
      trioStrictPassRateII: 0.25,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.trioStrictDeltaPP).toBeCloseTo(5.0, 6);
    expect(verdict.condition1Pass).toBe(true);
    expect(verdict.accepted).toBe(true);
  });

  it('delta = +4.99pp (just below boundary) → condition 1 FAIL', () => {
    const candidate = makeCandidate({
      shape: 'claude',
      trioStrictPassRateII: 0.2499,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition1Pass).toBe(false);
    expect(verdict.accepted).toBe(false);
  });

  it('negative delta (regression) → condition 1 FAIL', () => {
    const candidate = makeCandidate({
      shape: 'gpt',
      trioStrictPassRateII: 0.10,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.trioStrictDeltaPP).toBeCloseTo(-10.0, 6);
    expect(verdict.condition1Pass).toBe(false);
  });

  it('exposes binding constants for external auditing', () => {
    expect(TRIO_STRICT_DELTA_THRESHOLD_PP).toBe(5);
    expect(QWEN_RETRIEVAL_ENGAGEMENT_FLOOR).toBe(1.7);
    expect(QWEN_FALSE_POSITIVE_RETRIEVAL_FLOOR).toBe(1.5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §F condition 1 — Qwen-only retrieval engagement floor (1.7)
// ───────────────────────────────────────────────────────────────────────────

describe('§F condition 1 — Qwen retrieval engagement floor (1.7) sub-criterion', () => {
  it('Qwen candidate, delta = +5pp, retrieval = 1.69 → FAIL (below 1.7 floor)', () => {
    // 1.69 ≥ 1.5 false-positive floor (so §F.5 does not trigger)
    // but 1.69 < 1.7 §F.1 Qwen floor (so condition 1 fails)
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.25,
      meanRetrievalCallsPerTask: 1.69,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition5FalsePositiveGuardTriggered).toBe(false);
    expect(verdict.condition1Pass).toBe(false);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('FAIL §F.1 Qwen retrieval floor');
  });

  it('Qwen candidate, delta = +5pp, retrieval = 1.70 → PASS (exact floor inclusive)', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.25,
      meanRetrievalCallsPerTask: 1.70,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.condition1Pass).toBe(true);
    expect(verdict.accepted).toBe(true);
  });

  it('Qwen candidate, delta = +5pp, retrieval = 2.5 → PASS (well above floor)', () => {
    const candidate = makeCandidate({
      shape: 'qwen-non-thinking',
      trioStrictPassRateII: 0.25,
      meanRetrievalCallsPerTask: 2.5,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.accepted).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Audit log invariants
// ───────────────────────────────────────────────────────────────────────────

describe('audit log invariants', () => {
  it('reason string includes shape, delta, retrieval, accepted flag', () => {
    const candidate = makeCandidate({
      shape: 'qwen-thinking',
      trioStrictPassRateII: 0.30,
      meanRetrievalCallsPerTask: 2.0,
    });
    const verdict = evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.20 });
    expect(verdict.reason).toContain('shape=qwen-thinking');
    expect(verdict.reason).toContain('trio_strict_delta=10.00pp');
    expect(verdict.reason).toContain('mean_retrieval_calls=2.00');
    expect(verdict.reason).toContain('accepted=true');
  });

  it('every shape produces a verdict (no exceptions)', () => {
    const shapes: ShapeName[] = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'];
    for (const shape of shapes) {
      const candidate = makeCandidate({ shape, trioStrictPassRateII: 0.5 });
      expect(() =>
        evaluateCandidate({ candidate, baselineTrioStrictPassRateII: 0.4 }),
      ).not.toThrow();
    }
  });
});
