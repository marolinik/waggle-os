/** P1a route wrapper — `/launcher` → LauncherApp (props from Desktop.tsx:454). */
import LauncherApp from '@/components/os/apps/LauncherApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { useNavigate } from 'react-router-dom';

const LauncherRoute = () => {
  const { activeWorkspaceId, workspaces } = useShell();
  const navigate = useNavigate();
  return (
    <SurfaceBoundary appName="Tool Launcher">
      <LauncherApp
        activeWorkspaceId={activeWorkspaceId ?? undefined}
        workspaces={workspaces}
        onOpenRoom={(roomId) => navigate(`/room?room=${encodeURIComponent(roomId)}`)}
      />
    </SurfaceBoundary>
  );
};

export default LauncherRoute;
