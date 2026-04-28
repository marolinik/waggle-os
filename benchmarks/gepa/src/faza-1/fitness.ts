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
  type TieredFitnessInputs,
  type TieredFitnessComponents,
  type DeltaFloorInputs,
  type DeltaFloorVerdict,
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

// ── Amendment 7 — tiered fitness function ─────────────────────────────────

/** Tier 2 cap per Amendment 7 §fitness_function_tiered.tier_2 (max bonus). */
export const TIER_2_BONUS_CAP = 0.25;
/** Tier 2 weight per percentage point of retrieval engagement above NULL baseline. */
export const TIER_2_BONUS_PER_PP = 0.05;
/** Tier 3 binary bonus when all 7 cell-semantic anchors invariant. */
export const TIER_3_BONUS_FULL_INVARIANCE = 0.10;
/** Total cell-semantic anchor count (types.ts + MULTI_STEP_ACTION_CONTRACT + 5 baseline shapes). */
export const TIER_3_ANCHOR_COUNT_FULL = 7;

/**
 * Compute Tier 2 retrieval engagement bonus per Amendment 7 §fitness_function_tiered.tier_2.
 *
 * Continuous formula (supersedes Amendment 2 band bonus for tiered ranking):
 *   bonus = clamp(0.05 × delta_pp, 0, 0.25)
 *   where delta_pp = (candidate_mean - baseline_mean) × 100
 *
 * Cap reached at +5pp absolute increase in mean retrieval calls per task.
 * Floor 0 (no negative bonus from Tier 2 — negative-band penalty handled
 * by Amendment 2 §F.5 false-positive guard separately).
 *
 * Always returns 0 for non-Qwen shapes.
 */
export function computeTier2RetrievalBonus(
  shape: ShapeName,
  candidateMeanRetrievalCallsPerTask: number,
  baselineMeanRetrievalCallsPerTask: number,
): number {
  if (!QWEN_TARGETED_SHAPES.has(shape)) return 0;
  const deltaAbsolute = candidateMeanRetrievalCallsPerTask - baselineMeanRetrievalCallsPerTask;
  if (deltaAbsolute <= 0) return 0;
  const deltaPP = deltaAbsolute * 100;
  return Math.min(TIER_2_BONUS_PER_PP * deltaPP, TIER_2_BONUS_CAP);
}

/**
 * Compute the per-shape tiered fitness per Amendment 7 §fitness_function_tiered.
 *
 * Routes tier roles by saturation:
 *   - In saturated regime (≥4/5 shapes have NULL pass rate ≥75%):
 *       PRIMARY differentiator = Tier 2 (Qwen-targeted retrieval engagement)
 *       SECONDARY differentiator = Tier 3 (cell-semantic anchor invariance)
 *       TIE-BREAKER = Tier 1 (NULL pass rate delta)
 *       aggregateSaturatedRegime = tier_2 + tier_3
 *   - Outside saturated regime: legacy Amendment 2 form (computeFitness) applies
 *     and aggregateSaturatedRegime is reported but not the canonical fitness.
 *
 * Tier 1 also serves as the §F.1 acceptance gate (≥+5pp) — UNCHANGED from
 * Amendment 5 launch decision §F.1.
 */
export function computeTieredFitness(inputs: TieredFitnessInputs): TieredFitnessComponents {
  const {
    candidate,
    nullBaselinePassRateII,
    nullBaselineMeanRetrievalCallsPerTask,
    mutationValidatorPassed,
    saturatedRegime,
  } = inputs;

  // Tier 1 — NULL pass rate delta (signed pp)
  const tier1DeltaPP = (candidate.trioStrictPassRateII - nullBaselinePassRateII) * 100;

  // Tier 2 — continuous retrieval engagement bonus (Qwen-targeted only)
  const tier2RetrievalBonus = computeTier2RetrievalBonus(
    candidate.shape,
    candidate.meanRetrievalCallsPerTask,
    nullBaselineMeanRetrievalCallsPerTask,
  );

  // Tier 3 — binary cell-semantic anchor invariance bonus
  const tier3CellSemanticInvarianceBonus = mutationValidatorPassed
    ? TIER_3_BONUS_FULL_INVARIANCE
    : 0;
  // For Gen 1 candidates the mutation_validator gives binary (valid|invalid);
  // count semantic: pass = full 7-anchor invariance, fail = 0.
  const cellSemanticAnchorInvarianceCount = mutationValidatorPassed ? TIER_3_ANCHOR_COUNT_FULL : 0;

  // Aggregate fitness in saturated regime: tier_2 + tier_3 only
  const aggregateSaturatedRegime = tier2RetrievalBonus + tier3CellSemanticInvarianceBonus;

  return {
    tier1DeltaPP,
    tier2RetrievalBonus,
    tier3CellSemanticInvarianceBonus,
    aggregateSaturatedRegime,
    saturatedRegimeApplied: saturatedRegime,
    cellSemanticAnchorInvarianceCount,
  };
}

