import { memo, useMemo } from 'react';
import type { TextContentBlock } from '@/lib/types';
import { renderChatMarkdown } from '@/lib/render-markdown';
import { useStreamCadence } from '@/hooks/useStreamCadence';

const CAPABILITY_MARKER_DISPLAY_RE = /<!--\s*waggle:capability_request[\s\S]*?-->/g;

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
  const displayText = useMemo(
    () => shown.replace(CAPABILITY_MARKER_DISPLAY_RE, ''),
    [shown],
  );

  if (!raw && !isStreaming) return null;

  return (
    <div>
      {/* Assistant text is presentation data only. renderChatMarkdown escapes
          it before emitting tags; privileged controls come from tool results. */}
      {displayText && <span dangerouslySetInnerHTML={{ __html: renderChatMarkdown(displayText) }} />}
      {caretVisible && displayText && (
        <span
          aria-hidden
          className="stream-caret inline-block w-[3px] h-[1.15em] rounded-[1.5px] bg-[var(--honey-text)] ml-0.5 align-text-bottom"
        />
      )}
      {isStreaming && !shown && (
        <span className="inline-flex gap-1 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
        </span>
      )}
    </div>
  );
});

TextBlock.displayName = 'TextBlock';
export default TextBlock;
