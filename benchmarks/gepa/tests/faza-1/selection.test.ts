/**
 * GEPA Faza 1 — selection tests.
 *
 * Coverage targets:
 *   - top-1-per-shape selection by fitness
 *   - acceptance verdict per best-per-shape
 *   - run-aggregate §F.2 condition (≥3/5 shapes positive delta)
 *   - error handling: missing baseline entry
 */

import { describe, expect, it } from 'vitest';
import { runSelection } from '../../src/faza-1/selection.js';
import { type CandidateMetrics, type ShapeName } from '../../src/faza-1/types.js';

function makeCandidate(
  shape: ShapeName,
  candidateId: string,
  trioII: number,
  retrieval: number = 1.5,
  cost: number = 0.5,
): CandidateMetrics {
  return {
    candidateId,
    shape,
    evaluations: [],
    trioStrictPassRateII: trioII,
    trioStrictPassRateI: trioII,  // simplified for test
    meanRetrievalCallsPerTask: retrieval,
    meanCostUsd: cost,
  };
}

describe('runSelection — top-1 per shape', () => {
  it('selects highest-fitness candidate per shape', () => {
    const candidatesPerShape = new Map<ShapeName, CandidateMetrics[]>([
      ['claude', [
        makeCandidate('claude', 'c-low', 0.30),
        makeCandidate('claude', 'c-high', 0.50),
        makeCandidate('claude', 'c-mid', 0.40),
      ]],
    ]);
    const baselineRate = new Map<ShapeName, number>([['claude', 0.20]]);
    const baselineCost = new Map<ShapeName, number>([['claude', 0.50]]);

    const report = runSelection({
      candidatesPerShape,
      baselineTrioStrictPassRateII: baselineRate,
      baselineMedianCostUsd: baselineCost,
    });

    expect(report.perShape).toHaveLength(1);
    expect(report.perShape[0].shape).toBe('claude');
    expect(report.perShape[0].bestCandidate.candidateId).toBe('c-high');
    expect(report.perShape[0].allCandidatesRanked).toHaveLength(3);
    // Sorted descending by fitness
    expect(report.perShape[0].allCandidatesRanked[0].candidate.candidateId).toBe('c-high');
    expect(report.perShape[0].allCandidatesRanked[2].candidate.candidateId).toBe('c-low');
  });

  it('skips shapes with empty candidate lists', () => {
    const candidatesPerShape = new Map<ShapeName, CandidateMetrics[]>([
      ['claude', []],
      ['gpt', [makeCandidate('gpt', 'g1', 0.40)]],
    ]);
    const baselineRate = new Map<ShapeName, number>([
      ['claude', 0.20],
      ['gpt', 0.20],
    ]);
    const baselineCost = new Map<ShapeName, number>([
      ['claude', 0.50],
      ['gpt', 0.50],
    ]);

    const report = runSelection({
      candidatesPerShape,
      baselineTrioStrictPassRateII: baselineRate,
      baselineMedianCostUsd: baselineCost,
    });

    expect(report.perShape).toHaveLength(1);
    expect(report.perShape[0].shape).toBe('gpt');
  });

  it('throws on missing baseline trio_strict rate for a shape', () => {
    const candidatesPerShape = new Map<ShapeName, CandidateMetrics[]>([
      ['claude', [makeCandidate('claude', 'c1', 0.30)]],
    ]);
    expect(() =>
      runSelection({
        candidatesPerShape,
        baselineTrioStrictPassRateII: new Map(),
        baselineMedianCostUsd: new Map([['claude', 0.50]]),
      }),
    ).toThrow(/missing baseline trio_strict/);
  });

  it('throws on missing baseline median cost for a shape', () => {
    const candidatesPerShape = new Map<ShapeName, CandidateMetrics[]>([
      ['claude', [makeCandidate('claude', 'c1', 0.30)]],
    ]);
    expect(() =>
      runSelection({
        candidatesPerShape,
        baselineTrioStrictPassRateII: new Map([['claude', 0.20]]),
        baselineMedianCostUsd: new Map(),
      }),
    ).toThrow(/missing baseline median cost/);
  });
});

