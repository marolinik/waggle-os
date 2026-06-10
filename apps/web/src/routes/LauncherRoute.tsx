/** P1a route wrapper — `/launcher` → LauncherApp (props from Desktop.tsx:454). */
import LauncherApp from '@/components/os/apps/LauncherApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const LauncherRoute = () => {
  const { activeWorkspaceId } = useShell();
  return (
    <SurfaceBoundary appName="Tool Launcher">
      <LauncherApp activeWorkspaceId={activeWorkspaceId ?? undefined} />
    </SurfaceBoundary>
  );
};

export default LauncherRoute;
