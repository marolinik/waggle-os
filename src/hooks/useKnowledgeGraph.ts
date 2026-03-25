import { useState, useCallback } from 'react';
import { adapter } from '@/lib/adapter';
import type { KGNode, KGEdge } from '@/lib/types';

export const useKnowledgeGraph = (workspaceId: string | null) => {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);

  const fetch = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await adapter.getKnowledgeGraph(workspaceId);
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [workspaceId]);

  return { nodes, edges, loading, selectedNode, setSelectedNode, refresh: fetch };
};
