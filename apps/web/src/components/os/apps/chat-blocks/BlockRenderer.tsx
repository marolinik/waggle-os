import type { ReactNode } from 'react';
import type { ContentBlock, StepContentBlock } from '@/lib/types';
import TextBlock from './TextBlock';
import ToolUseBlock from './ToolUseBlock';
import ModelSwitchBlock from './ModelSwitchBlock';
import ArtifactBlock, { isArtifactBlock } from './ArtifactBlock';
import { ActivityStream, type ActivityStep } from '../../warm';

interface BlockRendererProps {
  blocks: ContentBlock[];
  isStreaming?: boolean;
}

function getBlockKey(block: ContentBlock, index: number): string {
  if (block.type === 'tool_use') return block.id;
  if ('blockId' in block && block.blockId) return block.blockId;
  return `${block.type}-${index}`;
}

/**
 * Group a consecutive run of "thinking" steps into one collapsible Activity
 * card — the design's "the magic" surface (SCREENS §02). Default-open on the
 * active (streaming) turn; collapsed on prior turns (history loads with
 * isStreaming=false). Provenance pills are intentionally omitted: the SSE
 * `step` payload carries no structured source field today (recon chat.md §4) —
 * we render the affordance, never fabricated provenance.
 */
function renderStepGroup(steps: StepContentBlock[], key: string, isStreaming: boolean): ReactNode {
  const anyRunning = steps.some(s => s.status === 'running');
  const activitySteps: ActivityStep[] = steps.map(s => ({
    tone: s.status === 'running' ? 'honey' : 'intel',
    text: s.description,
  }));
  return (
    <ActivityStream
      key={key}
      summary={anyRunning ? 'Working across your memory, web & files' : 'Worked across your memory, web & files'}
      steps={activitySteps}
      defaultOpen={isStreaming || anyRunning}
      className="my-1.5"
    />
  );
}

const BlockRenderer = ({ blocks, isStreaming }: BlockRendererProps) => {
  const out: ReactNode[] = [];
  let stepRun: StepContentBlock[] = [];
  let stepRunStart = 0;

  const flushSteps = () => {
    if (stepRun.length === 0) return;
    out.push(renderStepGroup(stepRun, `steps-${stepRunStart}`, !!isStreaming));
    stepRun = [];
  };

  blocks.forEach((block, i) => {
    if (block.type === 'step') {
      if (stepRun.length === 0) stepRunStart = i;
      stepRun.push(block);
      return;
    }
    // Any non-step block ends the current activity run.
    flushSteps();
    const key = getBlockKey(block, i);
    const isLast = i === blocks.length - 1;
    switch (block.type) {
      case 'text':
        out.push(<TextBlock key={key} block={block} isStreaming={isStreaming && isLast} />);
        break;
      case 'tool_use':
        // C2: a completed file-write IS the deliverable — render an openable
        // artifact card; in-flight/failed calls keep the generic tool row.
        out.push(
          isArtifactBlock(block)
            ? <ArtifactBlock key={key} block={block} />
            : <ToolUseBlock key={key} block={block} />,
        );
        break;
      case 'model_switch':
        out.push(<ModelSwitchBlock key={key} block={block} />);
        break;
      case 'error':
        out.push(
          <div key={key} className="flex items-center gap-2 py-1 text-[11px] text-[var(--risk)]">
            <span>&#x26A0;&#xFE0F; {block.message}</span>
          </div>,
        );
        break;
      default:
        break;
    }
  });
  flushSteps();

  return <>{out}</>;
};

export default BlockRenderer;
