/**
 * Correction Detector — identifies when a user is correcting the agent
 * and classifies corrections as durable (behavior-changing) vs task-local.
 *
 * Per Slice 7 correction #2:
 * - Durable corrections: repeated patterns that should influence future behavior → improvement signals
 * - Task-local corrections: one-off adjustments within a session → NOT signals
 * - One-off disagreements: not corrections at all → ignored
 */

export type CorrectionDurability = 'durable' | 'task_local' | 'not_correction';

export interface DetectedCorrection {
  isDurable: boolean;
  durability: CorrectionDurability;
  patternKey: string;
  detail: string;
  confidence: number; // 0-1
}

// ── Correction signal patterns ──────────────────────────────

/** Strong correction signals — high confidence the user is correcting agent behavior */
const STRONG_CORRECTION_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bno[,.]?\s*(?:not that|don'?t|do not|stop|never)\b/i, weight: 3 },
  { pattern: /\bI (?:said|told you|asked)\b/i, weight: 3 },
  { pattern: /\bthat'?s (?:wrong|incorrect|not (?:what|right))\b/i, weight: 3 },
  { pattern: /\bplease (?:don'?t|do not|stop|never)\b/i, weight: 2 },
  { pattern: /\binstead[,.]?\s*(?:use|do|try|go with)\b/i, weight: 2 },
  { pattern: /\bwrong (?:approach|way|format|style|tone)\b/i, weight: 2 },
  { pattern: /\bnot what I (?:wanted|meant|asked)\b/i, weight: 3 },
];

/** Moderate correction signals — may be correction or just refinement */
const MODERATE_CORRECTION_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /^no[,.:!]\s/i, weight: 2 },  // "No, ..." at start of message — strong disagreement
  { pattern: /\bactually[,.]?\s/i, weight: 1 },
  { pattern: /\brather[,.]?\s/i, weight: 1 },
  { pattern: /\blet'?s (?:not|try|go with|use)\b/i, weight: 1 },
  { pattern: /\bprefer\b/i, weight: 1 },
  { pattern: /\bshould (?:be|have been|use)\b/i, weight: 1 },
  { pattern: /\bchange (?:it|this|that) to\b/i, weight: 1 },
  { pattern: /\btoo (?:verbose|long|short|formal|casual|technical|simple)\b/i, weight: 1 },
  { pattern: /\bstop (?:doing|using|adding)\b/i, weight: 1 },
  { pattern: /\bkeep (?:it|things) (?:simple|short|brief|casual|formal)\b/i, weight: 1 },
];

// ── Durability classification patterns ──────────────────────

/** Durable signals — the correction applies beyond this specific task */
const DURABLE_SIGNALS: RegExp[] = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bfrom now on\b/i,
  /\bin (?:the )?future\b/i,
  /\bwhenever\b/i,
  /\bevery time\b/i,
  /\bin general\b/i,
  /\bI (?:always |usually )?prefer\b/i,
  /\bmy (?:preference|style|approach)\b/i,
  /\bdon'?t (?:ever|again)\b/i,
  /\bremember (?:to|that)\b/i,
  /\bkeep (?:it|things|this)\b/i,
];

/** Task-local signals — the correction is specific to this task */
const TASK_LOCAL_SIGNALS: RegExp[] = [
  /\bthis (?:time|one|specific|particular)\b/i,
  /\bfor (?:this|now)\b/i,
  /\bjust (?:here|this|now)\b/i,
  /\bin this (?:case|instance|response)\b/i,
  /\bright now\b/i,
  /\bhere\b/i,
];

// ── Pattern key extraction ──────────────────────────────────

/** Categories of behavioral corrections we can extract pattern keys for */
const PATTERN_KEY_EXTRACTORS: Array<{ category: string; pattern: RegExp }> = [
  { category: 'tone', pattern: /\btoo (?:formal|casual|verbose|terse|technical|simple)\b/i },
  { category: 'format', pattern: /\b(?:format|formatting|headers?|bullet|numbering|markdown)\b/i },
  { category: 'length', pattern: /\btoo (?:long|short|brief|detailed)\b/i },
  { category: 'approach', pattern: /\bwrong (?:approach|way|method|strategy)\b/i },
  { category: 'scope', pattern: /\btoo (?:much|many|broad|narrow|specific|general)\b/i },
  { category: 'accuracy', pattern: /\b(?:wrong|incorrect|inaccurate|mistake|error)\b/i },
  { category: 'style', pattern: /\b(?:style|voice|writing|wording|phrasing)\b/i },
];

/**
 * Detect whether a user message contains a correction and classify it.
 *
 * Returns null if no correction detected.
 * Returns DetectedCorrection with durability classification if correction found.
 */
export function detectCorrection(
  userMessage: string,
  previousAssistantMessage?: string,
): DetectedCorrection | null {
  if (!userMessage || userMessage.length < 5) return null;

  // Score correction strength
  let correctionScore = 0;
  for (const { pattern, weight } of STRONG_CORRECTION_PATTERNS) {
    if (pattern.test(userMessage)) correctionScore += weight;
  }
  for (const { pattern, weight } of MODERATE_CORRECTION_PATTERNS) {
    if (pattern.test(userMessage)) correctionScore += weight;
  }

  // Need minimum score to count as correction
  if (correctionScore < 2) return null;

  // Classify durability
  const durability = classifyDurability(userMessage);

  // Extract pattern key
  const patternKey = extractPatternKey(userMessage);

  // Compute confidence (0-1)
  const confidence = Math.min(correctionScore / 6, 1);

  // Build detail: first sentence or first 120 chars
  const detail = extractDetail(userMessage);

  return {
    isDurable: durability === 'durable',
    durability,
    patternKey,
    detail,
    confidence,
  };
}

function classifyDurability(message: string): CorrectionDurability {
  let durableScore = 0;
  let taskLocalScore = 0;

  for (const pattern of DURABLE_SIGNALS) {
    if (pattern.test(message)) durableScore++;
  }
  for (const pattern of TASK_LOCAL_SIGNALS) {
    if (pattern.test(message)) taskLocalScore++;
  }

  // Explicit durable signals win
  if (durableScore > 0 && durableScore >= taskLocalScore) return 'durable';

  // Explicit task-local signals
  if (taskLocalScore > 0) return 'task_local';

  // No explicit signals — default to task_local (conservative; only promote to durable
  // when the same pattern_key recurs across sessions via ImprovementSignalStore)
  return 'task_local';
}

function extractPatternKey(message: string): string {
  for (const { category, pattern } of PATTERN_KEY_EXTRACTORS) {
    const match = message.match(pattern);
    if (match) {
      const qualifier = match[0].toLowerCase().replace(/\s+/g, '_');
      return `${category}:${qualifier}`;
    }
  }
  // Fallback: generic correction key
  return 'general:correction';
}

function extractDetail(message: string): string {
  // Take first sentence or first 120 chars
  const sentenceMatch = message.match(/^(.+?[.!?])\s/);
  if (sentenceMatch && sentenceMatch[1].length <= 120) {
    return sentenceMatch[1];
  }
  return message.length > 120 ? message.slice(0, 117) + '...' : message;
}

/**
 * Analyze a sequence of message pairs to detect corrections.
 * Useful for batch analysis of session history.
 */
export function detectCorrectionsInHistory(
  messages: Array<{ role: string; content: string }>,
): DetectedCorrection[] {
  const corrections: DetectedCorrection[] = [];
  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const prevAssistant = i > 0 ? messages[i - 1] : undefined;
    const correction = detectCorrection(
      msg.content,
      prevAssistant?.role === 'assistant' ? prevAssistant.content : undefined,
    );
    if (correction) {
      corrections.push(correction);
    }
  }
  return corrections;
}
