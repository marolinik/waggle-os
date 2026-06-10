/** P1a route wrapper — `/home` → HomeCockpit (§5.1; props from Desktop.tsx:363-382). */
import { useNavigate } from 'react-router-dom';
import HomeCockpit from '@/components/os/apps/HomeCockpit';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { routeFor } from '@/lib/routes';

const HomeRoute = () => {
  const navigate = useNavigate();
  const { selectWorkspace, overlays } = useShell();
  return (
    <SurfaceBoundary appName="Home">
      <HomeCockpit
        onContinue={(workspaceId, sessionId) => {
          selectWorkspace(workspaceId);
          // sessionId: same known gap as the windowed shell (Desktop.tsx:366-373)
          // — `?session=` targeted restore lands when the chat runtime accepts a
          // sessionId seed (plan §5.3 #5; URL shape reserved).
          void sessionId;
          navigate(routeFor('chat', { activeWorkspaceId: workspaceId }));
        }}
        onOpenWorkspaceDesktop={(workspaceId) => {
          selectWorkspace(workspaceId);
          navigate(routeFor('workspace-desktop', { activeWorkspaceId: workspaceId }));
        }}
        onCreateWorkspace={() => overlays.setShowCreateWorkspace(true)}
      />
    </SurfaceBoundary>
  );
};

export default HomeRoute;
