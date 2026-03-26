/**
 * Knowledge Graph utility functions.
 *
 * Pure, testable functions for graph data manipulation, filtering,
 * neighborhood extraction, and simple force-directed layout.
 * No dependencies on D3, Cytoscape, or any rendering library.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface KGNode {
  id: string;
  label: string;
  type: string; // person, project, concept, organization, etc.
  properties?: Record<string, unknown>;
  history?: Array<{ timestamp: string; event: string; value?: unknown }>;
  x?: number;
  y?: number;
}

export interface KGEdge {
  source: string; // node id
  target: string; // node id
  label: string;  // relation type
  weight?: number;
}

export interface KGData {
  nodes: KGNode[];
  edges: KGEdge[];
}

export interface KGFilters {
  nodeTypes?: string[];
  edgeTypes?: string[];
}

export interface KGNodeDetail {
  node: KGNode | null;
  connections: Array<{ node: KGNode; edge: KGEdge }>;
}

// ── Color map ────────────────────────────────────────────────────────

const NODE_COLOR_MAP: Record<string, string> = {
  person: 'var(--kg-person, #4A90D9)',
  project: 'var(--kg-project, #50C878)',
  concept: 'var(--kg-concept, #9B59B6)',
  organization: 'var(--kg-org, #E67E22)',
};

const DEFAULT_NODE_COLOR = 'var(--kg-default, #95A5A6)';

// ── Sizing ───────────────────────────────────────────────────────────

const MIN_NODE_SIZE = 20;
const MAX_NODE_SIZE = 60;
const SIZE_PER_CONNECTION = 5;

// ── Functions ────────────────────────────────────────────────────────

/**
 * Map entity type to a display color.
 */
export function getNodeColor(type: string): string {
  return NODE_COLOR_MAP[type] ?? DEFAULT_NODE_COLOR;
}

/**
 * Calculate node size based on connection count.
 * More connections → larger node, clamped to [MIN_NODE_SIZE, MAX_NODE_SIZE].
 */
export function getNodeSize(node: KGNode, edges: KGEdge[]): number {
  const connectionCount = edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  ).length;
  return Math.min(MAX_NODE_SIZE, MIN_NODE_SIZE + connectionCount * SIZE_PER_CONNECTION);
}

/**
 * Filter a graph by node types and/or edge types.
 *
 * - nodeTypes: keep only nodes whose type is in the list. Edges referencing
 *   removed nodes are also removed.
 * - edgeTypes: keep only edges whose label is in the list. Nodes are NOT removed
 *   by edge filtering (you can have orphan nodes visible).
 */
export function filterGraph(data: KGData, filters: KGFilters): KGData {
  let nodes = data.nodes;
  let edges = data.edges;

  // Filter nodes by type
  if (filters.nodeTypes && filters.nodeTypes.length > 0) {
    const allowedTypes = new Set(filters.nodeTypes);
    nodes = nodes.filter((n) => allowedTypes.has(n.type));
    // Remove edges referencing removed nodes
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  // Filter edges by type
  if (filters.edgeTypes && filters.edgeTypes.length > 0) {
    const allowedEdgeTypes = new Set(filters.edgeTypes);
    edges = edges.filter((e) => allowedEdgeTypes.has(e.label));
  }

  return { nodes, edges };
}

/**
 * BFS to extract the N-hop neighborhood of a node.
 * Returns a subgraph containing the center node, all reachable nodes within `depth` hops,
 * and all edges between included nodes.
 */
export function getNeighborhood(data: KGData, nodeId: string, depth: number): KGData {
  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(nodeId)) {
    return { nodes: [], edges: [] };
  }

  // Build adjacency list (undirected)
  const adjacency = new Map<string, Set<string>>();
  for (const node of data.nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of data.edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  // BFS
  const visited = new Set<string>();
  const queue: Array<{ id: string; dist: number }> = [{ id: nodeId, dist: 0 }];
  visited.add(nodeId);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    if (dist < depth) {
      const neighbors = adjacency.get(id);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ id: neighbor, dist: dist + 1 });
          }
        }
      }
    }
  }

  // Collect nodes and edges
  const nodes = data.nodes.filter((n) => visited.has(n.id));
  const edges = data.edges.filter(
    (e) => visited.has(e.source) && visited.has(e.target),
  );

  return { nodes, edges };
}

/**
 * Get sorted unique node types from a graph.
 */
export function getNodeTypes(data: KGData): string[] {
  return [...new Set(data.nodes.map((n) => n.type))].sort();
}

/**
 * Get sorted unique edge types (labels) from a graph.
 */
