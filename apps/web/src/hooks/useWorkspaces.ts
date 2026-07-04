import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import {
  resolveActiveWorkspaceId,
  readPersistedWorkspaceId,
  persistWorkspaceId,
  clearPersistedWorkspaceId,
} from '@/lib/workspace-selection';

export const useWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // W2A: selection is explicit-only + survives full page loads. Seed from
  // localStorage so a typed-URL visit to / or /workspaces keeps the workspace.
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => readPersistedWorkspaceId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getWorkspaces();
      setWorkspaces(data);
      // W2A: NO auto-select. Validate the existing selection against the fresh
      // list (dropping a stale/deleted id to null); never promote data[0].
      setActiveWorkspaceId(prev => resolveActiveWorkspaceId(prev, data.map(w => w.id)));
      setError(null);
    } catch (err) {
      console.error('[useWorkspaces] fetch failed:', err);
      // P1b D3: surface the failure (this channel existed but was never set —
      // a lost boot race meant an empty workspace list for the whole session)
      // and keep any previously good list rather than clobbering it.
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkspaces(); }, []);
  // P1b D3 plus-clause: errored list revalidates on focus/online/connect-settled.
  useRevalidateOnError(error !== null, fetchWorkspaces);

  const createWorkspace = useCallback(async (data: { name: string; group: string; persona?: string; agentGroupId?: string; shared?: boolean; templateId?: string }) => {
    try {
      const ws = await adapter.createWorkspace(data);
      setWorkspaces(prev => [...prev, ws]);
      setActiveWorkspaceId(ws.id);
      persistWorkspaceId(ws.id);
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
      setWorkspaces(prev => [...prev, localWs]);
      setActiveWorkspaceId(localWs.id);
      persistWorkspaceId(localWs.id);
      return localWs;
    }
  }, []);

  // G4 (UX-Northstar 2026-06-13): state mutates ONLY on server success — a failed
  // delete/patch must not pretend it happened (error-as-empty antipattern).
  // Returns success so menu-style callers can toast; legacy fire-and-forget
  // callers (AppShell persona/group switch) keep working without throw.
  const deleteWorkspace = useCallback(async (id: string): Promise<boolean> => {
    try {
      await adapter.deleteWorkspace(id);
    } catch (err) {
      console.error('[useWorkspaces] delete failed:', err);
      return false;
    }
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    // W2A: deleting the active workspace clears the selection (no silent
    // successor-pick) — the shell then prompts the user to choose one.
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(null);
      clearPersistedWorkspaceId();
    }
    return true;
  }, [activeWorkspaceId]);

  const patchWorkspace = useCallback(async (id: string, data: Partial<Pick<Workspace, 'persona' | 'agentGroupId' | 'name' | 'group' | 'model' | 'status' | 'description'>>): Promise<boolean> => {
    try {
      await adapter.patchWorkspace(id, data);
    } catch (err) {
      console.error('[useWorkspaces] patch failed:', err);
      return false;
    }
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, ...data } : w));
    return true;
  }, []);

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    persistWorkspaceId(id);
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || null;

  return {
    workspaces, activeWorkspace, activeWorkspaceId,
    loading, error, createWorkspace, deleteWorkspace,
    patchWorkspace, selectWorkspace, refresh: fetchWorkspaces,
  };
};
