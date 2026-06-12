import { memo, useMemo, Fragment } from 'react';
import type { TextContentBlock } from '@/lib/types';
import CapabilityRequestCard from './CapabilityRequestCard';
import { segmentText } from './capability-request-parser';
import { renderChatMarkdown } from '@/lib/render-markdown';

interface TextBlockProps {
  block: TextContentBlock;
  isStreaming?: boolean;
}

const TextBlock = memo(({ block, isStreaming }: TextBlockProps) => {
  const segments = useMemo(() => segmentText(block.content ?? ''), [block.content]);

  if (!block.content && !isStreaming) return null;

  // Streaming cursor + bouncing-dot loader behaviour preserved from the
  // original implementation. We attach the blinking cursor to the last
  // text segment so the visual flow doesn't break when capability cards
  // are interleaved with text.
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
                tag (S04-hardened pattern) — headings/bold/lists render like
                every other chat product instead of literal #/** noise. */}
            {seg.content && (
              <span dangerouslySetInnerHTML={{ __html: renderChatMarkdown(seg.content) }} />
            )}
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
