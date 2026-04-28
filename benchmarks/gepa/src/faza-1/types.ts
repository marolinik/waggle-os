/**
 * GEPA Faza 1 — shared type definitions.
 *
 * Per manifest v7 (SHA 583712dde139ffc87fb1ab21643f68d52c56469ded9e8090a624980b05969beb,
 * Amendment 2 supplemented) and launch decision §A inherited rules.
 *
 * Cell semantic boundary linchpin: MULTI_STEP_ACTION_CONTRACT in
 * packages/agent/src/prompt-shapes/types.ts (SHA 70a1701d...).
 *
 * DO NOT modify this file as part of GEPA candidate evolution. This file is
 * scaffold-only; the mutation surface is the prompt-shape body methods in
 * packages/agent/src/prompt-shapes/{claude,qwen-thinking,qwen-non-thinking,gpt,generic-simple}.ts.
 */

/** The 5 shape names targeted by Faza 1 GEPA evolution. */
export type ShapeName =
  | 'claude'
  | 'qwen-thinking'
  | 'qwen-non-thinking'
  | 'gpt'
  | 'generic-simple';

/**
 * Shapes that get retrieval-engagement weighting per Amendment 2 §3.
 * Phase 4.5 finding: only Qwen exhibits the under-engagement gap.
 */
export const QWEN_TARGETED_SHAPES: ReadonlySet<ShapeName> = new Set<ShapeName>([
  'qwen-thinking',
  'qwen-non-thinking',
]);

/**
 * Shapes that use baseline fitness (no retrieval-engagement weight).
 * Per Amendment 2 §3: these shapes don't have the gap, so applying the
 * bonus uniformly would distort their fitness measurement.
 */
export const NON_QWEN_SHAPES: ReadonlySet<ShapeName> = new Set<ShapeName>([
  'claude',
  'gpt',
  'generic-simple',
]);

/** Per-task evaluation result for one candidate × one instance. */
export interface EvaluationResult {
  /** Stable instance identifier (e.g., from corpus generator). */
  instanceId: string;

  /** Trio judge mean (per pilot runner line 654 — arithmetic mean of valid judge means). */
  trioMean: number;

  /**
   * Trio strict pass per metric_operationalization (ii) — primary acceptance.
   * `trioMean >= 4.0` per Amendment 1 Ask B ratification.
   */
  trioStrictPassII: boolean;

  /**
   * Trio strict pass per metric_operationalization (i) — supplementary.
   * `>= 2 of 3 judges with judge.mean >= 3.5` per pilot runner line 657.
   * Reported in parallel for cross-validation against pilot baseline.
   */
  trioStrictPassI: boolean;

  /** Number of retrieve actions issued during this evaluation (existing telemetry). */
  retrievalCalls: number;

  /** Subject + judge cumulative cost (USD) for this evaluation. */
  costUsd: number;
}

/** Aggregated per-candidate metrics across N=8 evaluations (per shape). */
export interface CandidateMetrics {
  /** Stable candidate identifier (e.g., shape name + generation + variant). */
  candidateId: string;

  /** Which shape this candidate belongs to. */
  shape: ShapeName;

  /** All N=8 evaluation results for this candidate. */
  evaluations: EvaluationResult[];

  /** Pass rate per operationalization (ii) — primary. Range [0, 1]. */
  trioStrictPassRateII: number;

  /** Pass rate per operationalization (i) — supplementary. Range [0, 1]. */
  trioStrictPassRateI: number;

  /** Mean retrieval_calls across evaluations (per task). */
  meanRetrievalCallsPerTask: number;

  /** Mean cost (USD) across evaluations. */
  meanCostUsd: number;
}

/**
 * Per-shape fitness components per Amendment 2 §3.
 *
 * For Qwen-targeted shapes:
 *   fitness = trio_strict_pass_rate + retrieval_engagement_bonus - cost_penalty
 *
 * For non-Qwen shapes:
 *   fitness = trio_strict_pass_rate - cost_penalty
 *   (retrievalEngagementBonus is always 0 for non-Qwen — not added to fitness)
 */
export interface FitnessComponents {
  /** trio_strict_pass_rate per operationalization (ii). Range [0, 1]. */
  trioStrictPassRateII: number;

  /**
   * Retrieval engagement bonus per Amendment 2 §3 bands:
   *   +0.05 if mean retrieval_calls per task >= 2.0
   *    0.00 if mean retrieval_calls per task in [1.5, 2.0)
   *   -0.05 if mean retrieval_calls per task < 1.5
   * Always 0.0 for non-Qwen shapes (these shapes don't have the gap).
   */
  retrievalEngagementBonus: number;

  /**
   * Cost penalty per brief §3.1 — −0.5pp per $0.10 above per-shape baseline median.
   * Encoded as decimal (e.g., 0.005 = 0.5pp).
   */
  costPenalty: number;

