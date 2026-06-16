/**
 * Route wrapper — `/memory/:mindScope?` → MemoryCenterApp (P3/D2 standalone
 * promotion; the P1a-era MemoryApp shell is retired, its views live on as
 * MemoryCenterApp tabs).
 *
 * URL is the single navigation authority:
 *  - `:mindScope` (personal|workspace; anything else → personal) drives the
 *    two-mind split. `/memory` ≡ `/memory/personal` — J08's banner target and
 *    the personal-mind-only needsReviewCount stay aligned by default.
 *  - `?tab=` (validated against MEMORY_VIEWS) drives the view; absent →
 *    'memories'. The AppShell §2.3 shim already carries `tab` through
 *    queryString(), so `waggle:open-app {appId:'memory', tab:'graph'}` lands
 *    here with no extra wiring.
 *  - `?filter=` (P2/J08) is re-stashed through the app-deeplink channel on
 *    cold load, so a hard refresh or typed/shared `/memory?filter=unreviewed`
 *    URL seeds the Memory Center status filter the same way the Home banner's
 *    CustomEvent does — typed URLs and the §2.3 shim share one mechanism.
 *
 * useMemory + useKnowledgeGraph stay hoisted here (P1a §5.1) feeding the
 * legacy Timeline/Graph tabs verbatim.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import MemoryCenterApp, { MEMORY_VIEWS, type MemoryView, type MindScope } from '@/components/os/apps/MemoryCenterApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { useMemory } from '@/hooks/useMemory';
import { useKnowledgeGraph } from '@/hooks/useKnowledgeGraph';
import { stashDeepLink } from '@/lib/app-deeplink';

const MemoryRoute = () => {
  const { mindScope } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const mind: MindScope = mindScope === 'workspace' ? 'workspace' : 'personal';
  const tabParam = searchParams.get('tab');
  // PR3.5: 'trust' (screen 19) is the new default landing; ?tab= still selects
  // any view (incl. the legacy 'memories' list and the 6 secondary views).
  const view: MemoryView = MEMORY_VIEWS.includes(tabParam as MemoryView)
    ? (tabParam as MemoryView)
    : 'trust';

  // Stash once per mount, during render, so it precedes the child's mount
  // effect (the ref keeps StrictMode double-render from double-stashing).
  // Only when the Memories view is the landing target — a filter aimed at a
  // legacy tab would strand in the stash and replay on a later visit (P3
  // review finding).
  const stashedRef = useRef(false);
  if (!stashedRef.current) {
    stashedRef.current = true;
    const filter = searchParams.get('filter') ?? undefined;
    // J08 "N need review" deep-links here with ?filter=unreviewed and no tab →
    // lands on the default 'trust' view, whose Manage body embeds the same
    // MemoryCenterTab that consumes the stash. 'memories' (the secondary list)
    // also consumes it when explicitly targeted. Other tabs must not strand it.
    if (filter && (view === 'trust' || view === 'memories')) {
      stashDeepLink({ appId: 'memory', filter });
    }
  }

  // `?filter=` is a one-shot intent carrier, not state — strip it once the
  // child has consumed the stash (child mount effects run before this), so the
  // URL stops advertising a filter the user may have since changed, and a
  // refresh/share of the URL doesn't re-seed a stale filter.
  useEffect(() => {
    if (searchParams.has('filter')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('filter');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { activeWorkspaceId, workspaces, setContextRailTarget } = useShell();
  const memory = useMemory(activeWorkspaceId);
  const kg = useKnowledgeGraph(activeWorkspaceId);

  const wsId = activeWorkspaceId && activeWorkspaceId !== 'local-default' ? activeWorkspaceId : undefined;
  const wsName = wsId ? workspaces.find(w => w.id === wsId)?.name : undefined;

  return (
    <SurfaceBoundary appName="Memory">
      <MemoryCenterApp
        mind={mind}
        onMindChange={(m) => {
          // `/memory` is canonical for personal; keep ?tab/?filter across the switch.
          const search = searchParams.toString();
          navigate(`/memory${m === 'workspace' ? '/workspace' : ''}${search ? `?${search}` : ''}`);
        }}
        view={view}
        onViewChange={(v) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            // 'trust' is the canonical no-tab default now; everything else (incl.
            // the legacy 'memories' list) carries an explicit ?tab=.
            if (v === 'trust') next.delete('tab'); else next.set('tab', v);
            return next;
          }, { replace: true });
        }}
        workspaceId={wsId}
        workspaceName={wsName}
        timeline={{
          frames: memory.frames,
          selectedFrame: memory.selectedFrame,
          onSelectFrame: memory.setSelectedFrame,
          searchQuery: memory.filters.searchQuery,
          onSearchChange: (q) => memory.setFilters({ ...memory.filters, searchQuery: q }),
          onDeleteFrame: memory.deleteFrame,
          loading: memory.loading,
          error: memory.error,
          stats: memory.stats,
          typeFilters: memory.filters.types,
          onTypeFiltersChange: (types) => memory.setFilters({ ...memory.filters, types }),
          minImportance: memory.filters.minImportance,
          onMinImportanceChange: (val) => memory.setFilters({ ...memory.filters, minImportance: val }),
        }}
        knowledgeGraph={{ nodes: kg.nodes, edges: kg.edges }} onRefreshKG={kg.refresh}
        kgScope={kg.scope} onKGScopeChange={kg.setScope}
        kgLoading={kg.loading && kg.nodes.length === 0} kgError={kg.error}
        onContextRail={(target) => setContextRailTarget({ ...target, workspaceId: activeWorkspaceId ?? undefined })}
      />
    </SurfaceBoundary>
  );
};

export default MemoryRoute;
