/**
 * useRoomState — subscribes to `subagent_status` SSE events and maintains
 * a per-workspace map of live sub-agents for the Room canvas.
 *
 * Legacy chat subagents arrive as SSE deltas. Durable external/Fleet/group
 * runs hydrate from the AgentRun snapshot and replay journal, so reconnects
 * do not lose participants or results. Completed agents remain in "recent"
 * for 15 minutes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adapter } from '@/lib/adapter';
import {
  applyCanonicalRunEvents,
  applyRunEvent,
  applyStatusEvent,
  filterWorkspaceMapByRoom,
  hydrateCanonicalRuns,
  hydrateRunSnapshot,
  indexCanonicalRooms,
  pruneRecent,
  type CanonicalRunMap,
  type RoomAgent as _RoomAgent,
  type WorkspaceAgents,
} from '@/lib/room-state-reducer';

// Re-export the type at the old import path so RoomApp doesn't need changes.
export type RoomAgent = _RoomAgent;

export function useRoomState(focusedRoomId?: string) {
  const [workspaceMap, setWorkspaceMap] = useState<Map<string, WorkspaceAgents>>(() => new Map());
  const [runsById, setRunsById] = useState<CanonicalRunMap>(() => new Map());
  // P7/D15 B2: a broken SSE channel must be distinguishable from an idle room.
  // `connecting` covers the brief subscribe window; `error` flags a subscribe
  // failure so RoomApp can show reconnect instead of "no agents running".
  const [connecting, setConnecting] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let disposed = false;
    let syncing = false;
    let lastSeq: number | null = null;
    setConnecting(true);
    setStreamError(null);
    setSyncError(null);
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
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Failed to connect to the Room');
      setConnecting(false);
      console.error('[useRoomState] SSE subscribe failed:', err);
    }

    const syncRuns = async () => {
      if (syncing || disposed) return;
      syncing = true;
      try {
        if (lastSeq === null) {
          const snapshot = await adapter.getAgentRunSnapshot();
          if (disposed) return;
          lastSeq = snapshot.lastSeq;
          setRunsById(hydrateCanonicalRuns(snapshot.runs));
          setWorkspaceMap((prev) => hydrateRunSnapshot(prev, snapshot.runs));
        } else {
          const replay = await adapter.getAgentRunEvents(lastSeq);
          if (disposed) return;
          lastSeq = replay.lastSeq;
          setRunsById((prev) => {
            if (replay.resetRequired && replay.snapshot) {
              return hydrateCanonicalRuns(replay.snapshot.runs);
            }
            return applyCanonicalRunEvents(prev, replay.events);
          });
          setWorkspaceMap((prev) => {
            if (replay.resetRequired && replay.snapshot) {
              return hydrateRunSnapshot(prev, replay.snapshot.runs);
            }
            return replay.events.reduce(
              (state, event) => applyRunEvent(state, event),
              prev,
            );
          });
        }
        setSyncError(null);
      } catch (err) {
        if (!disposed) setSyncError(err instanceof Error ? err.message : 'Failed to sync Room runs');
      } finally {
        syncing = false;
        if (!disposed) setConnecting(false);
      }
    };
    void syncRuns();
    const poll = setInterval(() => { void syncRuns(); }, 1_000);

    return () => {
      disposed = true;
      clearInterval(poll);
      unsub?.();
    };
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

  const canonicalRooms = useMemo(() => indexCanonicalRooms(runsById), [runsById]);
  const focusedRoom = focusedRoomId ? canonicalRooms.roomsById.get(focusedRoomId) : undefined;
  const focusedWorkers = focusedRoomId
    ? (canonicalRooms.childrenByRoomId.get(focusedRoom?.id ?? focusedRoomId) ?? [])
    : [];
  const visibleWorkspaceMap = useMemo(
    () => focusedRoomId
      ? filterWorkspaceMapByRoom(workspaceMap, focusedRoom?.roomId ?? focusedRoomId)
      : workspaceMap,
    [focusedRoom, focusedRoomId, workspaceMap],
  );
  const allWorkspaceIds = useMemo(() => [...visibleWorkspaceMap.keys()], [visibleWorkspaceMap]);
  const totalLive = useMemo(() => {
    let count = 0;
    for (const data of visibleWorkspaceMap.values()) count += data.live.length;
    return count;
  }, [visibleWorkspaceMap]);

  const getWorkspace = (workspaceId: string): WorkspaceAgents | undefined => visibleWorkspaceMap.get(workspaceId);
  const getRoomWorkers = (roomId: string) => {
    const rootId = canonicalRooms.roomsById.get(roomId)?.id ?? roomId;
    return canonicalRooms.childrenByRoomId.get(rootId) ?? [];
  };
  const error = syncError ?? streamError;

  return {
    workspaceMap: visibleWorkspaceMap,
    allWorkspaceMap: workspaceMap,
    allWorkspaceIds,
    totalLive,
    getWorkspace,
    runsById,
    rooms: canonicalRooms.rooms,
    roomsById: canonicalRooms.roomsById,
    childrenByRoomId: canonicalRooms.childrenByRoomId,
    getRoomWorkers,
    focusedRoomId,
    focusedRoom,
    focusedWorkers,
    connecting,
    error,
    reconnect,
  };
}
