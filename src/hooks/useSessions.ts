import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { Session } from '@/lib/types';

export const useSessions = (workspaceId: string | null) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) { setSessions([]); return; }
    setLoading(true);
    adapter.getSessions(workspaceId)
      .then(data => {
        setSessions(data);
        if (data.length > 0 && !activeSessionId) setActiveSessionId(data[0].id);
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const createSession = useCallback(async () => {
    if (!workspaceId) return;
    const session = await adapter.createSession(workspaceId);
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    return session;
  }, [workspaceId]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!workspaceId) return;
    await adapter.deleteSession(sessionId, workspaceId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(sessions.find(s => s.id !== sessionId)?.id || null);
    }
  }, [workspaceId, activeSessionId, sessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!workspaceId) return;
    await adapter.renameSession(workspaceId, sessionId, title);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
  }, [workspaceId]);

  return {
    sessions, activeSessionId, setActiveSessionId,
    loading, createSession, deleteSession, renameSession,
  };
};
