/**
 * Sprint 12 Task 1 Blocker #6 — failure-code entry validator tests.
 *
 * Acceptance (brief § 2.1 B, 10 tests):
 *   1. null code + null rationale passes
 *   2. null code + non-null rationale rejects
 *   3. F1 + no rationale passes
 *   4. F_other + 15-word rationale passes
 *   5. F_other + 5-word rationale rejects (F_other_rationale_too_short)
 *   6. F_other + null rationale rejects (F_other_rationale_missing)
 *   7. F_other + whitespace-only rationale rejects
 *   8. F_other + exactly-10-word rationale passes (boundary)
 *   9. Invalid code enum rejects
 *  10. F_other + newline-separated 10-word rationale passes
 */

import { describe, expect, it } from 'vitest';
import { validateFailureCodeEntry } from '../../src/failure-taxonomy/validator.js';

describe('validateFailureCodeEntry — null code (correct verdict)', () => {
  it('null code + null rationale passes', () => {
    const r = validateFailureCodeEntry({ failure_code: null, rationale: null });
    expect(r.ok).toBe(true);
  });

  it('null code + undefined rationale passes', () => {
    const r = validateFailureCodeEntry({ failure_code: null });
    expect(r.ok).toBe(true);
  });

  it('null code + non-null rationale rejects (null_code_with_rationale)', () => {
    const r = validateFailureCodeEntry({
      failure_code: null,
      rationale: 'model was correct but here is a comment',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('null_code_with_rationale');
    }
  });
});

describe('validateFailureCodeEntry — F1..F6 codes', () => {
  it('F1 + no rationale passes (rationale optional for F1..F6)', () => {
    const r = validateFailureCodeEntry({ failure_code: 'F1' });
    expect(r.ok).toBe(true);
  });

  it('F3 + short rationale passes (no length constraint outside F_other)', () => {
    const r = validateFailureCodeEntry({ failure_code: 'F3', rationale: 'bad' });
    expect(r.ok).toBe(true);
  });

  it('F6 + null rationale passes', () => {
    const r = validateFailureCodeEntry({ failure_code: 'F6', rationale: null });
    expect(r.ok).toBe(true);
  });
});

describe('validateFailureCodeEntry — F_other code rationale enforcement', () => {
  it('F_other + 15-word rationale passes', () => {
    const r = validateFailureCodeEntry({
      failure_code: 'F_other',
      rationale:
        'the model produced a mostly-correct answer but reversed one subject pronoun in the middle which is confusing',
    });
    expect(r.ok).toBe(true);
  });

  it('F_other + 5-word rationale rejects (F_other_rationale_too_short)', () => {
    const r = validateFailureCodeEntry({
      failure_code: 'F_other',
      rationale: 'model hallucinated extra facts wrong',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('F_other_rationale_too_short');
      expect(r.message).toContain('10');
    }
  });

  it('F_other + null rationale rejects (F_other_rationale_missing)', () => {
    const r = validateFailureCodeEntry({ failure_code: 'F_other', rationale: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('F_other_rationale_missing');
    }
  });

  it('F_other + whitespace-only rationale rejects', () => {
    const r = validateFailureCodeEntry({ failure_code: 'F_other', rationale: '    \t\n  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('F_other_rationale_missing');
    }
  });

  it('F_other + exactly-10-word rationale passes (boundary)', () => {
    const r = validateFailureCodeEntry({
      failure_code: 'F_other',
      rationale: 'one two three four five six seven eight nine ten',
    });
    expect(r.ok).toBe(true);
  });

  it('F_other + newline-separated 10-word rationale passes (tokenize on any whitespace)', () => {
    const r = validateFailureCodeEntry({
      failure_code: 'F_other',
      rationale: 'alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\ntheta\niota\nkappa',
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateFailureCodeEntry — invalid input', () => {
  it('rejects a code outside the enum', () => {
    const r = validateFailureCodeEntry({ failure_code: 'F99' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('invalid_failure_code');
    }
  });
});
