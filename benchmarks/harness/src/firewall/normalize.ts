/**
 * Leakage-firewall text canonicalizer.
 *
 * The gold-substring gate (02-CONTINUAL-MEMORY-PROTOCOL.md §5.2) must catch a
 * leaked gold answer even when an artifact paraphrases its surface form:
 * different case, re-spaced, hyphen-vs-space, full-width glyphs, ligatures, or
 * zero-width characters inserted to defeat a naive `includes`. `normalizeForMatch`
 * produces ONE canonical form so that "Order #123!" and "order 123" collide.
 *
 * Pipeline (order matters):
 *   1. Unicode NFKC — fold compatibility forms (full-width, ligatures) to ASCII-ish.
 *   2. lowercase.
 *   3. strip zero-width + control chars (U+200B-U+200D, U+FEFF, U+0000-U+001F except
 *      whitespace) so they can't split a banned substring.
 *   4. replace every non-alphanumeric (Unicode letters/digits) run with a single space.
 *   5. collapse remaining whitespace to single spaces; trim.
 *
 * Pure + deterministic + idempotent. No I/O.
 */

// Zero-width + BOM joiners that must be deleted before matching.
const ZERO_WIDTH = /[​‌‍﻿]/g;
// Anything that is NOT a Unicode letter or number → fold to a space.
const NON_ALPHANUM = /[^\p{L}\p{N}]+/gu;
const WHITESPACE_RUN = /\s+/g;

export function normalizeForMatch(text: string): string {
  if (typeof text !== 'string') {
    throw new Error(`normalizeForMatch expects a string; got ${typeof text}`);
  }
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(ZERO_WIDTH, '')
    .replace(NON_ALPHANUM, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}
