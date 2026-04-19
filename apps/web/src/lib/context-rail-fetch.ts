/**
 * L-16 — ContextRail fetch helper.
 *
 * Extracted out of ContextRail.tsx so the "what to fetch for which target
 * type" logic is testable without rendering React. The helper does per-type
 * fan-out: memory frames for every target, plus (for entity targets) the
 * surrounding KG subgraph — neighbors + edges — so clicking a graph node
 * surfaces structural context, not just substring-matched memory hits.
 *
 * Pure contract: take a target + adapter, return a capped, deduplicated list.
 * No React, no DOM, no module-level state. Safe under jsdom.
 */

import type { MemoryFrame, KGNode, KGEdge } from './types';

// Kept in sync with ContextRail.tsx; duplicated here instead of imported to
// keep the helper free of UI-layer dependencies. The shape is small and
// stable — a type-identity drift would show up as a tsc error at the caller.
export interface ContextRailTarget {
  type: 'file' | 'frame' | 'entity' | 'message';
  id: string;
  label: string;
  workspaceId?: string;
}

export interface ContextRailItem {
  id: string;
  kind: 'memory' | 'entity' | 'relation';
  title: string;
  content: string;
  importance?: string;
  timestamp?: string;
}

export interface ContextRailAdapter {
  searchMemory: (query: string, scope?: string) => Promise<MemoryFrame[]>;
  getKnowledgeGraph: (
    workspaceId: string,
    scope?: 'current' | 'personal' | 'all',
  ) => Promise<{ nodes: KGNode[]; edges: KGEdge[] }>;
}

export interface FetchOptions {
  memoryLimit?: number;
  neighborLimit?: number;
  relationLimit?: number;
}

export const DEFAULT_MEMORY_LIMIT = 10;
export const DEFAULT_NEIGHBOR_LIMIT = 5;
export const DEFAULT_RELATION_LIMIT = 5;

/**
 * Build the search query for the memory pass. Use the label for human-
 * readable targets; fall back to the id for files where the label is just
 * the filename and the id (path) is more likely to hit a frame.
 */
export function buildMemoryQuery(target: ContextRailTarget): string {
  if (target.type === 'file') {
    return target.label || target.id;
  }
  return target.label;
}

function frameToItem(frame: MemoryFrame): ContextRailItem {
  const rawContent = typeof frame.content === 'string'
    ? frame.content
    : JSON.stringify(frame.content);
  const firstLine = rawContent.split('\n')[0] ?? '';
  const title = firstLine.trim().slice(0, 80) || frame.title || 'Memory';
  // MemoryFrame.importance is numeric at the type level but older callers
  // sometimes hand in a string label. Coerce to string for display; do NOT
  // invent category buckets — that's the existing ContextRail.tsx concern.
  const importance = frame.importance != null
    ? String(frame.importance)
    : undefined;
  return {
    id: `frame-${frame.id}`,
    kind: 'memory',
    title,
    content: rawContent,
    importance,
    timestamp: frame.timestamp,
  };
}

function nodeToItem(node: KGNode): ContextRailItem {
  return {
    id: `entity-${node.id}`,
    kind: 'entity',
    title: node.label,
    content: `${node.type}: ${node.label}`,
  };
}

function edgeToItem(edge: KGEdge, nodesById: Map<string, KGNode>): ContextRailItem {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  const srcLabel = source?.label ?? edge.source;
  const tgtLabel = target?.label ?? edge.target;
  return {
    id: `relation-${edge.source}-${edge.relationship}-${edge.target}`,
    kind: 'relation',
    title: `${srcLabel} → ${tgtLabel}`,
    content: `${srcLabel} ${edge.relationship} ${tgtLabel}`,
  };
}

/**
 * Rank KG neighbors by connection count (ties broken by label) so high-
 * centrality entities surface first. Keeps the top-N selection deterministic,
 * which matters for the relation list (stable ordering across renders) and
 * for vitest snapshots.
 */
export function rankNeighbors(
  entityId: string,
  nodes: KGNode[],
  edges: KGEdge[],
): { neighbors: KGNode[]; relations: KGEdge[] } {
  const nodesById = new Map(nodes.map(n => [n.id, n] as const));
  const neighborIds = new Set<string>();
  const relations: KGEdge[] = [];
  for (const edge of edges) {
    if (edge.source === entityId && edge.target !== entityId) {
      neighborIds.add(edge.target);
      relations.push(edge);
    } else if (edge.target === entityId && edge.source !== entityId) {
      neighborIds.add(edge.source);
      relations.push(edge);
    }
  }

  const degree: Record<string, number> = {};
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  const neighbors = [...neighborIds]
    .map(id => nodesById.get(id))
    .filter((n): n is KGNode => n !== undefined)
    .sort((a, b) => {
      const diff = (degree[b.id] ?? 0) - (degree[a.id] ?? 0);
      return diff !== 0 ? diff : a.label.localeCompare(b.label);
    });

  return { neighbors, relations };
}

/**
 * Main entry point. Fans out to memory + KG depending on target type,
 * deduplicates by id, and returns a single flat list suitable for rendering.
 *
 * Error policy: any failing branch is swallowed — we prefer returning a
 * partial list over surfacing a tangled error. The rail is an auxiliary UI;
 * a broken KG fetch should not blank out the memory results.
 */
export async function fetchContextRailItems(
  target: ContextRailTarget,
  adapter: ContextRailAdapter,
  opts: FetchOptions = {},
): Promise<ContextRailItem[]> {
  const memoryLimit = opts.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
  const neighborLimit = opts.neighborLimit ?? DEFAULT_NEIGHBOR_LIMIT;
  const relationLimit = opts.relationLimit ?? DEFAULT_RELATION_LIMIT;

  const items: ContextRailItem[] = [];
  const seen = new Set<string>();
  const push = (item: ContextRailItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  // Entity targets go to the KG first so structural context leads the list.
  if (target.type === 'entity') {
    try {
      const ws = target.workspaceId ?? 'current';
      const graph = await adapter.getKnowledgeGraph(ws, 'all');
      const { neighbors, relations } = rankNeighbors(target.id, graph.nodes, graph.edges);
      const nodesById = new Map(graph.nodes.map(n => [n.id, n] as const));
      for (const n of neighbors.slice(0, neighborLimit)) push(nodeToItem(n));
      for (const e of relations.slice(0, relationLimit)) push(edgeToItem(e, nodesById));
    } catch {
      // Graph fetch failed — fall through to memory search.
    }
  }

  // Memory pass — every target type benefits from this.
  try {
    const frames = await adapter.searchMemory(buildMemoryQuery(target), 'all');
    for (const f of frames.slice(0, memoryLimit)) push(frameToItem(f));
  } catch {
    // Leave whatever we already gathered from the graph pass.
  }

  return items;
}
