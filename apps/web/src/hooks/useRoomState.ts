/**
 * useRoomState — subscribes to `subagent_status` SSE events and maintains
 * a per-workspace map of live sub-agents for the Room canvas.
 *
 * The server emits the full current roster of agents on every status
 * change (not deltas), so each event replaces the workspace's agent list.
 * Completed agents stick around in the "recent" bucket for 15 minutes so
 * they don't vanish from view the instant they finish.
 */

import { useEffect, useMemo, useState } from 'react';
import { adapter } from '@/lib/adapter';

export interface RoomAgent {
  id: string;
  name: string;
  role: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  task: string;
  toolsUsed: string[];
  startedAt?: number;
  completedAt?: number;
}

interface WorkspaceAgents {
  live: RoomAgent[];
  recent: RoomAgent[];
  lastUpdatedAt: number;
}

const RECENT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function useRoomState() {
  const [workspaceMap, setWorkspaceMap] = useState<Map<string, WorkspaceAgents>>(() => new Map());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = adapter.subscribeSubagentStatus((event) => {
        setWorkspaceMap(prev => {
          const next = new Map(prev);
          const current = next.get(event.workspaceId) ?? {
            live: [],
            recent: [],
            lastUpdatedAt: 0,
          };

          // Completed agents from the previous live set move into recent.
          const previouslyLive = current.live;
          const stillLive = event.agents.filter(a => a.status === 'pending' || a.status === 'running');
          const newlyDone: RoomAgent[] = [];
          for (const agent of event.agents) {
            if (agent.status === 'done' || agent.status === 'failed') {
              newlyDone.push(agent);
            }
          }
          // Also sweep agents that were live before and aren't in the new event — they finished.
          for (const prev of previouslyLive) {
            const inNew = event.agents.find(a => a.id === prev.id);
            if (!inNew && prev.status !== 'done' && prev.status !== 'failed') {
              newlyDone.push({ ...prev, status: 'done', completedAt: Date.now() });
            }
          }

          const mergedRecent = dedupeAgents([...newlyDone, ...current.recent]);
          const prunedRecent = pruneRecent(mergedRecent);

          next.set(event.workspaceId, {
            live: stillLive,
            recent: prunedRecent,
            lastUpdatedAt: Date.now(),
          });
          return next;
        });
      });
    } catch (err) {
      console.error('[useRoomState] SSE subscribe failed:', err);
    }

    return () => unsub?.();
  }, []);

  // Periodically prune recent entries so stale ones fall off even without new events.
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkspaceMap(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [wsId, data] of prev) {
          const pruned = pruneRecent(data.recent);
          if (pruned.length !== data.recent.length) {
            next.set(wsId, { ...data, recent: pruned });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const allWorkspaceIds = useMemo(() => [...workspaceMap.keys()], [workspaceMap]);
  const totalLive = useMemo(() => {
    let count = 0;
    for (const data of workspaceMap.values()) count += data.live.length;
    return count;
  }, [workspaceMap]);

  const getWorkspace = (workspaceId: string): WorkspaceAgents | undefined => workspaceMap.get(workspaceId);

  return { workspaceMap, allWorkspaceIds, totalLive, getWorkspace };
}

function dedupeAgents(agents: RoomAgent[]): RoomAgent[] {
  const seen = new Set<string>();
  const out: RoomAgent[] = [];
  for (const a of agents) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

function pruneRecent(agents: RoomAgent[]): RoomAgent[] {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  return agents.filter(a => {
    const t = a.completedAt ?? a.startedAt ?? Date.now();
    return t >= cutoff;
  });
}
