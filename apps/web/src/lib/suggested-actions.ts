/**
 * Suggested next-action extraction (M-28 / ENG-7).
 *
 * Scans the last assistant message for concrete follow-up offers and
 * returns 0-3 short action phrases to render as clickable chips
 * below the message. Heuristic-only — no LLM call — so the pipeline
 * stays free and deterministic.
 *
 * Recognised patterns, in order of preference:
 *   1. Direct offers: "Want me to X?", "Would you like me to X?",
 *      "Should I X?". These are the strongest signal — the assistant
 *      is actively proposing the next step.
 *   2. Explicit "Next steps:" / "Suggestions:" / "You can:" sections
 *      with bullets (- / * / •) or numbered (1. 2. 3.) items.
 *
 * We cap at 3 chips (ENG-7 spec) and reject phrases under 3 chars or
 * over 120 to stay on a single line visually. Duplicates are removed.
 */

export const SUGGESTED_ACTIONS_MAX = 3;
const MIN_ACTION_LEN = 3;
const MAX_ACTION_LEN = 120;

// Require a sentence boundary before the trigger phrase. "Should I" mid-
// sentence (e.g. "What should I know?") is NOT an offer — only sentence-
// initial forms like "Should I commit?" count. Lookbehind is non-
// consuming so consecutive offers across sentence boundaries don't
// swallow each other's delimiters (V8 supports variable-length
// lookbehind since Node 10).
const OFFER_REGEX = /(?<=^|[.?!\n]\s*)(?:Want me to|Would you like me to|Should I|Can I help you|Do you want me to|Shall I)\s+([^.?!\n]+)[.?!]/gi;

const NEXT_STEPS_HEADING_REGEX = /(?:^|\n)\s*(?:Next steps|Suggestions|You can|You could|Here(?:'s| is) what(?:'s| is) next)\s*:?\s*\n/i;

function normalizeAction(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length < MIN_ACTION_LEN) return null;
  if (collapsed.length > MAX_ACTION_LEN) return null;
  // Strip trailing punctuation that would look odd as a button label.
  return collapsed.replace(/[.?!,:;]+$/, '').trim();
}

/** Pull "X" out of "Want me to X?" / "Should I X?" etc. */
function extractOffers(content: string): string[] {
  const offers: string[] = [];
  for (const match of content.matchAll(OFFER_REGEX)) {
    const normalized = normalizeAction(match[1] ?? '');
    if (normalized) offers.push(normalized);
  }
  return offers;
}

/** Pull bullet / numbered items out of a "Next steps:" section. */
function extractListSection(content: string): string[] {
  const headingMatch = content.match(NEXT_STEPS_HEADING_REGEX);
  if (!headingMatch) return [];
  const startIdx = headingMatch.index! + headingMatch[0].length;
  // Grab up to ~6 lines after the heading; stop at the first blank line.
  const tail = content.slice(startIdx).split(/\n/);
  const items: string[] = [];
  for (const line of tail) {
    if (line.trim() === '') break;
    const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (match) {
      const normalized = normalizeAction(match[1]);
      if (normalized) items.push(normalized);
    } else if (items.length > 0) {
      // Non-bullet line after bullets — treat as end of list.
      break;
    }
    if (items.length >= SUGGESTED_ACTIONS_MAX) break;
  }
  return items;
}

/**
 * Extract 0-3 suggested follow-up actions from the given assistant
 * message. Empty array means "no natural next actions" — the UI must
 * not render anything rather than fabricate chips.
 */
export function extractSuggestedActions(content: string): string[] {
  if (typeof content !== 'string' || content.trim().length === 0) return [];
  const merged = [...extractOffers(content), ...extractListSection(content)];
  // De-duplicate while preserving order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const action of merged) {
    const key = action.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(action);
    if (unique.length >= SUGGESTED_ACTIONS_MAX) break;
  }
  return unique;
}
