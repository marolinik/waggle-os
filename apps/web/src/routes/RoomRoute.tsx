/** P1a route wrapper — `/room` → RoomApp (workspaceNames map verbatim from Desktop.tsx:456-461). */
import RoomApp from '@/components/os/apps/RoomApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { useSearchParams } from 'react-router-dom';

const RoomRoute = () => {
  const { workspaces } = useShell();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room')?.trim() || undefined;
  // Phase A.3: build a workspace name lookup for the Room tiles.
  const wsNames: Record<string, string> = {};
  for (const w of workspaces) wsNames[w.id] = w.name;
  return (
    <SurfaceBoundary appName="Room">
      <RoomApp roomId={roomId} workspaceNames={wsNames} />
    </SurfaceBoundary>
  );
};

export default RoomRoute;