  /** Aggregate fitness (sum of above with sign convention: bonus +, penalty −). */
  fitness: number;

  /**
   * Whether retrieval engagement was applied (true for Qwen-targeted shapes,
   * false otherwise). Useful for downstream auditing + report generation.
   */
  retrievalEngagementApplied: boolean;
}

/** Inputs for the per-shape fitness function. */
export interface FitnessInputs {
  /** Aggregated metrics for this candidate. */
  candidate: CandidateMetrics;

  /**
   * Per-shape baseline median cost (USD per evaluation). Used for cost penalty
   * computation. Typically the NULL-baseline median for the same shape.
   */
  baselineMedianCostUsd: number;
}

/** Acceptance verdict for a single candidate per §F + §F.5 of launch decision. */
export interface AcceptanceVerdict {
  /** Whether candidate passes §F condition 1 (trio_strict delta + Qwen retrieval floor). */
  condition1Pass: boolean;

  /**
   * §F.5 false-positive guard — REJECTED if Qwen candidate has +5pp trio delta
   * but mean retrieval_calls < 1.5 (Amendment 2 §5).
   */
  condition5FalsePositiveGuardTriggered: boolean;

  /** Overall acceptance for this candidate (must pass condition 1 AND not trigger §F.5). */
  accepted: boolean;

  /** Detailed reason string for audit log. */
  reason: string;

  /**
   * Computed delta vs NULL-baseline trio_strict_pass_rate (percentage points).
   * Positive = improvement.
   */
  trioStrictDeltaPP: number;
}

/** Inputs for the acceptance validator. */
export interface AcceptanceInputs {
  /** Candidate under evaluation. */
  candidate: CandidateMetrics;

  /** NULL-baseline trio_strict_pass_rate (op. (ii)) for the same shape. */
  baselineTrioStrictPassRateII: number;
}

// ── Amendment 7 — tiered fitness + Δ-floor types ───────────────────────────

/**
 * Per-shape NULL-baseline anchors pinned from Checkpoint A v2 §B.2 (manifest
 * v7 Amendment 6 binding SHA 0b55d8e353...).
 *
 * These anchor:
 *   - Tier 1 baseline (NULL pass rate per shape)
 *   - Tier 2 baseline (NULL retrieval engagement per shape)
 *   - §F.1 acceptance gate ≥+5pp delta basis
 *   - Δ-floor threshold 2 per-shape comparison
 *
 * Source: real per-shape data from re-run NULL-baseline post Amendment 6
 * promptShapeOverride bug fix (run bhe0zwi91, 40/40 evals, 2026-04-28).
 */
export const NULL_BASELINE_PER_SHAPE: Readonly<
  Record<ShapeName, { trioStrictPassRateII: number; meanRetrievalCallsPerTask: number }>
> = {
  claude:              { trioStrictPassRateII: 0.875, meanRetrievalCallsPerTask: 1.12 },
  'qwen-thinking':     { trioStrictPassRateII: 0.875, meanRetrievalCallsPerTask: 1.12 },
  'qwen-non-thinking': { trioStrictPassRateII: 1.000, meanRetrievalCallsPerTask: 1.25 },
  gpt:                 { trioStrictPassRateII: 0.750, meanRetrievalCallsPerTask: 1.00 },
  'generic-simple':    { trioStrictPassRateII: 0.875, meanRetrievalCallsPerTask: 1.12 },
} as const;

/** NULL-baseline aggregate across all 5 shapes (Checkpoint A v2 §B.2). */
export const NULL_BASELINE_AGGREGATE = {
  trioStrictPassRateII: 0.875,         // 35/40
  meanRetrievalCallsPerTask: 1.12,
} as const;

/**
 * Tiered fitness components per Amendment 7 §fitness_function_tiered.
 *
 * Saturated regime (NULL pass rate ≥75% for ≥4/5 shapes — current Faza 1 state)
 * makes Tier 1 (NULL delta) noise-bound on N=8 binomial. Tier 2 + Tier 3 act as
 * primary differentiators; Tier 1 retained as TIE-BREAKER + acceptance gate.
 */
export interface TieredFitnessComponents {
  /**
   * Tier 1 — NULL pass rate delta (signed, percentage points).
   * Acceptance gate threshold: ≥+5pp (launch decision §F.1, UNCHANGED).
   * Role in saturated regime: TIE_BREAKER (noise-bound at N=8).
   */
  tier1DeltaPP: number;

  /**
   * Tier 2 — continuous retrieval engagement bonus (Qwen-targeted only).
   * Formula: clamp(0.05 × delta_pp, 0, 0.25) where delta_pp = (candidate − baseline) × 100.
   * Always 0 for non-Qwen shapes.
   * Role in saturated regime: PRIMARY differentiator for Qwen-targeted shapes.
   */
  tier2RetrievalBonus: number;

