import { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, Brain, Clock, Settings, Loader2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { motion, AnimatePresence } from 'framer-motion';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (type: string, id: string) => void;
}

interface SearchResult {
  type: 'workspace' | 'session' | 'memory' | 'command';
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
}

const QUICK_COMMANDS: SearchResult[] = [
  { type: 'command', id: 'dashboard', title: 'Open Dashboard', icon: Settings },
  { type: 'command', id: 'chat', title: 'Open Chat', icon: MessageSquare },
  { type: 'command', id: 'memory', title: 'Open Memory', icon: Brain },
  { type: 'command', id: 'settings', title: 'Open Settings', icon: Settings },
];

const GlobalSearch = ({ open, onClose, onNavigate }: GlobalSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>(QUICK_COMMANDS);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(QUICK_COMMANDS);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(QUICK_COMMANDS);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      const all: SearchResult[] = [];
      try {
        const [workspaces, frames] = await Promise.allSettled([
          adapter.getWorkspaces(),
          adapter.searchMemory(query),
        ]);
        if (workspaces.status === 'fulfilled') {
          workspaces.value
            .filter(w => w.name.toLowerCase().includes(query.toLowerCase()))
            .forEach(w => all.push({ type: 'workspace', id: w.id, title: w.name, subtitle: w.group, icon: Settings }));
        }
        if (frames.status === 'fulfilled') {
          frames.value.slice(0, 5).forEach(f => all.push({ type: 'memory', id: f.id, title: f.title, subtitle: f.type, icon: Brain }));
        }
      } catch { /* ignore */ }
      setResults(all.length > 0 ? all : QUICK_COMMANDS);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      onNavigate(results[selected].type, results[selected].id);
      onClose();
    }
    if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
            <Search className="w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search workspaces, memories, commands..."
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
            <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground font-display">ESC</kbd>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { onNavigate(r.type, r.id); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selected === i ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-muted/50'
                  }`}
                  onMouseEnter={() => setSelected(i)}
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 text-left">
                    <span className="font-display">{r.title}</span>
                    {r.subtitle && <span className="text-xs text-muted-foreground ml-2">{r.subtitle}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">{r.type}</span>
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>⌘K Toggle</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default GlobalSearch;
