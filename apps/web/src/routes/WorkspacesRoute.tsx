/** PR6c route wrapper — `/workspaces` → AllWorkspacesApp (the full shelf; replaces
 *  the §9.7 `/workspaces`→`/home` redirect, D15). */
import { useNavigate } from 'react-router-dom';
import AllWorkspacesApp from '@/components/os/apps/AllWorkspacesApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { routeFor } from '@/lib/routes';

const WorkspacesRoute = () => {
  const navigate = useNavigate();
  const { selectWorkspace } = useShell();
  return (
    <SurfaceBoundary appName="All workspaces">
      <AllWorkspacesApp
        onOpenWorkspace={(workspaceId) => {
          selectWorkspace(workspaceId);
          navigate(routeFor('workspace-desktop', { activeWorkspaceId: workspaceId }));
        }}
      />
    </SurfaceBoundary>
  );
};

export default WorkspacesRoute;
