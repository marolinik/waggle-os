/**
 * GEPA Faza 1 — per-shape fitness function.
 *
 * Per Amendment 2 §3 (manifest v7 §metric_operationalization.per_shape_fitness_formula
 * + §metric_operationalization.retrieval_engagement_bonus).
 *
 * Phase 4.5 empirical signal: Qwen retrieves 1.33×/task vs Opus 2.33×/task.
 * H4 score gap mechanistically traces to under-engagement. Mutation surface
 * (prompt-shape body) is the lever to address this on Qwen-targeted shapes.
 *
 * Fitness function forks by shape class:
 *   Qwen-targeted: fitness = trio_strict_pass_rate + retrieval_engagement_bonus − cost_penalty
 *   Non-Qwen:      fitness = trio_strict_pass_rate − cost_penalty
 *
 * Retrieval engagement bonus bands (Qwen-targeted shapes only):
 *   +0.05 if mean retrieval_calls per task ≥ 2.0   (Opus parity proxy)
 *    0.00 if mean retrieval_calls per task ∈ [1.5, 2.0)
 *   −0.05 if mean retrieval_calls per task < 1.5   (Qwen baseline penalty)
 */

import {
  type FitnessInputs,
  type FitnessComponents,
  type ShapeName,
  QWEN_TARGETED_SHAPES,
} from './types.js';

/** Cost penalty coefficient per brief §3.1 — 0.5pp per $0.10 above baseline median. */
const COST_PENALTY_PP_PER_DOLLAR_10C = 0.5;

/** Retrieval engagement thresholds per Amendment 2 §3 bands. */
export const RETRIEVAL_ENGAGEMENT_BANDS = {
  /** ≥ this → +0.05 bonus (Opus parity proxy). */
  upperThreshold: 2.0,
  /** ≥ this and < upper → 0.00. */
  lowerThreshold: 1.5,
  /** < lower → −0.05 (Qwen baseline penalty). */
  bonusPlus: 0.05,
  bonusZero: 0.0,
  bonusMinus: -0.05,
} as const;

/**
 * Compute the retrieval engagement bonus for a Qwen-targeted shape.
 *
 * Returns 0.0 for non-Qwen shapes (callers should branch on shape class
 * before calling this if they need to distinguish; alternatively use
 * `computeFitness` which handles routing).
 *
 * Boundary semantics (binding per Amendment 2 §8 test cases):
 *   1.49 → −0.05
 *   1.50 →  0.00  (exact lower threshold = zero band)
 *   1.99 →  0.00
 *   2.00 → +0.05  (exact upper threshold = bonus band)
 *   2.50 → +0.05
 */
export function computeRetrievalEngagementBonus(
  shape: ShapeName,
  meanRetrievalCallsPerTask: number,
): number {
  if (!QWEN_TARGETED_SHAPES.has(shape)) {
    return 0.0;
  }
  if (meanRetrievalCallsPerTask >= RETRIEVAL_ENGAGEMENT_BANDS.upperThreshold) {
    return RETRIEVAL_ENGAGEMENT_BANDS.bonusPlus;
  }
  if (meanRetrievalCallsPerTask >= RETRIEVAL_ENGAGEMENT_BANDS.lowerThreshold) {
    return RETRIEVAL_ENGAGEMENT_BANDS.bonusZero;
  }
  return RETRIEVAL_ENGAGEMENT_BANDS.bonusMinus;
}

/**
 * Compute the cost penalty per brief §3.1.
 *
 * If the candidate's mean cost is at or below the per-shape baseline median,
 * penalty is 0. Otherwise, penalty = 0.5pp per $0.10 of overage, encoded as
 * a positive decimal (caller subtracts from fitness).
 */
export function computeCostPenalty(
  candidateMeanCostUsd: number,
  baselineMedianCostUsd: number,
): number {
  const overageUsd = candidateMeanCostUsd - baselineMedianCostUsd;
  if (overageUsd <= 0) {
    return 0.0;
  }
  // 0.5 pp per $0.10 → 5 pp per $1.00 → encoded as 0.05 per $1.00 → 0.005 per $0.10
  const penaltyDecimal = (overageUsd / 0.10) * (COST_PENALTY_PP_PER_DOLLAR_10C / 100);
  return penaltyDecimal;
}

/**
 * Compute the per-shape fitness for a candidate.
 *
 * Routes by shape class:
 *   - Qwen-targeted (qwen-thinking, qwen-non-thinking): includes retrieval engagement bonus
 *   - Non-Qwen (claude, gpt, generic-simple): no retrieval engagement weighting
 *
 * Returns full FitnessComponents for downstream audit + reporting per
 * launch decision §A.9 binding compliance requirement.
 */
export function computeFitness(inputs: FitnessInputs): FitnessComponents {
  const { candidate, baselineMedianCostUsd } = inputs;

  const trioStrictPassRateII = candidate.trioStrictPassRateII;

  const retrievalEngagementApplied = QWEN_TARGETED_SHAPES.has(candidate.shape);
  const retrievalEngagementBonus = retrievalEngagementApplied
    ? computeRetrievalEngagementBonus(candidate.shape, candidate.meanRetrievalCallsPerTask)
    : 0.0;

  const costPenalty = computeCostPenalty(candidate.meanCostUsd, baselineMedianCostUsd);

  const fitness = trioStrictPassRateII + retrievalEngagementBonus - costPenalty;

  return {
    trioStrictPassRateII,
    retrievalEngagementBonus,
    costPenalty,
    fitness,
    retrievalEngagementApplied,
  };
}
