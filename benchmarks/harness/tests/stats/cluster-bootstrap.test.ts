/**
 * Sprint 12 Task 1 Blocker #5 — cluster-bootstrap tests.
 *
 * Acceptance (brief § 2.1 A):
 *   1. Deterministic re-run (same input + seed → same output)
 *   2. Default n_bootstrap = 10 000
 *   3. Default seed = 42
 *   4. Rejects empty rows
 *   5. CI ⊇ point_estimate property
 *   6. ci_lower ≤ ci_upper invariant
 *   7. Cluster structure affects CI vs. instance-level Wilson
 *   8. NaN guard on malformed `correct` field
 */

import { describe, expect, it } from 'vitest';
import {
  computeClusterBootstrapCI,
  type CorrectnessRow,
} from '../../src/stats/cluster-bootstrap.js';
import { computeWilsonCI } from '../../src/stats/wilson-ci.js';

function buildClusteredRows(
  clusterCount: number,
  rowsPerCluster: number,
  correctRate: number,
): CorrectnessRow[] {
  // Deterministic construction: first ⌊rate × rowsPerCluster⌋ rows in each
  // cluster are correct. Keeps tests independent of PRNG state.
  const rows: CorrectnessRow[] = [];
  const correctPerCluster = Math.round(correctRate * rowsPerCluster);
  for (let c = 0; c < clusterCount; c++) {
    const conversation_id = `conv-${c}`;
    for (let r = 0; r < rowsPerCluster; r++) {
      rows.push({ conversation_id, correct: r < correctPerCluster ? 1 : 0 });
    }
  }
  return rows;
}

describe('computeClusterBootstrapCI — determinism + defaults', () => {
  it('produces bit-identical output on two calls with same input', () => {
    const rows = buildClusteredRows(5, 4, 0.75);
    const a = computeClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    const b = computeClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    expect(a.ci_lower).toBe(b.ci_lower);
    expect(a.ci_upper).toBe(b.ci_upper);
    expect(a.point_estimate).toBe(b.point_estimate);
  });

  it('different seeds produce different bootstrap CIs (seed sensitivity sanity)', () => {
    // 20 singleton clusters with an irregular correct/wrong pattern so that
    // bootstrap resample means span a dense set of values. At n=20 and
    // n_bootstrap=2000, the 2.5th/97.5th percentile indices (50 and 1950)
    // are far from the extremes, so different seeds produce materially
    // different CI bounds.
    const rows: CorrectnessRow[] = [];
    for (let i = 0; i < 20; i++) {
      rows.push({ conversation_id: `c-${i}`, correct: (i % 3 === 0 ? 1 : 0) });
    }
    const a = computeClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    const b = computeClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 123 });
    expect(a.point_estimate).toBe(b.point_estimate);
    const sameBounds = a.ci_lower === b.ci_lower && a.ci_upper === b.ci_upper;
    expect(sameBounds).toBe(false);
  });

  it('defaults n_bootstrap=10000 and seed=42 per A3 LOCK § 2', () => {
    const rows = buildClusteredRows(3, 4, 0.5);
    const r = computeClusterBootstrapCI({ rows });
    expect(r.n_bootstrap).toBe(10000);
    expect(r.seed).toBe(42);
  });
});

describe('computeClusterBootstrapCI — structural invariants', () => {
  it('CI contains the point estimate (point ∈ [ci_lower, ci_upper])', () => {
    const rows = buildClusteredRows(8, 4, 0.75);
    const r = computeClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.point_estimate).toBeGreaterThanOrEqual(r.ci_lower);
    expect(r.point_estimate).toBeLessThanOrEqual(r.ci_upper);
  });

  it('ci_lower ≤ ci_upper always', () => {
    const rows = buildClusteredRows(5, 3, 0.333);
    const r = computeClusterBootstrapCI({ rows, n_bootstrap: 1000, seed: 42 });
    expect(r.ci_lower).toBeLessThanOrEqual(r.ci_upper);
  });

  it('reports n_clusters = distinct conversation_ids', () => {
    const rows = [
      { conversation_id: 'a', correct: 1 as const },
      { conversation_id: 'a', correct: 1 as const },
      { conversation_id: 'b', correct: 0 as const },
      { conversation_id: 'c', correct: 1 as const },
    ];
    const r = computeClusterBootstrapCI({ rows, n_bootstrap: 100, seed: 42 });
    expect(r.n_clusters).toBe(3);
    expect(r.n_rows).toBe(4);
  });

  it('produces wider CI than instance-level Wilson when intra-cluster correlation is high', () => {
    // 6 clusters × 4 rows, all-or-nothing correctness within each cluster:
    // 4 clusters all-correct (4×4=16 successes) + 2 clusters all-wrong (0).
    // Intra-cluster correlation is max (1.0) — clusters are homogeneous.
    // Bootstrap should reflect that cluster-level variance is huge (some
    // samples pick all-correct clusters → near 1.0; others pick all-wrong
    // → near 0.0), producing a much wider CI than instance-level Wilson
    // which assumes independent 16/24 successes.
    const rows: CorrectnessRow[] = [];
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        rows.push({ conversation_id: `correct-${c}`, correct: 1 });
      }
    }
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 4; r++) {
        rows.push({ conversation_id: `wrong-${c}`, correct: 0 });
      }
    }
    const bootstrap = computeClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    const wilson = computeWilsonCI({ successes: 16, trials: 24 });
    const bootstrapWidth = bootstrap.ci_upper - bootstrap.ci_lower;
    const wilsonWidth = wilson.ci_upper - wilson.ci_lower;
    expect(bootstrapWidth).toBeGreaterThan(wilsonWidth);
  });
});

describe('computeClusterBootstrapCI — input validation', () => {
  it('rejects empty rows', () => {
    expect(() => computeClusterBootstrapCI({ rows: [] })).toThrow(/non-empty rows/);
  });

  it('rejects n_bootstrap < 1', () => {
    const rows = buildClusteredRows(2, 2, 0.5);
    expect(() => computeClusterBootstrapCI({ rows, n_bootstrap: 0 })).toThrow(
      /n_bootstrap ≥ 1/,
    );
  });

  it('rejects non-integer seed', () => {
    const rows = buildClusteredRows(2, 2, 0.5);
    expect(() => computeClusterBootstrapCI({ rows, seed: 1.5 })).toThrow(/integer seed/);
  });

  it('rejects rows with correct ∉ {0, 1}', () => {
    const rows = [
      { conversation_id: 'a', correct: 1 as 0 | 1 },
      { conversation_id: 'a', correct: 2 as unknown as 0 | 1 },
    ];
    expect(() => computeClusterBootstrapCI({ rows, n_bootstrap: 10, seed: 42 })).toThrow(
      /correct ∈ \{0, 1\}/,
    );
  });

  it('rejects confidence ≠ 0.95', () => {
    const rows = buildClusteredRows(2, 2, 0.5);
    expect(() => computeClusterBootstrapCI({ rows, confidence: 0.99 })).toThrow(
      /confidence=0\.95/,
    );
  });
});
