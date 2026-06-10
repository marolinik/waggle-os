/**
 * P1a route wrapper — `/artifacts` → ArtifactCenterApp (§1.1: wrapper passes
 * `?workspace ?? activeWorkspaceId`; prop today Desktop.tsx:435).
 */
import { useSearchParams } from 'react-router-dom';
import ArtifactCenterApp from '@/components/os/apps/ArtifactCenterApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

const ArtifactsRoute = () => {
  const [searchParams] = useSearchParams();
  const { workspaces, activeWorkspaceId } = useShell();
  const wsId = searchParams.get('workspace') ?? activeWorkspaceId ?? undefined;
  const ws = workspaces.find(w => w.id === wsId);
  return (
    <SurfaceBoundary appName="Artifacts">
      <ArtifactCenterApp activeWorkspaceId={wsId} workspaceName={ws?.name} />
    </SurfaceBoundary>
  );
};

export default ArtifactsRoute;
