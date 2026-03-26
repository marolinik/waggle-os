/**
 * useWorkspaces — React hook for workspace management.
 *
 * Takes a WaggleService instance. Returns workspace state + CRUD actions.
 * Groups workspaces by `group` field for the tree view.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WaggleService, Workspace } from '../services/types.js';
import { groupWorkspacesByGroup } from '../components/workspace/utils.js';

export interface UseWorkspacesOptions {
  service: WaggleService;
}

export interface UseWorkspacesReturn {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (config: Partial<Workspace>) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateWorkspace: (id: string, config: Partial<Workspace>) => Promise<void>;
  groups: Record<string, Workspace[]>;
  loading: boolean;
}

const LAST_WORKSPACE_KEY = 'waggle:lastWorkspaceId';

export function useWorkspaces({ service }: UseWorkspacesOptions): UseWorkspacesReturn {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load workspaces on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    service.listWorkspaces().then((list) => {
      if (!cancelled) {
        setWorkspaces(list);
        // Restore last workspace from localStorage, fall back to first
        if (!activeId && list.length > 0) {
          let restoredId: string | null = null;
          try {
            const stored = localStorage.getItem(LAST_WORKSPACE_KEY);
            if (stored && list.some((ws) => ws.id === stored)) {
              restoredId = stored;
            }
          } catch {
            // localStorage unavailable — ignore
          }
          setActiveId(restoredId ?? list[0].id);
        }
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [service]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === activeId) || null,
    [workspaces, activeId],
  );

  const groups = useMemo(() => groupWorkspacesByGroup(workspaces), [workspaces]);

  const setActiveWorkspace = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(LAST_WORKSPACE_KEY, id);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  const createWorkspace = useCallback(async (config: Partial<Workspace>): Promise<Workspace> => {
    const ws = await service.createWorkspace(config);
    setWorkspaces((prev) => [...prev, ws]);
    return ws;
  }, [service]);

  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    await service.deleteWorkspace(id);
    setWorkspaces((prev) => prev.filter((ws) => ws.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  }, [service, activeId]);

  const updateWorkspace = useCallback(async (id: string, config: Partial<Workspace>): Promise<void> => {
    await service.updateWorkspace(id, config);
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === id ? { ...ws, ...config } : ws)),
    );
  }, [service]);

  return {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    updateWorkspace,
    groups,
    loading,
  };
}
