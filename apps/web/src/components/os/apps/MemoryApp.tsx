import { useState, useEffect } from 'react';
import { Brain, Search, Clock, Trash2, Edit3, Filter, Network, ChevronDown, X, Eye, Copy, Loader2, Download } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import type { MemoryFrame, KGNode, KGEdge } from '@/lib/types';
import { renderSimpleMarkdown } from '@/lib/render-markdown';
import ContextMenu, { type ContextMenuItem } from '@/components/os/ContextMenu';
import KnowledgeGraphViewer from './memory/KnowledgeGraphViewer';
import HarvestTab from './memory/HarvestTab';

const frameTypeIcons: Record<string, string> = {
  fact: '📋', event: '📅', insight: '💡', decision: '⚖️', task: '✅', entity: '🏷️',
};

const FRAME_TYPES = ['fact', 'event', 'insight', 'decision', 'task', 'entity'];

const importanceColors = ['text-muted-foreground', 'text-muted-foreground', 'text-foreground', 'text-primary', 'text-amber-400', 'text-destructive'];

interface MemoryAppProps {
  frames: MemoryFrame[];
  selectedFrame: MemoryFrame | null;
  onSelectFrame: (frame: MemoryFrame | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onDeleteFrame: (id: string) => void;
  loading: boolean;
  stats: { total: number; filtered: number; entities?: number; relations?: number };
  typeFilters?: string[];
  onTypeFiltersChange?: (types: string[]) => void;
  minImportance?: number;
  onMinImportanceChange?: (val: number) => void;
  knowledgeGraph?: { nodes: KGNode[]; edges: KGEdge[] };
  onRefreshKG?: () => void;
}


const MemoryApp = ({
  frames, selectedFrame, onSelectFrame, searchQuery, onSearchChange,
  onDeleteFrame, loading, stats, typeFilters = [], onTypeFiltersChange,
  minImportance = 0, onMinImportanceChange,
  knowledgeGraph, onRefreshKG,
}: MemoryAppProps) => {
  const [view, setView] = useState<'timeline' | 'graph' | 'harvest'>('timeline');
  const [showFilters, setShowFilters] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: ContextMenuItem[] } | null>(null);

  const handleFrameContextMenu = (e: React.MouseEvent, frame: MemoryFrame) => {
    e.preventDefault();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      items: [
        { label: 'View Details', icon: <Eye className="w-3.5 h-3.5" />, onClick: () => onSelectFrame(frame) },
        { label: 'Copy Content', icon: <Copy className="w-3.5 h-3.5" />, onClick: () => navigator.clipboard.writeText(frame.content) },
        { label: '', onClick: () => {}, separator: true },
        { label: 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => onDeleteFrame(frame.id), danger: true },
      ],
    });
  };

  const toggleTypeFilter = (type: string) => {
    if (!onTypeFiltersChange) return;
    if (typeFilters.includes(type)) {
      onTypeFiltersChange(typeFilters.filter(t => t !== type));
    } else {
      onTypeFiltersChange([...typeFilters, type]);
    }
  };

  return (
    <div className="flex h-full">
      {/* Timeline sidebar */}
      <div className="w-56 border-r border-border/50 flex flex-col shrink-0">
        <div className="p-2 border-b border-border/30">
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
            <Search className="w-3 h-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search memories..."
              className="flex-1 bg-transparent text-xs h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] text-muted-foreground">
              {stats.filtered} of {stats.total} frames
              {(stats.entities ?? 0) > 0 && <span> · {stats.entities} entities</span>}
              {(stats.relations ?? 0) > 0 && <span> · {stats.relations} relations</span>}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-1 rounded transition-colors ${showFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Filter className="w-3 h-3" />
              </button>
              <button
                onClick={() => setView(view === 'graph' ? 'timeline' : 'graph')}
                className={`p-1 rounded transition-colors ${view === 'graph' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Knowledge Graph"
              >
                <Network className="w-3 h-3" />
              </button>
              <button
                onClick={() => setView(view === 'harvest' ? 'timeline' : 'harvest')}
                className={`p-1 rounded transition-colors ${view === 'harvest' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Memory Harvest"
              >
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Type</p>
                <div className="flex flex-wrap gap-1">
                  {FRAME_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => toggleTypeFilter(t)}
                      className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                        typeFilters.includes(t) ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {frameTypeIcons[t]} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Min Importance: {minImportance}</p>
                <input
                  type="range"
                  min={0} max={5} value={minImportance}
                  onChange={e => onMinImportanceChange?.(Number(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none bg-muted accent-primary"
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
          {frames.map(f => (
            <button
              key={f.id}
              onClick={() => onSelectFrame(f)}
              onContextMenu={e => handleFrameContextMenu(e, f)}
              className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                selectedFrame?.id === f.id ? 'bg-primary/20 border border-primary/30' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span>{frameTypeIcons[f.type] || '📄'}</span>
                <span className="font-display font-medium text-foreground truncate flex-1">{f.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                <span className={importanceColors[Math.min(f.importance, 5)]}> {'●'.repeat(Math.min(f.importance, 5))}</span>
                <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(f.timestamp).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
          {loading && frames.length === 0 && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Loading memories...</p>
            </div>
          )}
          {frames.length === 0 && !loading && (
            <div className="text-center py-8">
              <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No memories found</p>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        {view === 'harvest' ? (
          <HarvestTab />
        ) : view === 'graph' ? (
          <KnowledgeGraphViewer nodes={knowledgeGraph?.nodes || []} edges={knowledgeGraph?.edges || []} />
        ) : selectedFrame ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{frameTypeIcons[selectedFrame.type] || '📄'}</span>
                <h3 className="text-sm font-display font-semibold text-foreground">{selectedFrame.title}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteFrame(selectedFrame.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground capitalize">{selectedFrame.type}</span>
              <span>Importance: {selectedFrame.importance}/5</span>
              <span>{new Date(selectedFrame.timestamp).toLocaleString()}</span>
            </div>
            {/* Safe: renderSimpleMarkdown escapes HTML entities before applying formatting */}
            <div
              className="text-sm text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(selectedFrame.content) }}
            />
            {selectedFrame.metadata && Object.keys(selectedFrame.metadata).length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-muted-foreground mb-1">Metadata</p>
                <pre className="text-[11px] text-muted-foreground overflow-x-auto">
                  {JSON.stringify(selectedFrame.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Brain className="w-12 h-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Select a memory frame to view details</p>
          </div>
        )}
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            items={contextMenu.items}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MemoryApp;
