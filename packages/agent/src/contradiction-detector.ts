/**
 * Lightweight contradiction detector for memory write-time validation.
 * Detects when new content contradicts an existing memory frame,
 * particularly for decision reversals.
 *
 * F25: Contradicting frames stored without any flag.
 */

export interface ContradictionResult {
  isContradiction: boolean;
  conflictsWith?: string;
}

/** Sentiment words indicating positive/forward direction */
const POSITIVE_WORDS = new Set([
  'yes', 'approved', 'proceed', 'accept', 'agree', 'confirmed', 'go',
  'will', 'should', 'enable', 'allow', 'adopt', 'use', 'keep', 'continue',
  'start', 'begin', 'include', 'add', 'support',
]);

/** Sentiment words indicating negative/blocking direction */
const NEGATIVE_WORDS = new Set([
  'no', 'not', 'never', 'cancel', 'reject', 'deny', 'denied', 'refuse',
  'stop', 'abandon', 'drop', 'remove', 'disable', 'block', 'avoid',
  'exclude', 'skip', 'delete', 'revoke', 'won\'t', 'shouldn\'t', 'cannot',
]);

/** Extract meaningful keywords from text (lowercase, 3+ chars, no stop words) */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
    'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'does', 'did', 'but', 'not',
    'all', 'any', 'each', 'which', 'their', 'there', 'then', 'than',
    'into', 'about', 'also', 'just', 'more', 'some', 'other',
  ]);

  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  return new Set(words.filter(w => !stopWords.has(w)));
}

/** Count how many words from a set appear in text */
function countSentimentWords(text: string, wordSet: Set<string>): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const word of wordSet) {
    // Use word boundary check to avoid partial matches
    const regex = new RegExp(`\\b${word.replace(/'/g, "'?")}\\b`, 'i');
    if (regex.test(lower)) count++;
  }
  return count;
}

/**
 * Detect if new content contradicts any existing memory frames.
 * Focused on decision reversals: if both contain "Decision:" and share
 * significant keyword overlap but have opposing sentiment.
 *
 * @param newContent - The content about to be saved
 * @param existingFrames - Array of existing memory frames to check against
 * @returns ContradictionResult indicating whether a contradiction was found
 */
export function detectContradiction(
  newContent: string,
  existingFrames: Array<{ content: string }>,
): ContradictionResult {
  // Only check decision-type content
  const isDecision = /\bdecision\s*:/i.test(newContent);
  if (!isDecision) {
    return { isContradiction: false };
  }

  const newKeywords = extractKeywords(newContent);
  const newPositive = countSentimentWords(newContent, POSITIVE_WORDS);
  const newNegative = countSentimentWords(newContent, NEGATIVE_WORDS);

  for (const frame of existingFrames) {
    // Only compare against other decision frames
    if (!/\bdecision\s*:/i.test(frame.content)) continue;

    const existingKeywords = extractKeywords(frame.content);

    // Count shared keywords (excluding sentiment words themselves)
    let sharedCount = 0;
    for (const kw of newKeywords) {
      if (existingKeywords.has(kw) && !POSITIVE_WORDS.has(kw) && !NEGATIVE_WORDS.has(kw)) {
        sharedCount++;
      }
    }

    // Need at least 3 shared keywords to consider them about the same topic
    if (sharedCount < 3) continue;

    const existingPositive = countSentimentWords(frame.content, POSITIVE_WORDS);
    const existingNegative = countSentimentWords(frame.content, NEGATIVE_WORDS);

    // Detect opposing sentiment: one is net-positive, the other is net-negative
    const newSentiment = newPositive - newNegative;
    const existingSentiment = existingPositive - existingNegative;

    // Opposing sentiment with shared topic = potential contradiction
    if ((newSentiment > 0 && existingSentiment < 0) || (newSentiment < 0 && existingSentiment > 0)) {
      return {
        isContradiction: true,
        conflictsWith: frame.content.slice(0, 300),
      };
    }
  }

  return { isContradiction: false };
}
