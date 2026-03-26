/**
 * Workflow Capture — proactive detection of repeatable patterns.
 *
 * Monitors session activity and suggests capturing workflows as reusable skills
 * when patterns are detected across sessions. Only triggers after 3+ repetitions
 * to avoid being annoying.
 */

import { detectWorkflowPattern, type SkillTemplate } from './skill-creator.js';

export interface CaptureCheckParams {
  /** Messages from the current session */
  messages: Array<{ role: string; content: string; toolsUsed?: string[] }>;
  /** Tool sequences from previous sessions (up to last 10) */
  sessionHistory: Array<{ toolSequence: string[] }>;
}

export interface CaptureNotification {
  type: 'workflow_captured';
  title: string;
  message: string;
}

export interface CaptureResult {
  /** Whether to suggest capturing this workflow */
  suggest: boolean;
  /** Pre-filled template if a pattern was detected */
  pattern?: SkillTemplate;
  /** Human-readable explanation of why this was suggested */
  reason?: string;
  /** Notification for UI visibility when a pattern is detected */
  notification?: CaptureNotification;
}

/**
 * Check if the current session has a capturable workflow pattern.
 *
 * Strategy:
 * 1. Extract tool sequence from current session
 * 2. Compare against tool sequences from past sessions
 * 3. If a similar sequence appeared 3+ times total (including current), suggest capture
 *
 * This function is designed to be non-annoying:
 * - Requires 3+ repetitions (current + 2 historical)
 * - Requires a minimum of 3 tools in the sequence
 * - Only triggers once per pattern (caller should track dismissed suggestions)
 */
export function shouldSuggestCapture(params: CaptureCheckParams): CaptureResult {
  const { messages, sessionHistory } = params;

  // Extract current session's tool sequence
  const currentToolSeq = extractCurrentToolSequence(messages);

  // Need at least 3 tools for a meaningful workflow
  if (currentToolSeq.length < 3) {
    return { suggest: false };
  }

  // Compare against historical sessions
  let matchCount = 0;
  const matchingSessions: number[] = [];

  for (let i = 0; i < sessionHistory.length; i++) {
    const historicalSeq = sessionHistory[i].toolSequence;
    if (historicalSeq.length < 3) continue;

    const similarity = computeSequenceSimilarity(currentToolSeq, historicalSeq);
    if (similarity >= 0.6) {
      matchCount++;
      matchingSessions.push(i);
    }
  }

  // Need 2+ historical matches (so 3+ total including current)
  if (matchCount < 2) {
    return { suggest: false };
  }

  // Try to detect a concrete pattern from the current session
  const pattern = detectWorkflowPattern(messages);

  if (!pattern) {
    // Even without a detected pattern, we know the sequence repeats
    // Build a basic template from the tool sequence
    const uniqueTools = [...new Set(currentToolSeq)];
    const basicPattern: SkillTemplate = {
      name: uniqueTools.slice(0, 3).join('-then-'),
      description: `Repeated workflow using: ${uniqueTools.join(', ')}`,
      triggerPatterns: [],
      steps: currentToolSeq.map((tool, i) => `Step ${i + 1}: Use ${tool}`),
      tools: uniqueTools,
      category: inferCategoryFromTools(uniqueTools),
    };

    const basicResult: CaptureResult = {
      suggest: true,
      pattern: basicPattern,
      reason: `You've used this tool sequence (${uniqueTools.slice(0, 4).join(' -> ')}${uniqueTools.length > 4 ? '...' : ''}) in ${matchCount + 1} sessions. Want me to save it as a reusable skill?`,
    };
    basicResult.notification = {
      type: 'workflow_captured',
      title: 'Your agent learned a new pattern',
      message: `Detected repeating workflow: ${basicPattern.name}. Save as a reusable skill?`,
    };
    return basicResult;
  }

  const detectedResult: CaptureResult = {
    suggest: true,
    pattern,
    reason: `You've repeated this workflow pattern ${matchCount + 1} times across sessions. Want me to save it as a reusable skill?`,
  };
  detectedResult.notification = {
    type: 'workflow_captured',
    title: 'Your agent learned a new pattern',
    message: `Detected repeating workflow: ${pattern.name}. Save as a reusable skill?`,
  };
  return detectedResult;
}

/**
 * Extract tool sequence from the current session's messages.
 */
function extractCurrentToolSequence(
  messages: Array<{ role: string; content: string; toolsUsed?: string[] }>,
): string[] {
  const tools: string[] = [];
  for (const msg of messages) {
    if (msg.toolsUsed && msg.toolsUsed.length > 0) {
      tools.push(...msg.toolsUsed);
    }
  }
  return tools;
}

/**
 * Compute similarity between two tool sequences.
 *
 * Uses a combination of:
 * - Set intersection (what tools appear in both)
 * - Order similarity (longest common subsequence ratio)
 *
 * Returns 0-1 where 1 = identical sequences.
 */
function computeSequenceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  // Set-based similarity (Jaccard)
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  const jaccard = intersection.size / union.size;

  // Order similarity using LCS
  const lcsLen = lcsLength(a, b);
  const orderSim = lcsLen / Math.max(a.length, b.length);

  // Weighted average — order matters more than just set overlap
  return jaccard * 0.4 + orderSim * 0.6;
}

/**
 * Longest Common Subsequence length (dynamic programming).
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

/**
 * Infer category from tool names.
 */
function inferCategoryFromTools(tools: string[]): string {
  const joined = tools.join(' ').toLowerCase();
  if (joined.includes('web_search') || joined.includes('web_fetch')) return 'research';
  if (joined.includes('git_') || joined.includes('edit_file') || joined.includes('code')) return 'coding';
  if (joined.includes('memory') || joined.includes('save_memory')) return 'knowledge';
  if (joined.includes('draft') || joined.includes('write') || joined.includes('docx')) return 'writing';
  if (joined.includes('plan') || joined.includes('task')) return 'planning';
  return 'general';
}
