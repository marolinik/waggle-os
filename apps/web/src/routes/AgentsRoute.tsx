/** P1a route wrapper — `/agents` → AgentsApp (props from Desktop.tsx:434). */
import AgentsApp from '@/components/os/apps/AgentsApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const AgentsRoute = () => {
  const { workspaces, activeWorkspaceId } = useShell();
  return (
    <SurfaceBoundary appName="Agents">
      <AgentsApp workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
    </SurfaceBoundary>
  );
};

export default AgentsRoute;
