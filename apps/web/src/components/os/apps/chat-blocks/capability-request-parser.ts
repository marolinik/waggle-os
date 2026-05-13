import type { CapabilityRequest } from './CapabilityRequestCard';

export type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'capability'; request: CapabilityRequest };

// Pattern A: structured marker the agent can emit explicitly (preferred):
//   <!--waggle:capability_request {"name":"X","source":"Y","reason":"..."}-->
const MARKER_RE = /<!--\s*waggle:capability_request\s+(\{[^}]+\})\s*-->/g;

// Pattern B: legacy markdown phrasing from acquire_capability's recommendation:
//   `install_capability` with name "X" and source "Y"
// Falls back to this when the agent hasn't been updated to emit Pattern A.
const LEGACY_RE = /`install_capability`\s+with\s+name\s+"([^"]+)"\s+and\s+source\s+"([^"]+)"/gi;

function parseRequest(jsonRaw: string): CapabilityRequest | null {
  try {
    const obj = JSON.parse(jsonRaw) as Partial<CapabilityRequest>;
    if (!obj.name || !obj.source) return null;
    return {
      name: String(obj.name),
      source: String(obj.source),
      kind: obj.kind,
      reason: obj.reason ? String(obj.reason) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Split a chat-text block into [text, capability_request, text, ...] segments
 * so the renderer can inline install buttons next to the prose that prompted
 * the recommendation.
 */
export function segmentText(content: string): Segment[] {
  if (!content.includes('capability_request') && !content.includes('install_capability')) {
    return [{ kind: 'text', content }];
  }

  type Hit = { start: number; end: number; request: CapabilityRequest };
  const hits: Hit[] = [];

  for (const m of content.matchAll(MARKER_RE)) {
    const request = parseRequest(m[1]);
    if (request && m.index !== undefined) {
      hits.push({ start: m.index, end: m.index + m[0].length, request });
    }
  }

  for (const m of content.matchAll(LEGACY_RE)) {
    if (m.index === undefined) continue;
    // Skip if a Pattern A marker already covers this region.
    const covered = hits.some(h => m.index! >= h.start && m.index! < h.end);
    if (covered) continue;
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      request: { name: m[1], source: m[2] },
    });
  }

  if (hits.length === 0) return [{ kind: 'text', content }];

  hits.sort((a, b) => a.start - b.start);
  // Deduplicate same-name+source repeats — acquire_capability summaries
  // sometimes mention the install call twice (body + recommendation).
  // Two identical install cards is noise.
  const seen = new Set<string>();
  const dedupedHits = hits.filter(h => {
    const key = `${h.request.source}::${h.request.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const segments: Segment[] = [];
  let cursor = 0;
  for (const h of dedupedHits) {
    if (h.start > cursor) {
      segments.push({ kind: 'text', content: content.slice(cursor, h.start) });
    }
    segments.push({ kind: 'capability', request: h.request });
    cursor = h.end;
  }
  if (cursor < content.length) {
    segments.push({ kind: 'text', content: content.slice(cursor) });
  }
  return segments;
}
