/**
 * useSessions — React hook for session management.
 *
 * Takes a WaggleService instance and workspaceId. Returns session state + actions.
 * Groups sessions by time period for the list view.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WaggleService, Session, SessionSearchResult } from '../services/types.js';
import { groupSessionsByTime, sortSessions } from '../components/sessions/utils.js';

export interface UseSessionsOptions {
  service: WaggleService;
  workspaceId: string;
}

export interface UseSessionsReturn {
  sessions: Session[];
  grouped: Record<string, Session[]>;
  loading: boolean;
  error: string | null;
  activeSessionId: string | null;
  selectSession: (id: string) => void;
  createSession: (title?: string) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  refresh: () => Promise<void>;
  searchQuery: string;
  searchResults: SessionSearchResult[] | null;
  searchLoading: boolean;
  searchSessions: (query: string) => Promise<void>;
  clearSearch: () => void;
  exportSession: (id: string) => Promise<void>;
}

function lastSessionKey(wsId: string): string {
  return `waggle:lastSession:${wsId}`;
}

export function useSessions({ service, workspaceId }: UseSessionsOptions): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SessionSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await service.listSessions(workspaceId);
      const sorted = sortSessions(list);
      setSessions(sorted);
      // Restore last session from localStorage, fall back to first
      if (sorted.length > 0) {
        let restoredId: string | null = null;
        try {
          const stored = localStorage.getItem(lastSessionKey(workspaceId));
          if (stored && sorted.some((s) => s.id === stored)) {
            restoredId = stored;
          }
        } catch {
          // localStorage unavailable — ignore
        }
        setActiveSessionId(restoredId ?? sorted[0].id);
      } else {
        setActiveSessionId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [service, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load sessions on mount and when workspace changes
  useEffect(() => {
    let cancelled = false;
    loadSessions().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [loadSessions]);

  // F4: Filter out auto-created empty sessions (UUID-named with 0 messages) before grouping
  const UUID_SESSION_RE = /^session-[0-9a-f]{8}-/;
  const displaySessions = useMemo(
    () => sessions.filter(s => s.messageCount > 0 || !UUID_SESSION_RE.test(s.id)),
    [sessions]
  );
  const grouped = useMemo(() => groupSessionsByTime(displaySessions), [displaySessions]);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    try {
      localStorage.setItem(lastSessionKey(workspaceId), id);
    } catch {
      // localStorage unavailable — ignore
    }
  }, [workspaceId]);

  const createSession = useCallback(async (title?: string): Promise<Session> => {
    const session = await service.createSession(workspaceId, title);
    setSessions((prev) => sortSessions([session, ...prev]));
    setActiveSessionId(session.id);
    try {
      localStorage.setItem(lastSessionKey(workspaceId), session.id);
    } catch {
      // localStorage unavailable — ignore
    }
    return session;
  }, [service, workspaceId]);

  const deleteSession = useCallback(async (id: string): Promise<void> => {
    await service.deleteSession(id, workspaceId);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  }, [service, workspaceId, activeSessionId]);

  const renameSession = useCallback(async (id: string, title: string): Promise<void> => {
    await service.renameSession(id, workspaceId, title);
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s)),
    );
  }, [service, workspaceId]);

  const refresh = useCallback(async () => {
    await loadSessions();
  }, [loadSessions]);

  const doSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query || query.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await service.searchSessions(workspaceId, query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [service, workspaceId]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  const exportSession = useCallback(async (id: string) => {
    try {
      const markdown = await service.exportSession(workspaceId, id);
      const session = sessions.find(s => s.id === id);
      const filename = (session?.title ?? id).replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 50) + '.md';
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail — could add error state later
    }
  }, [service, workspaceId, sessions]);

  return {
    sessions,
    grouped,
    loading,
    error,
    activeSessionId,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    refresh,
    searchQuery,
    searchResults,
    searchLoading,
    searchSessions: doSearch,
    clearSearch,
    exportSession,
  };
}