describe('runSelection — Qwen retrieval engagement bonus affects ranking', () => {
  it('Qwen candidate with higher retrieval engagement outranks higher trio_strict but low retrieval', () => {
    // Candidate A: trio=0.40, retrieval=1.0 (-0.05 bonus → fitness ~0.35)
    // Candidate B: trio=0.36, retrieval=2.0 (+0.05 bonus → fitness ~0.41)
    // B wins despite lower trio_strict, because the bonus tips it
    const candidatesPerShape = new Map<ShapeName, CandidateMetrics[]>([
      ['qwen-thinking', [
        makeCandidate('qwen-thinking', 'A-high-trio-low-retrieval', 0.40, 1.0),
        makeCandidate('qwen-thinking', 'B-mid-trio-high-retrieval', 0.36, 2.0),
      ]],
    ]);

    const report = runSelection({
      candidatesPerShape,
      baselineTrioStrictPassRateII: new Map([['qwen-thinking', 0.20]]),
      baselineMedianCostUsd: new Map([['qwen-thinking', 0.50]]),
    });

    expect(report.perShape[0].bestCandidate.candidateId).toBe('B-mid-trio-high-retrieval');
  });

  it('Non-Qwen ranking depends on trio_strict alone (no retrieval bonus tip)', () => {
    // Same trio_strict + retrieval setup as above but for claude shape
    // Now A wins (higher trio_strict) because no retrieval bonus applies
    const candidatesPerShape = new Map<ShapeName, CandidateMetrics[]>([
      ['claude', [
        makeCandidate('claude', 'A-high-trio', 0.40, 1.0),
        makeCandidate('claude', 'B-mid-trio', 0.36, 2.0),
      ]],
    ]);

    const report = runSelection({
      candidatesPerShape,
      baselineTrioStrictPassRateII: new Map([['claude', 0.20]]),
      baselineMedianCostUsd: new Map([['claude', 0.50]]),
    });

    expect(report.perShape[0].bestCandidate.candidateId).toBe('A-high-trio');
  });
});

describe('runSelection — run-aggregate §F.2 condition (≥3/5 shapes positive delta)', () => {
  function setupAllShapes(deltas: Record<ShapeName, number>) {
    const candidates = new Map<ShapeName, CandidateMetrics[]>();
    const baselineRates = new Map<ShapeName, number>();
    const baselineCosts = new Map<ShapeName, number>();
    const BASELINE = 0.20;
    for (const [shape, delta] of Object.entries(deltas) as Array<[ShapeName, number]>) {
      candidates.set(shape, [
        makeCandidate(shape, `${shape}-best`, BASELINE + delta / 100, 2.0),
      ]);
      baselineRates.set(shape, BASELINE);
      baselineCosts.set(shape, 0.5);
    }
    return { candidates, baselineRates, baselineCosts };
  }

  it('PASS §F.2: 5/5 shapes positive', () => {
    const { candidates, baselineRates, baselineCosts } = setupAllShapes({
      'claude': 6, 'qwen-thinking': 6, 'qwen-non-thinking': 6, 'gpt': 6, 'generic-simple': 6,
    });
    const report = runSelection({
      candidatesPerShape: candidates,
      baselineTrioStrictPassRateII: baselineRates,
      baselineMedianCostUsd: baselineCosts,
    });
    expect(report.runAggregate.shapesWithPositiveDelta).toBe(5);
    expect(report.runAggregate.condition2Pass).toBe(true);
  });

  it('PASS §F.2: 3/5 shapes positive (boundary)', () => {
    const { candidates, baselineRates, baselineCosts } = setupAllShapes({
      'claude': 6, 'qwen-thinking': 6, 'qwen-non-thinking': 6, 'gpt': -2, 'generic-simple': -2,
    });
    const report = runSelection({
      candidatesPerShape: candidates,
      baselineTrioStrictPassRateII: baselineRates,
      baselineMedianCostUsd: baselineCosts,
    });
    expect(report.runAggregate.shapesWithPositiveDelta).toBe(3);
    expect(report.runAggregate.condition2Pass).toBe(true);
  });

  it('FAIL §F.2: 2/5 shapes positive', () => {
    const { candidates, baselineRates, baselineCosts } = setupAllShapes({
      'claude': 6, 'qwen-thinking': 6, 'qwen-non-thinking': -2, 'gpt': -2, 'generic-simple': -2,
    });
    const report = runSelection({
      candidatesPerShape: candidates,
      baselineTrioStrictPassRateII: baselineRates,
      baselineMedianCostUsd: baselineCosts,
    });
    expect(report.runAggregate.shapesWithPositiveDelta).toBe(2);
    expect(report.runAggregate.condition2Pass).toBe(false);
  });
});
