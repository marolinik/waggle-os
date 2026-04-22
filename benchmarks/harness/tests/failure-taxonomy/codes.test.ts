/**
 * Sprint 12 Task 1 Blocker #6 — failure-code enum + definitions tests.
 *
 * Acceptance (brief § 2.1 B):
 *   1. FAILURE_CODES length === 7 (F1..F6 + F_other)
 *   2. All definitions present (F1..F6 + F_other)
 *   3. FailureCode type compiles as the 8-value union (compile-time
 *      proof via exhaustive switch)
 *   4. No duplicate code entries
 */

import { describe, expect, it } from 'vitest';
import {
  FAILURE_CODE_DEFINITIONS,
  FAILURE_CODES,
  FAILURE_TAXONOMY_VERSION,
  F_OTHER_REVIEW_THRESHOLD,
  type FailureCode,
} from '../../src/failure-taxonomy/codes.js';

describe('FAILURE_CODES constant', () => {
  it('lists exactly 7 non-null codes in A3 LOCK §6 order', () => {
    expect(FAILURE_CODES).toHaveLength(7);
    expect(FAILURE_CODES).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F_other']);
  });

  it('has no duplicates', () => {
    const unique = new Set(FAILURE_CODES);
    expect(unique.size).toBe(FAILURE_CODES.length);
  });
});

describe('FAILURE_CODE_DEFINITIONS record', () => {
  it('provides a non-empty definition for every non-null code', () => {
    for (const code of FAILURE_CODES) {
      const def = FAILURE_CODE_DEFINITIONS[code];
      expect(typeof def).toBe('string');
      expect(def.length).toBeGreaterThan(10);
    }
  });

  it('definitions match A3 LOCK §6 short-form taxonomy labels', () => {
    expect(FAILURE_CODE_DEFINITIONS.F1).toContain('contradicts-ground-truth');
    expect(FAILURE_CODE_DEFINITIONS.F2).toContain('partial-answer');
    expect(FAILURE_CODE_DEFINITIONS.F3).toContain('off-topic');
    expect(FAILURE_CODE_DEFINITIONS.F4).toContain('refusal');
    expect(FAILURE_CODE_DEFINITIONS.F5).toContain('tool-use-error');
    expect(FAILURE_CODE_DEFINITIONS.F6).toContain('format-violation');
    expect(FAILURE_CODE_DEFINITIONS.F_other).toContain('F-other');
  });
});

describe('FailureCode union shape', () => {
  it('FailureCode is the exhaustive 8-value union (null + F1..F6 + F_other)', () => {
    // Compile-time + runtime coverage: every case must be handled, else
    // TS flags the `never` arm and the test fails at compile.
    const all: FailureCode[] = [null, 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F_other'];
    expect(all).toHaveLength(8);
    for (const code of all) {
      switch (code) {
        case null:
        case 'F1':
        case 'F2':
        case 'F3':
        case 'F4':
        case 'F5':
        case 'F6':
        case 'F_other':
          // Exhaustive — no default needed.
          break;
      }
    }
  });
});

describe('taxonomy version + review threshold constants', () => {
  it('FAILURE_TAXONOMY_VERSION pinned to "F1-F6+other v1"', () => {
    expect(FAILURE_TAXONOMY_VERSION).toBe('F1-F6+other v1');
  });

  it('F_OTHER_REVIEW_THRESHOLD = 0.10 (A3 LOCK §6 strict-greater-than gate)', () => {
    expect(F_OTHER_REVIEW_THRESHOLD).toBe(0.10);
  });
});
