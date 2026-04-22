/**
 * Sprint 12 Task 1 Blocker #5 — Fleiss' κ (1971) implementation.
 *
 * Measures inter-rater agreement over a fixed number of categorical raters
 * assigning items to K mutually exclusive categories. Used in the benchmark
 * harness to compute pre-tie-break agreement across the 3-vendor primary
 * judge ensemble (Opus 4.7 + GPT-5.4 + Gemini 3.1) per A3 LOCK § 4.
 *
 * Formula (Fleiss 1971):
 *   n_ij  = number of judges who assigned item i to category j
 *   p_j   = (1 / (N·n)) · Σ_i n_ij          // category marginal
 *   P_i   = (1 / (n·(n−1))) · (Σ_j n_ij² − n)   // item agreement
 *   P_bar = (1/N) · Σ_i P_i                 // mean observed agreement
 *   P_e   = Σ_j p_j²                        // chance-expected agreement
 *   κ     = (P_bar − P_e) / (1 − P_e)
 *
 * Reference: Fleiss, J. L. (1971). "Measuring nominal scale agreement
 * among many raters." Psychological Bulletin, 76(5), 378-382.
 *
 * Numerical note: for K=2 this reduces to a well-behaved agreement
 * measure. When P_e = 1 (all judges always picked the same category),
 * the denominator vanishes and κ is undefined — we return NaN in that
 * case and surface the condition via the marginals.
 *
 * A3 LOCK § 4 HALT threshold: κ < 0.60 mid-run triggers abort. This
 * module returns the raw κ; the runner-level HALT check sits alongside.
 */

export interface VoteMatrix {
  /**
   * Number of judges per item. Fixed across all items (Fleiss requirement).
   * For the benchmark harness's 3-primary ensemble, this is 3.
   */
  n_judges: number;
  /**
   * counts[i][k] = number of judges who assigned item i to category k.
   * Row invariant: Σ_k counts[i][k] === n_judges for every i.
   */
  counts: readonly (readonly number[])[];
  /**
   * Optional labels for the K categories (e.g. ['correct', 'F1', 'F2', ...,
   * 'F_other']). Length must equal the column width of `counts`. Not used
   * in the κ math — preserved for report-time display.
   */
  categories?: readonly string[];
}

export interface FleissKappaResult {
  /** Fleiss' κ ∈ [−1, 1]. NaN when P_e === 1 (uniform judge assignment). */
  kappa: number;
  /** Item count (rows of `counts`). */
  n_items: number;
  /** Judge count (fixed, from input). */
  n_judges: number;
  /** Category count (columns of `counts`). */
  n_categories: number;
  /** Per-category marginal proportions p_j. Sum across K categories ≈ 1. */
  category_marginals: number[];
  /** Mean observed agreement over items (P_bar). */
  P_bar: number;
  /** Chance-expected agreement (P_e = Σ p_j²). */
  P_e: number;
}

export function computeFleissKappa(matrix: VoteMatrix): FleissKappaResult {
  const { n_judges, counts } = matrix;

  if (!Number.isFinite(n_judges) || n_judges < 2 || !Number.isInteger(n_judges)) {
    throw new Error(`Fleiss κ requires n_judges ≥ 2 (integer); got ${n_judges}`);
  }
  if (!Array.isArray(counts) || counts.length === 0) {
    throw new Error('Fleiss κ requires a non-empty counts matrix');
  }

  const N = counts.length;
  const K = counts[0].length;
  if (K < 2) {
    throw new Error(`Fleiss κ requires K ≥ 2 categories; got ${K}`);
  }

  // Validate rectangular shape + row-sum invariant.
  for (let i = 0; i < N; i++) {
    if (counts[i].length !== K) {
      throw new Error(
        `Fleiss κ counts matrix must be rectangular; row ${i} has ${counts[i].length} cols, expected ${K}`,
      );
    }
    let rowSum = 0;
    for (let k = 0; k < K; k++) {
      const v = counts[i][k];
      if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
        throw new Error(
          `Fleiss κ counts must be non-negative integers; counts[${i}][${k}] = ${v}`,
        );
      }
      rowSum += v;
    }
    if (rowSum !== n_judges) {
      throw new Error(
        `Fleiss κ row sum must equal n_judges; row ${i} sums to ${rowSum}, expected ${n_judges}`,
      );
    }
  }

  if (matrix.categories !== undefined && matrix.categories.length !== K) {
    throw new Error(
      `Fleiss κ categories length (${matrix.categories.length}) must match K=${K}`,
    );
  }

  // Category marginals p_j.
  const marginals = new Array<number>(K).fill(0);
  for (let k = 0; k < K; k++) {
    let total = 0;
    for (let i = 0; i < N; i++) total += counts[i][k];
    marginals[k] = total / (N * n_judges);
  }

  // Per-item agreement P_i.
  // P_i = (1 / (n·(n−1))) · (Σ_j n_ij² − n)
  const denomItem = n_judges * (n_judges - 1);
  let P_sum = 0;
  for (let i = 0; i < N; i++) {
    let sqSum = 0;
    for (let k = 0; k < K; k++) {
      const v = counts[i][k];
      sqSum += v * v;
    }
    const P_i = (sqSum - n_judges) / denomItem;
    P_sum += P_i;
  }
  const P_bar = P_sum / N;
  const P_e = marginals.reduce((acc, p) => acc + p * p, 0);

  // κ = (P_bar − P_e) / (1 − P_e). NaN when P_e === 1 (uniform assignment).
  const kappa = P_e === 1 ? Number.NaN : (P_bar - P_e) / (1 - P_e);

  return {
    kappa,
    n_items: N,
    n_judges,
    n_categories: K,
    category_marginals: marginals,
    P_bar,
    P_e,
  };
}
