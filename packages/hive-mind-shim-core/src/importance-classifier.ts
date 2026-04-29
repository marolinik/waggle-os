/**
 * Rule-based importance classifier. Pure-functional, no LLM calls.
 *
 * Four importance levels matching hive-mind core's Importance type:
 *   - temporary: ephemeral chatter explicitly marked for fast decay
 *   - normal:    default for substantive content with no special signal
 *                (this is the upstream MCP default — was 'temporary' in
 *                pre-1.4 shim, raised to 'normal' in Commit 1.4 to align
 *                with the upstream save_memory schema)
 *   - important: turns containing decisions / failures / actions
 *   - critical:  user-facing rules / preferences / "always"/"never"
 *                directives, retained indefinitely
 *
 * Higher importance wins when multiple rules match.
 */

export type Importance = 'temporary' | 'normal' | 'important' | 'critical';

export interface ImportanceRule {
  pattern: RegExp | string;
  importance: Importance;
  reason: string;
}

export interface ClassifyContext {
  eventType?: string;
  source?: string;
}

const TIER: Record<Importance, number> = {
  temporary: 0,
  normal: 1,
  important: 2,
  critical: 3,
};

const CRITICAL_PATTERNS: readonly ImportanceRule[] = [
  { pattern: /\balways\b/i, importance: 'critical', reason: 'directive: always' },
  { pattern: /\bnever\b/i, importance: 'critical', reason: 'directive: never' },
  { pattern: /\bMEMORY\.md\b/i, importance: 'critical', reason: 'memory rule reference' },
  { pattern: /\bCLAUDE\.md\b/i, importance: 'critical', reason: 'rules document reference' },
  { pattern: /\b(my preference|i prefer|please always|please never)\b/i, importance: 'critical', reason: 'user preference' },
  { pattern: /\b(do not|don'?t)\s+(use|do|run|invoke|call)\b/i, importance: 'critical', reason: 'prohibition' },
];

const IMPORTANT_PATTERNS: readonly ImportanceRule[] = [
  { pattern: /\b(decided|decision|conclusion|resolved|chose)\b/i, importance: 'important', reason: 'decision statement' },
  { pattern: /\b(implement|fix|refactor|migrate|deploy|ship)\b/i, importance: 'important', reason: 'action verb' },
  { pattern: /\b(error|bug|issue|broke|broken|fails?|failed)\b/i, importance: 'important', reason: 'failure signal' },
  { pattern: /\bTODO\b|\bFIXME\b/, importance: 'important', reason: 'work marker' },
];

export const DEFAULT_RULES: readonly ImportanceRule[] = [
  ...CRITICAL_PATTERNS,
  ...IMPORTANT_PATTERNS,
];

function compilePattern(p: RegExp | string): RegExp {
  return p instanceof RegExp ? p : new RegExp(p);
}

function applyRules(content: string, rules: readonly ImportanceRule[], floor: Importance): Importance {
  let best: Importance = floor;
  for (const rule of rules) {
    const re = compilePattern(rule.pattern);
    if (re.test(content) && TIER[rule.importance] > TIER[best]) {
      best = rule.importance;
    }
  }
  return best;
}

export function classifyImportance(
  content: string,
  context: ClassifyContext = {},
): Importance {
  if (!content || content.trim().length === 0) {
    return 'temporary';
  }

  // Session boundaries always retain at least 'important' importance:
  // start/end establish project context that we don't want to decay.
  // Everything else floors at 'normal' to align with the upstream
  // save_memory default and avoid silent decay of substantive turns.
  const floor: Importance = (context.eventType === 'session-start' || context.eventType === 'session-end')
    ? 'important'
    : 'normal';

  return applyRules(content, DEFAULT_RULES, floor);
}

export function classifyWithRules(
  content: string,
  rules: readonly ImportanceRule[],
  fallback: Importance = 'normal',
): Importance {
  if (!content || content.trim().length === 0) return fallback;
  return applyRules(content, rules, fallback);
}
