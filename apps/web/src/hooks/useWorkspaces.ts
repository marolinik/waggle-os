import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';

export const useWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getWorkspaces();
      setWorkspaces(data);
      if (!activeWorkspaceId && data.length > 0) {
        setActiveWorkspaceId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { fetchWorkspaces(); }, []);

  const createWorkspace = useCallback(async (data: { name: string; group: string; persona?: string }) => {
    const ws = await adapter.createWorkspace(data);
    setWorkspaces(prev => [...prev, ws]);
    setActiveWorkspaceId(ws.id);
    return ws;
  }, []);

  const deleteWorkspace = useCallback(async (id: string) => {
    await adapter.deleteWorkspace(id);
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(workspaces.find(w => w.id !== id)?.id || null);
    }
  }, [activeWorkspaceId, workspaces]);

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null;

  return {
    workspaces, activeWorkspace, activeWorkspaceId,
    loading, error, createWorkspace, deleteWorkspace,
    selectWorkspace, refresh: fetchWorkspaces,
  };
};
