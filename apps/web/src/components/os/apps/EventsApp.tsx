import { useState, useMemo } from 'react';
import { Activity, Loader2, CheckCircle2, XCircle, Zap, MessageSquare, Clock, ChevronRight, StopCircle, GitBranch, Circle } from 'lucide-react';
import type { AgentStep } from '@/lib/types';
import { decodeHtmlEntities } from '@/lib/decode-entities';
import { HintTooltip } from '@/components/ui/hint-tooltip';

const stepIcons: Record<string, React.ElementType> = {
  think: Activity,
  tool_call: Zap,
  tool_result: CheckCircle2,
  response: MessageSquare,
  error: XCircle,
  spawn: GitBranch,
};

// FR #19: defensive formatters for partially-populated event payloads.
// Some emitters drop type/description/timestamp on the floor; without
// these guards the UI renders the literal string "undefined" and
// "Invalid Date".
function formatType(type: string | null | undefined): string {
  if (!type || typeof type !== 'string') return 'unknown';
  return type.replace(/_/g, ' ');
}

function formatTimestamp(ts: string | number | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return 'just now';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 'just now' : d.toLocaleTimeString();
}

function formatDescription(
  description: string | null | undefined,
  type: string | null | undefined,
): string {
  if (description && typeof description === 'string' && description !== 'undefined') {
    return decodeHtmlEntities(description);
  }
  return type ? `${formatType(type)} event` : 'Unknown event';
}

const stepColors: Record<string, string> = {
  running: 'text-primary border-primary/30',
  complete: 'text-emerald-400 border-emerald-400/30',
  error: 'text-destructive border-destructive/30',
};

interface EventsAppProps {
  steps: AgentStep[];
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  filter: string | null;
  onFilterChange: (f: string | null) => void;
  onAbort?: () => void;
}

