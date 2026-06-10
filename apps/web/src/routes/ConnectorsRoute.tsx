/** P1a route wrapper — `/connectors` → ConnectorsApp (props from Desktop.tsx:410). */
import ConnectorsApp from '@/components/os/apps/ConnectorsApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const ConnectorsRoute = () => {
  const { activeWorkspace } = useShell();
  return (
    <SurfaceBoundary appName="Connector Hub">
      <ConnectorsApp personaId={activeWorkspace?.persona} />
    </SurfaceBoundary>
  );
};

export default ConnectorsRoute;
