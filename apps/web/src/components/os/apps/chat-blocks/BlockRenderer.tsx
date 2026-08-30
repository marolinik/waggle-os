import { useId, useState, type ReactNode } from 'react';
import type {
  ContentBlock,
  StepContentBlock,
  ToolContextContentBlock,
  ToolUseContentBlock,
} from '@/lib/types';
import TextBlock from './TextBlock';
import ToolUseBlock from './ToolUseBlock';
import ModelSwitchBlock from './ModelSwitchBlock';
import ArtifactBlock, { isArtifactBlock } from './ArtifactBlock';
import ErrorBlock from './ErrorBlock';
import RouteProposalCard from './RouteProposalCard';
import CapabilityRequestCard, { type CapabilityRequest } from './CapabilityRequestCard';
import { segmentText } from './capability-request-parser';
import type { RouteProposalConfirmResponse } from '@/lib/route-proposals';
import { ActivityStream, type ActivityStep } from '../../warm';
import { frameSourceLabel } from '@/lib/frame-source';

interface BlockRendererProps {
  blocks: ContentBlock[];
  isStreaming?: boolean;
  workspaceId?: string | null;
  sessionId?: string | null;
  /** F4: re-issue the last failed turn (threaded to error blocks). */
  onRetry?: () => void;
  /** Router arc B2: a route_proposal dispatch landed (ChatApp consumes the composer text). */
  onRouteProposalDispatched?: (blockId: string, result: RouteProposalConfirmResponse) => void;
  /** Router arc B2: re-run propose after a revalidation_failed confirm. */
  onRouteProposalRePropose?: (blockId: string, preferredExecutorId?: string) => void;
}

function getBlockKey(block: ContentBlock, index: number): string {
  if (block.type === 'tool_use') return block.id;
  if ('blockId' in block && block.blockId) return block.blockId;
  return `${block.type}-${index}`;
}

