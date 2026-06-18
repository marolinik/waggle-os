/**
 * P1a route wrapper — `/files` → StorageAndFilesApp (§1.1: `?workspace=<id>`
 * replaces the Phase-B.1 `filesViewWorkspaceId` local state plumbing,
 * Desktop.tsx:211,436-451; props otherwise verbatim).
 *
 * PR6b/B2 (screen 07): the route now renders the A/B `StorageAndFilesApp`
 * wrapper — Variation A ("Where it lives") + Variation B (the existing
 * FilesAppTabs browser). All previous FilesAppTabs props pass through B
 * verbatim; the resolved workspace record additionally feeds Variation A.
 */
import { useSearchParams } from 'react-router-dom';
import StorageAndFilesApp from '@/components/os/apps/StorageAndFilesApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const FilesRoute = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaces, activeWorkspaceId, setContextRailTarget } = useShell();
  // Prefer the URL-chosen workspace, falling back to the global active one on
  // first open — same precedence as filesViewWorkspaceId ?? activeWorkspaceId.
  const wsId = searchParams.get('workspace') ?? activeWorkspaceId ?? 'local-default';
  const ws = workspaces.find(w => w.id === wsId);
  return (
    <SurfaceBoundary appName="Files">
      <StorageAndFilesApp
        workspaceId={wsId}
        workspaceName={ws?.name}
        defaultStorageType={ws?.storageType}
        workspace={ws}
        workspaces={workspaces}
        onSelectWorkspace={(id) => setSearchParams({ workspace: id })}
        onContextRail={(target) => setContextRailTarget({ ...target, workspaceId: wsId })}
      />
    </SurfaceBoundary>
  );
};

export default FilesRoute;
