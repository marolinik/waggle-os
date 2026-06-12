/**
 * useRoomState — subscribes to `subagent_status` SSE events and maintains
 * a per-workspace map of live sub-agents for the Room canvas.
 *
 * The server emits the full current roster of agents on every status
 * change (not deltas), so each event replaces the workspace's agent list.
 * Completed agents stick around in the "recent" bucket for 15 minutes so
 * they don't vanish from view the instant they finish.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adapter } from '@/lib/adapter';
import {
  applyStatusEvent,
  pruneRecent,
  type RoomAgent as _RoomAgent,
  type WorkspaceAgents,
} from '@/lib/room-state-reducer';

// Re-export the type at the old import path so RoomApp doesn't need changes.
export type RoomAgent = _RoomAgent;

export function useRoomState() {
  const [workspaceMap, setWorkspaceMap] = useState<Map<string, WorkspaceAgents>>(() => new Map());
  // P7/D15 B2: a broken SSE channel must be distinguishable from an idle room.
  // `connecting` covers the brief subscribe window; `error` flags a subscribe
  // failure so RoomApp can show reconnect instead of "no agents running".
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    setConnecting(true);
    setError(null);
    try {
      unsub = adapter.subscribeSubagentStatus((event) => {
        setWorkspaceMap(prev => {
          const next = new Map(prev);
          const current = next.get(event.workspaceId);
          // Pure reducer drives the actual state math; see room-state-reducer.ts.
          const updated = applyStatusEvent(current, event);
          next.set(event.workspaceId, updated);
          return next;
        });
      });
      // Subscription established (the SSE contract emits the roster only on a
      // status change, so absence of events = idle, not still-connecting).
      setConnecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to the Room');
      setConnecting(false);
      console.error('[useRoomState] SSE subscribe failed:', err);
    }

    return () => unsub?.();
  }, [reconnectNonce]);

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

  return { workspaceMap, allWorkspaceIds, totalLive, getWorkspace, connecting, error, reconnect };
}