function trustedCapabilityProposals(blocks: ContentBlock[]): Map<string, CapabilityRequest> {
  const trusted = new Map<string, CapabilityRequest>();
  for (const block of blocks) {
    if (
      block.type !== 'tool_use'
      || block.name !== 'acquire_capability'
      || block.status !== 'done'
      || typeof block.result !== 'string'
    ) continue;

    const segments = segmentText(block.result.trim());
    const finalSegment = segments.at(-1);
    const finalProposal = finalSegment?.kind === 'capability' ? finalSegment : null;
    if (!finalProposal) continue;

    const { request } = finalProposal;
    const supportedRoute = (request.source === 'starter-pack' && request.kind === 'skill')
      || (request.source === 'marketplace' && request.kind === 'marketplace');
    if (supportedRoute) trusted.set(block.id, request);
  }
  return trusted;
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
function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function skillName(block: ToolUseContentBlock): string | null {
  const raw = block.input?.name ?? block.input?.skillName;
  return typeof raw === 'string' && raw.trim()
    ? raw.trim().replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
    : null;
}

function toolActionLabel(block: ToolUseContentBlock): string {
  if (block.name === 'read_skill') {
    const name = skillName(block);
    const suffix = name ? ` ${name} skill` : ' skill guidance';
    if (block.status === 'running') return `Opening${suffix}`;
    if (block.status === 'done') return `Opened${suffix}`;
    return `Couldn't open${suffix}`;
  }
  if (block.name === 'search_skills') {
    if (block.status === 'running') return 'Searching skills';
    if (block.status === 'done') return 'Searched skills';
    return "Couldn't search skills";
  }
  return formatToolName(block.name);
}

function ToolActivityDetails({
  block,
  prelude,
}: {
  block: ToolUseContentBlock;
  prelude?: string;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const status = block.status === 'running'
    ? 'Running'
    : block.status === 'done'
      ? 'Completed'
      : block.status === 'denied'
        ? 'Denied'
        : 'Failed';
  const hasDetails = !!block.input || typeof block.result === 'string';
  return (
    <span className="block min-w-0">
      <button
        type="button"
        aria-expanded={hasDetails ? open : undefined}
        aria-controls={hasDetails ? contentId : undefined}
        disabled={!hasDetails}
        onClick={() => hasDetails && setOpen(value => !value)}
        className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default"
      >
        <span className="font-medium text-[var(--text-2)]">{prelude ?? toolActionLabel(block)}</span>
        {prelude && <span className="text-xs text-[var(--text-dim)]">{toolActionLabel(block)}</span>}
        {block.name !== 'read_skill' && block.name !== 'search_skills' && (
          <span className="text-xs text-[var(--text-dim)]">{status}</span>
        )}
        {block.duration != null && <span className="text-xs text-[var(--text-dim)]">{block.duration}ms</span>}
      </button>
      {open && hasDetails && (
        <span id={contentId} className="mt-1.5 block space-y-1 text-xs text-[var(--text-dim)]">
          {block.input && (
            <code className="block max-h-24 overflow-auto rounded bg-[var(--bg-1)] p-1.5 whitespace-pre-wrap">
              {JSON.stringify(block.input, null, 2).slice(0, 1000)}
            </code>
          )}
          {typeof block.result === 'string' && (
            <code className="block max-h-32 overflow-auto rounded bg-[var(--bg-1)] p-1.5 whitespace-pre-wrap">
              {block.result.slice(0, 2000)}
            </code>
          )}
        </span>
      )}
    </span>
  );
}

function ContextEfficiencyDetails({ block }: { block: ToolContextContentBlock }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const { metrics } = block;
  const timing = [
    `selector ${metrics.selectorLatencyMs}ms`,
    metrics.timeToFirstTokenMs === null ? null : `first token ${metrics.timeToFirstTokenMs}ms`,
    `total ${metrics.totalServerLatencyMs}ms`,
  ].filter(Boolean).join(' · ');
  return (
    <span className="block min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(value => !value)}
        className="text-left text-[var(--text-2)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        Context efficiency
      </button>
      {open && (
        <span id={contentId} className="mt-1.5 block space-y-0.5 text-xs text-[var(--text-dim)]">
          <span className="block">
          Prepared {metrics.toolSelectedCount} of {metrics.toolEligibleCount} eligible tools ·{' '}
          {metrics.toolOmittedCount} kept out of model context
          </span>
          <span className="block">
          {metrics.packageMode === 'compact' ? 'Compact' : metrics.packageMode === 'full' ? 'Full' : 'Custom'} prompt package ·{' '}
          ~{metrics.estimatedToolSchemaTokens.toLocaleString()} tool-schema tokens
          </span>
          <span className="block">{timing}</span>
        </span>
      )}
    </span>
  );
}

function renderActivityGroup(blocks: ContentBlock[], key: string, isStreaming: boolean): ReactNode {
  const steps = blocks.filter((block): block is StepContentBlock => block.type === 'step');
  const context = blocks.find((block): block is ToolContextContentBlock => block.type === 'tool_context');
  const toolBlocks = blocks.filter((block): block is ToolUseContentBlock => (
    block.type === 'tool_use' && block.name !== 'auto_recall' && !isArtifactBlock(block)
  ));
  const autoRecall = blocks.find((block): block is ToolUseContentBlock => (
    block.type === 'tool_use' && block.name === 'auto_recall'
  ));
  const hasMemoryProvenance = steps.some(step => (step.provenance?.sources.length ?? 0) > 0);
  const recallFailed = autoRecall?.status === 'error';
  const recallDenied = autoRecall?.status === 'denied';
  const recallRunning = autoRecall?.status === 'running';
  const recallChecked = autoRecall?.status === 'done' && !hasMemoryProvenance;
  const anyRunning = steps.some(step => step.status === 'running')
    || toolBlocks.some(tool => tool.status === 'running')
    || recallRunning;
  const executionTools = blocks.filter((block): block is ToolUseContentBlock => (
    block.type === 'tool_use' && block.name !== 'auto_recall' && block.status !== 'denied'
  ));
  const failedTools = executionTools.filter(tool => tool.status === 'error').length;
  const deniedTools = toolBlocks.filter(tool => tool.status === 'denied').length;
  const preludeByToolId = new Map<string, string>();
  const mergedStepIds = new Set<string>();
  for (let i = 0; i < blocks.length - 1; i++) {
    const step = blocks[i];
    const next = blocks[i + 1];
    if (
      step?.type === 'step'
      && next?.type === 'tool_use'
      && next.name !== 'auto_recall'
      && !isArtifactBlock(next)
    ) {
      preludeByToolId.set(next.id, step.description);
      mergedStepIds.add(step.blockId);
    }
  }

  const activityStepFrom = (step: StepContentBlock): ActivityStep => {
    const sourceLabels = (step.provenance?.sources ?? [])
      .map(frameSourceLabel)
      .filter((l): l is string => !!l);
    // A memory-recall step carries provenance; on the ACTIVE turn it blooms honey
    // as it lands (Pillar 3.2 "it remembered" moment). Off the active turn (history
    // reload / a re-expanded prior card) it renders plain — the bloom is a
    // just-happened signal, never a replay.
    const isRecall = sourceLabels.length > 0;
    return {
      tone: step.status === 'running' ? 'honey' : 'intel',
      text: step.description,
      ...(isRecall
        ? { provenance: { source: sourceLabels.join(' · ') }, bloom: isStreaming }
        : {}),
    };
  };

  const activitySteps: ActivityStep[] = [];
  for (const block of blocks) {
    if (block.type === 'step' && !mergedStepIds.has(block.blockId)) {
      activitySteps.push(activityStepFrom(block));
    } else if (block.type === 'tool_use' && block.name === 'auto_recall' && !hasMemoryProvenance) {
      const noRelevantMemory = block.status === 'done'
        && /no relevant memor|nothing relevant|0 memor/i.test(block.result ?? '');
      activitySteps.push({
        tone: block.status === 'running' ? 'honey' : block.status === 'done' ? 'neutral' : 'risk',
        text: block.status === 'running'
          ? 'Checking saved memory'
          : block.status === 'done'
            ? `Checked saved memory${noRelevantMemory ? ' · nothing relevant found' : ''}`
            : block.status === 'denied'
              ? 'Memory check was denied'
              : "Couldn't check saved memory",
      });
    } else if (block.type === 'tool_use' && block.name !== 'auto_recall' && !isArtifactBlock(block)) {
      activitySteps.push({
        tone: block.status === 'running' ? 'honey' : block.status === 'done' ? 'healthy' : 'risk',
        text: <ToolActivityDetails block={block} prelude={preludeByToolId.get(block.id)} />,
      });
    }
  }
  if (context && activitySteps.length > 0) {
    const lastIndex = activitySteps.length - 1;
    const last = activitySteps[lastIndex]!;
    activitySteps[lastIndex] = {
      ...last,
      text: (
        <span className="block">
          <span className="block">{last.text}</span>
          <span className="mt-2 block"><ContextEfficiencyDetails block={context} /></span>
        </span>
      ),
    };
  }

  let summary = 'Activity';
  if (anyRunning) {
    const details = [recallRunning ? 'checking saved memory' : hasMemoryProvenance ? 'saved memory' : null, executionTools.length > 0
      ? `${executionTools.length} tool${executionTools.length === 1 ? '' : 's'}`
      : null].filter(Boolean).join(' · ');
    summary = details ? `Working · ${details}` : 'Working';
  } else {
    const memorySummary = hasMemoryProvenance
      ? 'Used saved memory'
      : recallDenied
        ? 'Memory check denied'
        : recallFailed
          ? 'Memory check failed'
          : recallChecked
            ? 'Checked saved memory'
            : null;
    let toolSummary = executionTools.length > 0
      ? failedTools === executionTools.length
      ? `${failedTools} tool${failedTools === 1 ? '' : 's'} failed`
        : `${failedTools > 0 ? 'Ran' : 'Used'} ${executionTools.length} tool${executionTools.length === 1 ? '' : 's'}${failedTools > 0 ? ` · ${failedTools} failed` : ''}`
      : deniedTools > 0
        ? `${deniedTools} tool${deniedTools === 1 ? '' : 's'} denied`
        : null;
    if (toolSummary && executionTools.length > 0 && deniedTools > 0) {
      toolSummary += ` · ${deniedTools} denied`;
    }
    if (memorySummary === 'Used saved memory' && toolSummary?.startsWith('Used ')) {
      summary = `${memorySummary} + ${toolSummary.slice('Used '.length)}`;
    } else {
      summary = [memorySummary, toolSummary].filter(Boolean).join(' · ') || 'Activity';
    }
  }

  return (
    <ActivityStream
      key={key}
      summary={summary}
      steps={activitySteps}
      defaultOpen={isStreaming || anyRunning}
      className="my-1.5"
    />
  );
}

const BlockRenderer = ({
  blocks, isStreaming, workspaceId, sessionId, onRetry,
  onRouteProposalDispatched, onRouteProposalRePropose,
}: BlockRendererProps) => {
  const out: ReactNode[] = [];
  const capabilityProposals = trustedCapabilityProposals(blocks);
  const hasVisibleActivity = blocks.some(block => (
    block.type === 'step'
    || (block.type === 'tool_use' && !isArtifactBlock(block))
  ));
  const firstActivityIdx = hasVisibleActivity
    ? blocks.findIndex(block => (
        block.type === 'step'
        || (block.type === 'tool_use' && !isArtifactBlock(block))
      ))
    : -1;

  blocks.forEach((block, i) => {
    if (block.type === 'tool_context' && !hasVisibleActivity) {
      out.push(
        <div key={block.blockId} className="my-1.5 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-2)] px-3 py-2 text-[13px]">
          <ContextEfficiencyDetails block={block} />
        </div>,
      );
      return;
    }
    const belongsToActivity = block.type === 'step'
      || block.type === 'tool_context'
      || (block.type === 'tool_use' && !isArtifactBlock(block));
    if (belongsToActivity) {
      if (i === firstActivityIdx) out.push(renderActivityGroup(blocks, 'activity', !!isStreaming));
      if (block.type === 'tool_use') {
        const capabilityProposal = capabilityProposals.get(block.id);
        if (capabilityProposal) {
          out.push(
            <CapabilityRequestCard
              key={`${getBlockKey(block, i)}-capability`}
              request={capabilityProposal}
              workspaceId={workspaceId}
              sessionId={sessionId}
            />,
          );
        }
      }
      return;
    }
    const key = getBlockKey(block, i);
    const isLast = i === blocks.length - 1;
    switch (block.type) {
      case 'text':
        out.push(<TextBlock key={key} block={block} isStreaming={isStreaming && isLast} />);
        break;
      case 'tool_use': {
        // C2: a completed file-write IS the deliverable — render an openable
        // artifact card; in-flight/failed calls keep the generic tool row.
        out.push(
          isArtifactBlock(block)
            ? <ArtifactBlock key={key} block={block} />
            : <ToolUseBlock key={key} block={block} />,
        );
        break;
      }
      case 'model_switch':
        out.push(<ModelSwitchBlock key={key} block={block} />);
        break;
      case 'error':
        out.push(<ErrorBlock key={key} block={block} onRetry={onRetry} />);
        break;
      case 'route_proposal':
        // Router arc B2: composer-injected "Where should this run?" card.
        out.push(
          <RouteProposalCard
            key={key}
            proposal={block.proposal}
            onDispatched={onRouteProposalDispatched
              ? result => onRouteProposalDispatched(block.blockId, result)
              : undefined}
            onRePropose={onRouteProposalRePropose
              ? (preferredExecutorId?: string) => onRouteProposalRePropose(block.blockId, preferredExecutorId)
              : undefined}
          />,
        );
        break;
      default:
        break;
    }
  });

  return <>{out}</>;
};

export default BlockRenderer;
