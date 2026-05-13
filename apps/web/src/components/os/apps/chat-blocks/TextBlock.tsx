import { memo, useMemo, Fragment } from 'react';
import type { TextContentBlock } from '@/lib/types';
import CapabilityRequestCard, { type CapabilityRequest } from './CapabilityRequestCard';

interface TextBlockProps {
  block: TextContentBlock;
  isStreaming?: boolean;
}

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

export function segmentText(content: string): Segment[] {
  if (!content.includes('capability_request') && !content.includes('install_capability')) {
    return [{ kind: 'text', content }];
  }

  // Collect both pattern matches with their absolute positions, then weave
  // them into a single ordered segment list. Doing two regex passes keeps
  // each pattern's grouping clean.
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
  // Deduplicate same-name+source repeats — `acquire_capability` summaries
  // sometimes mention the install call twice (in the body and recommendation).
  // Showing two identical install cards is noise.
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

const TextBlock = memo(({ block, isStreaming }: TextBlockProps) => {
  const segments = useMemo(() => segmentText(block.content ?? ''), [block.content]);

  if (!block.content && !isStreaming) return null;

  // Streaming cursor + bouncing-dot loader behaviour preserved from the
  // original implementation. We attach them to the last text segment so
  // the visual flow doesn't break when capability cards are interleaved.
  let cursorAttached = false;

  return (
    <div className="whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.kind === 'capability') {
          return <CapabilityRequestCard key={`cap-${i}`} request={seg.request} />;
        }
        const isLastTextSegment = !cursorAttached && i === segments.length - 1;
        cursorAttached = cursorAttached || isLastTextSegment;
        return (
          <Fragment key={`txt-${i}`}>
            {seg.content}
            {isStreaming && isLastTextSegment && seg.content && (
              <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </Fragment>
        );
      })}
      {isStreaming && !block.content && (
        <span className="inline-flex gap-1 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      )}
    </div>
  );
});

TextBlock.displayName = 'TextBlock';
export default TextBlock;
