/**
 * Sprint 12 Task 1 Blocker #6 — failure taxonomy codes.
 *
 * A3 LOCK § 6 hybrid taxonomy: 6 categorical failure modes (F1–F6) +
 * `null` (correct) + `F_other` escape category with mandatory rationale.
 *
 * Taxonomy version tag: `F1-F6+other v1` (surfaces into A3 LOCK § 7 field 14
 * `failure_taxonomy_version` of the per-run manifest).
 */

/**
 * 8-value failure code space:
 *   - `null`      — correct verdict (no failure classification)
 *   - `'F1'`..`'F6'` — LOCKED categorical failure modes per A3 LOCK § 6
 *   - `'F_other'` — escape hatch; requires ≥10-word rationale per validator
 */
export type FailureCode = null | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F_other';

/**
 * Ordered list of non-null failure codes. Used by aggregators and rubric
 * renderers that need stable iteration order.
 */
export const FAILURE_CODES = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F_other'] as const;

/**
 * Verbatim definitions per A3 LOCK § 6. Plain-English short form suitable
 * for inclusion in the judge rubric prompt block and for per-run exit-ping
 * narration. Do NOT paraphrase — any edit requires PM ratification and a
 * taxonomy version bump (`F1-F6+other v2`).
 */
export const FAILURE_CODE_DEFINITIONS: Record<Exclude<FailureCode, null>, string> = {
  F1: 'contradicts-ground-truth — Model output asserts a fact that directly contradicts the LoCoMo reference answer. Most severe failure class.',
  F2: 'partial-answer — Model output contains correct information but is incomplete against the reference\'s required components.',
  F3: 'off-topic — Model output is tangentially related or addresses a different question than asked.',
  F4: 'refusal — Model declines to answer (safety response, capability disclaimer, "I don\'t know").',
  F5: 'tool-use-error — Model attempted a tool call but the harness returned an error, a malformed response, or an infinite loop; applies only in cells where tool use is permitted.',
  F6: 'format-violation — Model output is correct in content but violates the required output format (JSON schema mismatch, wrong key names, escape errors).',
  F_other: 'F-other — Judge identifies a failure that does not fit F1–F6. Mandatory ≥10-word rationale explaining the failure.',
};

/**
 * Taxonomy version tag per A3 LOCK § 6 / § 7 field 14. Emitted verbatim
 * into the pre-registration manifest and any aggregate report.
 */
export const FAILURE_TAXONOMY_VERSION = 'F1-F6+other v1';

/**
 * Threshold at which `F_other` rate triggers a taxonomy-review flag per
 * A3 LOCK § 6 ("F-other rate on any run > 10% triggers taxonomy review and
 * potential v2 amendment"). Strict greater-than.
 */
export const F_OTHER_REVIEW_THRESHOLD = 0.10;
