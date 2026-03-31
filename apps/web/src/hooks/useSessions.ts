import { useState, useCallback, useEffect } from 'react';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) { setSessions([]); setActiveSessionId(null); return; }
    setLoading(true);
    adapter.getSessions(workspaceId)
      .then(data => {
        if (data.length > 0) {
          setSessions(data);
          if (!activeSessionId) setActiveSessionId(data[0].id);
        } else {
          const def = makeDefaultSession(workspaceId);
          setSessions([def]);
          setActiveSessionId(def.id);
        }
      })
      .catch((err) => {
        console.error('[useSessions] fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
        const def = makeDefaultSession(workspaceId);
        setSessions([def]);
        setActiveSessionId(def.id);
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const createSession = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const session = await adapter.createSession(workspaceId);
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      return session;
    } catch (err) {
      console.error('[useSessions] create failed, using local fallback:', err);
      const local: Session = {
        id: `local-session-${Date.now()}`,
        workspaceId,
        title: 'New Session',
        messageCount: 0,
        lastActive: new Date().toISOString(),
      };
      setSessions(prev => [local, ...prev]);
      setActiveSessionId(local.id);
      return local;
    }
  }, [workspaceId]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!workspaceId) return;
    try { await adapter.deleteSession(sessionId, workspaceId); } catch (err) { console.error('[useSessions] delete failed:', err); }
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
    }
  }, [workspaceId, activeSessionId, sessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!workspaceId) return;
    try { await adapter.renameSession(workspaceId, sessionId, title); } catch (err) { console.error('[useSessions] rename failed:', err); }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
  }, [workspaceId]);

  return {
    sessions, activeSessionId, setActiveSessionId,
    loading, error, createSession, deleteSession, renameSession,
  };
};
