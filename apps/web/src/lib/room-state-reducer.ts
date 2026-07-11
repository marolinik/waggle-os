import type {
  CollaborationRoomRun,
  CollaborationRun,
  CollaborationRunEvent,
  CollaborationWorkerRun,
} from '@waggle/shared';

export type CanonicalRunMap = Map<string, CollaborationRun>;

export interface CanonicalRoomIndex {
  rooms: CollaborationRoomRun[];
  roomsById: Map<string, CollaborationRoomRun>;
  childrenByRoomId: Map<string, CollaborationWorkerRun[]>;
}

/**
 * Pure reducer for the Room sub-agent status stream.
 *
 * Extracted from `useRoomState` so the "two parallel agents don't cross-
 * contaminate" invariant (P6) is testable without a browser, an SSE
 * transport, or React hooks. The hook wraps this reducer; Playwright
 * specs wrap the full render path.
 */

export type RoomAgentStatus = 'pending' | 'running' | 'done' | 'failed';

export interface RoomAgent {
  id: string;
  name: string;
  role: string;
  status: RoomAgentStatus;
  task: string;
  toolsUsed: string[];
  startedAt?: number;
  completedAt?: number;
  origin?: 'legacy' | 'run';
  roomId?: string;
  source?: CollaborationRun['source'];
  runStatus?: CollaborationRun['status'];
  toolId?: string;
  model?: string;
  resultSummary?: string;
  memoryStatus?: CollaborationRun['memoryRefs']['status'];
  workspaceId?: string;
  parentRunId?: string;
  rootRunId?: string;
  executor?: CollaborationRun['executor'];
  progress?: CollaborationRun['progress'];
  result?: CollaborationRun['result'];
  metrics?: CollaborationRun['metrics'];
  memoryRefs?: CollaborationRun['memoryRefs'];
  capabilities?: CollaborationRun['capabilities'];
}

export interface WorkspaceAgents {
  live: RoomAgent[];
  recent: RoomAgent[];
  lastUpdatedAt: number;
}

export interface StatusEvent {
  type: 'subagent_status';
  workspaceId: string;
  agents: RoomAgent[];
  timestamp: string;
  mode?: 'delta' | 'snapshot';
}

/** Default recency window for "finished agents" tiles. */
export const DEFAULT_RECENT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Apply one `subagent_status` event to the prior state for that
 * workspace and return the updated state.
 *
 * Invariants:
 *  - Agents with status pending/running go to `live`.
 *  - Agents with status done/failed go to `recent` (never `live`).
 *  - Delta events touch only the ids they carry; missing siblings stay live.
 *  - Explicit snapshot events may transition missing live agents to done.
 *  - IDs are unique across `recent` (dedup by id, newest wins).
 *  - Recent entries older than `recentWindowMs` are pruned.
 *  - Two distinct agent IDs are kept distinct — no field merging.
 */
export function applyStatusEvent(
  current: WorkspaceAgents | undefined,
  event: StatusEvent,
  now: number = Date.now(),
  recentWindowMs: number = DEFAULT_RECENT_WINDOW_MS,
): WorkspaceAgents {
  const prior: WorkspaceAgents = current ?? { live: [], recent: [], lastUpdatedAt: 0 };
  const incomingIds = new Set(event.agents.map((agent) => agent.id));
  let stillLive = prior.live.filter((agent) => !incomingIds.has(agent.id));
  const priorRecent = prior.recent.filter((agent) => !incomingIds.has(agent.id));
  const newlyDone: RoomAgent[] = [];
  for (const agent of event.agents) {
    const normalized: RoomAgent = { ...agent, origin: agent.origin ?? 'legacy' };
    if (agent.status === 'pending' || agent.status === 'running') stillLive.push(normalized);
    else newlyDone.push(normalized);
  }
  // Agents that were live previously but are absent from the new event
  // have finished out-of-band — auto-mark them done so they move to recent.
  if (event.mode === 'snapshot') {
    for (const prevAgent of prior.live) {
      if (!incomingIds.has(prevAgent.id)) {
        newlyDone.push({ ...prevAgent, status: 'done', completedAt: now });
        stillLive = stillLive.filter((agent) => agent.id !== prevAgent.id);
      }
    }
  }

  stillLive = dedupeAgents(stillLive);
  const mergedRecent = dedupeAgents([...newlyDone, ...priorRecent]);
  const prunedRecent = pruneRecent(mergedRecent, now, recentWindowMs);

  return {
    live: stillLive,
    recent: prunedRecent,
    lastUpdatedAt: now,
  };
}

