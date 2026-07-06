import { useState } from 'react';
import { Brain, Search, Clock, Trash2, Edit3, Filter, Eye, Copy, Loader2, AlertTriangle, ClipboardList, Calendar, Lightbulb, Scale, CheckSquare, Tag, FileText, type LucideIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { DATE_LOCALE } from '@/lib/date-locale';
import type { MemoryFrame } from '@/lib/types';
import { renderChatMarkdown } from '@/lib/render-markdown';
import ContextMenu, { type ContextMenuItem } from '@/components/os/ContextMenu';
import { HintTooltip } from '@/components/ui/hint-tooltip';

/**
 * Timeline tab (P3/D2 extraction) — the chronological frame list + detail pane,
 * moved VERBATIM out of the retired MemoryApp.tsx shell (its sidebar + detail
 * JSX) so the capability survives the entry restructure. Operates on the legacy
 * MemoryFrame surface (useMemory hook via the route), not the shared Memory
 * entity — that distinction is the Memories tab's job.
 */

// Lucide, not emoji — one icon language across the chrome (2026-07-06 P2).
const frameTypeIcons: Record<string, LucideIcon> = {
  fact: ClipboardList, event: Calendar, insight: Lightbulb, decision: Scale, task: CheckSquare, entity: Tag,
};

const FRAME_TYPES = ['fact', 'event', 'insight', 'decision', 'task', 'entity'];

const importanceColors = ['text-muted-foreground', 'text-muted-foreground', 'text-foreground', 'text-honey', 'text-amber-400', 'text-destructive'];

/**
 * AI-OS Phase 4 polish — read the cross-tool provenance off a frame's
 * metadata. The waggle-dance-bridge sets `metadata.tool` when re-emitting
 * v2 signals through emitWaggleSignal; harvest adapters may also populate
 * `metadata.source` / `metadata.sourceTool`. Returns null when neither
 * exists so callers can skip rendering the badge entirely.
 */
function readFrameProvenanceTool(frame: { metadata?: Record<string, unknown> }): string | null {
  const md = frame.metadata;
  if (!md || typeof md !== 'object') return null;
  const candidates = [md.tool, md.sourceTool, md.source];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && c.length < 60) return c;
  }
  return null;
}

export interface TimelineTabProps {
  frames: MemoryFrame[];
  selectedFrame: MemoryFrame | null;
  onSelectFrame: (frame: MemoryFrame | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onDeleteFrame: (id: string) => void;
  loading: boolean;
  /** P7/D15 B5: a fetch failure must not render as "No memories found" on the
      lock-in moat surface. Threaded from useMemory.error via MemoryRoute. */
  error?: string | null;
  stats: { total: number; filtered: number; entities?: number; relations?: number };
  typeFilters?: string[];
  onTypeFiltersChange?: (types: string[]) => void;
  minImportance?: number;
  onMinImportanceChange?: (val: number) => void;
  onContextRail?: (target: { type: 'frame' | 'entity'; id: string; label: string }) => void;
}

const TimelineTab = ({
  frames, selectedFrame, onSelectFrame, searchQuery, onSearchChange,
  onDeleteFrame, loading, error, stats, typeFilters = [], onTypeFiltersChange,
  minImportance = 0, onMinImportanceChange, onContextRail,
}: TimelineTabProps) => {
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
      {/* Timeline sidebar — chronological frame list with search + filters. */}
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
              <HintTooltip content="Filter timeline">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-1 rounded transition-colors ${showFilters ? 'text-honey' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Filter className="w-3 h-3" />
                </button>
              </HintTooltip>
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
                        typeFilters.includes(t) ? 'bg-primary/20 text-honey' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {(() => { const TypeIcon = frameTypeIcons[t]; return TypeIcon ? <TypeIcon className="w-3 h-3 inline mr-0.5" aria-hidden /> : null; })()}{t}
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
              // Frame ids collide across minds (separate per-mind SQLite
              // autoincrements) and the legacy frames API merges both — the id
              // alone duplicated keys on real data (P3 live smoke, key `36`).
              key={`${f.workspaceId ?? 'personal'}:${f.id}`}
              onClick={() => {
                onSelectFrame(f);
                if (onContextRail) onContextRail({ type: 'frame', id: String(f.id), label: f.content?.split('\n')[0]?.slice(0, 60) ?? 'Frame' });
              }}
              onContextMenu={e => handleFrameContextMenu(e, f)}
              className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                selectedFrame?.id === f.id ? 'bg-primary/20 border border-primary/30' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {(() => { const TypeIcon = frameTypeIcons[f.type] ?? FileText; return <TypeIcon className="w-3.5 h-3.5 text-honey/70 shrink-0" aria-hidden />; })()}
                <span className="font-display font-medium text-foreground truncate flex-1">{f.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                <span
                  className={importanceColors[Math.min(f.importance, 5)]}
                  aria-label={`Importance ${Math.min(f.importance, 5)} of 5`}
                  role="img"
                > {'●'.repeat(Math.min(f.importance, 5))}</span>
                <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(f.timestamp).toLocaleDateString(DATE_LOCALE)}</span>
                {(() => {
                  const provenance = readFrameProvenanceTool(f);
                  return provenance ? (
                    <span
                      className="px-1.5 rounded bg-amber-500/10 text-amber-400 text-[10px]"
                      title={`Captured from ${provenance}`}
                    >
                      {provenance}
                    </span>
                  ) : null;
                })()}
              </div>
            </button>
          ))}
          {loading && frames.length === 0 && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Loading memories...</p>
            </div>
          )}
          {/* P7/D15 B5: a load failure is not an empty memory store. */}
          {error && !loading && frames.length === 0 && (
            <div role="alert" className="text-center py-8">
              <AlertTriangle className="w-8 h-8 text-destructive/50 mx-auto mb-2" />
              <p className="text-xs text-foreground">Couldn't load memories</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto">The memory service is unreachable — this is a load error, not an empty store.</p>
            </div>
          )}
          {!error && frames.length === 0 && !loading && (
            <div className="text-center py-8">
              <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No memories found</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-auto">
        {selectedFrame ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {(() => { const TypeIcon = frameTypeIcons[selectedFrame.type] ?? FileText; return <TypeIcon className="w-5 h-5 text-honey shrink-0" aria-hidden />; })()}
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
              <span>{new Date(selectedFrame.timestamp).toLocaleString(DATE_LOCALE)}</span>
            </div>
            {/* Safe: renderChatMarkdown escapes HTML entities before applying formatting */}
            <div
              className="text-sm text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderChatMarkdown(selectedFrame.content) }}
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

export default TimelineTab;
