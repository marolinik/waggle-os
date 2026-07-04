import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { KGNode, KGEdge } from '@/lib/types';

export type KGScope = 'current' | 'personal' | 'all';

export const useKnowledgeGraph = (workspaceId: string | null) => {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<KGScope>('current');

  const fetchKG = useCallback(async () => {
    // W2D: with no real workspace, 'current' has nothing to point at — used to
    // silently return (a permanently empty graph). Fall back to the Personal
    // mind and reflect that in the scope select so the UI tells the truth.
    const noRealWorkspace = !workspaceId || workspaceId === 'local-default';
    if (noRealWorkspace && scope === 'current') {
      setScope('personal');
      return;
    }
    setLoading(true);
    try {
      const data = await adapter.getKnowledgeGraph(workspaceId ?? '', scope);
      setNodes(data.nodes);
      setEdges(data.edges);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [workspaceId, scope]);

  useEffect(() => { fetchKG(); }, [fetchKG]);

  return { nodes, edges, loading, error, selectedNode, setSelectedNode, scope, setScope, refresh: fetchKG };
};
