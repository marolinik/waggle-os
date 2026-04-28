/**
 * GEPA Faza 1 — cost governance + super-linear projection tracker.
 *
 * Per launch decision §A.7 + manifest v7 §cost_governance.
 *
 * Halt triggers (any single triggers immediate halt + PM ratify):
 *   - Cumulative spend > $80 (internal halt)
 *   - Cumulative spend > $100 (hard cap)
 *   - Mid-run actual exceeds projection by >30% (super-linear sub-rule per brief §6.7)
 *
 * Audit cadence: every 20 evaluations.
 *
 * Cost projection methodology: 1.5× baseline token count per candidate
 * (encodes mutation overhead since GEPA candidates may grow prompts).
 */

/** Hard cap (immediate halt on breach). */
export const HARD_CAP_USD = 100.00;

/** Internal halt threshold (halt + PM ratify before proceeding). */
export const INTERNAL_HALT_USD = 80.00;

/** Super-linear projection multiplier per brief §6.7. */
export const SUPER_LINEAR_MULTIPLIER = 1.5;

/** Mid-run halt threshold: actual exceeds projection by this fraction. */
export const SUPER_LINEAR_OVERAGE_THRESHOLD = 0.30;

/** Audit cadence (every N evaluations). */
export const AUDIT_CADENCE_EVAL_COUNT = 20;

export type HaltReason =
  | 'NONE'
  | 'INTERNAL_HALT_USD_BREACH'
  | 'HARD_CAP_USD_BREACH'
  | 'SUPER_LINEAR_PROJECTION_BREACH';

export interface CostTrackerState {
  cumulativeUsd: number;
  evaluationCount: number;
  /** Per-evaluation projection used for super-linear check (1.5× baseline median). */
  projectionPerEvalUsd: number;
}

export interface HaltCheckResult {
  haltReason: HaltReason;
  cumulativeUsd: number;
  expectedAtThisCount: number;
  overageFraction: number;
  message: string;
}

/** Create a new cost tracker state with the per-evaluation projection. */
export function createCostTracker(baselineMedianCostPerEvalUsd: number): CostTrackerState {
  return {
    cumulativeUsd: 0,
    evaluationCount: 0,
    projectionPerEvalUsd: baselineMedianCostPerEvalUsd * SUPER_LINEAR_MULTIPLIER,
  };
}

/**
 * Record an evaluation cost and return updated state (immutable update).
 * Per coding-style.md: never mutate, always return new copy.
 */
export function recordEvaluation(state: CostTrackerState, evalCostUsd: number): CostTrackerState {
  return {
    ...state,
    cumulativeUsd: state.cumulativeUsd + evalCostUsd,
    evaluationCount: state.evaluationCount + 1,
  };
}

/**
 * Check halt triggers against current state.
 *
 * Returns NONE if all checks pass; otherwise returns the first triggered
 * halt reason with diagnostic context.
 *
 * Order of precedence (most severe first):
 *   1. HARD_CAP_USD_BREACH ($100 breach)
 *   2. INTERNAL_HALT_USD_BREACH ($80 breach)
 *   3. SUPER_LINEAR_PROJECTION_BREACH (actual > 1.30 × expected at current eval count)
 */
export function checkHaltTriggers(state: CostTrackerState): HaltCheckResult {
  const expectedAtThisCount = state.projectionPerEvalUsd * state.evaluationCount;
  const overageFraction =
    expectedAtThisCount > 0 ? (state.cumulativeUsd - expectedAtThisCount) / expectedAtThisCount : 0;

  if (state.cumulativeUsd > HARD_CAP_USD) {
    return {
      haltReason: 'HARD_CAP_USD_BREACH',
      cumulativeUsd: state.cumulativeUsd,
      expectedAtThisCount,
      overageFraction,
      message: `HARD CAP BREACH: $${state.cumulativeUsd.toFixed(2)} > $${HARD_CAP_USD} cap`,
    };
  }

  if (state.cumulativeUsd > INTERNAL_HALT_USD) {
    return {
      haltReason: 'INTERNAL_HALT_USD_BREACH',
      cumulativeUsd: state.cumulativeUsd,
      expectedAtThisCount,
      overageFraction,
      message: `INTERNAL HALT: $${state.cumulativeUsd.toFixed(2)} > $${INTERNAL_HALT_USD} internal halt — PM ratify before proceeding`,
    };
  }

  // Super-linear check requires at least 1 eval to have meaningful expected value.
  if (state.evaluationCount > 0 && overageFraction > SUPER_LINEAR_OVERAGE_THRESHOLD) {
    return {
      haltReason: 'SUPER_LINEAR_PROJECTION_BREACH',
      cumulativeUsd: state.cumulativeUsd,
      expectedAtThisCount,
      overageFraction,
      message: `SUPER-LINEAR BREACH: actual $${state.cumulativeUsd.toFixed(2)} exceeds expected $${expectedAtThisCount.toFixed(2)} by ${(overageFraction * 100).toFixed(1)}% (>${(SUPER_LINEAR_OVERAGE_THRESHOLD * 100).toFixed(0)}% threshold)`,
    };
  }

  return {
    haltReason: 'NONE',
    cumulativeUsd: state.cumulativeUsd,
    expectedAtThisCount,
    overageFraction,
    message: `OK: $${state.cumulativeUsd.toFixed(2)} cumulative; expected $${expectedAtThisCount.toFixed(2)}; ${(overageFraction * 100).toFixed(1)}% overage`,
  };
}

/** Whether the current eval count is on an audit cadence boundary. */
export function shouldAudit(state: CostTrackerState): boolean {
  return state.evaluationCount > 0 && state.evaluationCount % AUDIT_CADENCE_EVAL_COUNT === 0;
}
