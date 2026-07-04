/**
 * P1a route wrapper — `/workspaces/:workspaceId/:tab?` → WorkspaceDesktopApp
 * (§1.1 /workspaces row; props from Desktop.tsx:392-406).
 *
 * Stage B: `:tab?` drives the founder-ratified controlled-tab seam (§5.2a) —
 * the URL is the tab state, tab clicks navigate (overview is the canonical
 * bare `/workspaces/:id`). The chat tab body receives the ChatSlot (§5.2b)
 * that ChatHost portals the live per-workspace ChatWindowInstance into
 * (§4.2). `?session=` stays reserved (§5.3 #5).
 */
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import WorkspaceDesktopApp, { type WorkspaceTabId } from '@/components/os/apps/WorkspaceDesktopApp';
import { ChatSlot } from '@/components/os/ChatHost';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';

// The warm-Hive 6-tab bar + `tasks` (deep-link-reachable, not shown in the bar
// — the Overview "Up next" card routes to it). Dropped Research/Timeline/
// Settings fall through to the overview default instead of an empty panel.
const WS_TABS: readonly WorkspaceTabId[] = [
  'overview', 'chat', 'memory', 'artifacts', 'files', 'team', 'tasks',
];

const WorkspaceRoute = () => {
  const navigate = useNavigate();
  const { workspaceId, tab } = useParams();
  const { workspaces, activeWorkspaceId, selectWorkspace } = useShell();
  // §2.1: the URL is the single source of truth — sync the routed workspace
  // into shell state, so shell-global surfaces (StatusBar, PersonaSwitcher,
  // Ctrl+Shift+N / nav-Chat) track what is on screen. Covers the two
  // navigation paths that bypass every explicit selectWorkspace call site:
  // typed deep links (W2A: useWorkspaces no longer auto-selects — this sync is
  // now the persistence trigger for deep links) and browser Back/Forward. The
  // pre-fetch placeholder never syncs (§3.3/§4.2 rule).
  useEffect(() => {
    if (workspaceId && workspaceId !== 'local-default' && workspaceId !== activeWorkspaceId) {
      selectWorkspace(workspaceId);
    }
  }, [workspaceId, activeWorkspaceId, selectWorkspace]);
  // Fall back to the active workspace if the param is missing (parity with the
  // restored-window fallback, Desktop.tsx:393).
  const wsId = workspaceId || activeWorkspaceId || 'local-default';
  const ws = workspaces.find(w => w.id === wsId);
  const activeTab: WorkspaceTabId = WS_TABS.includes(tab as WorkspaceTabId)
    ? (tab as WorkspaceTabId)
    : 'overview';
  return (
    <SurfaceBoundary appName="Workspace">
      <WorkspaceDesktopApp
        workspaceId={wsId}
        workspaceName={ws?.name ?? 'Workspace'}
        activeTab={activeTab}
        onTabChange={(next) => navigate(
          next === 'overview' ? `/workspaces/${wsId}` : `/workspaces/${wsId}/${next}`,
        )}
        // The pre-fetch placeholder id never gets a live widget (§3.3/§4.2);
        // it keeps the deep-link placeholder body instead.
        chatSlot={wsId !== 'local-default' ? <ChatSlot workspaceId={wsId} /> : undefined}
        onOpenChat={(id) => {
          selectWorkspace(id);
          navigate(`/workspaces/${id}/chat`);
        }}
      />
    </SurfaceBoundary>
  );
};

export default WorkspaceRoute;
