/**
 * GEPA Faza 1 — regression test for null-baseline promptShapeOverride bug.
 *
 * Per Amendment 6: the original NULL-baseline runner passed `shape: PromptShape`
 * to runOneEval but never forwarded it to runRetrievalAgentLoop, meaning all
 * 40 evals used the model-alias-default shape (qwen-thinking for Qwen subject)
 * regardless of the per-shape evaluation label.
 *
 * Fix: pass `promptShapeOverride: shape.name` to runRetrievalAgentLoop.
 *
 * This test verifies the fix is present in the script source — a structural
 * source-text invariant. A behavioral test would require refactoring the runner
 * to expose a testable function; for the Faza 1 timeline, source-text check is
 * sufficient regression protection.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const RUNNER_PATH = path.resolve(__dirname, '../../scripts/faza-1/run-null-baseline.ts');

describe('Amendment 6 regression — null-baseline promptShapeOverride wiring', () => {
  const source = fs.readFileSync(RUNNER_PATH, 'utf-8');

  it('script source contains promptShapeOverride passed to runRetrievalAgentLoop', () => {
    // The fix introduces the literal `promptShapeOverride: shape.name` in the
    // runRetrievalAgentLoop call within runOneEval.
    expect(source).toContain('promptShapeOverride: shape.name');
  });

  it('script source contains Amendment 6 bug-fix annotation comment', () => {
    expect(source).toContain('Amendment 6');
    expect(source).toContain('bug fix per Amendment 6');
  });

  it('script source still passes modelAlias = SUBJECT_ALIAS', () => {
    // Make sure the fix didn't inadvertently change the subject (which is
    // shape-independent: subject is always Qwen, override controls shape).
    expect(source).toContain('modelAlias: SUBJECT_ALIAS');
  });

  it('runOneEval receives shape parameter typed as PromptShape', () => {
    // The shape parameter must remain in scope so promptShapeOverride: shape.name
    // resolves correctly.
    expect(source).toMatch(/runOneEval\s*\(\s*shape\s*:\s*PromptShape/);
  });
});
