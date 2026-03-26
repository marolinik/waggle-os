/**
 * KGViewer — Knowledge Graph mini-viewer component.
 *
 * Renders a node-link diagram using absolutely-positioned divs for nodes
 * and SVG lines for edges. Supports zoom/pan, node selection, filtering,
 * neighborhood expansion, and fullscreen mode.
 *
 * No D3 or Cytoscape dependency — uses the pure layout functions from kg-utils.
 */

import { useMemo, useState, useCallback, useRef } from 'react';
import type { KGNode, KGData, KGFilters } from './kg-utils.js';
import {
  getNodeColor,
  getNodeSize,
  filterGraph,
  getNodeTypes,
  getEdgeTypes,
  getNodeDetail,
  layoutForceSimple,
} from './kg-utils.js';

export interface KGViewerProps {
  data: KGData;
  selectedNode?: KGNode | null;
  onSelectNode?: (node: KGNode) => void;
  onExpandNeighborhood?: (nodeId: string) => void;
  filters?: KGFilters;
  onFiltersChange?: (f: KGFilters) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  width?: number;
  height?: number;
}

export function KGViewer({
  data,
  selectedNode,
  onSelectNode,
  onExpandNeighborhood,
  filters = {},
  onFiltersChange,
  fullscreen = false,
  onToggleFullscreen,
  width = 600,
  height = 400,
}: KGViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  // Filter and layout
  const filteredData = useMemo(() => filterGraph(data, filters), [data, filters]);
  const layoutData = useMemo(
    () => layoutForceSimple(filteredData, width, height),
    [filteredData, width, height],
  );

  const nodeTypes = useMemo(() => getNodeTypes(data), [data]);
  const edgeTypes = useMemo(() => getEdgeTypes(data), [data]);

  // Node detail for selected node
  const selectedDetail = useMemo(() => {
    if (!selectedNode) return null;
    return getNodeDetail(data, selectedNode.id);
  }, [data, selectedNode]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.2, Math.min(5, z * factor)));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    setIsPanning(true);
    lastPanRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      setPanX((x) => x + dx);
      setPanY((y) => y + dy);
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Double-click to expand neighborhood
  const handleDoubleClick = useCallback(
    (nodeId: string) => {
      onExpandNeighborhood?.(nodeId);
    },
    [onExpandNeighborhood],
  );

  // Filter toggle helpers
  const toggleNodeTypeFilter = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const current = filters.nodeTypes ?? [];
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      onFiltersChange({ ...filters, nodeTypes: next.length > 0 ? next : undefined });
    },
    [filters, onFiltersChange],
  );

  const toggleEdgeTypeFilter = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const current = filters.edgeTypes ?? [];
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      onFiltersChange({ ...filters, edgeTypes: next.length > 0 ? next : undefined });
    },
    [filters, onFiltersChange],
  );

  // Node position map for edge rendering
  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of layoutData.nodes) {
      if (node.x !== undefined && node.y !== undefined) {
        map.set(node.id, { x: node.x, y: node.y });
      }
    }
    return map;
  }, [layoutData.nodes]);

  const containerClass = fullscreen
    ? 'kg-viewer fixed inset-0 z-50 flex flex-col bg-background'
    : 'kg-viewer flex flex-col bg-background rounded border border-border';

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="kg-viewer__toolbar flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Knowledge Graph</span>
        <span className="text-xs text-muted-foreground">
          {filteredData.nodes.length} nodes, {filteredData.edges.length} edges
        </span>
        <div className="flex-1" />
        {onToggleFullscreen && (
          <button
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-primary-foreground"
            onClick={onToggleFullscreen}
          >
            {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        )}
      </div>

      {/* Filters */}
      {onFiltersChange && (nodeTypes.length > 0 || edgeTypes.length > 0) && (
        <div className="kg-viewer__filters flex flex-wrap gap-1 border-b border-border px-3 py-1.5">
          {nodeTypes.map((type) => {
            const active = !filters.nodeTypes || filters.nodeTypes.includes(type);
            return (
              <button
                key={`node-${type}`}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  active
                    ? 'text-primary-foreground'
                    : 'bg-card text-muted-foreground opacity-50'
                }`}
                style={active ? { backgroundColor: getNodeColor(type) } : undefined}
                onClick={() => toggleNodeTypeFilter(type)}
                title={`Filter: ${type}`}
              >
                {type}
              </button>
            );
          })}
          {edgeTypes.length > 0 && nodeTypes.length > 0 && (
            <span className="mx-1 text-muted-foreground/60">|</span>
          )}
          {edgeTypes.map((type) => {
            const active = !filters.edgeTypes || filters.edgeTypes.includes(type);
            return (
              <button
                key={`edge-${type}`}
                className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                  active
                    ? 'border-border text-muted-foreground'
                    : 'border-border text-muted-foreground/60 opacity-50'
                }`}
                onClick={() => toggleEdgeTypeFilter(type)}
                title={`Filter edge: ${type}`}
              >
                {type}
              </button>
            );
          })}
        </div>
      )}

      {/* Graph canvas */}
      <div className="kg-viewer__canvas flex-1 overflow-hidden">
        <div
          className={`relative h-full w-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Transform container for zoom/pan */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Edges — SVG overlay */}
            <svg
              className="absolute inset-0 pointer-events-none text-muted-foreground"
              width={width}
              height={height}
            >
              {layoutData.edges.map((edge, i) => {
                const sourcePos = nodePositions.get(edge.source);
                const targetPos = nodePositions.get(edge.target);
                if (!sourcePos || !targetPos) return null;
                return (
                  <g key={`edge-${i}`}>
                    <line
                      x1={sourcePos.x}
                      y1={sourcePos.y}
                      x2={targetPos.x}
                      y2={targetPos.y}
                      stroke="currentColor"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                    {/* Edge label at midpoint */}
                    <text
                      x={(sourcePos.x + targetPos.x) / 2}
                      y={(sourcePos.y + targetPos.y) / 2 - 4}
                      fill="currentColor"
                      fontSize={9}
                      textAnchor="middle"
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Nodes — positioned divs */}
            {layoutData.nodes.map((node) => {
              const size = getNodeSize(node, layoutData.edges);
              const color = getNodeColor(node.type);
              const isSelected = selectedNode?.id === node.id;
              return (
                <div
                  key={node.id}
                  className={`kg-viewer__node absolute flex items-center justify-center rounded-full cursor-pointer transition-shadow ${
                    isSelected ? 'ring-2 ring-white shadow-lg' : 'hover:shadow-md'
                  }`}
                  style={{
                    left: (node.x ?? 0) - size / 2,
                    top: (node.y ?? 0) - size / 2,
                    width: size,
                    height: size,
                    backgroundColor: color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode?.(node);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleDoubleClick(node.id);
                  }}
                  title={`${node.label} (${node.type})`}
                >
                  <span
                    className="text-center text-primary-foreground font-medium truncate px-1"
                    style={{ fontSize: Math.max(8, size * 0.3) }}
                  >
                    {node.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail panel — shown when a node is selected */}
      {selectedDetail && selectedDetail.node && (
        <div className="kg-viewer__detail border-t border-border px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: getNodeColor(selectedDetail.node.type) }}
            />
            <span className="text-sm font-medium text-primary-foreground">
              {selectedDetail.node.label}
            </span>
            <span className="text-xs text-muted-foreground">{selectedDetail.node.type}</span>
          </div>
          {selectedDetail.node.properties &&
            Object.keys(selectedDetail.node.properties).length > 0 && (
              <div className="mb-1 text-xs text-muted-foreground">
                {Object.entries(selectedDetail.node.properties).map(([key, val]) => (
                  <span key={key} className="mr-3">
                    <span className="text-muted-foreground">{key}:</span>{' '}
                    {String(val)}
                  </span>
                ))}
              </div>
            )}
          <div className="text-xs text-muted-foreground">
            {selectedDetail.connections.length} connection
            {selectedDetail.connections.length !== 1 ? 's' : ''}
            {selectedDetail.connections.length > 0 && ': '}
            {selectedDetail.connections
              .slice(0, 5)
              .map((c) => c.node.label)
              .join(', ')}
            {selectedDetail.connections.length > 5 && ', ...'}
          </div>
          {/* Temporal history */}
          {selectedDetail.node.history && selectedDetail.node.history.length > 0 && (
            <div className="kg-viewer__history mt-1 border-t border-border pt-1">
              <span className="text-xs font-medium text-muted-foreground">History</span>
              <ul className="mt-0.5 space-y-0.5">
                {selectedDetail.node.history.map((entry, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground">
                    <span className="text-muted-foreground/60">{entry.timestamp}</span>{' '}
                    <span className="text-muted-foreground">{entry.event}</span>
                    {entry.value !== undefined && (
                      <span className="ml-1 text-muted-foreground">({String(entry.value)})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