export function getEdgeTypes(data: KGData): string[] {
  return [...new Set(data.edges.map((e) => e.label))].sort();
}

/**
 * Get detailed info about a node: the node itself + all connected nodes with their edges.
 */
export function getNodeDetail(data: KGData, nodeId: string): KGNodeDetail {
  const node = data.nodes.find((n) => n.id === nodeId) ?? null;
  if (!node) {
    return { node: null, connections: [] };
  }

  const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
  const connections: Array<{ node: KGNode; edge: KGEdge }> = [];

  for (const edge of data.edges) {
    if (edge.source === nodeId) {
      const target = nodeMap.get(edge.target);
      if (target) {
        connections.push({ node: target, edge });
      }
    } else if (edge.target === nodeId) {
      const source = nodeMap.get(edge.source);
      if (source) {
        connections.push({ node: source, edge });
      }
    }
  }

  return { node, connections };
}

/**
 * Simple force-directed layout algorithm.
 *
 * Assigns x,y coordinates to each node using a basic spring-force simulation:
 * 1. Initialize positions randomly within bounds
 * 2. For each iteration:
 *    - Repulsion: each pair of nodes pushes apart (Coulomb's law)
 *    - Attraction: connected nodes pull together (Hooke's law)
 *    - Center gravity: all nodes pulled slightly toward center
 * 3. Clamp positions to bounds
 *
 * Returns a new KGData — does not mutate the input.
 */
export function layoutForceSimple(
  data: KGData,
  width: number,
  height: number,
  iterations = 50,
): KGData {
  if (data.nodes.length === 0) {
    return { nodes: [], edges: [...data.edges] };
  }

  const padding = 30;
  const centerX = width / 2;
  const centerY = height / 2;

  // Tuning constants
  const repulsionStrength = 5000;
  const attractionStrength = 0.01;
  const gravityStrength = 0.02;
  const damping = 0.9;
  const minDist = 1; // avoid division by zero

  // Seeded pseudo-random for deterministic tests wouldn't be feasible without
  // adding a seed parameter. Use center-spread initialization instead of Math.random.
  // Spread nodes in a circle around center for deterministic initial layout.
  const nodes = data.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / data.nodes.length;
    const radius = Math.min(width, height) * 0.3;
    return {
      ...n,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  // Velocity accumulators
  const vx = new Float64Array(nodes.length);
  const vy = new Float64Array(nodes.length);

  // Build edge index for fast lookup
  const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));

  for (let iter = 0; iter < iterations; iter++) {
    // Reset forces
    const fx = new Float64Array(nodes.length);
    const fy = new Float64Array(nodes.length);

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x! - nodes[j].x! || 1e-4;
        const dy = nodes[i].y! - nodes[j].y! || 1e-4;
        const distSq = Math.max(dx * dx + dy * dy, minDist);
        const dist = Math.sqrt(distSq);
        const force = repulsionStrength / distSq;
        const forceX = (force * dx) / dist;
        const forceY = (force * dy) / dist;
        fx[i] += forceX;
        fy[i] += forceY;
        fx[j] -= forceX;
        fy[j] -= forceY;
      }
    }

    // Attraction along edges
    for (const edge of data.edges) {
      const si = nodeIndexMap.get(edge.source);
      const ti = nodeIndexMap.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const dx = nodes[ti].x! - nodes[si].x!;
      const dy = nodes[ti].y! - nodes[si].y!;
      const forceX = dx * attractionStrength;
      const forceY = dy * attractionStrength;
      fx[si] += forceX;
      fy[si] += forceY;
      fx[ti] -= forceX;
      fy[ti] -= forceY;
    }

    // Center gravity
    for (let i = 0; i < nodes.length; i++) {
      fx[i] += (centerX - nodes[i].x!) * gravityStrength;
      fy[i] += (centerY - nodes[i].y!) * gravityStrength;
    }

    // Apply forces with damping
    for (let i = 0; i < nodes.length; i++) {
      vx[i] = (vx[i] + fx[i]) * damping;
      vy[i] = (vy[i] + fy[i]) * damping;
      nodes[i].x = nodes[i].x! + vx[i];
      nodes[i].y = nodes[i].y! + vy[i];
    }
  }

  // Build output with clamped positions (avoid mutating simulation nodes)
  const outputNodes = nodes.map((n) => ({
    ...n,
    x: Math.max(padding, Math.min(width - padding, n.x!)),
    y: Math.max(padding, Math.min(height - padding, n.y!)),
  }));

  return { nodes: outputNodes, edges: [...data.edges] };
}
