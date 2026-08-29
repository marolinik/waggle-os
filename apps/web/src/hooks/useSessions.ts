import { useState, useCallback, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';
import type { Session } from '@/lib/types';

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
  const listRevisionRef = useRef(0);
  const mountedRef = useRef(false);
  const workspaceRef = useRef(workspaceId);
  const createInFlightRef = useRef(new Map<string, Promise<Session | undefined>>());
  workspaceRef.current = workspaceId;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const listRevision = ++listRevisionRef.current;
    let cancelled = false;
    if (!workspaceId) {
      setSessions([]);
      setActiveSessionId(null);
      setLoading(false);
      setCreating(false);
      setError(null);
      return;
    }
    // Reset active session on workspace change to avoid stale cross-workspace refs
    setSessions([]);
    setActiveSessionId(null);
    setLoading(true);
    setCreating(false);
    setError(null);
    adapter.getSessions(workspaceId)
      .then(data => {
        if (cancelled || listRevision !== listRevisionRef.current) return;
        setError(null);
        if (data.length > 0) {
          const scopedSessions = data.map(session => ({ ...session, workspaceId }));
          setSessions(scopedSessions);
          setActiveSessionId(scopedSessions[0].id);
        } else {
          const def = makeDefaultSession(workspaceId);
          setSessions([def]);
          setActiveSessionId(def.id);
        }
      })
      .catch((err) => {
        if (cancelled || listRevision !== listRevisionRef.current) return;
        console.error('[useSessions] fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
        setSessions([]);
        setActiveSessionId(null);
      })
      .finally(() => {
        if (!cancelled && listRevision === listRevisionRef.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const createSession = useCallback((): Promise<Session | undefined> => {
    if (!workspaceId) return Promise.resolve(undefined);
    const pending = createInFlightRef.current.get(workspaceId);
    if (pending) return pending;
    setCreating(true);

    const request = (async () => {
      try {
        const wireSession = await adapter.createSession(workspaceId);
        const session = { ...wireSession, workspaceId };
        if (!mountedRef.current || workspaceRef.current !== workspaceId) return undefined;
        ++listRevisionRef.current;
        setLoading(false);
        setError(null);
        setSessions(prev => [
          session,
          ...prev.filter(existing => existing.workspaceId === workspaceId && existing.id !== session.id),
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
    setError(null);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
  }, [workspaceId]);

  return {
    sessions, activeSessionId, setActiveSessionId,
    loading, creating, error, createSession, deleteSession, renameSession,
  };
};
