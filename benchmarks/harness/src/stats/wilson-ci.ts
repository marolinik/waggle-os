/**
 * Sprint 12 Task 1 Blocker #5 — Wilson score interval (95% two-sided).
 *
 * Frequentist binomial confidence interval on a proportion. Primary CI per
 * A3 LOCK § 2 for binary correctness rates; tighter than Wald at the
 * boundaries (p̂ near 0 or 1) and does not require normal approximation.
 *
 * Formula (Wilson 1927):
 *   p̂     = successes / trials
 *   z     = 1.959964                         (two-sided 95%)
 *   denom = 1 + z²/n
 *   center = (p̂ + z²/(2n)) / denom
 *   half  = z · √(p̂(1−p̂)/n + z²/(4n²)) / denom
 *   CI    = [center − half, center + half]
 *
 * Reference: Wilson, E. B. (1927). "Probable inference, the law of
 * succession, and statistical inference." JASA, 22(158), 209-212.
 *
 * A3 LOCK § 2 STRONG-PUBLISHABLE gate: Wilson lower bound ≥ 91.6% when
 * computed over the full H-42a 4620-eval run. This module returns the
 * raw CI; tier classification sits alongside in the aggregate writer.
 */

export interface WilsonInput {
  /** Number of successes (correct verdicts). Must be integer in [0, trials]. */
  successes: number;
  /** Total trials. Must be positive integer. */
  trials: number;
  /**
   * Confidence level. Only 0.95 is implemented (z=1.959964 hardcoded).
   * Defaults to 0.95. Non-0.95 values throw until someone extends the
   * z-lookup table — deliberate conservatism to prevent silent
   * miscalibration in a launch-gating metric.
   */
  confidence?: number;
}

export interface WilsonResult {
  /** Point estimate p̂ = successes / trials. */
  point_estimate: number;
  /** Lower bound of the 95% CI, clamped to [0, 1]. */
  ci_lower: number;
  /** Upper bound of the 95% CI, clamped to [0, 1]. */
  ci_upper: number;
  /** (ci_upper − ci_lower) / 2 — symmetric half-width. */
  half_width: number;
  /** Confidence level echo-back (always 0.95 in this implementation). */
  confidence: number;
}

/** z-score for the two-sided 95% Wilson interval. Matches standard
 *  tabular value: Φ⁻¹(0.975) ≈ 1.959964. */
export const Z_95_TWO_SIDED = 1.959964;

export function computeWilsonCI(input: WilsonInput): WilsonResult {
  const { successes, trials, confidence = 0.95 } = input;

  if (!Number.isFinite(trials) || trials <= 0 || !Number.isInteger(trials)) {
    throw new Error(`Wilson CI requires trials ≥ 1 (integer); got ${trials}`);
  }
  if (
    !Number.isFinite(successes) ||
    successes < 0 ||
    successes > trials ||
    !Number.isInteger(successes)
  ) {
    throw new Error(
      `Wilson CI requires successes ∈ [0, trials]; got ${successes} (trials=${trials})`,
    );
  }
  if (confidence !== 0.95) {
    throw new Error(
      `Wilson CI only supports confidence=0.95 in this implementation; got ${confidence}`,
    );
  }

  const n = trials;
  const p_hat = successes / n;
  const z = Z_95_TWO_SIDED;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p_hat + z2 / (2 * n)) / denom;
  const halfInner = p_hat * (1 - p_hat) / n + z2 / (4 * n * n);
  const half = (z * Math.sqrt(halfInner)) / denom;

  // Clamp to [0, 1] defensively — Wilson is well-behaved at boundaries
  // but floating-point can produce −1e-17 etc. at p̂=0 / p̂=1 edges.
  const ci_lower = Math.max(0, center - half);
  const ci_upper = Math.min(1, center + half);

  return {
    point_estimate: p_hat,
    ci_lower,
    ci_upper,
    half_width: (ci_upper - ci_lower) / 2,
    confidence,
  };
}
