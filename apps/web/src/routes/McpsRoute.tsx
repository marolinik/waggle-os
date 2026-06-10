/** P1a route wrapper — `/mcps` → MCPHubApp (props from Desktop.tsx:411). */
import MCPHubApp from '@/components/os/apps/MCPHubApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const McpsRoute = () => {
  const { activeWorkspace } = useShell();
  return (
    <SurfaceBoundary appName="MCP Hub">
      <MCPHubApp personaId={activeWorkspace?.persona} />
    </SurfaceBoundary>
  );
};

export default McpsRoute;