/** Preserve complete canonical run records without projecting away lifecycle data. */
export function hydrateCanonicalRuns(runs: readonly CollaborationRun[]): CanonicalRunMap {
  return new Map(runs.map((run) => [run.id, run]));
}

/** Apply complete journal upserts while retaining untouched roots and siblings. */
export function applyCanonicalRunEvents(
  current: CanonicalRunMap,
  events: readonly CollaborationRunEvent[],
): CanonicalRunMap {
  const next = new Map(current);
  for (const event of events) next.set(event.run.id, event.run);
  return next;
}

/** Index durable Room roots and their exact worker children. */
export function indexCanonicalRooms(runsById: CanonicalRunMap): CanonicalRoomIndex {
  const rooms: CollaborationRoomRun[] = [];
  const roomsById = new Map<string, CollaborationRoomRun>();
  const childrenByRoomId = new Map<string, CollaborationWorkerRun[]>();
  for (const run of runsById.values()) {
    if (run.kind === 'room') {
      rooms.push(run);
      roomsById.set(run.id, run);
      roomsById.set(run.roomId, run);
      continue;
    }
    const children = childrenByRoomId.get(run.parentRunId) ?? [];
    children.push(run);
    childrenByRoomId.set(run.parentRunId, children);
  }
  return { rooms, roomsById, childrenByRoomId };
}

/** Focus the existing tile projection on one canonical Room, hiding legacy/unrelated runs. */
export function filterWorkspaceMapByRoom(
  workspaceMap: Map<string, WorkspaceAgents>,
  roomId: string,
): Map<string, WorkspaceAgents> {
  const focused = new Map<string, WorkspaceAgents>();
  for (const [workspaceId, state] of workspaceMap) {
    const live = state.live.filter((agent) => agent.origin === 'run' && agent.roomId === roomId);
    const recent = state.recent.filter((agent) => agent.origin === 'run' && agent.roomId === roomId);
    if (live.length > 0 || recent.length > 0) {
      focused.set(workspaceId, { live, recent, lastUpdatedAt: state.lastUpdatedAt });
    }
  }
  return focused;
}

/** Hydrate durable worker runs while preserving legacy subagent tiles. */
export function hydrateRunSnapshot(
  current: Map<string, WorkspaceAgents>,
  runs: CollaborationRun[],
  now: number = Date.now(),
): Map<string, WorkspaceAgents> {
  const next = new Map<string, WorkspaceAgents>();
  for (const [workspaceId, state] of current) {
    next.set(workspaceId, {
      live: state.live.filter((agent) => agent.origin !== 'run'),
      recent: state.recent.filter((agent) => agent.origin !== 'run'),
      lastUpdatedAt: state.lastUpdatedAt,
    });
  }
  for (const run of runs) {
    if (run.kind === 'worker') upsertRun(next, run, now);
  }
  return next;
}

/** Apply one complete run snapshot from the registry event journal. */
export function applyRunEvent(
  current: Map<string, WorkspaceAgents>,
  event: CollaborationRunEvent,
  now: number = Date.now(),
): Map<string, WorkspaceAgents> {
  if (event.run.kind === 'room') return current;
  const next = new Map(current);
  upsertRun(next, event.run, now);
  return next;
}

