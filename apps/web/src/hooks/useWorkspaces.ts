import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';

const DEFAULT_WORKSPACE: Workspace = {
  id: 'local-default',
  name: 'Default Workspace',
  group: 'Personal',
  persona: 'researcher',
  health: 'healthy',
  memoryCount: 0,
  sessionCount: 0,
  lastActive: new Date().toISOString(),
};

export const useWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_WORKSPACE]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(DEFAULT_WORKSPACE.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getWorkspaces();
      if (data.length > 0) {
        setWorkspaces(data);
        if (!activeWorkspaceId || activeWorkspaceId === DEFAULT_WORKSPACE.id) {
          setActiveWorkspaceId(data[0].id);
        }
      }
      setError(null);
    } catch (err) {
      console.error('[useWorkspaces] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { fetchWorkspaces(); }, []);

  const createWorkspace = useCallback(async (data: { name: string; group: string; persona?: string; agentGroupId?: string; shared?: boolean; templateId?: string }) => {
    try {
      const ws = await adapter.createWorkspace(data);
      setWorkspaces(prev => [...prev.filter(w => w.id !== DEFAULT_WORKSPACE.id), ws]);
      setActiveWorkspaceId(ws.id);
      return ws;
    } catch (err) {
      console.error('[useWorkspaces] create failed, using local fallback:', err);
      const localWs: Workspace = {
        id: `local-${Date.now()}`,
        name: data.name,
        group: data.group,
        persona: data.persona,
        shared: data.shared,
        templateId: data.templateId,
        health: 'healthy',
        memoryCount: 0,
        sessionCount: 0,
        lastActive: new Date().toISOString(),
      };
      setWorkspaces(prev => [...prev.filter(w => w.id !== DEFAULT_WORKSPACE.id), localWs]);
      setActiveWorkspaceId(localWs.id);
      return localWs;
    }
  }, []);

  const deleteWorkspace = useCallback(async (id: string) => {
    try { await adapter.deleteWorkspace(id); } catch (err) { console.error('[useWorkspaces] delete failed:', err); }
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(workspaces.find(w => w.id !== id)?.id || null);
    }
  }, [activeWorkspaceId, workspaces]);

  const patchWorkspace = useCallback(async (id: string, data: Partial<Pick<Workspace, 'persona' | 'agentGroupId' | 'name' | 'group' | 'model'>>) => {
    try {
      await adapter.patchWorkspace(id, data);
    } catch (err) { console.error('[useWorkspaces] patch failed:', err); }
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, ...data } : w));
  }, []);

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null;

  return {
    workspaces, activeWorkspace, activeWorkspaceId,
    loading, error, createWorkspace, deleteWorkspace,
    patchWorkspace, selectWorkspace, refresh: fetchWorkspaces,
  };
};
