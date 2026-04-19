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
 *  - Agents that were live before and are missing from the new event
 *    auto-transition to done (implicit completion).
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
  const stillLive = event.agents.filter(
    (a) => a.status === 'pending' || a.status === 'running',
  );
  const newlyDone: RoomAgent[] = [];
  for (const agent of event.agents) {
    if (agent.status === 'done' || agent.status === 'failed') {
      newlyDone.push(agent);
    }
  }
  // Agents that were live previously but are absent from the new event
  // have finished out-of-band — auto-mark them done so they move to recent.
  for (const prevAgent of prior.live) {
    const inNew = event.agents.find((a) => a.id === prevAgent.id);
    if (!inNew && prevAgent.status !== 'done' && prevAgent.status !== 'failed') {
      newlyDone.push({ ...prevAgent, status: 'done', completedAt: now });
    }
  }

  const mergedRecent = dedupeAgents([...newlyDone, ...prior.recent]);
  const prunedRecent = pruneRecent(mergedRecent, now, recentWindowMs);

  return {
    live: stillLive,
    recent: prunedRecent,
    lastUpdatedAt: now,
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
