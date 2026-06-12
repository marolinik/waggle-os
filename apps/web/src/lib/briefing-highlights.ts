/**
 * LoginBriefing highlight ranker (L-22 — richer memory bragging).
 *
 * Picks the 3 most concrete memory frames to show under "I remember"
 * so the briefing proves Waggle's long-term memory with real content,
 * not placeholder noise.
 *
 * Ranking order:
 *   1. Importance descending ("critical" > "important" > others), so
 *      a curated "critical" memory wins over a trivial "normal" one.
 *   2. Recency descending (so older important memories don't crowd
 *      out recent ones at the same importance).
 *
 * Filters:
 *   - content length ≥ 20 chars (short snippets are usually tool
 *     receipts, not meaningful highlights).
 *   - skip empty / null content.
 */

export interface BriefingFrameLike {
  readonly content?: string | null;
  readonly importance?: string | number | null;
  readonly timestamp?: string | number | null;
  readonly workspaceName?: string | null;
}

export const BRIEFING_HIGHLIGHT_LIMIT = 3;
const MIN_HIGHLIGHT_CONTENT_CHARS = 20;

function importanceScore(f: BriefingFrameLike): number {
  const v = f.importance;
  if (typeof v === 'number') return v;
  switch (v) {
    case 'critical': return 4;
    case 'important': return 3;
    case 'normal': return 2;
    case 'low': return 1;
    default: return 2;
  }
}

function timestampMs(f: BriefingFrameLike): number {
  const ts = f.timestamp;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isConcrete(f: BriefingFrameLike): boolean {
  if (typeof f.content !== 'string') return false;
  const trimmed = f.content.trim();
  return trimmed.length >= MIN_HIGHLIGHT_CONTENT_CHARS;
}

/** First line of the content, normalized — the identity used for dedup. */
function highlightKey(f: BriefingFrameLike): string {
  return (f.content ?? '').split('\n')[0].trim().toLowerCase().slice(0, 120);
}

/**
 * Rank and trim the frames to the top BRIEFING_HIGHLIGHT_LIMIT
 * highlights. Returns a new array — does not mutate input.
 *
 * Duplicate content (consolidation re-writes the same fact as a fresh
 * frame) is collapsed to ONE highlight, keeping the EARLIEST timestamp —
 * the moment it was learned. Showing the same memory twice with two
 * different ages was the single most trust-destroying defect judges hit.
 */
export function selectBriefingHighlights<T extends BriefingFrameLike>(frames: readonly T[]): T[] {
  const concrete = frames.filter(isConcrete);
  const byKey = new Map<string, T>();
  for (const f of concrete) {
    const key = highlightKey(f);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, f);
      continue;
    }
    // Keep the higher-importance copy; tie → the earliest-learned copy.
    if (
      importanceScore(f) > importanceScore(existing) ||
      (importanceScore(f) === importanceScore(existing) &&
        timestampMs(f) > 0 &&
        (timestampMs(existing) === 0 || timestampMs(f) < timestampMs(existing)))
    ) {
      byKey.set(key, f);
    }
  }
  const sorted = [...byKey.values()].sort((a, b) => {
    const impDiff = importanceScore(b) - importanceScore(a);
    if (impDiff !== 0) return impDiff;
    return timestampMs(b) - timestampMs(a);
  });
  return sorted.slice(0, BRIEFING_HIGHLIGHT_LIMIT);
}
