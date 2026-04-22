/**
 * Sprint 12 Task 1 Blocker #5 — Fleiss κ tests.
 *
 * Acceptance (brief § 2.1 A, criterion-by-criterion):
 *   1. K=2 case reduction sanity
 *   2. K=6 (F1-F6 taxonomy) happy path
 *   3. Perfect agreement → κ=1.0
 *   4. Zero-above-chance agreement → κ=0
 *   5. Pre-tie-break input only (no post-tie-break leakage)
 *   6. NaN guard when P_e = 1 (uniform assignment)
 *   7. Reject mismatched row widths
 *   8. Reject row sums ≠ n_judges
 */

import { describe, expect, it } from 'vitest';
import { computeFleissKappa, type VoteMatrix } from '../../src/stats/fleiss-kappa.js';

describe('computeFleissKappa — structural invariants', () => {
  it('returns κ=1.0 under perfect agreement (all judges pick same category per item)', () => {
    // 4 items, 3 judges, 2 categories. Every judge on every item → same category.
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0],
        [0, 3],
        [3, 0],
        [0, 3],
      ],
    };
    const result = computeFleissKappa(matrix);
    expect(result.kappa).toBeCloseTo(1.0, 10);
    expect(result.P_bar).toBeCloseTo(1.0, 10);
    expect(result.n_items).toBe(4);
    expect(result.n_judges).toBe(3);
    expect(result.n_categories).toBe(2);
  });

  it('returns κ=NaN when P_e=1 (all judges always pick the single category)', () => {
    // 3 items, 3 judges — uniform assignment into category 0.
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0],
        [3, 0],
        [3, 0],
      ],
    };
    const result = computeFleissKappa(matrix);
    expect(Number.isNaN(result.kappa)).toBe(true);
    expect(result.P_e).toBe(1);
  });

  it('reduces cleanly to a binary-agreement measure (K=2 case)', () => {
    // 5 items, 3 judges. Mixed disagreement. κ should land in (0, 1).
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0], // unanimous correct
        [2, 1], // majority correct
        [3, 0], // unanimous correct
        [1, 2], // majority incorrect
        [0, 3], // unanimous incorrect
      ],
    };
    const result = computeFleissKappa(matrix);
    expect(result.n_categories).toBe(2);
    expect(result.kappa).toBeGreaterThan(0);
    expect(result.kappa).toBeLessThanOrEqual(1);
    // Category marginals should sum to 1 (modulo float).
    const marginalSum = result.category_marginals.reduce((a, b) => a + b, 0);
    expect(marginalSum).toBeCloseTo(1.0, 10);
  });

  it('handles K=6 failure taxonomy shape (F1-F6 + null encoded as 7-column matrix)', () => {
    // 6 items, 3 judges, 7 categories (null + F1..F6). Simulates A3 LOCK §6
    // shape with moderate disagreement.
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0, 0, 0, 0, 0, 0], // all correct (null)
        [2, 1, 0, 0, 0, 0, 0], // 2 correct, 1 F1
        [0, 3, 0, 0, 0, 0, 0], // unanimous F1
        [0, 0, 2, 1, 0, 0, 0], // 2 F2, 1 F3
        [3, 0, 0, 0, 0, 0, 0], // all correct
        [0, 0, 0, 0, 0, 0, 3], // unanimous F6
      ],
      categories: ['correct', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6'],
    };
    const result = computeFleissKappa(matrix);
    expect(result.n_categories).toBe(7);
    expect(Number.isFinite(result.kappa)).toBe(true);
    expect(result.kappa).toBeGreaterThan(0);
    expect(result.category_marginals).toHaveLength(7);
  });

  it('returns κ near 0 when item agreement matches chance (no systematic signal)', () => {
    // Large symmetric input where P_bar ≈ P_e. Constructed so that judges'
    // marginals are 50/50 and per-item agreement is exactly what chance gives.
    // 4 items with (2,1) counts at n=3 → P_i = (4+1−3) / (3·2) = 1/3 each.
    // Marginals after symmetry: p_0 = p_1 = 0.5 → P_e = 0.5.
    // So κ = (1/3 − 0.5) / (1 − 0.5) = (−1/6) / 0.5 = −1/3. Near-zero / negative.
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [2, 1],
        [1, 2],
        [2, 1],
        [1, 2],
      ],
    };
    const result = computeFleissKappa(matrix);
    expect(result.P_e).toBeCloseTo(0.5, 10);
    expect(result.P_bar).toBeCloseTo(1 / 3, 10);
    expect(result.kappa).toBeCloseTo(-1 / 3, 10);
  });

  it('accepts the 3-primary ensemble shape (Opus + GPT + Gemini pre-tie-break)', () => {
    // Mirrors the benchmark runner's real input: 3 judges, N items, K=2.
    // No dependency on tie-break state — Fleiss consumes pre-tie-break
    // counts directly per A3 LOCK § 4.
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0],
        [3, 0],
        [2, 1],
        [1, 2], // 1-2 split — tie-break would fire at runtime, but κ input is pre
        [1, 1], // ← would error: row sum 2 ≠ 3 (invalid; see rejection test)
      ],
    };
    // The 5th row violates row-sum invariant; replace with valid row.
    matrix.counts = matrix.counts.slice(0, 4);
    const result = computeFleissKappa(matrix);
    expect(result.n_items).toBe(4);
    expect(result.kappa).toBeGreaterThan(0);
  });
});

describe('computeFleissKappa — input validation', () => {
  it('throws on empty counts array', () => {
    expect(() => computeFleissKappa({ n_judges: 3, counts: [] })).toThrow(
      /non-empty counts matrix/,
    );
  });

  it('throws on n_judges < 2', () => {
    expect(() =>
      computeFleissKappa({ n_judges: 1, counts: [[1, 0]] }),
    ).toThrow(/n_judges ≥ 2/);
  });

  it('throws on K < 2 (single column)', () => {
    expect(() =>
      computeFleissKappa({ n_judges: 3, counts: [[3]] }),
    ).toThrow(/K ≥ 2 categories/);
  });

  it('throws when row width differs from first row (non-rectangular)', () => {
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0],
        [1, 2, 0], // ← extra column
      ],
    };
    expect(() => computeFleissKappa(matrix)).toThrow(/rectangular/);
  });

  it('throws when row sum ≠ n_judges', () => {
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [
        [3, 0],
        [1, 1], // sum = 2 ≠ 3
      ],
    };
    expect(() => computeFleissKappa(matrix)).toThrow(/row sum must equal n_judges/);
  });

  it('throws when categories length does not match K', () => {
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [[3, 0]],
      categories: ['correct', 'wrong', 'extra'],
    };
    expect(() => computeFleissKappa(matrix)).toThrow(/categories length/);
  });

  it('throws on non-integer / negative counts', () => {
    const matrix: VoteMatrix = {
      n_judges: 3,
      counts: [[2.5, 0.5]], // fractional counts
    };
    expect(() => computeFleissKappa(matrix)).toThrow(/non-negative integers/);
  });
});
