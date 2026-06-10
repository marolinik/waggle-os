/** P1a route wrapper — `/settings/timeline` → TimelineApp (props from Desktop.tsx:463). */
import TimelineApp from '@/components/os/apps/TimelineApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const TimelineRoute = () => {
  const { activeWorkspaceId, activeWorkspace } = useShell();
  return (
    <SurfaceBoundary appName="Timeline">
      <TimelineApp workspaceId={activeWorkspaceId ?? undefined} workspaceName={activeWorkspace?.name} />
    </SurfaceBoundary>
  );
};

export default TimelineRoute;
