/** P1a route wrapper — `/room` → RoomApp (workspaceNames map verbatim from Desktop.tsx:456-461). */
import RoomApp from '@/components/os/apps/RoomApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const RoomRoute = () => {
  const { workspaces } = useShell();
  // Phase A.3: build a workspace name lookup for the Room tiles.
  const wsNames: Record<string, string> = {};
  for (const w of workspaces) wsNames[w.id] = w.name;
  return (
    <SurfaceBoundary appName="Room">
      <RoomApp workspaceNames={wsNames} />
    </SurfaceBoundary>
  );
};

export default RoomRoute;
