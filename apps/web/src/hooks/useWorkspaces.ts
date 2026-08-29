import { useState, useCallback, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import { toast } from '@/hooks/use-toast';
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
  const listRevisionRef = useRef(0);

  const fetchWorkspaces = useCallback(async () => {
    const listRevision = ++listRevisionRef.current;
    setLoading(true);
    try {
      const data = await adapter.getWorkspaces();
      if (listRevision !== listRevisionRef.current) return;
      setWorkspaces(data);
      // W2A: NO auto-select. Validate the existing selection against the fresh
      // list (dropping a stale/deleted id to null); never promote data[0].
      setActiveWorkspaceId(prev => resolveActiveWorkspaceId(prev, data.map(w => w.id)));
      setError(null);
    } catch (err) {
      if (listRevision !== listRevisionRef.current) return;
      console.error('[useWorkspaces] fetch failed:', err);
      // P1b D3: surface the failure (this channel existed but was never set —
      // a lost boot race meant an empty workspace list for the whole session)
      // and keep any previously good list rather than clobbering it.
      setError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      if (listRevision === listRevisionRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkspaces(); }, []);
  // P1b D3 plus-clause: errored list revalidates on focus/online/connect-settled.
  useRevalidateOnError(error !== null, fetchWorkspaces);

  const createWorkspace = useCallback(async (data: { name: string; group: string; persona?: string; agentGroupId?: string; shared?: boolean; templateId?: string; storageType?: Workspace['storageType']; storagePath?: string; storageConfig?: Record<string, unknown> }) => {
    try {
      const ws = await adapter.createWorkspace(data);
      ++listRevisionRef.current;
      setLoading(false);
      setError(null);
      setWorkspaces(prev => [...prev.filter(existing => existing.id !== ws.id), ws]);
      setActiveWorkspaceId(ws.id);
      persistWorkspaceId(ws.id);
      return ws;
    } catch (err) {
      console.error('[useWorkspaces] create failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      setError(message);
      toast({
        title: "Couldn't create workspace",
        description: message,
        variant: 'destructive',
      });
      return null;
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
    ++listRevisionRef.current;
    setLoading(false);
    setError(null);
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    // W2A: deleting the active workspace clears the selection (no silent
    // successor-pick) — the shell then prompts the user to choose one.
    setActiveWorkspaceId(current => {
      if (current !== id) return current;
      clearPersistedWorkspaceId();
      return null;
    });
    return true;
  }, []);

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
