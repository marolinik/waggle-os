/**
 * useTeamPresence — real-time team presence via WebSocket with polling fallback.
 *
 * Only active when the current workspace has a teamId.
 * Primary: WebSocket `presence_update` events via service.on().
 * Fallback: HTTP polling every 60 seconds via /api/team/presence proxy.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { TeamMember, WaggleService } from '../services/types.js';

export interface UseTeamPresenceOptions {
  /** Base URL of the local server */
  baseUrl?: string;
  /** Current workspace's teamId (null/undefined = not a team workspace) */
  teamId?: string;
  /** WaggleService instance for WebSocket event subscription */
  service?: WaggleService;
  /** Fallback poll interval in ms (default: 60000 — longer since WS is primary) */
  pollInterval?: number;
}

export interface UseTeamPresenceReturn {
  members: TeamMember[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useTeamPresence({
  baseUrl = 'http://127.0.0.1:3333',
  teamId,
  service,
  pollInterval = 60_000,
}: UseTeamPresenceOptions): UseTeamPresenceReturn {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // HTTP fetch (used for initial load + fallback polling)
  const fetchPresence = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/team/presence?workspaceId=${teamId}`);
      if (res.ok) {
        const data = await res.json() as { members: TeamMember[] };
        setMembers(data.members ?? []);
      }
    } catch {
      // Non-critical — presence is optional
    } finally {
      setLoading(false);
    }
  }, [baseUrl, teamId]);

  // Initial fetch + fallback polling
  useEffect(() => {
    if (!teamId) {
      setMembers([]);
      return;
    }

    fetchPresence();
    intervalRef.current = setInterval(fetchPresence, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [teamId, fetchPresence, pollInterval]);

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!teamId || !service) return;
    const unsubscribe = service.on('presence_update', (data: unknown) => {
      const event = data as { members?: TeamMember[] };
      if (event.members) {
        setMembers(event.members);
      }
    });
    return unsubscribe;
  }, [teamId, service]);

  return { members, loading, refresh: fetchPresence };
}
