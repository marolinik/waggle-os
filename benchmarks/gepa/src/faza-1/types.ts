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