const StepCard = ({ step, onAbort }: { step: AgentStep; onAbort?: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = stepIcons[step.type] || Activity;
  const color = stepColors[step.status] || 'text-muted-foreground border-border/30';

  return (
    <div className={`rounded-lg border ${color} bg-secondary/20 overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 p-2 text-left"
      >
        <div className="mt-0.5">
          {step.status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Icon className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground">{formatDescription(step.description, step.type)}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
            <span className="capitalize">{formatType(step.type)}</span>
            {step.duration && <span>{step.duration}ms</span>}
            <span>{formatTimestamp(step.timestamp)}</span>
          </div>
        </div>
        {step.status === 'running' && onAbort && (
          <HintTooltip content="Cancel execution">
            <button
              onClick={(e) => { e.stopPropagation(); onAbort(); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-destructive/20 text-destructive text-[11px] font-display hover:bg-destructive/30 transition-colors shrink-0"
            >
              <StopCircle className="w-3 h-3" /> Cancel
            </button>
          </HintTooltip>
        )}
        {step.details && (
          <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {expanded && step.details && (
        <div className="px-3 pb-2 pt-0">
          <pre className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 overflow-x-auto max-h-32">
            {JSON.stringify(step.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/* ── Agent Tree types & helpers ── */
interface AgentNode {
  id: string;
  name: string;
  status: 'running' | 'complete' | 'error';
  persona?: string;
  model?: string;
  task?: string;
  timestamp: string;
  children: AgentNode[];
  stepCount: number;
}

function buildAgentTree(steps: AgentStep[]): AgentNode[] {
  const nodeMap = new Map<string, AgentNode>();
  const childToParent = new Map<string, string>();

  // Root agent always exists if there are steps
  const rootId = 'root-agent';
  const rootNode: AgentNode = {
    id: rootId,
    name: 'Primary Agent',
    status: 'running',
    timestamp: steps[0]?.timestamp || new Date().toISOString(),
    children: [],
    stepCount: 0,
  };
  nodeMap.set(rootId, rootNode);

  for (const step of steps) {
    // Count steps for root unless assigned to a child
    const agentId = (step.details?.agentId as string) || rootId;

    if (step.type === 'spawn') {
      const childId = (step.details?.childAgentId as string) || (step.details?.workspaceId as string) || `spawn-${step.id}`;
      const parentId = (step.details?.parentAgentId as string) || agentId;
      const childNode: AgentNode = {
        id: childId,
        name: (step.details?.workspaceName as string) || (step.details?.persona as string) || step.description || `Sub-agent`,
        status: step.status,
        persona: step.details?.persona as string,
        model: step.details?.model as string,
        task: step.details?.task as string || step.description,
        timestamp: step.timestamp,
        children: [],
        stepCount: 0,
      };
      nodeMap.set(childId, childNode);
      childToParent.set(childId, parentId);
    }

    // Increment step count for the relevant agent
    const ownerNode = nodeMap.get(agentId);
    if (ownerNode) {
      ownerNode.stepCount++;
      // Update status to the latest
      if (step.status === 'error') ownerNode.status = 'error';
      else if (step.status === 'complete' && ownerNode.status !== 'error') ownerNode.status = 'complete';
    } else {
      rootNode.stepCount++;
    }
  }

  // If no spawns, mark root based on steps
  const hasRunning = steps.some(s => s.status === 'running');
  const hasError = steps.some(s => s.status === 'error');
  if (hasError) rootNode.status = 'error';
  else if (!hasRunning && steps.length > 0) rootNode.status = 'complete';

  // Wire children to parents
  for (const [childId, parentId] of childToParent) {
    const parent = nodeMap.get(parentId) || rootNode;
    const child = nodeMap.get(childId);
    if (child) parent.children.push(child);
  }

  return [rootNode];
}

const statusDotColor: Record<string, string> = {
  running: 'bg-primary animate-pulse',
  complete: 'bg-emerald-400',
  error: 'bg-destructive',
};

const TreeNode = ({ node, depth = 0 }: { node: AgentNode; depth?: number }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/30 transition-colors text-left group ${
          depth === 0 ? '' : ''
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Tree connector line */}
        {depth > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="w-3 h-px bg-border/50" />
          </div>
        )}

        {/* Expand/collapse */}
        {hasChildren ? (
          <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        ) : (
          <Circle className="w-2 h-2 text-muted-foreground/30 shrink-0" />
        )}

        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor[node.status] || 'bg-muted-foreground'}`} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-display font-medium text-foreground truncate">{node.name}</span>
            {node.persona && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">{node.persona}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            {node.model && <span>{node.model}</span>}
            <span>{node.stepCount} steps</span>
            <span>{formatTimestamp(node.timestamp)}</span>
          </div>
          {node.task && depth > 0 && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{node.task}</p>
          )}
        </div>

        {/* Status badge */}
        <span className={`text-[11px] capitalize shrink-0 ${
          node.status === 'running' ? 'text-primary' : node.status === 'error' ? 'text-destructive' : 'text-emerald-400'
        }`}>
          {node.status}
        </span>
      </button>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="relative">
          {/* Vertical connector line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-border/30"
            style={{ left: `${depth * 20 + 22}px` }}
          />
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const AgentTreeView = ({ steps }: { steps: AgentStep[] }) => {
  const tree = useMemo(() => buildAgentTree(steps), [steps]);
  const spawnCount = steps.filter(s => s.type === 'spawn').length;

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <GitBranch className="w-10 h-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">No agent activity</p>
        <p className="text-xs text-muted-foreground/60">Agent tree will appear when agents are running</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-3 px-2">
        <GitBranch className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-display text-muted-foreground uppercase">
          Agent Hierarchy
        </span>
        <span className="text-[11px] text-muted-foreground">
          · {spawnCount} spawn{spawnCount !== 1 ? 's' : ''}
        </span>
      </div>
      {tree.map(node => (
        <TreeNode key={node.id} node={node} />
      ))}
    </div>
  );
};

/* ── Main Events App ── */
const EventsApp = ({ steps, autoScroll, onToggleAutoScroll, filter, onFilterChange, onAbort }: EventsAppProps) => {
  const [tab, setTab] = useState<'live' | 'tree' | 'replay'>('live');
  const types = ['think', 'tool_call', 'tool_result', 'response', 'error', 'spawn'];

  const filteredSteps = filter ? steps.filter(s => s.type === filter) : steps;

  // Group steps by session/time for replay
  const stepsByTime = steps.reduce<Record<string, AgentStep[]>>((acc, step) => {
    // FR #19: events without a parseable timestamp would otherwise group
    // under the literal "Invalid Date" key. Bucket them under "Earlier"
    // so the day-grouped replay panel still reads cleanly.
    const d = step.timestamp ? new Date(step.timestamp) : null;
    const timeKey = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : 'Earlier';
    if (!acc[timeKey]) acc[timeKey] = [];
    acc[timeKey].push(step);
    return acc;
  }, {});

  return (
    <div className="flex h-full">
      {/* Filters */}
      <div className="w-36 border-r border-border/50 p-2 space-y-1 shrink-0">
        {/* Tabs */}
        <div className="flex gap-0.5 mb-3 p-0.5 rounded-lg bg-muted/50">
          {(['live', 'tree', 'replay'] as const).map(t => (
            <HintTooltip
              key={t}
              content={
                t === 'live' ? 'Stream of every think/tool call/response as the agent runs right now' :
                t === 'tree' ? 'Hierarchical view showing how sub-agents spawned from each turn' :
                'Group past runs by day — inspect or re-open a prior session\'s full trace'
              }
            >
              <button
                onClick={() => setTab(t)}
                className={`flex-1 text-[11px] py-1 rounded font-display transition-colors capitalize ${
                  tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {t}
              </button>
            </HintTooltip>
          ))}
        </div>

        {tab !== 'tree' && (
          <>
            <p className="text-[11px] font-display text-muted-foreground uppercase mb-2">Filter by type</p>
            <button
              onClick={() => onFilterChange(null)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                !filter ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >All events</button>
            {types.map(t => (
              <button
                key={t}
                onClick={() => onFilterChange(t)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors capitalize ${
                  filter === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{t.replace('_', ' ')}</button>
            ))}
            <div className="pt-2 mt-2 border-t border-border/30">
              <button
                onClick={onToggleAutoScroll}
                className={`w-full text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  autoScroll ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
                }`}
              >Auto-scroll {autoScroll ? 'ON' : 'OFF'}</button>
            </div>
          </>
        )}

        {tab === 'tree' && (
          <div className="space-y-2">
            <p className="text-[11px] font-display text-muted-foreground uppercase">Legend</p>
            <div className="space-y-1.5">
              {[
                { color: 'bg-primary', label: 'Running' },
                { color: 'bg-emerald-400', label: 'Complete' },
                { color: 'bg-destructive', label: 'Error' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${l.color}`} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {onAbort && steps.some(s => s.status === 'running') && (
          <div className="pt-2 mt-2 border-t border-border/30">
            <button
              onClick={onAbort}
              className="w-full flex items-center justify-center gap-1.5 text-xs px-2 py-2 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors font-display"
            >
              <StopCircle className="w-3.5 h-3.5" /> Abort Agent
            </button>
          </div>
        )}
        <div className="pt-2 mt-2 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground">{steps.length} events</p>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {tab === 'tree' ? (
          <AgentTreeView steps={steps} />
        ) : tab === 'live' ? (
          <>
            {filteredSteps.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No events yet</p>
                <p className="text-xs text-muted-foreground/60">Events will appear here as the agent executes</p>
              </div>
            )}
            {filteredSteps.map(step => <StepCard key={step.id} step={step} onAbort={onAbort} />)}
          </>
        ) : (
          <>
            {Object.keys(stepsByTime).length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No events yet</p>
              </div>
            )}
            {Object.entries(stepsByTime).map(([date, dateSteps]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px] font-display text-muted-foreground">{date}</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
                {dateSteps.map(step => <StepCard key={step.id} step={step} />)}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default EventsApp;
