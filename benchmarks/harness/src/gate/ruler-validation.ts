/**
 * Ruler-validation gate (03-REDTEAM-RESOLUTIONS D6).
 *
 * Before claiming ANY delta on a substrate, reproduce a published leaderboard
 * number within a PRE-REGISTERED absolute tolerance. This is the same move the
 * prior memory arc made (reproduced Memori's published 81.95 at 81.98, within
 * 0.03pp ⇒ the ruler is trustworthy). Generalized here into a reusable gate.
 *
 * This module is pure arithmetic: the *measurement* (running the native,
 * unmodified τ²/SWE distribution for one model) is produced by the runner /
 * the substrate adapter; this function VALIDATES that measured number against
 * the pre-registered reference. A FAIL must block the priced run.
 *
 * Two-sided band on purpose: a reproduction that is FAR ABOVE the published
 * number is as suspect as one far below — it means our harness measures
 * something different (different split, leaked context, different metric),
 * so the comparison would not be apples-to-apples. Both edges fail.
 */

export interface RulerSpec {
  /** Substrate id, e.g. 'tau2-bench' | 'swe-bench-verified'. */
  substrate: string;
  /** Split / domain, e.g. 'retail' | 'airline' | 'verified'. */
  split: string;
  /** Model id whose published score we reproduce. */
  model: string;
  /** Published leaderboard score as a fraction in [0, 1]. */
  published_score: number;
  /** Pre-registered absolute tolerance (e.g. 0.01 = ±1pp). MUST be > 0. */
  tolerance_abs: number;
  /** Provenance string for the published number (leaderboard + date + ref). */
  source: string;
}

export interface RulerVerdict {
  pass: boolean;
  substrate: string;
  split: string;
  model: string;
  measured_score: number;
  published_score: number;
  /** measured − published (signed). */
  delta: number;
  /** |measured − published|. */
  abs_delta: number;
  tolerance_abs: number;
  source: string;
  /** Human-readable explanation (always set; empty-string-free). */
  reason: string;
}

export function validateRuler(spec: RulerSpec, measured_score: number): RulerVerdict {
  if (!Number.isFinite(spec.tolerance_abs) || spec.tolerance_abs <= 0) {
    throw new Error(`ruler validation requires tolerance_abs > 0; got ${spec.tolerance_abs}`);
  }
  if (!Number.isFinite(spec.published_score) || spec.published_score < 0 || spec.published_score > 1) {
    throw new Error(`ruler validation requires published_score ∈ [0, 1]; got ${spec.published_score}`);
  }
  if (!Number.isFinite(measured_score) || measured_score < 0 || measured_score > 1) {
    throw new Error(`ruler validation requires measured ∈ [0, 1]; got ${measured_score}`);
  }

  const delta = measured_score - spec.published_score;
  const abs_delta = Math.abs(delta);
  // The band is INCLUSIVE at its exact edge. Compare with a tiny absolute
  // epsilon so an edge value that only misses by IEEE-754 representation error
  // (e.g. 0.8195 − 0.01 → |Δ| = 0.0100000000000006) still PASSes, while a real
  // miss (≥ ~1e-9 beyond tolerance) still FAILs.
  const FP_EPSILON = 1e-9;
  const pass = abs_delta <= spec.tolerance_abs + FP_EPSILON;
  const reason = pass
    ? `reproduced ${spec.model} on ${spec.substrate}/${spec.split}: |Δ|=${abs_delta.toFixed(4)} ≤ tol ${spec.tolerance_abs} (ruler trustworthy)`
    : `measured ${measured_score.toFixed(4)} is outside the pre-registered ±${spec.tolerance_abs} band around published ${spec.published_score.toFixed(4)} (|Δ|=${abs_delta.toFixed(4)}) — BLOCK the priced run; the ruler is not reproduced`;

  return {
    pass,
    substrate: spec.substrate,
    split: spec.split,
    model: spec.model,
    measured_score,
    published_score: spec.published_score,
    delta,
    abs_delta,
    tolerance_abs: spec.tolerance_abs,
    source: spec.source,
    reason,
  };
}
