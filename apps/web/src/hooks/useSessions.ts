import { useState, useCallback, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';
import type { Session } from '@/lib/types';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';

const makeDefaultSession = (workspaceId: string): Session => ({
  id: `local-session-${workspaceId}`,
  workspaceId,
  title: 'New Session',
  messageCount: 0,
  lastActive: new Date().toISOString(),
});

export const useSessions = (workspaceId: string | null) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const listRevisionRef = useRef(0);
  const mountedRef = useRef(false);
  const workspaceRef = useRef(workspaceId);
  const activeSessionIdRef = useRef(activeSessionId);
  const loadingRef = useRef(loading);
  const createInFlightRef = useRef(new Map<string, Promise<Session | undefined>>());
  workspaceRef.current = workspaceId;
  activeSessionIdRef.current = activeSessionId;
  loadingRef.current = loading;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshSessions = useCallback(() => {
    const requestedWorkspaceId = workspaceId;
    const listRevision = ++listRevisionRef.current;
    if (!requestedWorkspaceId) {
      setSessions([]);
      setActiveSessionId(null);
      setLoading(false);
      setCreating(false);
      setError(null);
      setListFailed(false);
      return;
    }
    // Reset active session on workspace change to avoid stale cross-workspace refs
    setSessions([]);
    setActiveSessionId(null);
    setLoading(true);
    setCreating(createInFlightRef.current.has(requestedWorkspaceId));
    setError(null);
    setListFailed(false);
    adapter.getSessions(requestedWorkspaceId)
      .then(data => {
        if (!mountedRef.current
          || requestedWorkspaceId !== workspaceRef.current
          || listRevision !== listRevisionRef.current) return;
        setError(null);
        if (data.length > 0) {
          const scopedSessions = data.map(session => ({ ...session, workspaceId: requestedWorkspaceId }));
          setSessions(scopedSessions);
          setActiveSessionId(scopedSessions[0].id);
        } else {
          const def = makeDefaultSession(requestedWorkspaceId);
          setSessions([def]);
          setActiveSessionId(def.id);
        }
      })
      .catch((err) => {
        if (!mountedRef.current
          || requestedWorkspaceId !== workspaceRef.current
          || listRevision !== listRevisionRef.current) return;
        console.error('[useSessions] fetch failed:', err);
        setListFailed(true);
        setError(err instanceof Error ? err.message : 'Failed to load');
        setSessions([]);
        setActiveSessionId(null);
      })
      .finally(() => {
        if (mountedRef.current
          && requestedWorkspaceId === workspaceRef.current
          && listRevision === listRevisionRef.current) setLoading(false);
      });
  }, [workspaceId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useRevalidateOnError(listFailed, refreshSessions);

  const revalidateSessions = useCallback(async (
    expectedWorkspaceId: string | null = workspaceRef.current,
    expectedSessionId?: string,
  ): Promise<boolean> => {
    if (
      !expectedWorkspaceId
      || expectedWorkspaceId !== workspaceRef.current
      || loadingRef.current
    ) return false;

    const listRevision = ++listRevisionRef.current;
    try {
      const data = await adapter.getSessions(expectedWorkspaceId);
      if (
        !mountedRef.current
        || expectedWorkspaceId !== workspaceRef.current
        || listRevision !== listRevisionRef.current
      ) return false;

      const scopedSessions = data.map(session => ({
        ...session,
        workspaceId: expectedWorkspaceId,
      }));
      const activeId = activeSessionIdRef.current;
      if (
        !activeId
        || !scopedSessions.some(session => session.id === activeId)
        || (expectedSessionId && !scopedSessions.some(session => session.id === expectedSessionId))
      ) return false;

      setSessions(scopedSessions);
      return true;
    } catch (err) {
      if (
        mountedRef.current
        && expectedWorkspaceId === workspaceRef.current
        && listRevision === listRevisionRef.current
      ) console.error('[useSessions] metadata refresh failed:', err);
      return false;
    }
  }, []);

  const createSession = useCallback((): Promise<Session | undefined> => {
    if (!workspaceId) return Promise.resolve(undefined);
    const pending = createInFlightRef.current.get(workspaceId);
    if (pending) {
      setCreating(true);
      return pending;
    }
    setCreating(true);

    const request = (async () => {
      try {
        const wireSession = await adapter.createSession(workspaceId);
        const session = { ...wireSession, workspaceId };
        if (!mountedRef.current || workspaceRef.current !== workspaceId) return undefined;
        ++listRevisionRef.current;
        setLoading(false);
        setError(null);
        setListFailed(false);
        setSessions(prev => [
          session,
          ...prev.filter(existing => existing.workspaceId === workspaceId
            && existing.id !== session.id
            && existing.id !== `local-session-${workspaceId}`),
        ]);
        setActiveSessionId(session.id);
        return session;
      } catch (err) {
        if (!mountedRef.current || workspaceRef.current !== workspaceId) return undefined;
        console.error('[useSessions] create failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to create session');
        return undefined;
      } finally {
        createInFlightRef.current.delete(workspaceId);
        if (mountedRef.current && workspaceRef.current === workspaceId) setCreating(false);
      }
    })();
    createInFlightRef.current.set(workspaceId, request);
    return request;
  }, [workspaceId]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!workspaceId) return;
    try {
      await adapter.deleteSession(sessionId, workspaceId);
    } catch (err) {
      if (!mountedRef.current || workspaceRef.current !== workspaceId) return;
      console.error('[useSessions] delete failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session');
      return;
    }
    if (!mountedRef.current || workspaceRef.current !== workspaceId) return;
    ++listRevisionRef.current;
    setLoading(false);
    setError(null);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setActiveSessionId(current => current === sessionId
      ? sessions.find(s => s.id !== sessionId)?.id || null
      : current);
  }, [workspaceId, sessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!workspaceId) return;
    try {
      await adapter.renameSession(workspaceId, sessionId, title);
    } catch (err) {
      if (!mountedRef.current || workspaceRef.current !== workspaceId) return;
      console.error('[useSessions] rename failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename session');
      return;
    }
    if (!mountedRef.current || workspaceRef.current !== workspaceId) return;
    ++listRevisionRef.current;
    setLoading(false);
    setError(null);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
  }, [workspaceId]);

  return {
    sessions, activeSessionId, setActiveSessionId,
    loading, creating, error, createSession, deleteSession, renameSession,
    revalidateSessions,
  };
};
