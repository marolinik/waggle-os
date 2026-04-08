import type { ContentBlock } from '@/lib/types';
import TextBlock from './TextBlock';
import StepBlock from './StepBlock';
import ToolUseBlock from './ToolUseBlock';
import ModelSwitchBlock from './ModelSwitchBlock';

interface BlockRendererProps {
  blocks: ContentBlock[];
  isStreaming?: boolean;
}

const BlockRenderer = ({ blocks, isStreaming }: BlockRendererProps) => {
  return (
    <>
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        switch (block.type) {
          case 'text':
            return <TextBlock key={i} block={block} isStreaming={isStreaming && isLast} />;
          case 'step':
            return <StepBlock key={i} block={block} />;
          case 'tool_use':
            return <ToolUseBlock key={i} block={block} />;
          case 'model_switch':
            return <ModelSwitchBlock key={i} block={block} />;
          case 'error':
            return (
              <div key={i} className="flex items-center gap-2 py-1 text-[11px] text-destructive">
                <span>&#x26A0;&#xFE0F; {block.message}</span>
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
};

export default BlockRenderer;
