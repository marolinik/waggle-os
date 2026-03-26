/**
 * useKnowledgeGraph — React hook for knowledge graph state.
 *
 * Manages graph data loading, filtering, node selection, and
 * neighborhood expansion via WaggleService.
 */

import { useState, useCallback } from 'react';
import type { WaggleService } from '../services/types.js';
import type { KGNode, KGData, KGFilters } from '../components/memory/kg-utils.js';
import { getNeighborhood } from '../components/memory/kg-utils.js';

export interface UseKnowledgeGraphOptions {
  service: WaggleService;
  workspaceId: string;
}

export interface UseKnowledgeGraphReturn {
  data: KGData | null;
  loading: boolean;
  error: string | null;
  filters: KGFilters;
  setFilters: (f: KGFilters) => void;
  selectedNode: KGNode | null;
  selectNode: (id: string | null) => void;
  expandNeighborhood: (nodeId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Convert raw knowledge graph API response to KGData.
 * The WaggleService returns { entities: unknown[]; relations: unknown[] }.
 * We map entities to KGNodes and relations to KGEdges.
 */
function toKGData(raw: { entities: unknown[]; relations: unknown[] }): KGData {
  const nodes = (raw.entities ?? []).map((e: any, index: number) => ({
    id: String(e.id ?? e.name ?? `unknown-${index}`),
    label: String(e.name ?? e.label ?? e.id ?? ''),
    type: String(e.type ?? 'unknown'),
    properties: e.properties ?? {},
    history: Array.isArray(e.history) ? e.history : undefined,
  })).filter((n) => n.id !== '');

  const edges = (raw.relations ?? []).map((r: any) => ({
    source: String(r.source ?? r.from ?? ''),
    target: String(r.target ?? r.to ?? ''),
    label: String(r.label ?? r.type ?? r.relation ?? 'related_to'),
    weight: typeof r.weight === 'number' ? r.weight : undefined,
  }));

  return { nodes, edges };
}

export function useKnowledgeGraph({
  service,
  workspaceId,
}: UseKnowledgeGraphOptions): UseKnowledgeGraphReturn {
  const [data, setData] = useState<KGData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<KGFilters>({});
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const raw = await service.getKnowledgeGraph(workspaceId);
      const kgData = toKGData(raw);
      setData(kgData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge graph');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [service, workspaceId]);

  const selectNode = useCallback(
    (id: string | null) => {
      if (!id || !data) {
        setSelectedNode(null);
        return;
      }
      const node = data.nodes.find((n) => n.id === id) ?? null;
      setSelectedNode(node);
    },
    [data],
  );

  const expandNeighborhood = useCallback(
    async (nodeId: string) => {
      // Re-fetch from server to pick up any new data, then merge neighborhood
      try {
        const raw = await service.getKnowledgeGraph(workspaceId);
        const freshData = toKGData(raw);
        const neighborhood = getNeighborhood(freshData, nodeId, 1);

        const currentData = data ?? { nodes: [], edges: [] };
        const existingIds = new Set(currentData.nodes.map((n) => n.id));
        const newNodes = neighborhood.nodes.filter((n) => !existingIds.has(n.id));
        const existingEdgeKeys = new Set(
          currentData.edges.map((e) => `${e.source}-${e.target}-${e.label}`),
        );
        const newEdges = neighborhood.edges.filter(
          (e) => !existingEdgeKeys.has(`${e.source}-${e.target}-${e.label}`),
        );

        if (newNodes.length > 0 || newEdges.length > 0) {
          setData({
            nodes: [...currentData.nodes, ...newNodes],
            edges: [...currentData.edges, ...newEdges],
          });
        }
      } catch {
        // Fall back to local expansion if server fetch fails
        if (!data) return;
        const neighborhood = getNeighborhood(data, nodeId, 1);
        const existingIds = new Set(data.nodes.map((n) => n.id));
        const newNodes = neighborhood.nodes.filter((n) => !existingIds.has(n.id));
        const existingEdgeKeys = new Set(
          data.edges.map((e) => `${e.source}-${e.target}-${e.label}`),
        );
        const newEdges = neighborhood.edges.filter(
          (e) => !existingEdgeKeys.has(`${e.source}-${e.target}-${e.label}`),
        );

        if (newNodes.length > 0 || newEdges.length > 0) {
          setData({
            nodes: [...data.nodes, ...newNodes],
            edges: [...data.edges, ...newEdges],
          });
        }
      }
    },
    [data, service, workspaceId],
  );

  return {
    data,
    loading,
    error,
    filters,
    setFilters,
    selectedNode,
    selectNode,
    expandNeighborhood,
    refresh,
  };
}
