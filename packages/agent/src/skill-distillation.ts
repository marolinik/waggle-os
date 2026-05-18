/**
 * Skill-distillation trigger (premium harness R1 — Hermes-parity, rubric D1).
 *
 * Hermes Agent's signature "closed learning loop": when a task takes ≥5 tool
 * calls and succeeds, it autonomously distils the reusable approach into a
 * skill doc, so the next similar task is faster (benchmarked ~40% faster vs a
 * fresh instance). Waggle had the pieces (create_skill tool, traces) but no
 * trigger — the loop was open.
 *
 * This is the decision layer: a pure predicate for "this turn earned a skill."
 * The behavioral-spec instructs the agent to actually author it via its own
 * create_skill tool (the same way Hermes's model writes the skill doc),
 * keeping authoring in the LLM rather than a parallel distillation engine.
 *
 * Gated by the R2 sign gate: never distil from a failed / refusal turn — a
 * skill is a *proven* recipe. Distilling failure would pollute the skill
 * library exactly as unguarded auto-save poisons recall (DEFECT-2).
 */

import { isSelfIncapacityAssertion } from './memory-sign-gate.js';

/** Hermes uses ≥5 tool calls as the "complex enough to be worth a skill" line. */
export const SKILL_DISTILL_MIN_TOOL_CALLS = 5;

/**
 * True when the just-completed turn earned an autonomous skill: it did
 * substantive multi-tool work AND succeeded (not a refusal / self-incapacity
 * turn). `toolCallCount` is the number of tool calls the turn made;
 * `assistantMsg` is the final assistant message for the turn.
 */
export function shouldDistillSkill(toolCallCount: number, assistantMsg: string): boolean {
  if (!Number.isFinite(toolCallCount) || toolCallCount < SKILL_DISTILL_MIN_TOOL_CALLS) {
    return false;
  }
  // A skill is a proven recipe — a failed/refusal turn has no recipe yet.
  if (isSelfIncapacityAssertion(assistantMsg)) return false;
  return true;
}
