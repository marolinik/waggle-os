/**
 * P1a route wrapper — `/files` → FilesAppTabs (§1.1: `?workspace=<id>`
 * replaces the Phase-B.1 `filesViewWorkspaceId` local state plumbing,
 * Desktop.tsx:211,436-451; props otherwise verbatim).
 */
import { useSearchParams } from 'react-router-dom';
import FilesAppTabs from '@/components/os/apps/FilesAppTabs';
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
      <FilesAppTabs
        workspaceId={wsId}
        workspaceName={ws?.name}
        defaultStorageType={ws?.storageType}
        workspaces={workspaces}
        onSelectWorkspace={(id) => setSearchParams({ workspace: id })}
        onContextRail={(target) => setContextRailTarget({ ...target, workspaceId: wsId })}
      />
    </SurfaceBoundary>
  );
};

export default FilesRoute;
