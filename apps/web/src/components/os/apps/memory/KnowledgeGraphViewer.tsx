/**
 * KnowledgeGraphViewer — interactive force-directed knowledge graph.
 *
 * Uses d3-force for layout computation and React SVG for rendering.
 * Supports zoom/pan, node dragging, type-colored nodes, edge hover,
 * search highlighting, and a type legend.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from 'd3-force';
import { Network, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { KGNode, KGEdge } from '@/lib/types';

// ── Type colors from waggle-theme.css KG tokens ──

const TYPE_COLORS: Record<string, string> = {
  person: 'var(--kg-person, #4A90D9)',
  project: 'var(--kg-project, #50C878)',
  concept: 'var(--kg-concept, #9B59B6)',
  organization: 'var(--kg-org, #E67E22)',
  org: 'var(--kg-org, #E67E22)',
  location: '#E74C3C',
  event: '#F39C12',
  technology: '#1ABC9C',
  tool: '#1ABC9C',
  default: 'var(--kg-default, #95A5A6)',
};

const TYPE_LABELS: Record<string, string> = {
  person: 'Person',
  project: 'Project',
  concept: 'Concept',
  organization: 'Organization',
  org: 'Organization',
  location: 'Location',
  event: 'Event',
  technology: 'Technology',
  tool: 'Tool',
};

function getNodeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? TYPE_COLORS.default;
}

function getNodeLabel(type: string): string {
  return TYPE_LABELS[type.toLowerCase()] ?? type;
}

// ── Simulation types ──

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  connectionCount: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  relationship: string;
}

// ── Component ──

interface KnowledgeGraphViewerProps {
  nodes: KGNode[];
  edges: KGEdge[];
  onNodeClick?: (nodeId: string) => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

type NodeLimit = 50 | 100 | 200 | 500 | 'all';
const LIMIT_OPTIONS: NodeLimit[] = [50, 100, 200, 500, 'all'];
// d3-force ticks at ~60fps; state updates on every tick drown the renderer
// when there are hundreds of SVG nodes. Batching every Nth tick halves the
// React work while keeping motion visible.
const TICK_RENDER_EVERY = 2;

function chooseDefaultLimit(total: number): NodeLimit {
  if (total <= 100) return 'all';
  if (total <= 300) return 200;
  return 200;
}

const KnowledgeGraphViewer = ({ nodes, edges, onNodeClick }: KnowledgeGraphViewerProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // View state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Scaling controls: hide noisy types, cap rendered node count at top-N
  // most-connected (by full-graph centrality, not filtered graph).
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set());
  const [nodeLimit, setNodeLimit] = useState<NodeLimit>(() => chooseDefaultLimit(nodes.length));

  // Drag state
  const [dragging, setDragging] = useState<string | null>(null);

  // Pan state
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Simulation state
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);

  // Count connections per node — derived from the FULL edge set so top-N
  // selection reflects real graph centrality, not the filtered subgraph.
  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const edge of edges) {
      counts[edge.source] = (counts[edge.source] ?? 0) + 1;
      counts[edge.target] = (counts[edge.target] ?? 0) + 1;
    }
    return counts;
  }, [edges]);

  // Type → count breakdown for legend chips. Derived from full nodes.
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      const t = n.type.toLowerCase();
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [nodes]);

  // Unique types sorted by descending count (most common first).
  const uniqueTypes = useMemo(() => {
    return Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]);
  }, [typeCounts]);

  // Visible subgraph = (not hidden by type) ∧ (top-N by connection count).
  const visibleNodes = useMemo(() => {
    const filtered = hiddenTypes.size === 0
      ? nodes
      : nodes.filter(n => !hiddenTypes.has(n.type.toLowerCase()));
    const sorted = [...filtered].sort(
      (a, b) => (connectionCounts[b.id] ?? 0) - (connectionCounts[a.id] ?? 0),
    );
    return nodeLimit === 'all' ? sorted : sorted.slice(0, nodeLimit);
  }, [nodes, hiddenTypes, connectionCounts, nodeLimit]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map(n => n.id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () => edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [edges, visibleNodeIds],
  );

  const toggleHideType = useCallback((type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const resetHiddenTypes = useCallback(() => setHiddenTypes(new Set()), []);

  // Search filtering
  const searchLower = searchQuery.toLowerCase();
  const isNodeHighlighted = useCallback(
    (node: SimNode) => {
      if (!searchQuery) return true;
      return node.label.toLowerCase().includes(searchLower) || node.type.toLowerCase().includes(searchLower);
    },
    [searchQuery, searchLower],
  );

  // Initialize simulation — runs on visible subgraph, not full graph.
  // When limits/filters change, a new simulation is created for the new set.
  useEffect(() => {
    if (visibleNodes.length === 0) return;

    const simNodesInit: SimNode[] = visibleNodes.map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
      connectionCount: connectionCounts[n.id] ?? 0,
    }));

    const nodeIndex = new Map(simNodesInit.map(n => [n.id, n]));

    const simLinksInit: SimLink[] = visibleEdges
      .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      }));

    const sim = forceSimulation<SimNode>(simNodesInit)
      .force('link', forceLink<SimNode, SimLink>(simLinksInit).id(d => d.id).distance(80))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>().radius(d => nodeRadius(d) + 4))
      .alpha(1)
      .alphaDecay(0.02);

    let tick = 0;
    sim.on('tick', () => {
      tick++;
      if (tick % TICK_RENDER_EVERY !== 0) return;
      setSimNodes([...simNodesInit]);
      setSimLinks([...simLinksInit]);
    });
    // Ensure final positions land even if the last tick was skipped.
    sim.on('end', () => {
      setSimNodes([...simNodesInit]);
      setSimLinks([...simLinksInit]);
    });

    simulationRef.current = sim;

    return () => {
      sim.stop();
      simulationRef.current = null;
    };
  }, [visibleNodes, visibleEdges, connectionCounts]);

  // Node radius based on connection count
  const nodeRadius = (node: SimNode) => {
    const base = 6;
    const scale = Math.min(node.connectionCount, 10);
    return base + scale * 1.5;
  };

  // ── Zoom handlers ──

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
    },
    [],
  );

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ── Pan handlers ──

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // Only start panning if clicking on the SVG background
      if ((e.target as Element).tagName === 'svg' || (e.target as Element).classList.contains('kg-bg')) {
        setPanning(true);
        panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (panning) {
        setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      }
      if (dragging && simulationRef.current) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2 - pan.x) / zoom;
        const y = (e.clientY - rect.top - rect.height / 2 - pan.y) / zoom;
        const node = simNodes.find(n => n.id === dragging);
        if (node) {
          node.fx = x;
          node.fy = y;
          simulationRef.current.alpha(0.3).restart();
        }
      }
    },
    [panning, dragging, zoom, pan, simNodes],
  );

  const handleMouseUp = useCallback(() => {
    setPanning(false);
    if (dragging) {
      const node = simNodes.find(n => n.id === dragging);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      setDragging(null);
    }
  }, [dragging, simNodes]);

  // ── Node drag ──

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      setDragging(nodeId);
      const node = simNodes.find(n => n.id === nodeId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
    },
    [simNodes],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNode(prev => (prev === nodeId ? null : nodeId));
      onNodeClick?.(nodeId);
    },
    [onNodeClick],
  );

  // ── Fullscreen toggle ──

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!fullscreen) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreen(f => !f);
  }, [fullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // ── Empty state ──

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Network className="w-10 h-10 text-muted-foreground/20 mb-3" />
        <p className="text-xs text-muted-foreground">No knowledge graph data</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Interact with the agent to build entity relationships
        </p>
      </div>
    );
  }

  const selectedNodeData = selectedNode ? simNodes.find(n => n.id === selectedNode) : null;
  const hiddenCount = nodes.length - visibleNodes.length;

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col bg-background relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Network className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-display font-medium text-foreground">
            Knowledge Graph
          </span>
          <span className="text-[11px] text-muted-foreground">
            {visibleNodes.length.toLocaleString()} / {nodes.length.toLocaleString()} nodes
            · {visibleEdges.length.toLocaleString()} / {edges.length.toLocaleString()} edges
          </span>
          {hiddenCount > 0 && (
            <span className="text-[11px] text-amber-400">
              · {hiddenCount.toLocaleString()} hidden
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Limit selector */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md px-1 py-0.5">
            <span className="text-[10px] text-muted-foreground px-1">Show top</span>
            {LIMIT_OPTIONS.map(opt => (
              <button
                key={String(opt)}
                onClick={() => setNodeLimit(opt)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  nodeLimit === opt
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={opt === 'all' ? `Show all ${nodes.length.toLocaleString()} nodes` : `Show top ${opt} by connections`}
              >
                {opt === 'all' ? 'All' : opt}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-md px-1.5 py-0.5">
            <Search className="w-3 h-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter nodes..."
              className="w-28 bg-transparent text-[11px] h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 ml-2">
            <button onClick={zoomOut} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Zoom out">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Zoom in">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={resetView} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Reset view">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button onClick={toggleFullscreen} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Toggle fullscreen">
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Background for pan detection */}
          <rect className="kg-bg" width="100%" height="100%" fill="transparent" />

          <g transform={`translate(${pan.x + (svgRef.current?.clientWidth ?? 0) / 2}, ${pan.y + (svgRef.current?.clientHeight ?? 0) / 2}) scale(${zoom})`}>
            {/* Edges */}
            {simLinks.map((link, i) => {
              const source = link.source as SimNode;
              const target = link.target as SimNode;
              if (source.x == null || target.x == null) return null;
              const isHovered = hoveredEdge === i;
              const isConnectedToSelected =
                selectedNode && (source.id === selectedNode || target.id === selectedNode);
              const isSearchDimmed = searchQuery && !(isNodeHighlighted(source) || isNodeHighlighted(target));

              return (
                <g key={`edge-${i}`}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={isConnectedToSelected ? 'hsl(38, 92%, 50%)' : 'hsl(40, 10%, 40%)'}
                    strokeOpacity={isSearchDimmed ? 0.05 : isHovered || isConnectedToSelected ? 0.7 : 0.2}
                    strokeWidth={isHovered || isConnectedToSelected ? 2 : 1}
                  />
                  {/* Invisible wider line for easier hover */}
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="transparent"
                    strokeWidth={12}
                    onMouseEnter={() => setHoveredEdge(i)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    className="cursor-pointer"
                  />
                  {/* Relationship label on hover */}
                  {isHovered && (
                    <text
                      x={(source.x! + target.x!) / 2}
                      y={(source.y! + target.y!) / 2 - 6}
                      textAnchor="middle"
                      fill="hsl(40, 20%, 85%)"
                      fontSize={10}
                      fontWeight={500}
                      className="pointer-events-none select-none"
                    >
                      {link.relationship}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {simNodes.map(node => {
              if (node.x == null || node.y == null) return null;
              const r = nodeRadius(node);
              const highlighted = isNodeHighlighted(node);
              const isSelected = selectedNode === node.id;
              const isHovered = hoveredNode === node.id;
              const dimmed = searchQuery ? !highlighted : false;

              return (
                <g
                  key={node.id}
                  className="cursor-pointer"
                  onMouseDown={e => handleNodeMouseDown(e, node.id)}
                  onClick={() => handleNodeClick(node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Glow ring for selected */}
                  {isSelected && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 4}
                      fill="none"
                      stroke={getNodeColor(node.type)}
                      strokeWidth={2}
                      strokeOpacity={0.5}
                    />
                  )}
                  {/* Node circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={getNodeColor(node.type)}
                    fillOpacity={dimmed ? 0.1 : isHovered || isSelected ? 0.9 : 0.65}
                    stroke={getNodeColor(node.type)}
                    strokeWidth={isHovered ? 2 : 1}
                    strokeOpacity={dimmed ? 0.1 : 0.8}
                  />
                  {/* Label */}
                  <text
                    x={node.x}
                    y={node.y + r + 12}
                    textAnchor="middle"
                    fill="hsl(40, 20%, 85%)"
                    fontSize={isHovered || isSelected ? 11 : 10}
                    fontWeight={isSelected ? 600 : 400}
                    opacity={dimmed ? 0.15 : isHovered || isSelected ? 1 : 0.7}
                    className="pointer-events-none select-none"
                  >
                    {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Type legend — interactive. Click a chip to toggle visibility. */}
        <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm border border-border/30 rounded-lg px-3 py-2 max-w-[22rem]">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <p className="text-[11px] font-display font-medium text-muted-foreground">
              Entity Types
            </p>
            {hiddenTypes.size > 0 && (
              <button
                onClick={resetHiddenTypes}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                title="Reset all type filters"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {uniqueTypes.map(type => {
              const hidden = hiddenTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleHideType(type)}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${
                    hidden
                      ? 'opacity-40 hover:opacity-70'
                      : 'hover:bg-muted/60'
                  }`}
                  title={hidden ? `Show ${getNodeLabel(type)}` : `Hide ${getNodeLabel(type)}`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: getNodeColor(type) }}
                  />
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {getNodeLabel(type)}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    {typeCounts[type].toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected node detail panel */}
        {selectedNodeData && (
          <div className="absolute top-3 right-3 w-56 bg-background/90 backdrop-blur-sm border border-border/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: getNodeColor(selectedNodeData.type) }}
              />
              <p className="text-xs font-display font-semibold text-foreground truncate">
                {selectedNodeData.label}
              </p>
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>Type: <span className="text-foreground capitalize">{getNodeLabel(selectedNodeData.type)}</span></p>
              <p>Connections: <span className="text-foreground">{selectedNodeData.connectionCount}</span></p>
              {/* Connected edges */}
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="font-medium text-foreground mb-1">Relationships</p>
                {simLinks
                  .filter(l => {
                    const s = (l.source as SimNode).id;
                    const t = (l.target as SimNode).id;
                    return s === selectedNodeData.id || t === selectedNodeData.id;
                  })
                  .slice(0, 8)
                  .map((l, i) => {
                    const s = l.source as SimNode;
                    const t = l.target as SimNode;
                    const other = s.id === selectedNodeData.id ? t : s;
                    return (
                      <p key={i} className="truncate">
                        <span className="text-primary/80">{l.relationship}</span>
                        {' → '}
                        <span className="text-foreground">{other.label}</span>
                      </p>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeGraphViewer;
