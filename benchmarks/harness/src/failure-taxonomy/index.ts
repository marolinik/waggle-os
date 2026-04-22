/**
 * Sprint 12 Task 1 Blocker #6 — failure taxonomy module barrel.
 *
 * A3 LOCK § 6 surface consumed by:
 *   - Task 2 judge rubric splicer (buildJudgeRubricBlock)
 *   - Task 2 judge response parser (validateFailureCodeEntry)
 *   - Aggregate JSON writer (computeFailureDistribution)
 *   - Pre-registration manifest (FAILURE_TAXONOMY_VERSION field)
 */

export {
  FAILURE_CODES,
  FAILURE_CODE_DEFINITIONS,
  FAILURE_TAXONOMY_VERSION,
  F_OTHER_REVIEW_THRESHOLD,
} from './codes.js';
export type { FailureCode } from './codes.js';

export { buildJudgeRubricBlock } from './rubric.js';

export {
  validateFailureCodeEntry,
  F_OTHER_RATIONALE_MIN_TOKENS,
} from './validator.js';
export type {
  FailureCodeEntryInput,
  ValidationErrorCode,
  ValidationFailure,
  ValidationResult,
  ValidationSuccess,
} from './validator.js';

export { computeFailureDistribution } from './aggregate.js';
export type { FailureRow, FailureDistribution } from './aggregate.js';
