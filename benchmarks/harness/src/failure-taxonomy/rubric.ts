/**
 * Sprint 12 Task 1 Blocker #6 — judge rubric block builder.
 *
 * Deterministic multi-line string that embeds the A3 LOCK § 6 failure
 * taxonomy verbatim into the judge prompt. Task 2 (Stage 2 mini C3
 * execution) will splice this block into the judge system prompt; Session
 * 3 only guarantees the block exists, renders deterministically, and
 * carries the LOCKED taxonomy version tag.
 *
 * Determinism contract: identical output on every call. No parameters, no
 * time / cwd / env dependency. Same bytes every invocation.
 */

import {
  FAILURE_CODE_DEFINITIONS,
  FAILURE_TAXONOMY_VERSION,
} from './codes.js';

/**
 * Returns the A3 LOCK § 6 failure taxonomy rubric block for inclusion in
 * the judge prompt. The block is appended to the judge system prompt by
 * Task 2 runtime; Session 3 ships only the renderer.
 *
 * Structure:
 *   - Header with taxonomy version tag
 *   - One line per non-null failure code (F1–F6 + F_other)
 *   - Trailing F-other escape-clause instruction matching A3 LOCK § 6
 *
 * The block MUST be deterministic — two successive calls produce
 * byte-identical strings. Tests pin the presence of key sentinel phrases.
 */
export function buildJudgeRubricBlock(): string {
  const lines: string[] = [];
  lines.push(`Failure taxonomy (${FAILURE_TAXONOMY_VERSION}):`);
  lines.push('');
  lines.push(`F1 — ${FAILURE_CODE_DEFINITIONS.F1}`);
  lines.push(`F2 — ${FAILURE_CODE_DEFINITIONS.F2}`);
  lines.push(`F3 — ${FAILURE_CODE_DEFINITIONS.F3}`);
  lines.push(`F4 — ${FAILURE_CODE_DEFINITIONS.F4}`);
  lines.push(`F5 — ${FAILURE_CODE_DEFINITIONS.F5}`);
  lines.push(`F6 — ${FAILURE_CODE_DEFINITIONS.F6}`);
  lines.push('');
  lines.push(
    'If no category fits, select F-other and provide ≥10-word rationale explaining the failure.',
  );
  return lines.join('\n');
}
