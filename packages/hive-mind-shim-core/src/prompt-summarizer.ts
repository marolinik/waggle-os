/**
 * Deterministic extractive turn summarizer. Pure text reduction; NO LLM.
 *
 * Strategy:
 *   1. Replace fenced code blocks with the literal token "[code]" so a
 *      large embedded snippet doesn't blow the budget.
 *   2. Collapse whitespace + newlines to a single space.
 *   3. Split on sentence boundaries.
 *   4. Take leading sentences until maxChars is consumed (with a
 *      one-char reservation for the ellipsis).
 *   5. Append a single Unicode ellipsis if anything was dropped.
 *
 * This is intentionally NOT an LLM-grade summary. Its job is to make
 * Stop-hook traffic small enough for `save_memory` while still carrying
 * the leading sentence verbatim — the highest-signal part of any turn.
 */

export interface SummarizeOptions {
  /** Maximum output length in characters. Defaults to 500. */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 500;
const ELLIPSIS = '…';
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z(\[])/g;

export function summarizeTurn(content: string, opts: SummarizeOptions = {}): string {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  if (!content || content.trim().length === 0) return '';

  const collapsed = content
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (collapsed.length <= maxChars) return collapsed;

  const sentences = collapsed.split(SENTENCE_BOUNDARY);
  const parts: string[] = [];
  let used = 0;
  for (const s of sentences) {
    const sep = parts.length === 0 ? 0 : 1;
    if (used + s.length + sep > maxChars - 1) break;
    parts.push(s);
    used += s.length + sep;
  }

  if (parts.length === 0) {
    return collapsed.slice(0, Math.max(0, maxChars - 1)) + ELLIPSIS;
  }

  const out = parts.join(' ');
  return out.length < collapsed.length ? out + ELLIPSIS : out;
}
