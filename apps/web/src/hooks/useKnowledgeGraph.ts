import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { KGNode, KGEdge } from '@/lib/types';

export const useKnowledgeGraph = (workspaceId: string | null) => {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await adapter.getKnowledgeGraph(workspaceId);
      setNodes(data.nodes);
      setEdges(data.edges);
      setError(null);
    } catch (err) {
      console.error('[useKnowledgeGraph] fetch failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { nodes, edges, loading, error, selectedNode, setSelectedNode, refresh: fetch };
};
