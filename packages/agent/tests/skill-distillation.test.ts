/**
 * R1 / D1 (Hermes-parity closed learning loop) — the skill-distillation
 * trigger fires on successful complex work and is gated against
 * refusal/failure turns by the R2 sign gate.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldDistillSkill,
  planSkillDistillation,
  SKILL_DISTILL_MIN_TOOL_CALLS,
} from '../src/skill-distillation.js';

describe('shouldDistillSkill', () => {
  const ok = 'Done. I read the configs, ran the migration, verified the build, and all tests pass.';

  it('fires when a turn does ≥5 tool calls and succeeds', () => {
    expect(shouldDistillSkill(5, ok)).toBe(true);
    expect(shouldDistillSkill(9, ok)).toBe(true);
  });

  it('does NOT fire for trivial turns below the tool-call threshold', () => {
    expect(shouldDistillSkill(0, ok)).toBe(false);
    expect(shouldDistillSkill(4, ok)).toBe(false);
    expect(shouldDistillSkill(SKILL_DISTILL_MIN_TOOL_CALLS - 1, ok)).toBe(false);
  });

  it('does NOT fire when the complex turn was a refusal / self-incapacity (R2 gate)', () => {
    // A skill is a proven recipe — never distil a failed/refusal turn.
    expect(shouldDistillSkill(8, "I have exhausted every option — I can't access that path.")).toBe(false);
    expect(shouldDistillSkill(8, 'acquire_capability — no installable capability found')).toBe(false);
    expect(shouldDistillSkill(8, "You'll need to run npm install yourself and restart the session.")).toBe(false);
  });

  it('handles bad input safely', () => {
    expect(shouldDistillSkill(NaN, ok)).toBe(false);
    expect(shouldDistillSkill(-1, ok)).toBe(false);
    expect(shouldDistillSkill(7, '')).toBe(true); // empty msg is not a refusal
  });

  it('threshold matches the Hermes ≥5 reference', () => {
    expect(SKILL_DISTILL_MIN_TOOL_CALLS).toBe(5);
  });
});

/**
 * The deterministic closed-loop half: the runtime turn-completion seam plans a
 * distillation directive from the real turn (toolsUsed[] + final assistant
 * message), gated end-to-end by the R2 sign gate. This is what makes the loop
 * *closed* rather than dependent on the model spontaneously recalling the
 * behavioral-spec prose.
 */
describe('planSkillDistillation', () => {
  const ok = 'Done. Read configs, ran the migration, verified the build, all tests pass.';
  const fiveTools = ['read_file', 'search_skills', 'edit_file', 'run_tests', 'save_memory'];

  it('returns a directive for a successful ≥5-tool turn', () => {
    const plan = planSkillDistillation(fiveTools, ok);
    expect(plan).not.toBeNull();
    expect(plan!.directive).toMatch(/create_skill/);
    expect(plan!.patternKey.length).toBeGreaterThan(0);
  });

  it('returns null below the tool-call threshold', () => {
    expect(planSkillDistillation(['read_file', 'edit_file'], ok)).toBeNull();
    expect(planSkillDistillation([], ok)).toBeNull();
  });

  it('returns null for a ≥5-tool refusal / self-incapacity turn (R2 gate end-to-end)', () => {
    expect(
      planSkillDistillation(fiveTools, "I have exhausted every option — I can't access that path."),
    ).toBeNull();
    expect(
      planSkillDistillation(fiveTools, 'acquire_capability — no installable capability found'),
    ).toBeNull();
  });

  it('derives a stable, secret-free pattern key from the tool sequence', () => {
    const plan = planSkillDistillation(['read_file', 'read_file', 'edit_file', 'run_tests', 'grep'], ok)!;
    // Deduped, ordered signature — no paths/args/secrets, just capability shape.
    expect(plan.patternKey).toBe('read_file>edit_file>run_tests>grep');
  });
});
