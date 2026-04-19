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

/**
 * Rank and trim the frames to the top BRIEFING_HIGHLIGHT_LIMIT
 * highlights. Returns a new array — does not mutate input.
 */
export function selectBriefingHighlights<T extends BriefingFrameLike>(frames: readonly T[]): T[] {
  const concrete = frames.filter(isConcrete);
  const sorted = [...concrete].sort((a, b) => {
    const impDiff = importanceScore(b) - importanceScore(a);
    if (impDiff !== 0) return impDiff;
    return timestampMs(b) - timestampMs(a);
  });
  return sorted.slice(0, BRIEFING_HIGHLIGHT_LIMIT);
}
