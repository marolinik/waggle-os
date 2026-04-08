import { memo } from 'react';
import type { TextContentBlock } from '@/lib/types';

interface TextBlockProps {
  block: TextContentBlock;
  isStreaming?: boolean;
}

const TextBlock = memo(({ block, isStreaming }: TextBlockProps) => {
  if (!block.content && !isStreaming) return null;

  return (
    <span className="whitespace-pre-wrap">
      {block.content}
      {isStreaming && !block.content && (
        <span className="inline-flex gap-1 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      )}
      {isStreaming && block.content && (
        <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
      )}
    </span>
  );
});

TextBlock.displayName = 'TextBlock';
export default TextBlock;