// ── Amendment 7 — pre-registered Δ-floor verdict ──────────────────────────

/** Δ-floor thresholds per Amendment 7 §gen_1_pre_registered_delta_floor. */
export const DELTA_FLOOR_THRESHOLDS = {
  /** Threshold 1: aggregate Tier 1 delta in pp (≥+3pp passes). */
  threshold1AggregateTier1PP: 3,
  /** Threshold 2: max Qwen retrieval engagement delta absolute (≥+0.10 passes). */
  threshold2QwenRetrievalAbsolute: 0.10,
  /** Threshold 3a: aggregate Tier 1 delta in pp (≥0pp). */
  threshold3Tier1MinPP: 0,
  /** Threshold 3b: aggregate Tier 2 bonus across Qwen-targeted candidates (≥0.05). */
  threshold3Tier2MinBonus: 0.05,
} as const;

/** Float tolerance for exact-boundary threshold comparisons (consistent with acceptance.ts EPSILON). */
const DELTA_FLOOR_EPSILON = 1e-9;

/**
 * Compute the Δ-floor verdict per Amendment 7 §gen_1_pre_registered_delta_floor.
 *
 * Three OR-gated thresholds:
 *   1. aggregate Tier 1 delta ≥ +3pp absolute (loosened from §F.1 ≥+5pp)
 *   2. max Qwen-shape retrieval engagement delta ≥ +0.10 absolute above per-shape NULL baseline
 *   3. (aggregate Tier 1 delta ≥ 0pp) AND (aggregate Tier 2 bonus ≥ 0.05)
 *
 * If ANY ONE passes → PROCEED (continue past Checkpoint B subject to PM ratify).
 * If ALL THREE fail → HALT_INVESTIGATE (file Investigate report).
 *
 * Per Amendment 7 §3.2: "If Gen 1 fails ALL three thresholds → HALT before Gen 2,
 * file Investigate report. If Gen 1 passes any one → proceed to Gen 2."
 */
export function computeDeltaFloorVerdict(inputs: DeltaFloorInputs): DeltaFloorVerdict {
  // Threshold 1 — aggregate Tier 1 delta
  const threshold1ValuePP =
    (inputs.aggregateTrioStrictPassRateII - inputs.aggregateNullBaselinePassRateII) * 100;
  const threshold1Pass =
    threshold1ValuePP >= DELTA_FLOOR_THRESHOLDS.threshold1AggregateTier1PP - DELTA_FLOOR_EPSILON;

  // Threshold 2 — max Qwen retrieval engagement delta absolute
  let threshold2MaxDeltaAbsolute: number | null = null;
  for (const [shapeKey, candidateMean] of Object.entries(inputs.qwenShapeRetrievalMeans)) {
    if (candidateMean === undefined) continue;
    const baselineMean = inputs.qwenShapeNullBaselineRetrievalMeans[shapeKey as ShapeName];
    if (baselineMean === undefined) continue;
    const delta = candidateMean - baselineMean;
    if (threshold2MaxDeltaAbsolute === null || delta > threshold2MaxDeltaAbsolute) {
      threshold2MaxDeltaAbsolute = delta;
    }
  }
  // No Qwen data: report 0 delta (informative neutral); threshold2 fails since 0 < 0.10
  if (threshold2MaxDeltaAbsolute === null) threshold2MaxDeltaAbsolute = 0;
  const threshold2Pass =
    threshold2MaxDeltaAbsolute >=
    DELTA_FLOOR_THRESHOLDS.threshold2QwenRetrievalAbsolute - DELTA_FLOOR_EPSILON;

  // Threshold 3 — compound Tier 1 ≥0 AND Tier 2 ≥0.05
  const threshold3Tier1ValuePP = threshold1ValuePP;
  const threshold3Tier1Pass =
    threshold3Tier1ValuePP >= DELTA_FLOOR_THRESHOLDS.threshold3Tier1MinPP - DELTA_FLOOR_EPSILON;
  const threshold3Tier2Pass =
    inputs.qwenAggregateTier2Bonus >=
    DELTA_FLOOR_THRESHOLDS.threshold3Tier2MinBonus - DELTA_FLOOR_EPSILON;
  const threshold3Pass = threshold3Tier1Pass && threshold3Tier2Pass;

  const overallVerdict: 'PROCEED' | 'HALT_INVESTIGATE' =
    threshold1Pass || threshold2Pass || threshold3Pass ? 'PROCEED' : 'HALT_INVESTIGATE';

  return {
    threshold1AggregateTier1: threshold1Pass ? 'PASS' : 'FAIL',
    threshold1ValuePP,
    threshold2QwenRetrievalAbsolute: threshold2Pass ? 'PASS' : 'FAIL',
    threshold2MaxDeltaAbsolute,
    threshold3CompoundTier1PlusTier2: threshold3Pass ? 'PASS' : 'FAIL',
    threshold3Tier1ValuePP,
    threshold3Tier2Aggregate: inputs.qwenAggregateTier2Bonus,
    overallVerdict,
  };
}
