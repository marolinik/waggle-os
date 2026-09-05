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
import {
  Users, CheckCircle2, AlertCircle, Loader2, Clock, Wrench,
  Pause, Play, Square, Send, Brain, FileText,
} from 'lucide-react';
import { useRoomState, type RoomAgent } from '@/hooks/useRoomState';
import { adapter } from '@/lib/adapter';
import type {
  CollaborationRun,
  CollaborationRunControl,
  CollaborationRunStatus,
  CollaborationRoomRun,
  CollaborationWorkerRun,
} from '@waggle/shared';

interface RoomAppProps {
  /** Optional workspace filter — if set, only shows agents for that workspace. */
  workspaceId?: string;
  roomId?: string;
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

const TERMINAL_RUN_STATUSES = new Set<CollaborationRunStatus>([
  'completed', 'failed', 'cancelled', 'interrupted',
]);

function isTerminalRun(status: CollaborationRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function runStatusLabel(status: CollaborationRunStatus): string {
  const label = status.replace(/_/g, ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function runStatusStyle(status: CollaborationRunStatus): { color: string; background: string } {
  if (status === 'completed') return { color: 'var(--healthy)', background: 'var(--healthy-wash)' };
  if (status === 'failed' || status === 'interrupted') return { color: 'var(--risk)', background: 'var(--risk-wash)' };
  if (status === 'cancelled') return { color: 'var(--text-dim)', background: 'var(--surface-2)' };
  if (status === 'waiting_for_approval' || status === 'paused' || status === 'cancelling') {
    return { color: 'var(--attention)', background: 'var(--honey-wash)' };
  }
  return { color: 'var(--honey)', background: 'var(--honey-wash)' };
}

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
          <Wrench className="w-3 h-3 text-honey/70" />
          <span className="text-honey/90 font-mono truncate">{currentTool}</span>
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

interface ControlState {
  runId: string;
  action: CollaborationRunControl;
}

interface RunControlProps {
  run: CollaborationRun;
  pending: ControlState | null;
  error?: string;
  message: string;
  onMessageChange: (message: string) => void;
  onControl: (action: CollaborationRunControl, message?: string) => void;
}

function RunControls({ run, pending, error, message, onMessageChange, onControl }: RunControlProps) {
  const busy = pending?.runId === run.id;
  const terminal = isTerminalRun(run.status);
  const canCancel = run.capabilities.cancel && !terminal && run.status !== 'cancelling';
  const canPause = run.capabilities.pause && run.status === 'running';
  const canResume = run.capabilities.resume && run.status === 'paused';
  const canMessage = run.capabilities.message && !terminal;
  if (!canCancel && !canPause && !canResume && !canMessage && !error) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border/30" data-testid={`run-controls-${run.id}`}>
      <div className="flex flex-wrap gap-1.5">
        {canPause && (
          <button
            type="button"
            aria-label={`Pause ${run.title}`}
            disabled={busy}
            onClick={() => onControl('pause')}
            className="inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Pause className="w-3 h-3" /> Pause
          </button>
        )}
        {canResume && (
          <button
            type="button"
            aria-label={`Resume ${run.title}`}
            disabled={busy}
            onClick={() => onControl('resume')}
            className="inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Play className="w-3 h-3" /> Resume
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            aria-label={`Cancel ${run.title}`}
            disabled={busy}
            onClick={() => onControl('cancel')}
            className="inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Square className="w-3 h-3" /> Cancel
          </button>
        )}
      </div>
      {canMessage && (
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = message.trim();
            if (trimmed && !busy) onControl('message', trimmed);
          }}
        >
          <input
            aria-label={`Message ${run.title}`}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="Send guidance to this run…"
            className="min-w-0 flex-1 rounded border border-border/50 bg-background px-2 py-1 text-[11px] text-foreground"
          />
          <button
            type="submit"
            aria-label={`Send message to ${run.title}`}
            disabled={busy || !message.trim()}
            className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-1 text-[11px] text-honey disabled:opacity-50"
          >
            <Send className="w-3 h-3" /> Send
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function RunData({ run }: { run: CollaborationRun }) {
  const progress = run.progress;
  const result = run.result;
  const metrics = run.metrics;
  const personalCount = run.memoryRefs.personalFrameIds.length;
  const workspaceCount = Object.values(run.memoryRefs.workspaceFrameIds)
    .reduce((count, ids) => count + ids.length, 0);
  const progressPct = progress?.current !== undefined && progress.total
    ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100))
    : undefined;

  return (
    <div className="space-y-2">
      {progress && (
        <div className="space-y-1" data-testid={`run-progress-${run.id}`}>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{progress.phase ? `${progress.phase} · ` : ''}{progress.message}</span>
            {progress.current !== undefined && progress.total !== undefined && (
              <span>{progress.current}/{progress.total}</span>
            )}
          </div>
          {progressPct !== undefined && (
            <div
              role="progressbar"
              aria-label={`${run.title} progress`}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.current}
              className="h-1 overflow-hidden rounded-full bg-secondary"
            >
              <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      )}
      {result?.summary && (
        <p className="text-[11px] leading-relaxed text-foreground whitespace-pre-wrap" data-testid={`run-summary-${run.id}`}>
          {result.summary}
        </p>
      )}
      {result?.error && (
        <p role="alert" className="text-[11px] text-destructive whitespace-pre-wrap">{result.error}</p>
      )}
      {result?.artifacts && result.artifacts.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1 font-medium text-foreground"><FileText className="w-3 h-3" /> Artifacts</p>
          <ul className="mt-1 space-y-0.5 font-mono">
            {result.artifacts.map((artifact) => <li key={artifact} className="break-all">{artifact}</li>)}
          </ul>
        </div>
      )}
      {(result?.sessionId || result?.traceId || result?.exitCode !== undefined) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
          {result.sessionId && <span>Session · {result.sessionId}</span>}
          {result.traceId && <span>Trace · {result.traceId}</span>}
          {result.exitCode !== undefined && <span>Exit · {result.exitCode ?? 'pending'}</span>}
        </div>
      )}
      {run.kind === 'worker'
        && run.status === 'completed'
        && result?.summary?.trim()
        && !result.error?.startsWith('Assistant history could not be persisted:')
        && result.sessionId && (
        <a
          href={`/workspaces/${encodeURIComponent(run.workspaceId)}/chat?session=${encodeURIComponent(result.sessionId)}`}
          className="inline-flex items-center rounded-md bg-primary/15 px-2 py-1 text-[11px] font-display font-medium text-honey hover:bg-primary/25 transition-colors"
        >
          Open result in chat
        </a>
      )}
      {metrics && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground" data-testid={`run-metrics-${run.id}`}>
          {(metrics.toolsUsed?.length ?? 0) > 0 && <span>Tools · {metrics.toolsUsed!.join(', ')}</span>}
          {metrics.inputTokens !== undefined && <span>Input · {metrics.inputTokens.toLocaleString()} tokens</span>}
          {metrics.outputTokens !== undefined && <span>Output · {metrics.outputTokens.toLocaleString()} tokens</span>}
          {metrics.costUsd !== undefined && <span>Cost · ${metrics.costUsd.toFixed(4)}</span>}
        </div>
      )}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-secondary/30 px-2 py-1.5 text-[10px] text-muted-foreground"
        data-testid={`run-memory-${run.id}`}
      >
        <span className="flex items-center gap-1 text-foreground"><Brain className="w-3 h-3" /> Memory · {run.memoryRefs.status}</span>
        <span>Personal mind · {personalCount} frame{personalCount === 1 ? '' : 's'}</span>
        <span>Workspace mind · {workspaceCount} frame{workspaceCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

interface CanonicalRunCardProps {
  run: CollaborationWorkerRun;
  workspaceName: string;
  pending: ControlState | null;
  controlError?: string;
  message: string;
  onMessageChange: (message: string) => void;
  onControl: (action: CollaborationRunControl, message?: string) => void;
}

function CanonicalWorkerCard({
  run, workspaceName, pending, controlError, message, onMessageChange, onControl,
}: CanonicalRunCardProps) {
  const executor = run.executor.toolId ?? run.executor.personaId ?? run.executor.agentId ?? run.source;
  const startedAt = run.startedAt ? Date.parse(run.startedAt) : undefined;
  const completedAt = run.completedAt ? Date.parse(run.completedAt) : undefined;
  return (
    <article
      className="min-w-0 space-y-2 rounded-xl border border-border/40 bg-card/50 p-3"
      data-testid="canonical-worker-card"
      data-run-id={run.id}
      data-run-status={run.status}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h5 className="text-xs font-display font-semibold text-foreground">{run.title}</h5>
            <span className="rounded px-1.5 py-0.5 text-[10px]" style={runStatusStyle(run.status)}>
              {runStatusLabel(run.status)}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {executor}{run.executor.model ? ` · ${run.executor.model}` : ''} · {workspaceName}
          </p>
        </div>
        {startedAt && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-2.5 h-2.5" /> {formatElapsed(startedAt, completedAt)}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{run.task}</p>
      <RunData run={run} />
      <RunControls
        run={run}
        pending={pending}
        error={controlError}
        message={message}
        onMessageChange={onMessageChange}
        onControl={onControl}
      />
    </article>
  );
}

interface RoomSummaryProps {
  room: CollaborationRoomRun;
  workers: CollaborationWorkerRun[];
  workspaceNames: Record<string, string>;
  pending: ControlState | null;
  controlError?: string;
  message: string;
  onMessageChange: (message: string) => void;
  onControl: (action: CollaborationRunControl, message?: string) => void;
}

function RoomSummary({
  room, workers, workspaceNames, pending, controlError, message, onMessageChange, onControl,
}: RoomSummaryProps) {
  const settled = workers.filter((worker) => isTerminalRun(worker.status)).length;
  const statusCounts = new Map<CollaborationRunStatus, number>();
  for (const worker of workers) statusCounts.set(worker.status, (statusCounts.get(worker.status) ?? 0) + 1);
  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="room-root-summary">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-display font-semibold text-foreground">{room.title}</h4>
            <span className="rounded px-1.5 py-0.5 text-[10px]" style={runStatusStyle(room.status)}>
              {runStatusLabel(room.status)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{room.task}</p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{settled}/{workers.length} settled</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>Source · {room.source}</span>
        <span>Workspaces · {room.workspaceIds.map((id) => workspaceNames[id] ?? id).join(', ')}</span>
        {[...statusCounts].map(([status, count]) => (
          <span key={status}>{runStatusLabel(status)} · {count}</span>
        ))}
      </div>
      <RunData run={room} />
      <RunControls
        run={room}
        pending={pending}
        error={controlError}
        message={message}
        onMessageChange={onMessageChange}
        onControl={onControl}
      />
    </section>
  );
}

/** One participant row in the "In the room" panel. */
interface Participant {
  key: string;
  name: string;
  role: string;
  live: boolean;
}

const RoomApp = ({ workspaceId, roomId, workspaceNames = {} }: RoomAppProps) => {
  const {
    workspaceMap, totalLive, connecting, error, reconnect,
    focusedRoom, focusedWorkers = [],
  } = useRoomState(roomId);
  const [showRecent, setShowRecent] = useState(false);
  const [pendingControl, setPendingControl] = useState<ControlState | null>(null);
  const [controlErrors, setControlErrors] = useState<Record<string, string>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});

  const handleControl = async (
    runId: string,
    action: CollaborationRunControl,
    message?: string,
  ) => {
    setPendingControl({ runId, action });
    setControlErrors((current) => {
      const next = { ...current };
      delete next[runId];
      return next;
    });
    try {
      await adapter.controlAgentRun(runId, action, message);
      if (action === 'message') {
        setMessageDrafts((current) => ({ ...current, [runId]: '' }));
      }
    } catch (err) {
      setControlErrors((current) => ({
        ...current,
        [runId]: err instanceof Error ? err.message : 'Run control failed',
      }));
    } finally {
      setPendingControl(null);
    }
  };

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
    if (focusedRoom) {
      return focusedWorkers.map((run) => ({
        key: run.id,
        name: run.title,
        role: run.executor.toolId ?? run.executor.personaId ?? run.executor.agentId ?? run.source,
        live: !isTerminalRun(run.status),
      }));
    }
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
  }, [focusedRoom, focusedWorkers, liveAgents, recentAgents]);

  const focusedLiveCount = focusedWorkers.filter((run) => !isTerminalRun(run.status)).length;
  const focusedRecentCount = focusedWorkers.length - focusedLiveCount;
  const displayedLiveCount = focusedRoom ? focusedLiveCount : liveCount;
  const displayedRecentCount = focusedRoom ? focusedRecentCount : recentCount;
  const hasRoster = Boolean(focusedRoom) || liveCount > 0 || recentCount > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background" data-testid="room-root">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-honey" />
          <h3 className="text-sm font-display font-semibold text-foreground">Room</h3>
          <span className="text-[11px] text-muted-foreground" data-testid="room-live-count">
            {displayedLiveCount} live
            {displayedRecentCount > 0 && (
              <> · {displayedRecentCount} {focusedRoom ? 'settled' : 'recent'}</>
            )}
            {!focusedRoom && totalLive === 0 && recentCount === 0 && <> · no agents running</>}
          </span>
          {focusedRoom && (
            <span className="rounded px-1.5 py-0.5 text-[10px]" style={runStatusStyle(focusedRoom.status)}>
              {runStatusLabel(focusedRoom.status)}
            </span>
          )}
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
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 text-honey text-[11px] font-display hover:bg-primary/25 transition-colors"
          >
            <Loader2 className="w-3.5 h-3.5" /> Reconnect
          </button>
        </div>
      ) : connecting ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4" data-testid="room-connecting">
          <Loader2 className="w-10 h-10 text-muted-foreground/30 mb-3 animate-spin" />
          <p className="text-sm font-display text-foreground">Connecting to the Room…</p>
        </div>
      ) : roomId && !focusedRoom ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4" data-testid="room-not-found">
          <AlertCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-display text-foreground">Room not found</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
            No durable Room exists for <span className="font-mono">{roomId}</span>. Check the link or open the Room overview.
          </p>
        </div>
      ) : !hasRoster ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-display text-foreground">No agents running</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
            Spawn a Waggle agent, run an agent group, or launch a captured external task to watch it work here.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 p-4 overflow-hidden">
          {/* Turn stage — the live + recently-completed agents working */}
          <div className="min-h-0 overflow-auto space-y-4" data-testid="room-stage">
            {focusedRoom && (
              <>
                <RoomSummary
                  room={focusedRoom}
                  workers={focusedWorkers}
                  workspaceNames={workspaceNames}
                  pending={pendingControl}
                  controlError={controlErrors[focusedRoom.id]}
                  message={messageDrafts[focusedRoom.id] ?? ''}
                  onMessageChange={(message) => setMessageDrafts((current) => ({
                    ...current, [focusedRoom.id]: message,
                  }))}
                  onControl={(action, message) => void handleControl(focusedRoom.id, action, message)}
                />
                <section className="space-y-2">
                  <h4 className="text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                    Agents ({focusedWorkers.length})
                  </h4>
                  {focusedWorkers.length > 0 ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                      {focusedWorkers.map((run) => (
                        <CanonicalWorkerCard
                          key={run.id}
                          run={run}
                          workspaceName={workspaceNames[run.workspaceId] ?? run.workspaceId}
                          pending={pendingControl}
                          controlError={controlErrors[run.id]}
                          message={messageDrafts[run.id] ?? ''}
                          onMessageChange={(message) => setMessageDrafts((current) => ({
                            ...current, [run.id]: message,
                          }))}
                          onControl={(action, message) => void handleControl(run.id, action, message)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-border/30 bg-card/30 p-3 text-[11px] text-muted-foreground">
                      This Room has no registered worker runs yet.
                    </p>
                  )}
                </section>
              </>
            )}
            {!focusedRoom && liveCount > 0 && (
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

            {!focusedRoom && recentCount > 0 && (
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
              {focusedRoom
                ? 'Each agent works in its bound workspace. Full results return to that workspace mind, with a concise reference in your personal mind.'
                : 'Waggle agents, groups, and captured external tasks appear here across your workspaces.'}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
};

export default RoomApp;