  /**
   * Tier 3 — binary cell-semantic anchor invariance bonus.
   * 0.10 if all 7 anchors invariant (mutation-validator passed); 0 otherwise.
   * Role in saturated regime: SECONDARY differentiator (substrate-preservation proxy).
   */
  tier3CellSemanticInvarianceBonus: number;

  /**
   * Aggregate fitness in saturated regime: tier_2 + tier_3.
   * Tier 1 reserved as tie-breaker (NOT in this aggregate).
   * Cost penalty per Amendment 2 NOT in tiered ranking aggregate (supplementary diagnostic).
   */
  aggregateSaturatedRegime: number;

  /** Whether saturated regime applies (per Amendment 7 §fitness_function_tiered.saturated_regime_definition). */
  saturatedRegimeApplied: boolean;

  /** Cell-semantic anchor invariance count (0..7) for audit reporting. */
  cellSemanticAnchorInvarianceCount: number;
}

/** Inputs for tiered fitness. */
export interface TieredFitnessInputs {
  /** Aggregated metrics for this candidate. */
  candidate: CandidateMetrics;

  /** Per-shape NULL-baseline pass rate (op. ii). Typically NULL_BASELINE_PER_SHAPE[shape].trioStrictPassRateII. */
  nullBaselinePassRateII: number;

  /** Per-shape NULL-baseline mean retrieval calls per task. Typically NULL_BASELINE_PER_SHAPE[shape].meanRetrievalCallsPerTask. */
  nullBaselineMeanRetrievalCallsPerTask: number;

  /** Whether the candidate's mutation-validator verdict was VALID (all 7 anchors invariant). */
  mutationValidatorPassed: boolean;

  /**
   * Whether the saturated regime applies (≥4/5 shapes have NULL pass rate ≥75%).
   * Caller computes from Checkpoint A v2 data; default true for Faza 1.
   */
  saturatedRegime: boolean;
}

/**
 * Δ-floor verdict per Amendment 7 §gen_1_pre_registered_delta_floor.
 * Pre-registered Gen 1 floor for "evolution worked at all" — looser than
 * §F.1 acceptance gate. Three OR-gated thresholds.
 */
export interface DeltaFloorVerdict {
  /** Threshold 1: aggregate Tier 1 delta ≥+3pp. */
  threshold1AggregateTier1: 'PASS' | 'FAIL';
  /** Aggregate Tier 1 delta value (pp, signed) — for audit. */
  threshold1ValuePP: number;

  /** Threshold 2: max Qwen-shape retrieval engagement delta ≥+0.10 absolute. */
  threshold2QwenRetrievalAbsolute: 'PASS' | 'FAIL';
  /** Max delta across Qwen shapes (absolute) — for audit. */
  threshold2MaxDeltaAbsolute: number;

  /** Threshold 3: (Tier 1 ≥0pp) AND (Tier 2 ≥0.05). */
  threshold3CompoundTier1PlusTier2: 'PASS' | 'FAIL';
  /** Aggregate Tier 1 delta (pp, signed) — for audit. */
  threshold3Tier1ValuePP: number;
  /** Aggregate Tier 2 bonus across Qwen-targeted candidates — for audit. */
  threshold3Tier2Aggregate: number;

  /** Overall verdict: PROCEED if ANY threshold passes; HALT_INVESTIGATE if ALL fail. */
  overallVerdict: 'PROCEED' | 'HALT_INVESTIGATE';
}

/** Inputs for Δ-floor verdict computation. */
export interface DeltaFloorInputs {
  /** Aggregate trio_strict_pass_rate_II across all evaluated candidates × all evals (in saturated regime, mean across 30 Checkpoint B evals). */
  aggregateTrioStrictPassRateII: number;

  /** Aggregate NULL-baseline pass rate (e.g., 0.875 = NULL_BASELINE_AGGREGATE.trioStrictPassRateII). */
  aggregateNullBaselinePassRateII: number;

  /**
   * Per-shape mean retrieval calls per task for Qwen-targeted candidates.
   * Map: shape → meanRetrievalCallsPerTask. Empty entries treated as no-data (skipped).
   */
  qwenShapeRetrievalMeans: Partial<Record<ShapeName, number>>;

  /** Per-shape NULL baseline retrieval means (typically NULL_BASELINE_PER_SHAPE[shape].meanRetrievalCallsPerTask). */
  qwenShapeNullBaselineRetrievalMeans: Partial<Record<ShapeName, number>>;

  /** Aggregate Tier 2 retrieval engagement bonus across Qwen-targeted candidates (mean). */
  qwenAggregateTier2Bonus: number;
}
