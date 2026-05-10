/**
 * GEPA Faza 1 — acceptance validator.
 *
 * Per launch decision §F (4 must-hold conditions) + §F.5 (Amendment 2 §5
 * false-positive evolution guard).
 *
 * Per-candidate verdict logic:
 *
 * §F condition 1 (third update — Amendment 2 §5):
 *   "Best GEPA candidate per shape beats NULL-baseline by ≥+5pp on
 *    trio_strict_pass rate (trio_mean ≥ 4.0). For Qwen-targeted shapes,
 *    additionally: best candidate must have mean retrieval_calls per task
 *    ≥ 1.7 (engagement gap closed by ≥50% relative to Qwen baseline 1.33)."
 *
 * §F.5 (NEW per Amendment 2 — false-positive guard):
 *   "If best Qwen-shape candidate achieves +5pp trio_strict delta WITHOUT
 *    closing retrieval engagement gap (mean retrieval_calls < 1.5), this
 *    signals false-positive evolution. Result: candidate REJECTED, shape
 *    marked FAIL even if other criteria pass."
 *
 * Conditions §F.2/§F.3/§F.4 are evaluated at the run-aggregate level (across
 * shapes / κ stability across all evaluations / mutation validator log) and
 * are NOT checked per-candidate here. See selection.ts + run-orchestrator
 * for those.
 */

import {
  type AcceptanceInputs,
  type AcceptanceVerdict,
  QWEN_TARGETED_SHAPES,
} from './types.js';

/** §F condition 1 trio_strict delta threshold (percentage points). */
export const TRIO_STRICT_DELTA_THRESHOLD_PP = 5;

/**
 * §F condition 1 Qwen-only retrieval engagement floor (mean retrieval_calls
 * per task). 1.7 = 50% gap closure between Qwen baseline 1.33 and Opus
 * parity 2.33 per Amendment 2 §5.
 */
export const QWEN_RETRIEVAL_ENGAGEMENT_FLOOR = 1.7;

/**
 * §F.5 false-positive guard threshold (mean retrieval_calls per task).
 * If a Qwen candidate achieves trio_strict delta but stays below this floor,
 * it is REJECTED as false-positive evolution per Amendment 2 §5.
 */
export const QWEN_FALSE_POSITIVE_RETRIEVAL_FLOOR = 1.5;

/**
 * Floating-point tolerance for threshold comparisons. 1e-9 is well below
 * any signal magnitude in the +/-0.05 fitness band (which is itself ~9
 * orders of magnitude larger). Required because IEEE 754 makes
 * `(0.25 - 0.20) * 100 = 4.999999999999999` rather than exact 5.0.
 */
const EPSILON = 1e-9;

/**
 * Compute acceptance verdict for a single candidate per launch decision §F + §F.5.
 *
 * Caller is responsible for §F.2 (≥3/5 shapes positive delta), §F.3 (κ stability),
 * and §F.4 (zero cell semantic violations) at the run-aggregate level.
 */
export function evaluateCandidate(inputs: AcceptanceInputs): AcceptanceVerdict {
  const { candidate, baselineTrioStrictPassRateII } = inputs;

  // Compute delta in percentage points (scale 0..100)
  const trioStrictDeltaPP =
    (candidate.trioStrictPassRateII - baselineTrioStrictPassRateII) * 100;

  const isQwenTargeted = QWEN_TARGETED_SHAPES.has(candidate.shape);

  // §F.5 false-positive guard — applies ONLY to Qwen-targeted shapes
  // and ONLY when trio_strict delta meets the +5pp threshold.
  // Per Amendment 2 §5: if delta ≥ +5pp AND retrieval_calls < 1.5 → REJECT.
  // EPSILON tolerance handles IEEE 754 precision on exact-boundary deltas.
  let condition5FalsePositiveGuardTriggered = false;
  if (
    isQwenTargeted &&
    trioStrictDeltaPP >= TRIO_STRICT_DELTA_THRESHOLD_PP - EPSILON &&
    candidate.meanRetrievalCallsPerTask < QWEN_FALSE_POSITIVE_RETRIEVAL_FLOOR - EPSILON
  ) {
    condition5FalsePositiveGuardTriggered = true;
  }

  // §F condition 1 — trio_strict delta + (Qwen only) retrieval engagement floor
  let condition1Pass = trioStrictDeltaPP >= TRIO_STRICT_DELTA_THRESHOLD_PP - EPSILON;
  if (condition1Pass && isQwenTargeted) {
    // Qwen sub-criterion: mean retrieval_calls ≥ 1.7
    if (candidate.meanRetrievalCallsPerTask < QWEN_RETRIEVAL_ENGAGEMENT_FLOOR - EPSILON) {
      condition1Pass = false;
    }
  }

  // Overall acceptance: condition 1 must pass AND §F.5 must not trigger
  const accepted = condition1Pass && !condition5FalsePositiveGuardTriggered;

  // Reason string for audit log
  const reason = buildReason({
    candidate,
    trioStrictDeltaPP,
    condition1Pass,
    condition5FalsePositiveGuardTriggered,
    isQwenTargeted,
    accepted,
  });

  return {
    condition1Pass,
    condition5FalsePositiveGuardTriggered,
    accepted,
    reason,
    trioStrictDeltaPP,
  };
}

interface BuildReasonInputs {
  candidate: { shape: string; meanRetrievalCallsPerTask: number };
  trioStrictDeltaPP: number;
  condition1Pass: boolean;
  condition5FalsePositiveGuardTriggered: boolean;
  isQwenTargeted: boolean;
  accepted: boolean;
}

function buildReason(i: BuildReasonInputs): string {
  const parts: string[] = [];
  parts.push(`shape=${i.candidate.shape}`);
  parts.push(`trio_strict_delta=${i.trioStrictDeltaPP.toFixed(2)}pp`);
  parts.push(`mean_retrieval_calls=${i.candidate.meanRetrievalCallsPerTask.toFixed(2)}`);

  if (i.condition5FalsePositiveGuardTriggered) {
    parts.push(
      `REJECTED §F.5 false-positive guard: delta ≥ +${TRIO_STRICT_DELTA_THRESHOLD_PP}pp AND retrieval < ${QWEN_FALSE_POSITIVE_RETRIEVAL_FLOOR}`,
    );
  } else if (!i.condition1Pass) {
    // Use same EPSILON tolerance as condition1Pass evaluation to keep root-cause
    // attribution consistent with the gating logic on exact-boundary deltas.
    if (i.trioStrictDeltaPP < TRIO_STRICT_DELTA_THRESHOLD_PP - EPSILON) {
      parts.push(
        `FAIL §F.1 trio_strict delta: ${i.trioStrictDeltaPP.toFixed(2)}pp < ${TRIO_STRICT_DELTA_THRESHOLD_PP}pp`,
      );
    } else if (i.isQwenTargeted) {
      parts.push(
        `FAIL §F.1 Qwen retrieval floor: ${i.candidate.meanRetrievalCallsPerTask.toFixed(2)} < ${QWEN_RETRIEVAL_ENGAGEMENT_FLOOR}`,
      );
    }
  } else {
    parts.push(`PASS §F.1${i.isQwenTargeted ? ' (Qwen retrieval floor met)' : ''}`);
  }

  parts.push(`accepted=${i.accepted}`);
  return parts.join(' | ');
}
