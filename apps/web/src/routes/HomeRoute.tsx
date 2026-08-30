/** P1a route wrapper — `/home` → HomeCockpit (§5.1; props from Desktop.tsx:363-382). */
import { useNavigate } from 'react-router-dom';
import HomeCockpit from '@/components/os/apps/HomeCockpit';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { queryString, routeFor } from '@/lib/routes';
import { NoModelBanner } from '@/components/os/model-gate/NoModelBanner';
import { workspaceCounts } from '@/lib/workspace-counts';
import {
  cancelWorkspaceSelectionChatDispatch,
  completeWorkspaceSelectionChatDispatch,
  stageWorkspaceSelectionChatDispatch,
} from '@/hooks/useChatWidgetState';

const HomeRoute = () => {
  const navigate = useNavigate();
  const {
    activeWorkspaceId,
    selectWorkspace,
    overlays,
    workspaces,
    workspacesLoading,
  } = useShell();
  return (
    <SurfaceBoundary appName="Home">
      {/* PR5 D2 — persists on Home until a working model exists (the soft-escape
          safety net for the onboarding model gate). */}
      <NoModelBanner onSetup={() => navigate(routeFor('settings'))} />
      <HomeCockpit
        onContinue={(workspaceId, sessionId) => {
          selectWorkspace(workspaceId);
          navigate(`${routeFor('chat', { activeWorkspaceId: workspaceId })}${queryString({ session: sessionId })}`);
        }}
        onOpenWorkspaceDesktop={(workspaceId) => {
          selectWorkspace(workspaceId);
          navigate(routeFor('workspace-desktop', { activeWorkspaceId: workspaceId }));
        }}
        onCreateWorkspace={() => overlays.setShowCreateWorkspace(true)}
        onAskChat={(text) => {
          const activeWorkspaceExists = activeWorkspaceId
            ? workspaces.some(workspace => workspace.id === activeWorkspaceId)
            : false;
          if (workspacesLoading) {
            stageWorkspaceSelectionChatDispatch(text);
            return false;
          }
          if (!activeWorkspaceId || !activeWorkspaceExists) {
            if (workspaces.length > 0) {
              stageWorkspaceSelectionChatDispatch(text);
              overlays.setShowWorkspaceSwitcher(true);
            } else {
              overlays.setShowCreateWorkspace(true);
            }
            return false;
          }
          const staged = stageWorkspaceSelectionChatDispatch(text);
          try {
            const delivered = completeWorkspaceSelectionChatDispatch(
              activeWorkspaceId,
              staged.id,
              () => {
                navigate(routeFor('chat', { activeWorkspaceId }));
                selectWorkspace(activeWorkspaceId);
              },
            );
            return Boolean(delivered);
          } catch (error) {
            cancelWorkspaceSelectionChatDispatch(staged.id);
            throw error;
          }
        }}
        totalWorkspaceCount={workspaceCounts(workspaces).visible}
      />
    </SurfaceBoundary>
  );
};

export default HomeRoute;
