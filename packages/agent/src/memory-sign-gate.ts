/**
 * Memory-loop sign gate (premium harness R2 — DEFECT-2 structural fix).
 *
 * The implicit self-evolution loop (autoSaveFromExchange → cognify → recall →
 * behavior) had NO sign discrimination: the agent's own self-incapacity /
 * refusal assertions ("I can't install that, run xcopy, restart the session")
 * were persisted at normal/important weight and then recalled on the next
 * similar prompt as authoritative context — so the LLM pattern-matched its own
 * past failure and confabulated a tool result it never produced (DEFECT-2,
 * reproduced live 2026-05-17). An evolution loop that ingests its own
 * unvalidated negative outputs as ground truth is a divergence engine.
 *
 * This classifier flags content that asserts the agent *cannot* do something
 * or pushes the work back to the user. Such frames are still stored (audit /
 * offline-evolution visibility) but at `temporary` importance, which the
 * recall path already excludes (orchestrator getRecentFrames:
 * `WHERE importance != 'deprecated' AND importance != 'temporary'`). They
 * therefore never re-enter the prompt as instruction-grade truth.
 *
 * Pure + exported so the gate behaviour is unit-testable without the
 * orchestrator. Deliberately conservative: it should fire on the demonstrated
 * failure shapes and NOT on ordinary task content or legitimate user
 * preferences/decisions.
 */

const SELF_INCAPACITY_PATTERNS: RegExp[] = [
  // Direct inability assertions (agent subject).
  /\bI\s+(?:can'?t|cannot|am\s+unable\s+to|don'?t\s+have\s+(?:a\s+)?(?:tool|way|capability|access))\b/i,
  /\b(?:I'?ve|I\s+have)\s+exhausted\s+(?:every|all)\b/i,
  /\bnot\s+(?:something\s+I\s+can|possible\s+for\s+me|able\s+to)\b/i,
  /\bI\s+literally\s+(?:can'?t|don'?t)\b/i,
  /\bbeyond\s+(?:my|the\s+agent'?s)\s+(?:current\s+)?(?:capabilit|abilit|runtime|build)/i,
  /\b(?:outside|beyond)\s+my\s+(?:sandbox|workspace|reach|control)\b/i,
  // Pushing the work back to the user instead of attempting it.
  /\byou'?ll\s+need\s+to\s+(?:run|install|edit|configure|do\s+this)\b/i,
  /\b(?:run|use)\s+(?:this\s+)?(?:xcopy|npm\s+install|npx)\b.*\byourself\b/i,
  /\brestart\s+(?:the\s+)?(?:session|app)\b.*\b(?:to|before|then)\b/i,
  /\bthis\s+is\s+a\s+(?:platform|you)-?side\s+(?:setup|change|configuration)\b/i,
  // Confabulation tell — claiming a tool was tried with no result.
  /\bI\s+(?:tried|ran)\s+\w+\s*(?:—|-|:)?\s*(?:no\b|nothing\b|came\s+up\s+empty)/i,
  // Tool-came-up-empty report (often confabulated, e.g.
  // "acquire_capability — no installable capability found").
  /\bno\s+installable\s+\w+|\bnothing\s+(?:found|available)\b|\bcame\s+up\s+empty\b/i,
];

/**
 * True when `content` reads as an agent self-incapacity / refusal / "push it
 * back to the user" assertion that must NOT become authoritative recall.
 */
export function isSelfIncapacityAssertion(content: string): boolean {
  if (!content || content.length < 12) return false;
  return SELF_INCAPACITY_PATTERNS.some(re => re.test(content));
}
