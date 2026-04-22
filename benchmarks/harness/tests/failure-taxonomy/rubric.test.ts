/**
 * Sprint 12 Task 1 Blocker #6 — judge rubric block tests.
 *
 * Acceptance (brief § 2.1 B):
 *   1. Block contains verbatim "F1 — contradicts-ground-truth"
 *   2. Block contains verbatim "F6 — format-violation"
 *   3. Block contains "F-other" escape clause (≥10-word rationale directive)
 *   4. Block contains taxonomy version tag "F1-F6+other v1"
 *
 * Plus: determinism (same bytes on two calls).
 */

import { describe, expect, it } from 'vitest';
import { buildJudgeRubricBlock } from '../../src/failure-taxonomy/rubric.js';

describe('buildJudgeRubricBlock', () => {
  it('contains the F1 — contradicts-ground-truth label verbatim', () => {
    const block = buildJudgeRubricBlock();
    expect(block).toContain('F1 — contradicts-ground-truth');
  });

  it('contains the F6 — format-violation label verbatim', () => {
    const block = buildJudgeRubricBlock();
    expect(block).toContain('F6 — format-violation');
  });

  it('contains the F-other escape clause with the ≥10-word rationale directive', () => {
    const block = buildJudgeRubricBlock();
    expect(block).toContain('F-other');
    expect(block).toContain('≥10-word rationale');
  });

  it('carries the taxonomy version tag "F1-F6+other v1"', () => {
    const block = buildJudgeRubricBlock();
    expect(block).toContain('F1-F6+other v1');
  });

  it('is deterministic — two successive calls return byte-identical strings', () => {
    const a = buildJudgeRubricBlock();
    const b = buildJudgeRubricBlock();
    expect(a).toBe(b);
  });
});
