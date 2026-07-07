import type { ReactNode } from 'react';
import type { ContentBlock, StepContentBlock } from '@/lib/types';
import TextBlock from './TextBlock';
import ToolUseBlock from './ToolUseBlock';
import ModelSwitchBlock from './ModelSwitchBlock';
import ArtifactBlock, { isArtifactBlock } from './ArtifactBlock';
import ErrorBlock from './ErrorBlock';
import { ActivityStream, type ActivityStep } from '../../warm';
import { frameSourceLabel } from '@/lib/frame-source';

interface BlockRendererProps {
  blocks: ContentBlock[];
  isStreaming?: boolean;
  /** F4: re-issue the last failed turn (threaded to error blocks). */
  onRetry?: () => void;
}

function getBlockKey(block: ContentBlock, index: number): string {
  if (block.type === 'tool_use') return block.id;
  if ('blockId' in block && block.blockId) return block.blockId;
  return `${block.type}-${index}`;
}

/**
 * Group ALL "thinking" steps of a turn into one collapsible Activity card —
 * the design's "the magic" surface (SCREENS §02). Default-open on the active
 * (streaming) turn; collapsed on prior turns (history loads with
 * isStreaming=false). Memory-recall steps carry provenance (PR3.5): the
 * distinct sources of what was recalled, composed into a ⬡ pill via the FE
 * label map. Non-memory steps stay provenance-less by design — never a
 * fabricated source.
 *
 * F11: steps that are split by a non-step block (e.g. the auto-recall tool_use
 * between the "Recalling…" and "Recalled N…" steps) must still yield exactly
 * ONE card per turn — see the single-group anchoring in BlockRenderer below.
 */
function renderStepGroup(steps: StepContentBlock[], key: string, isStreaming: boolean): ReactNode {
  const anyRunning = steps.some(s => s.status === 'running');
  const activitySteps: ActivityStep[] = steps.map(s => {
    const sourceLabels = (s.provenance?.sources ?? [])
      .map(frameSourceLabel)
      .filter((l): l is string => !!l);
    // A memory-recall step carries provenance; on the ACTIVE turn it blooms honey
    // as it lands (Pillar 3.2 "it remembered" moment). Off the active turn (history
    // reload / a re-expanded prior card) it renders plain — the bloom is a
    // just-happened signal, never a replay.
    const isRecall = sourceLabels.length > 0;
    return {
      tone: s.status === 'running' ? 'honey' : 'intel',
      text: s.description,
      ...(isRecall
        ? { provenance: { source: sourceLabels.join(' · ') }, bloom: isStreaming }
        : {}),
    };
  });
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

const BlockRenderer = ({ blocks, isStreaming, onRetry }: BlockRendererProps) => {
  const out: ReactNode[] = [];
  // F11: one Activity card per turn. Collect every step of the turn and render
  // the single group at the FIRST step's position; skip the rest. Non-step
  // blocks (tool rows, artifacts, text, model_switch, error) keep their order,
  // so a tool_use between two steps no longer splits the run into two cards.
  const allSteps = blocks.filter((b): b is StepContentBlock => b.type === 'step');
  const firstStepIdx = blocks.findIndex(b => b.type === 'step');

  blocks.forEach((block, i) => {
    if (block.type === 'step') {
      if (i === firstStepIdx) out.push(renderStepGroup(allSteps, 'activity', !!isStreaming));
      return;
    }
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
        out.push(<ErrorBlock key={key} block={block} onRetry={onRetry} />);
        break;
      default:
        break;
    }
  });

  return <>{out}</>;
};

export default BlockRenderer;
