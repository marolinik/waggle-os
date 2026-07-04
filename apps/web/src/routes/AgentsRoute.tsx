/** P1a route wrapper — `/agents` → AgentsApp (props from Desktop.tsx:434). */
import AgentsApp from '@/components/os/apps/AgentsApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const AgentsRoute = () => {
  const { workspaces } = useShell();
  return (
    <SurfaceBoundary appName="Agents">
      <AgentsApp workspaces={workspaces} />
    </SurfaceBoundary>
  );
};

export default AgentsRoute;
