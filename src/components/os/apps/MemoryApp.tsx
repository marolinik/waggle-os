import { Brain, Search, Clock, Trash2, Plus, Filter } from 'lucide-react';
import type { MemoryFrame } from '@/lib/types';

const frameTypeIcons: Record<string, string> = {
  fact: '📋', event: '📅', insight: '💡', decision: '⚖️', task: '✅', entity: '🏷️',
};

const importanceColors = ['text-muted-foreground', 'text-muted-foreground', 'text-foreground', 'text-primary', 'text-amber-400', 'text-destructive'];

interface MemoryAppProps {
  frames: MemoryFrame[];
  selectedFrame: MemoryFrame | null;
  onSelectFrame: (frame: MemoryFrame | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onDeleteFrame: (id: string) => void;
  loading: boolean;
  stats: { total: number; filtered: number };
}

const MemoryApp = ({
  frames, selectedFrame, onSelectFrame, searchQuery, onSearchChange,
  onDeleteFrame, loading, stats,
}: MemoryAppProps) => (
  <div className="flex h-full">
    {/* Timeline sidebar */}
    <div className="w-56 border-r border-border/50 flex flex-col shrink-0">
      <div className="p-2 border-b border-border/30">
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
          <Search className="w-3 h-3 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{stats.filtered} of {stats.total} frames</p>
      </div>
      <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
        {frames.map(f => (
          <button
            key={f.id}
            onClick={() => onSelectFrame(f)}
            className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
              selectedFrame?.id === f.id ? 'bg-primary/20 border border-primary/30' : 'hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>{frameTypeIcons[f.type] || '📄'}</span>
              <span className="font-display font-medium text-foreground truncate flex-1">{f.title}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
              <span className={importanceColors[Math.min(f.importance, 5)]}> {'●'.repeat(Math.min(f.importance, 5))}</span>
              <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(f.timestamp).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
        {frames.length === 0 && !loading && (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No memories found</p>
          </div>
        )}
      </div>
    </div>

    {/* Frame detail */}
    <div className="flex-1 p-4 overflow-auto">
      {selectedFrame ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{frameTypeIcons[selectedFrame.type] || '📄'}</span>
              <h3 className="text-sm font-display font-semibold text-foreground">{selectedFrame.title}</h3>
            </div>
            <button
              onClick={() => onDeleteFrame(selectedFrame.id)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground capitalize">{selectedFrame.type}</span>
            <span>Importance: {selectedFrame.importance}/5</span>
            <span>{new Date(selectedFrame.timestamp).toLocaleString()}</span>
          </div>
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {selectedFrame.content}
          </div>
          {selectedFrame.metadata && Object.keys(selectedFrame.metadata).length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border/30">
              <p className="text-xs font-display font-medium text-muted-foreground mb-1">Metadata</p>
              <pre className="text-[10px] text-muted-foreground overflow-x-auto">
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
  </div>
);

export default MemoryApp;
