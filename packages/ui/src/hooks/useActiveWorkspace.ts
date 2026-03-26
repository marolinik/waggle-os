/**
 * useActiveWorkspace — manages active workspace switching with mind context.
 *
 * Tracks the currently active workspace and provides a switchWorkspace
 * callback that updates the active workspace by ID. When switching workspaces,
 * the corresponding .mind file context changes automatically (handled by
 * the server's workspace-scoped agent sessions).
 */

import { useState, useCallback, useMemo } from 'react';
import type { WaggleService, Workspace } from '../services/types.js';

export interface UseActiveWorkspaceOptions {
  service: WaggleService;
  workspaces: Workspace[];
  initialId?: string | null;
}

export interface UseActiveWorkspaceReturn {
  activeId: string | null;
  workspace: Workspace | null;
  switchWorkspace: (id: string) => void;
}

export function useActiveWorkspace({
  workspaces,
  initialId = null,
}: UseActiveWorkspaceOptions): UseActiveWorkspaceReturn {
  const [activeId, setActiveId] = useState<string | null>(initialId);

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const switchWorkspace = useCallback((id: string) => {
    setActiveId(id);
    // The server handles mind context switching when we send messages
    // scoped to a workspace ID — no explicit API call needed here.
    // Future: could notify the service to preload the workspace's .mind file.
  }, []);

  return { activeId, workspace, switchWorkspace };
}
