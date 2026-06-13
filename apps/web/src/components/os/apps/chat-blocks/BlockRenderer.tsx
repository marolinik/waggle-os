import type { ContentBlock } from '@/lib/types';
import TextBlock from './TextBlock';
import StepBlock from './StepBlock';
import ToolUseBlock from './ToolUseBlock';
import ModelSwitchBlock from './ModelSwitchBlock';
import ArtifactBlock, { isArtifactBlock } from './ArtifactBlock';

interface BlockRendererProps {
  blocks: ContentBlock[];
  isStreaming?: boolean;
}

function getBlockKey(block: ContentBlock, index: number): string {
  if (block.type === 'tool_use') return block.id;
  if ('blockId' in block && block.blockId) return block.blockId;
  return `${block.type}-${index}`;
}

const BlockRenderer = ({ blocks, isStreaming }: BlockRendererProps) => {
  return (
    <>
      {blocks.map((block, i) => {
        const key = getBlockKey(block, i);
        const isLast = i === blocks.length - 1;
        switch (block.type) {
          case 'text':
            return <TextBlock key={key} block={block} isStreaming={isStreaming && isLast} />;
          case 'step':
            return <StepBlock key={key} block={block} />;
          case 'tool_use':
            // C2: a completed file-write IS the deliverable — render an
            // openable artifact card; in-flight/failed calls keep the
            // generic tool row so progress and errors stay visible.
            return isArtifactBlock(block)
              ? <ArtifactBlock key={key} block={block} />
              : <ToolUseBlock key={key} block={block} />;
          case 'model_switch':
            return <ModelSwitchBlock key={key} block={block} />;
          case 'error':
            return (
              <div key={key} className="flex items-center gap-2 py-1 text-[11px] text-destructive">
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
