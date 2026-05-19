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

/**
 * The deterministic closed-loop plan for one completed turn. `directive` is the
 * instruction the runtime surfaces so the agent reliably authors the skill via
 * its own `create_skill` tool (Hermes keeps authoring in the LLM) instead of
 * the loop hoping the model spontaneously recalls the behavioral-spec rule.
 * `patternKey` is a stable, secret-free signature of the tool shape, suitable
 * as an idempotent upsert key for an improvement signal.
 */
export interface SkillDistillationPlan {
  directive: string;
  patternKey: string;
}

/**
 * Plan a skill distillation from a real turn's tool usage + final assistant
 * message. Returns `null` unless the turn earned a skill (≥5 tool calls AND
 * not a refusal — `shouldDistillSkill`, which is R2 sign-gated end to end).
 * Pure: the runtime seam decides here; surfacing/recording is the caller's job.
 */
export function planSkillDistillation(
  toolsUsed: readonly string[],
  assistantMsg: string,
): SkillDistillationPlan | null {
  const count = toolsUsed?.length ?? 0;
  if (!shouldDistillSkill(count, assistantMsg)) return null;

  // First-occurrence-ordered, deduped tool sequence — the capability shape of
  // the workflow, with no paths/args/secrets. Stable across identical workflows
  // so the improvement-signal upsert collapses repeats instead of fragmenting.
  const signature = [...new Set(toolsUsed)].join('>').slice(0, 120) || 'mixed';

  return {
    directive:
      `You just completed a ${count}-tool task successfully. Per the closed `
      + `learning loop, distil the reusable approach now: call create_skill `
      + `(run search_skills first — improve a close match instead of `
      + `duplicating). Capture the generalized method, not this run's `
      + `specifics; strip secrets, paths, and one-off values.`,
    patternKey: signature,
  };
}
