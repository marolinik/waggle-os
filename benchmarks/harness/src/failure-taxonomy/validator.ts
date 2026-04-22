/**
 * Sprint 12 Task 1 Blocker #6 — failure-code entry validator.
 *
 * Enforces A3 LOCK § 6 invariants on judge-emitted {failure_code, rationale}
 * pairs:
 *
 *   - `failure_code === null`      → rationale must be null/undefined
 *   - `failure_code` in F1..F6     → rationale optional, no length constraint
 *   - `failure_code === 'F_other'` → rationale mandatory, ≥10 whitespace-
 *                                     separated tokens, non-empty strings only
 *
 * Error codes surface the exact failure mode for downstream routing (Task 2
 * judge-response parser will map these onto its own error class).
 */

import { FAILURE_CODES, type FailureCode } from './codes.js';

export type ValidationErrorCode =
  | 'invalid_failure_code'
  | 'null_code_with_rationale'
  | 'F_other_rationale_missing'
  | 'F_other_rationale_too_short';

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationFailure {
  ok: false;
  code: ValidationErrorCode;
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface FailureCodeEntryInput {
  failure_code: FailureCode | string;
  rationale?: string | null;
}

/** Minimum token count required for F_other rationale per A3 LOCK § 6. */
export const F_OTHER_RATIONALE_MIN_TOKENS = 10;

/** Tokenise on any whitespace run; drop empty strings. */
function countRationaleTokens(rationale: string): number {
  return rationale.split(/\s+/).filter(tok => tok.length > 0).length;
}

function isRecognisedCode(code: unknown): code is FailureCode {
  if (code === null) return true;
  if (typeof code !== 'string') return false;
  return (FAILURE_CODES as readonly string[]).includes(code);
}

export function validateFailureCodeEntry(entry: FailureCodeEntryInput): ValidationResult {
  const { failure_code, rationale } = entry;

  if (!isRecognisedCode(failure_code)) {
    return {
      ok: false,
      code: 'invalid_failure_code',
      message: `failure_code must be null | F1..F6 | F_other; got ${JSON.stringify(failure_code)}`,
    };
  }

  const rationaleProvided =
    rationale !== undefined &&
    rationale !== null &&
    typeof rationale === 'string' &&
    rationale.length > 0;

  if (failure_code === null) {
    if (rationaleProvided) {
      return {
        ok: false,
        code: 'null_code_with_rationale',
        message: 'failure_code=null (correct) must not carry a rationale',
      };
    }
    return { ok: true };
  }

  if (failure_code === 'F_other') {
    if (rationale === undefined || rationale === null) {
      return {
        ok: false,
        code: 'F_other_rationale_missing',
        message: 'F_other requires a non-null rationale string',
      };
    }
    if (typeof rationale !== 'string' || rationale.trim().length === 0) {
      return {
        ok: false,
        code: 'F_other_rationale_missing',
        message: 'F_other rationale must be a non-empty string',
      };
    }
    const tokens = countRationaleTokens(rationale);
    if (tokens < F_OTHER_RATIONALE_MIN_TOKENS) {
      return {
        ok: false,
        code: 'F_other_rationale_too_short',
        message: `F_other rationale must have ≥${F_OTHER_RATIONALE_MIN_TOKENS} whitespace-separated tokens; got ${tokens}`,
      };
    }
    return { ok: true };
  }

  // F1..F6: rationale is optional and has no length constraint.
  return { ok: true };
}