function upsertRun(
  map: Map<string, WorkspaceAgents>,
  run: Extract<CollaborationRun, { kind: 'worker' }>,
  now: number,
): void {
  const prior = map.get(run.workspaceId) ?? { live: [], recent: [], lastUpdatedAt: 0 };
  const agent = roomAgentFromRun(run);
  const live = prior.live.filter((item) => item.id !== run.id);
  const recent = prior.recent.filter((item) => item.id !== run.id);
  if (agent.status === 'pending' || agent.status === 'running') live.push(agent);
  else recent.unshift(agent);
  map.set(run.workspaceId, {
    live: dedupeAgents(live),
    recent: pruneRecent(dedupeAgents(recent), now),
    lastUpdatedAt: now,
  });
}

export function roomAgentFromRun(
  run: Extract<CollaborationRun, { kind: 'worker' }>,
): RoomAgent {
  const status: RoomAgentStatus = (() => {
    if (run.status === 'completed' || run.status === 'cancelled') return 'done';
    if (run.status === 'failed' || run.status === 'interrupted') return 'failed';
    if (run.status === 'queued' || run.status === 'starting') return 'pending';
    return 'running';
  })();
  return {
    id: run.id,
    name: run.title,
    role: run.executor.toolId ?? run.executor.personaId ?? run.executor.agentId ?? run.source,
    status,
    task: run.task,
    toolsUsed: run.metrics?.toolsUsed ?? [],
    startedAt: run.startedAt ? Date.parse(run.startedAt) : undefined,
    completedAt: run.completedAt ? Date.parse(run.completedAt) : undefined,
    origin: 'run',
    roomId: run.roomId,
    source: run.source,
    runStatus: run.status,
    toolId: run.executor.toolId,
    model: run.executor.model,
    resultSummary: run.result?.summary,
    memoryStatus: run.memoryRefs.status,
    workspaceId: run.workspaceId,
    parentRunId: run.parentRunId,
    rootRunId: run.rootRunId,
    executor: run.executor,
    progress: run.progress,
    result: run.result,
    metrics: run.metrics,
    memoryRefs: run.memoryRefs,
    capabilities: run.capabilities,
  };
}

/**
 * Dedupe agents by id, keeping the first occurrence (caller determines
 * order — newer entries should come first so they win).
 */
export function dedupeAgents(agents: RoomAgent[]): RoomAgent[] {
  const seen = new Set<string>();
  const out: RoomAgent[] = [];
  for (const a of agents) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/** Drop agents whose completedAt / startedAt is older than `windowMs`. */
export function pruneRecent(
  agents: RoomAgent[],
  now: number = Date.now(),
  windowMs: number = DEFAULT_RECENT_WINDOW_MS,
): RoomAgent[] {
  const cutoff = now - windowMs;
  return agents.filter((a) => {
    const t = a.completedAt ?? a.startedAt ?? now;
    return t >= cutoff;
  });
}

/**
 * Flatten a workspace map into the two ordered lists the Room canvas
 * renders. Optionally filter by a single workspace id.
 */
export function flattenWorkspaceMap(
  workspaceMap: Map<string, WorkspaceAgents>,
  filterWorkspaceId?: string,
): {
  liveAgents: Array<{ agent: RoomAgent; workspaceId: string }>;
  recentAgents: Array<{ agent: RoomAgent; workspaceId: string }>;
} {
  const live: Array<{ agent: RoomAgent; workspaceId: string }> = [];
  const recent: Array<{ agent: RoomAgent; workspaceId: string }> = [];

  const entries = filterWorkspaceId
    ? (workspaceMap.has(filterWorkspaceId)
        ? [[filterWorkspaceId, workspaceMap.get(filterWorkspaceId)!] as const]
        : [])
    : [...workspaceMap.entries()];

  for (const [wsId, data] of entries) {
    for (const a of data.live) live.push({ agent: a, workspaceId: wsId });
    for (const a of data.recent) recent.push({ agent: a, workspaceId: wsId });
  }
  return { liveAgents: live, recentAgents: recent };
}
