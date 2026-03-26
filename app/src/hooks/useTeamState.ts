/**
 * useTeamState — Manages team connection lifecycle and team messages polling.
 *
 * Team presence and team activity are handled by @waggle/ui hooks
 * (useTeamPresence, useTeamActivity). This hook covers:
 * - Team messages polling (Waggle Dance messages)
 * - Team connection status (connect/disconnect/list)
 */

import { useState, useEffect, useCallback } from 'react';
import type { TeamMessage } from '@waggle/ui';
import type { TeamConnection } from '@waggle/ui';
import type { LocalAdapter } from '@waggle/ui';

export interface UseTeamStateOptions {
  /** Active workspace's teamId, if any */
  teamId: string | undefined;
  /** Server base URL for team message endpoint */
  serverBaseUrl: string;
  /** LocalAdapter instance for team connection methods */
  adapter: LocalAdapter;
  /** Polling interval for team messages in ms (default: 30000) */
  pollInterval?: number;
}

export interface UseTeamStateReturn {
  /** Waggle Dance team messages for active workspace */
  teamMessages: TeamMessage[];
  /** Current team connection info */
  teamConnection: TeamConnection | null;
  /** Connect to a team server */
  handleTeamConnect: (serverUrl: string, token: string) => Promise<void>;
  /** Disconnect from team */
  handleTeamDisconnect: () => Promise<void>;
  /** Fetch list of teams */
  handleFetchTeams: () => ReturnType<LocalAdapter['listTeams']>;
}

export function useTeamState({
  teamId,
  serverBaseUrl,
  adapter,
  pollInterval = 30_000,
}: UseTeamStateOptions): UseTeamStateReturn {
  // ── Team messages polling ──────────────────────────────────────
  const [teamMessages, setTeamMessages] = useState<TeamMessage[]>([]);

  useEffect(() => {
    if (!teamId) { setTeamMessages([]); return; }

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${serverBaseUrl}/api/team/messages?workspaceId=${teamId}`);
        if (res.ok) {
          const data = await res.json();
          setTeamMessages(data.messages ?? []);
        }
      } catch { /* silent */ }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, pollInterval);
    return () => clearInterval(interval);
  }, [teamId, serverBaseUrl, pollInterval]);

  // ── Team connection ────────────────────────────────────────────
  const [teamConnection, setTeamConnection] = useState<TeamConnection | null>(null);

  // Check team status on mount
  useEffect(() => {
    adapter.getTeamStatus()
      .then((tc) => setTeamConnection(tc))
      .catch(() => {});
  }, [adapter]);

  const handleTeamConnect = useCallback(async (serverUrl: string, token: string) => {
    const tc = await adapter.connectTeam(serverUrl, token);
    setTeamConnection(tc);
  }, [adapter]);

  const handleTeamDisconnect = useCallback(async () => {
    await adapter.disconnectTeam();
    setTeamConnection(null);
  }, [adapter]);

  const handleFetchTeams = useCallback(async () => {
    return adapter.listTeams();
  }, [adapter]);

  return {
    teamMessages,
    teamConnection,
    handleTeamConnect,
    handleTeamDisconnect,
    handleFetchTeams,
  };
}
