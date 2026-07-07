import { memo, useMemo, Fragment } from 'react';
import type { TextContentBlock } from '@/lib/types';
import CapabilityRequestCard from './CapabilityRequestCard';
import { segmentText } from './capability-request-parser';
import { renderChatMarkdown } from '@/lib/render-markdown';
import { useStreamCadence } from '@/hooks/useStreamCadence';

interface TextBlockProps {
  block: TextContentBlock;
  isStreaming?: boolean;
}

const TextBlock = memo(({ block, isStreaming }: TextBlockProps) => {
  const raw = block.content ?? '';
  // Pillar 3.1 cadence buffer: smooth the accreting raw stream into a steady
  // per-character reveal (`shown`) with a honey caret at the head. Zero added
  // first-token latency — `raw` already holds every delivered chunk; this only
  // paces the paint. Settled/history turns + reduced-motion snap to whole text.
  const { shown, caretVisible } = useStreamCadence(raw, !!isStreaming);
  const segments = useMemo(() => segmentText(shown), [shown]);

  if (!raw && !isStreaming) return null;

  // Streaming caret + bouncing-dot loader behaviour preserved from the original
  // implementation. We attach the caret to the last text segment so the visual
  // flow doesn't break when capability cards are interleaved with text.
  let cursorAttached = false;

  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.kind === 'capability') {
          return <CapabilityRequestCard key={`cap-${i}`} request={seg.request} />;
        }
        const isLastTextSegment = !cursorAttached && i === segments.length - 1;
        cursorAttached = cursorAttached || isLastTextSegment;
        return (
          <Fragment key={`txt-${i}`}>
            {/* renderChatMarkdown escapes the full input before emitting any
                tag (S04-hardened pattern) — partial markdown crossing the reveal
                head forms as escaped text, never raw noise. */}
            {seg.content && (
              <span dangerouslySetInnerHTML={{ __html: renderChatMarkdown(seg.content) }} />
            )}
            {caretVisible && isLastTextSegment && seg.content && (
              <span
                aria-hidden
                className="stream-caret inline-block w-0.5 h-4 bg-[var(--honey-text)] ml-0.5 align-text-bottom"
              />
            )}
          </Fragment>
        );
      })}
      {isStreaming && !shown && (
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
