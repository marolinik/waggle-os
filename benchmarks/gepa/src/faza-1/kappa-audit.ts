/**
 * GEPA Faza 1 — κ drift audit utility.
 *
 * Per launch decision §F.3 + manifest v7 §canonical_kappa_anchor +
 * §faza_1_acceptance.condition_3.
 *
 * Canonical κ value: 0.7877758913412564 (rounds to 0.7878).
 * Source: benchmarks/calibration/v6-kappa-recal/_summary-v6-kappa.json
 *         (SHA 657d4490bab28d35cf8a9c3ccea8a6b79e92835d700155184e51f3900836684c)
 * Drift threshold: ±0.05 (drift band [0.7378, 0.8378])
 *
 * Per κ_recalibration_v6 success_criteria + monitoring_runtime in manifest v6 §5.4:
 *   - PASS: κ_trio ≥ 0.70
 *   - BORDERLINE: κ_trio ∈ [0.60, 0.70]
 *   - FAIL: κ_trio < 0.60
 *
 * Faza 1-specific drift acceptance (tighter than v6 baseline policy):
 *   - PASS: κ_trio ∈ [0.7378, 0.8378] (canonical ±0.05)
 *   - DRIFT_LOW: κ_trio < 0.7378
 *   - DRIFT_HIGH: κ_trio > 0.8378 (also a fail signal — judge ensemble drifted upward)
 */

/** Canonical κ baseline anchor pinned per manifest v7. */
export const CANONICAL_KAPPA = 0.7877758913412564;

/** Drift threshold (per brief §4 condition 3). */
export const KAPPA_DRIFT_THRESHOLD = 0.05;

/** Drift band lower bound (canonical − threshold). */
export const KAPPA_DRIFT_BAND_LOW = CANONICAL_KAPPA - KAPPA_DRIFT_THRESHOLD;

/** Drift band upper bound (canonical + threshold). */
export const KAPPA_DRIFT_BAND_HIGH = CANONICAL_KAPPA + KAPPA_DRIFT_THRESHOLD;

/** v6 policy floor for absolute κ pass (kept for cross-validation reporting). */
export const V6_KAPPA_POLICY_FLOOR_PASS = 0.70;

/** v6 borderline lower bound. */
export const V6_KAPPA_POLICY_FLOOR_BORDERLINE = 0.60;

export type KappaVerdict =
  | 'PASS_WITHIN_DRIFT_BAND'
  | 'DRIFT_LOW_BELOW_BAND'
  | 'DRIFT_HIGH_ABOVE_BAND';

export interface KappaPairwise {
  /** Cohen's κ between Opus and GPT verdict streams. */
  kOpusGpt: number;
  /** Cohen's κ between Opus and MiniMax verdict streams. */
  kOpusMinimax: number;
  /** Cohen's κ between GPT and MiniMax verdict streams. */
  kGptMinimax: number;
}

export interface KappaAuditResult {
  /** Conservative trio κ = min of three pairwise κ values (per manifest v6 §5.4). */
  kConservativeTrio: number;
  /** Pairwise components (carried through for audit log). */
  pairwise: KappaPairwise;
  /** Drift band verdict per Faza 1 §F.3 acceptance. */
  verdict: KappaVerdict;
  /** Absolute drift from canonical (positive = above, negative = below). */
  driftFromCanonical: number;
  /** Whether the κ_conservative_trio passes v6 policy floor (≥ 0.70). */
  v6PolicyFloorPass: boolean;
  /** Audit log line for inclusion in checkpoint reports. */
  auditLogLine: string;
}

/** Compute κ audit verdict from three pairwise Cohen's κ values. */
export function auditKappa(pairwise: KappaPairwise): KappaAuditResult {
  const kConservativeTrio = Math.min(
    pairwise.kOpusGpt,
    pairwise.kOpusMinimax,
    pairwise.kGptMinimax,
  );

  const driftFromCanonical = kConservativeTrio - CANONICAL_KAPPA;

  let verdict: KappaVerdict;
  if (kConservativeTrio < KAPPA_DRIFT_BAND_LOW) {
    verdict = 'DRIFT_LOW_BELOW_BAND';
  } else if (kConservativeTrio > KAPPA_DRIFT_BAND_HIGH) {
    verdict = 'DRIFT_HIGH_ABOVE_BAND';
  } else {
    verdict = 'PASS_WITHIN_DRIFT_BAND';
  }

  const v6PolicyFloorPass = kConservativeTrio >= V6_KAPPA_POLICY_FLOOR_PASS;

  const auditLogLine = [
    `κ_conservative_trio=${kConservativeTrio.toFixed(4)}`,
    `canonical=${CANONICAL_KAPPA.toFixed(4)}`,
    `drift=${driftFromCanonical >= 0 ? '+' : ''}${driftFromCanonical.toFixed(4)}`,
    `verdict=${verdict}`,
    `v6_policy_floor=${v6PolicyFloorPass ? 'PASS' : 'FAIL'}`,
  ].join(' | ');

  return {
    kConservativeTrio,
    pairwise,
    verdict,
    driftFromCanonical,
    v6PolicyFloorPass,
    auditLogLine,
  };
}

/**
 * Compute Cohen's κ from a 2×2 confusion matrix.
 *
 * Convenience helper for callers that have raw verdict pair counts (the κ
 * recalibration script computes these for Phase 1 baseline; tests and
 * inline audits during Faza 1 reproduce the computation here).
 *
 * Returns NaN if total observations is zero (caller must handle).
 */
export function computeCohensKappa(confusion: {
  bothCorrect: number;
  bothIncorrect: number;
  firstCorrectSecondIncorrect: number;
  firstIncorrectSecondCorrect: number;
}): number {
  const { bothCorrect, bothIncorrect, firstCorrectSecondIncorrect, firstIncorrectSecondCorrect } = confusion;
  const total = bothCorrect + bothIncorrect + firstCorrectSecondIncorrect + firstIncorrectSecondCorrect;
  if (total === 0) return NaN;

  const observedAgreement = (bothCorrect + bothIncorrect) / total;

  // Marginal probabilities for "correct" verdict per rater.
  const firstCorrectMarginal = (bothCorrect + firstCorrectSecondIncorrect) / total;
  const secondCorrectMarginal = (bothCorrect + firstIncorrectSecondCorrect) / total;

  const expectedAgreement =
    firstCorrectMarginal * secondCorrectMarginal +
    (1 - firstCorrectMarginal) * (1 - secondCorrectMarginal);

  if (expectedAgreement === 1) return 1.0;  // perfect base rate, no variance → return κ=1 by convention

  return (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
}
