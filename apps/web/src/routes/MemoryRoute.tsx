/**
 * P1a route wrapper — `/memory/:mindScope?` → MemoryApp (§5.1 heaviest
 * re-host: useMemory + useKnowledgeGraph move here verbatim from
 * Desktop.tsx:120,126; props verbatim from Desktop.tsx:412-423).
 *
 * `:mindScope?` (personal|workspace) is reserved now, implemented in P3 with
 * the D2 two-mind split; `?tab=` URL→internal-tab wiring is P3 phase work,
 * not conversion work (§5.3 #1-2).
 */
import { useParams } from 'react-router-dom';
import MemoryApp from '@/components/os/apps/MemoryApp';
import SurfaceBoundary from './SurfaceBoundary';
import { useShell } from '@/providers/ShellContext';
import { useMemory } from '@/hooks/useMemory';
import { useKnowledgeGraph } from '@/hooks/useKnowledgeGraph';

const MemoryRoute = () => {
  const { mindScope } = useParams();
  const { activeWorkspaceId, setContextRailTarget } = useShell();
  const memory = useMemory(activeWorkspaceId);
  const kg = useKnowledgeGraph(activeWorkspaceId);
  // Reserved for P3 (D2 two-mind split) — read so the route shape is frozen now.
  void mindScope;
  return (
    <SurfaceBoundary appName="Memory">
      <MemoryApp frames={memory.frames} selectedFrame={memory.selectedFrame} onSelectFrame={memory.setSelectedFrame}
        searchQuery={memory.filters.searchQuery} onSearchChange={(q) => memory.setFilters({ ...memory.filters, searchQuery: q })}
        onDeleteFrame={memory.deleteFrame} loading={memory.loading} stats={memory.stats}
        typeFilters={memory.filters.types} onTypeFiltersChange={(types) => memory.setFilters({ ...memory.filters, types })}
        minImportance={memory.filters.minImportance} onMinImportanceChange={(val) => memory.setFilters({ ...memory.filters, minImportance: val })}
        knowledgeGraph={{ nodes: kg.nodes, edges: kg.edges }} onRefreshKG={kg.refresh}
        kgScope={kg.scope} onKGScopeChange={kg.setScope}
        kgLoading={kg.loading && kg.nodes.length === 0} kgError={kg.error}
        onContextRail={(target) => setContextRailTarget({ ...target, workspaceId: activeWorkspaceId ?? undefined })} />
    </SurfaceBoundary>
  );
};

export default MemoryRoute;
