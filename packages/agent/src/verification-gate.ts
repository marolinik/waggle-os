/**
 * Verification-before-completion gate (premium harness D3 — structural).
 *
 * R3 (`f9be0b4`) put the "a task is not done until verified" contract in
 * BEHAVIORAL_SPEC as prose. R6 is direct evidence that a model does not
 * reliably obey in-context discipline. Premium D3 ("not done until
 * verified; reproduce the check") therefore needs a STRUCTURAL gate, the
 * same way R2/R5a made memory integrity structural rather than prose.
 *
 * This classifier flags a final turn that *asserts* the work is
 * verified / passing / working while NO verification-class tool was run
 * that turn — i.e. an unverified completion claim, the exact
 * confabulation R3 prohibits. The agent loop uses it to force ONE
 * corrective turn before accepting completion (one-shot; loop-guard /
 * maxTurns still bound the loop).
 *
 * Pure + conservatively tuned: it must fire on explicit success/verified
 * assertions and NOT on neutral "done", honest "I could not verify"
 * non-claims, or turns where a check actually ran. False negatives are
 * safe (no behavior change); false positives would disrupt normal flows,
 * so the bar to fire is deliberately high.
 */

/** Tool-name fragments that count as actually running a check. */
const VERIFICATION_TOOL = /test|build|\brun\b|run_|verif|lint|typecheck|tsc|pytest|jest|vitest|exec|bash|compile|spec/i;

/** Explicit "the work is verified / passing / working" success assertions. */
const SUCCESS_ASSERTION: RegExp[] = [
  /\b(?:all\s+)?(?:tests?|suite|specs?)\s+(?:(?:are|is)\s+)?(?:pass(?:ed|ing)?|green)\b/i,
  /\b\d+\s+tests?\s+(?:pass(?:ed|ing)?|green)\b/i,
  /\bbuild\s+(?:succeed(?:s|ed)?|passes|is\s+green)\b/i,
  /\bit\s+(?:now\s+)?compiles?\b|\beverything\s+compiles\b/i,
  /\bI(?:'ve| have)?\s+verified\b|\bverified\s+(?:that\s+)?(?:everything|it|the)\b/i,
  /\bit\s+works\s+(?:now|correctly|as\s+expected)\b|\beverything\s+works\b/i,
  /\bI\s+ran\s+it\b[^.]*\b(?:correct|works?|pass(?:es|ed)?)\b/i,
  /\b(?:confirmed|validated)\s+(?:it|the|that)\b[^.]*\b(?:works?|passes?|correct)\b/i,
];

/** Requests whose output is expected to preserve claims supplied by the user. */
const SOURCE_TRANSFORM_REQUEST = /\b(?:rewrite|rephrase|summari[sz]e|translate|preserve|quote|extract|polish|edit this|turn this into)\b/i;

/** Context that makes a success phrase a future condition rather than a completion claim. */
const PLANNING_CONTEXT = /(?:\b(?:exit|acceptance|release|completion|success|quality)\s+(?:criteria|criterion|gate)\b|\bdefinition of done\b|\b(?:if|when|once|until|unless)\b|\b(?:must|should|needs? to|required|requires?|target|goal|planned|plan to|will)\b)/i;
const PLANNING_HEADER = /(?:criteria|criterion|gate|definition of done|requirements?|target|goal)/i;
const ATTRIBUTED_CONTEXT = /\b(?:you (?:said|reported|stated|provided)|according to (?:you|your message)|the supplied (?:text|claim)|reported|claimed)\b/i;

function normalizeAssertion(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function assertionContext(content: string, index: number): { line: string; previousLine: string } {
  const lineStart = content.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const lineEndMatch = content.indexOf('\n', index);
  const lineEnd = lineEndMatch === -1 ? content.length : lineEndMatch;
  const previousEnd = Math.max(0, lineStart - 1);
  const previousStart = content.lastIndexOf('\n', Math.max(0, previousEnd - 1)) + 1;
  return {
    line: content.slice(lineStart, lineEnd),
    previousLine: content.slice(previousStart, previousEnd),
  };
}

function isPlanningCondition(content: string, index: number): boolean {
  const { line, previousLine } = assertionContext(content, index);
  if (PLANNING_CONTEXT.test(line)) return true;
  if (!/^\s*(?:[-*]|\d+[.)])\s+/.test(line)) return false;
  const lineStart = content.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const sectionLead = content.slice(Math.max(0, lineStart - 240), lineStart);
  return PLANNING_HEADER.test(previousLine) || PLANNING_HEADER.test(sectionLead);
}

function isSuppliedClaim(
  assertion: RegExp,
  matchText: string,
  content: string,
  index: number,
  userRequest: string,
): boolean {
  if (SOURCE_TRANSFORM_REQUEST.test(userRequest)) {
    const flags = assertion.flags.replaceAll('g', '');
    if (new RegExp(assertion.source, flags).test(userRequest)) return true;
  }
  const normalizedMatch = normalizeAssertion(matchText);
  if (!normalizedMatch || !normalizeAssertion(userRequest).includes(normalizedMatch)) return false;
  return ATTRIBUTED_CONTEXT.test(assertionContext(content, index).line);
}

/**
 * True when `content` asserts verified/passing/working completion but
 * none of `toolsUsed` is a verification-class tool — an unverified
 * completion claim that must not be accepted as "done".
 */
export function assertsUnverifiedCompletion(
  content: string,
  toolsUsed: readonly string[],
  userRequest = '',
): boolean {
  if (!content || content.length < 12) return false;
  // A check actually ran this turn → the claim is grounded; do not fire.
  if (toolsUsed.some(t => VERIFICATION_TOOL.test(t))) return false;
  for (const assertion of SUCCESS_ASSERTION) {
    const flags = assertion.flags.includes('g') ? assertion.flags : `${assertion.flags}g`;
    for (const match of content.matchAll(new RegExp(assertion.source, flags))) {
      const index = match.index ?? 0;
      if (isPlanningCondition(content, index)) continue;
      if (isSuppliedClaim(assertion, match[0], content, index, userRequest)) continue;
      return true;
    }
  }
  return false;
}

/**
 * One-shot corrective directive injected when the gate fires. Mirrors
 * BEHAVIORAL_SPEC's verification contract into an actionable instruction.
 */
export const VERIFICATION_GATE_DIRECTIVE =
  'You asserted the work is verified/passing/working but ran no verification '
  + 'tool this turn. Per the verification-before-completion contract: actually '
  + 'run the check now (the tests / build / the original reproduction) and quote '
  + 'the real output, OR explicitly label the result UNVERIFIED and say what '
  + 'remains unchecked. Do not reassert success without evidence.';
