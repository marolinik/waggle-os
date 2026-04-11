/**
 * RoomApp — the Room canvas from Phase A.3 of the Killer Story plan.
 *
 * Shows every running sub-agent across every workspace as a tile on a
 * canvas, so the user literally watches their team of specialists work.
 * Subscribes to `subagent_status` SSE events via useRoomState.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ Header: live count, recent count        │
 *   ├─────────────────────────────────────────┤
 *   │ Live agents (grid of tiles)             │
 *   │   [persona] Role                        │
 *   │   Task one-liner                        │
 *   │   Status dot · current tool             │
 *   │   Tools used: [badge] [badge]           │
 *   ├─────────────────────────────────────────┤
 *   │ Recently completed (collapsible)        │
 *   └─────────────────────────────────────────┘
 */

import { useMemo, useState } from 'react';
import { Users, CheckCircle2, AlertCircle, Loader2, Clock, Wrench } from 'lucide-react';
import { useRoomState, type RoomAgent } from '@/hooks/useRoomState';

interface RoomAppProps {
  /** Optional workspace filter — if set, only shows agents for that workspace. */
  workspaceId?: string;
  /** Map of workspace IDs to human-readable names. */
  workspaceNames?: Record<string, string>;
}

const STATUS_COLORS: Record<RoomAgent['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-primary',
  done: 'text-emerald-400',
  failed: 'text-destructive',
};

const STATUS_DOT_COLORS: Record<RoomAgent['status'], string> = {
  pending: 'bg-muted-foreground',
  running: 'bg-primary animate-pulse',
  done: 'bg-emerald-400',
  failed: 'bg-destructive',
};

const ROLE_COLORS: Record<string, string> = {
  researcher: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  writer: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  coder: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  analyst: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  reviewer: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  planner: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
};

function roleColor(role: string): string {
  return ROLE_COLORS[role.toLowerCase()] ?? 'bg-muted/30 text-muted-foreground border-border/30';
}

function formatElapsed(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '';
  const end = completedAt ?? Date.now();
  const seconds = Math.round((end - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function AgentTile({ agent, workspaceName }: { agent: RoomAgent; workspaceName?: string }) {
  const currentTool = agent.toolsUsed[agent.toolsUsed.length - 1];
  const elapsed = formatElapsed(agent.startedAt, agent.completedAt);

  return (
    <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 hover:border-primary/30 transition-colors min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT_COLORS[agent.status]}`} />
          <span className={`px-1.5 py-0.5 rounded text-[10px] border font-display uppercase tracking-wide ${roleColor(agent.role)}`}>
            {agent.role}
          </span>
          <span className="text-xs font-display text-foreground truncate">{agent.name}</span>
        </div>
        {elapsed && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <Clock className="w-2.5 h-2.5" />
            <span>{elapsed}</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">{agent.task}</p>

      {workspaceName && (
        <p className="text-[10px] text-muted-foreground/60 mb-2">workspace · {workspaceName}</p>
      )}

      {(agent.status === 'running' || agent.status === 'pending') && currentTool && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Wrench className="w-3 h-3 text-primary/70" />
          <span className="text-primary/90 font-mono truncate">{currentTool}</span>
        </div>
      )}

      {agent.status === 'done' && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>Done · {agent.toolsUsed.length} tool{agent.toolsUsed.length === 1 ? '' : 's'} used</span>
        </div>
      )}

      {agent.status === 'failed' && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="w-3 h-3" />
          <span>Failed</span>
        </div>
      )}

      {agent.status === 'pending' && !currentTool && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Queued</span>
        </div>
      )}
    </div>
  );
}

const RoomApp = ({ workspaceId, workspaceNames = {} }: RoomAppProps) => {
  const { workspaceMap, totalLive } = useRoomState();
  const [showRecent, setShowRecent] = useState(false);

  // Flatten all workspaces (or just the filtered one) into a live list + recent list.
  const { liveAgents, recentAgents } = useMemo(() => {
    const live: Array<{ agent: RoomAgent; workspaceId: string }> = [];
    const recent: Array<{ agent: RoomAgent; workspaceId: string }> = [];
    const entries = workspaceId
      ? (workspaceMap.has(workspaceId) ? [[workspaceId, workspaceMap.get(workspaceId)!] as const] : [])
      : [...workspaceMap.entries()];
    for (const [wsId, data] of entries) {
      for (const a of data.live) live.push({ agent: a, workspaceId: wsId });
      for (const a of data.recent) recent.push({ agent: a, workspaceId: wsId });
    }
    return { liveAgents: live, recentAgents: recent };
  }, [workspaceMap, workspaceId]);

  const liveCount = liveAgents.length;
  const recentCount = recentAgents.length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-display font-semibold text-foreground">Room</h3>
          <span className="text-[11px] text-muted-foreground">
            {liveCount} live
            {recentCount > 0 && <> · {recentCount} recent</>}
            {totalLive === 0 && recentCount === 0 && <> · no agents running</>}
          </span>
        </div>
        {workspaceId && (
          <span className="text-[11px] text-muted-foreground">
            filtered to {workspaceNames[workspaceId] ?? workspaceId}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {liveCount === 0 && recentCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-display text-foreground">No agents running</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
              When you ask a complex question in chat, sub-agents spawn here and you can watch them work.
            </p>
          </div>
        )}

        {liveCount > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                Live ({liveCount})
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {liveAgents.map(({ agent, workspaceId: wsId }) => (
                <AgentTile
                  key={`${wsId}-${agent.id}`}
                  agent={agent}
                  workspaceName={workspaceNames[wsId]}
                />
              ))}
            </div>
          </div>
        )}

        {recentCount > 0 && (
          <div>
            <button
              onClick={() => setShowRecent(v => !v)}
              className="flex items-center gap-2 mb-2 text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Recently completed ({recentCount}) {showRecent ? '▼' : '▶'}
            </button>
            {showRecent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 opacity-80">
                {recentAgents.map(({ agent, workspaceId: wsId }) => (
                  <AgentTile
                    key={`recent-${wsId}-${agent.id}`}
                    agent={agent}
                    workspaceName={workspaceNames[wsId]}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomApp;
