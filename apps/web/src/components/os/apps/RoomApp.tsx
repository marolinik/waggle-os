/**
 * RoomApp — the Room canvas from Phase A.3 of the Killer Story plan.
 *
 * Shows every running sub-agent across every workspace as a tile on a
 * canvas, so the user literally watches their team of specialists work.
 * Subscribes to `subagent_status` SSE events via useRoomState.
 *
 * Layout (PR6b §16 — two-column shared stage + participants panel):
 *   ┌───────────────────────────────────────────────────────┐
 *   │ Header: live count, recent count                      │
 *   ├──────────────────────────────────┬────────────────────┤
 *   │ Turn stage                       │ In the room        │
 *   │   Live agents (grid of tiles)    │   participant list │
 *   │   Recently completed (collapse)  │   (host + agents)  │
 *   └──────────────────────────────────┴────────────────────┘
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

// Warm-token status styling (D21): the live SSE roster maps to semantic vars,
// not raw emerald/sky/violet. Inline style is the project convention for the
// --work/--intel/--healthy/--risk semantic palette (see BenchmarkApp).
const STATUS_DOT_STYLE: Record<RoomAgent['status'], { background: string }> = {
  pending: { background: 'var(--text-dim)' },
  running: { background: 'var(--honey)' },
  done: { background: 'var(--healthy)' },
  failed: { background: 'var(--risk)' },
};

// Persona role → warm tint. Roles fan out across the four semantic hues so the
// stage reads at a glance without reintroducing the saturated tier colors.
const ROLE_STYLE: Record<string, { color: string; background: string }> = {
  researcher: { color: 'var(--work)', background: 'var(--work-wash)' },
  writer: { color: 'var(--attention)', background: 'var(--honey-wash)' },
  coder: { color: 'var(--intel)', background: 'var(--intel-wash)' },
  analyst: { color: 'var(--healthy)', background: 'var(--healthy-wash)' },
  reviewer: { color: 'var(--risk)', background: 'var(--risk-wash)' },
  planner: { color: 'var(--work)', background: 'var(--work-wash)' },
};

function roleStyle(role: string): { color: string; background: string } {
  return ROLE_STYLE[role.toLowerCase()] ?? { color: 'var(--text-dim)', background: 'var(--surface-2)' };
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
    <div
      className="p-3 rounded-xl bg-secondary/30 border border-border/30 hover:border-primary/30 transition-colors min-w-0"
      data-testid="room-agent-tile"
      data-agent-id={agent.id}
      data-agent-status={agent.status}
      data-agent-role={agent.role}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${agent.status === 'running' ? 'animate-pulse' : ''}`}
            style={STATUS_DOT_STYLE[agent.status]}
          />
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-display uppercase tracking-wide"
            style={roleStyle(agent.role)}
          >
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
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--healthy)' }}>
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

/** One participant row in the "In the room" panel. */
interface Participant {
  key: string;
  name: string;
  role: string;
  live: boolean;
}

const RoomApp = ({ workspaceId, workspaceNames = {} }: RoomAppProps) => {
  const { workspaceMap, totalLive, connecting, error, reconnect } = useRoomState();
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

  // Participants panel — derived from the SAME real SSE roster, never invented.
  // The host ("You") is always present; live agents show first, then recently-
  // finished ones (deduped by id so an agent isn't listed twice). D20: no
  // fabricated invitees — only agents the live feed actually reports.
  const participants = useMemo<Participant[]>(() => {
    const seen = new Set<string>();
    const rows: Participant[] = [];
    for (const { agent } of liveAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      rows.push({ key: agent.id, name: agent.name, role: agent.role, live: true });
    }
    for (const { agent } of recentAgents) {
      if (seen.has(agent.id)) continue;
      seen.add(agent.id);
      rows.push({ key: agent.id, name: agent.name, role: agent.role, live: false });
    }
    return rows;
  }, [liveAgents, recentAgents]);

  const hasRoster = liveCount > 0 || recentCount > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background" data-testid="room-root">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-display font-semibold text-foreground">Room</h3>
          <span className="text-[11px] text-muted-foreground" data-testid="room-live-count">
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

      {/* Content — full-bleed states (error / connecting / empty) take the
          whole canvas; once there's a roster we split into the two-column
          stage + participants layout. */}
      {/* P7/D15 B2: a broken SSE channel is NOT an idle room. Error and
          connecting take precedence over the "no agents running" empty state. */}
      {error ? (
        <div role="alert" className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <AlertCircle className="w-10 h-10 text-destructive/60 mb-3" />
          <p className="text-sm font-display text-foreground">Room channel disconnected</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
            Lost the live agent feed — this is a connection error, not an empty room. {error}
          </p>
          <button
            onClick={reconnect}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 text-primary text-[11px] font-display hover:bg-primary/25 transition-colors"
          >
            <Loader2 className="w-3.5 h-3.5" /> Reconnect
          </button>
        </div>
      ) : connecting ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4" data-testid="room-connecting">
          <Loader2 className="w-10 h-10 text-muted-foreground/30 mb-3 animate-spin" />
          <p className="text-sm font-display text-foreground">Connecting to the Room…</p>
        </div>
      ) : !hasRoster ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-display text-foreground">No agents running</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
            When you ask a complex question in chat, sub-agents spawn here and you can watch them work.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 p-4 overflow-hidden">
          {/* Turn stage — the live + recently-completed agents working */}
          <div className="min-h-0 overflow-auto space-y-4" data-testid="room-stage">
            {liveCount > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--honey)' }} />
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

          {/* Participants panel — "In the room" */}
          <aside
            className="min-h-0 overflow-auto rounded-xl border border-border/40 bg-card/40 p-4"
            aria-label="Participants in the room"
            data-testid="room-participants"
          >
            <h4 className="text-[10.5px] font-display font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
              In the room
            </h4>
            <ul className="space-y-0.5">
              <li className="flex items-center gap-2.5 py-1.5 text-[13px]">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--honey)' }} />
                <span className="flex-1 text-foreground truncate">You</span>
                <span className="text-[11px] text-muted-foreground">host</span>
              </li>
              {participants.map((p) => (
                <li key={p.key} className="flex items-center gap-2.5 py-1.5 text-[13px]" data-testid="room-participant">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.live ? 'animate-pulse' : ''}`}
                    style={{ background: p.live ? 'var(--healthy)' : 'var(--text-dim)' }}
                  />
                  <span className="flex-1 text-foreground truncate">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">{p.live ? 'live' : p.role}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-muted-foreground leading-relaxed">
              Everyone shares this workspace's memory — agents spawn here when you ask a complex question.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
};

export default RoomApp;
