/**
 * P1a route wrapper — `/workspaces/:workspaceId/:tab?` → WorkspaceDesktopApp
 * (§1.1 /workspaces row; props from Desktop.tsx:392-406).
 *
 * Stage-A stub for the param plumbing: `:tab?` is read but not yet passed —
 * the controlled activeTab/onTabChange seam is the founder-ratified two-seam
 * WorkspaceDesktopApp edit (§5.2) and lands in Stage B, together with the
 * chat-tab ChatWindowInstance embed (until then the chat tab keeps its
 * deep-link placeholder). `?session=` stays reserved (§5.3 #5).
 */
import { useNavigate, useParams } from 'react-router-dom';
import WorkspaceDesktopApp from '@/components/os/apps/WorkspaceDesktopApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const WorkspaceRoute = () => {
  const navigate = useNavigate();
  const { workspaceId, tab } = useParams();
  const { workspaces, activeWorkspaceId, selectWorkspace } = useShell();
  // Fall back to the active workspace if the param is missing (parity with the
  // restored-window fallback, Desktop.tsx:393).
  const wsId = workspaceId || activeWorkspaceId || 'local-default';
  const ws = workspaces.find(w => w.id === wsId);
  // TODO(stage-B): pass `tab` as controlled activeTab + onTabChange→navigate
  // once the §5.2 seam lands.
  void tab;
  return (
    <SurfaceBoundary appName="Workspace">
      <WorkspaceDesktopApp
        workspaceId={wsId}
        workspaceName={ws?.name ?? 'Workspace'}
        onOpenChat={(id) => {
          selectWorkspace(id);
          navigate(`/workspaces/${id}/chat`);
        }}
      />
    </SurfaceBoundary>
  );
};

export default WorkspaceRoute;
