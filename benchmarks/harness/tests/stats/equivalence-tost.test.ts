/**
 * Equivalence-stats tests — paired cluster-bootstrap diff CI + TOST + N helper.
 * Mirrors the acceptance style of cluster-bootstrap.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  computePairedDiffClusterBootstrapCI,
  type PairedRow,
} from '../../src/stats/equivalence-tost.js';

/** Build paired rows: each cluster has `rowsPerCluster` items; arm_a/arm_b
 *  correctness set deterministically by rate so tests don't depend on PRNG. */
function buildPairedRows(
  clusterCount: number,
  rowsPerCluster: number,
  rateA: number,
  rateB: number,
): PairedRow[] {
  const rows: PairedRow[] = [];
  const cA = Math.round(rateA * rowsPerCluster);
  const cB = Math.round(rateB * rowsPerCluster);
  for (let c = 0; c < clusterCount; c++) {
    const cluster_id = `cl-${c}`;
    for (let r = 0; r < rowsPerCluster; r++) {
      rows.push({ cluster_id, arm_a: r < cA ? 1 : 0, arm_b: r < cB ? 1 : 0 });
    }
  }
  return rows;
}

describe('computePairedDiffClusterBootstrapCI — determinism + shape', () => {
  it('is bit-identical on two calls with same input + seed', () => {
    const rows = buildPairedRows(8, 4, 0.75, 0.5);
    const a = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    const b = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    expect(a.ci_lower).toBe(b.ci_lower);
    expect(a.ci_upper).toBe(b.ci_upper);
    expect(a.diff_point).toBe(b.diff_point);
  });

  it('defaults n_bootstrap=10000, seed=42, confidence=0.90', () => {
    const rows = buildPairedRows(4, 4, 0.5, 0.5);
    const r = computePairedDiffClusterBootstrapCI({ rows });
    expect(r.n_bootstrap).toBe(10000);
    expect(r.seed).toBe(42);
    expect(r.confidence).toBe(0.9);
  });

  it('reports n_clusters and n_rows', () => {
    const rows = buildPairedRows(3, 4, 1, 0);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 100, seed: 42 });
    expect(r.n_clusters).toBe(3);
    expect(r.n_rows).toBe(12);
  });
});

describe('computePairedDiffClusterBootstrapCI — correctness of the difference', () => {
  it('diff_point = mean_a − mean_b on the full sample', () => {
    // arm_a 75% correct, arm_b 50% correct → diff = +0.25
    const rows = buildPairedRows(10, 4, 0.75, 0.5);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 1000, seed: 42 });
    expect(r.diff_point).toBeCloseTo(0.25, 10);
  });

  it('homogeneous A=1,B=0 clusters → diff ≈ 1 with a degenerate CI', () => {
    const rows = buildPairedRows(6, 4, 1, 0);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.diff_point).toBe(1);
    expect(r.ci_lower).toBe(1);
    expect(r.ci_upper).toBe(1);
  });

  it('identical arms → diff_point = 0 and CI brackets 0', () => {
    const rows = buildPairedRows(12, 4, 0.5, 0.5);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.diff_point).toBe(0);
    expect(r.ci_lower).toBeLessThanOrEqual(0);
    expect(r.ci_upper).toBeGreaterThanOrEqual(0);
  });

  it('ci_lower ≤ diff_point ≤ ci_upper and bounds within [−1, 1]', () => {
    const rows = buildPairedRows(15, 3, 0.66, 0.33);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 1500, seed: 42 });
    expect(r.ci_lower).toBeLessThanOrEqual(r.diff_point);
    expect(r.diff_point).toBeLessThanOrEqual(r.ci_upper);
    expect(r.ci_lower).toBeGreaterThanOrEqual(-1);
    expect(r.ci_upper).toBeLessThanOrEqual(1);
  });

  it('preserves pairing: resampling uses the SAME clusters for both arms', () => {
    // If pairing were broken (independent resampling of A and B), the diff CI
    // would be wider. Here A and B are perfectly correlated per cluster (each
    // cluster is all-A-correct-and-B-correct OR all-wrong) so the PAIRED diff
    // is exactly 0 in every resample → zero-width CI at 0. Independent
    // resampling would produce a non-zero-width CI.
    const rows: PairedRow[] = [];
    for (let c = 0; c < 6; c++) {
      const both = c % 2 === 0 ? 1 : 0;
      for (let r = 0; r < 4; r++) rows.push({ cluster_id: `c-${c}`, arm_a: both as 0 | 1, arm_b: both as 0 | 1 });
    }
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.diff_point).toBe(0);
    expect(r.ci_lower).toBe(0);
    expect(r.ci_upper).toBe(0);
  });
});

describe('computePairedDiffClusterBootstrapCI — validation', () => {
  it('rejects empty rows', () => {
    expect(() => computePairedDiffClusterBootstrapCI({ rows: [] })).toThrow(/non-empty/);
  });
  it('rejects arm values ∉ {0,1}', () => {
    const rows = [{ cluster_id: 'a', arm_a: 1 as 0 | 1, arm_b: 2 as unknown as 0 | 1 }];
    expect(() => computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 10 })).toThrow(/arm_a, arm_b ∈/);
  });
  it('rejects confidence outside (0,1)', () => {
    const rows = buildPairedRows(2, 2, 0.5, 0.5);
    expect(() => computePairedDiffClusterBootstrapCI({ rows, confidence: 1.5 })).toThrow(/confidence/);
  });
  it('rejects non-integer seed', () => {
    const rows = buildPairedRows(2, 2, 0.5, 0.5);
    expect(() => computePairedDiffClusterBootstrapCI({ rows, seed: 1.5 })).toThrow(/integer seed/);
  });
});
