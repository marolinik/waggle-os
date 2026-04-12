import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, MessageSquare, Brain, Clock, Settings, Loader2,
  LayoutDashboard, Bot, FolderOpen, Activity, Package, Plug,
  Store, Mic, Sparkles, Shield, Users, FileText,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adapter } from '@/lib/adapter';
import { motion, AnimatePresence } from 'framer-motion';
import { fuzzyMatch } from '@/lib/fuzzy-match';

/* ── Types ── */
type SearchCategory = 'command' | 'workspace' | 'memory' | 'session' | 'skill';

interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  score: number;
  badge?: string;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (type: string, id: string) => void;
}

/* ── Commands (static) ── */
const COMMANDS: SearchResult[] = [
  { category: 'command', id: 'dashboard', title: 'Dashboard', subtitle: 'Home overview', icon: LayoutDashboard, score: 0 },
  { category: 'command', id: 'chat', title: 'Chat', subtitle: 'Open conversation', icon: MessageSquare, score: 0 },
  { category: 'command', id: 'agents', title: 'Agents', subtitle: 'Manage personas & groups', icon: Bot, score: 0 },
  { category: 'command', id: 'files', title: 'Files', subtitle: 'Workspace documents', icon: FolderOpen, score: 0 },
  { category: 'command', id: 'memory', title: 'Memory', subtitle: 'Knowledge frames', icon: Brain, score: 0 },
  { category: 'command', id: 'cockpit', title: 'Command Center', subtitle: 'System health & ops', icon: Activity, score: 0 },
  { category: 'command', id: 'capabilities', title: 'Skills & Apps', subtitle: 'Installed capabilities', icon: Package, score: 0 },
  { category: 'command', id: 'connectors', title: 'Connectors', subtitle: 'Service integrations', icon: Plug, score: 0 },
  { category: 'command', id: 'scheduled-jobs', title: 'Scheduled Jobs', subtitle: 'Recurring tasks', icon: Clock, score: 0 },
  { category: 'command', id: 'marketplace', title: 'Marketplace', subtitle: 'Browse extensions', icon: Store, score: 0 },
  { category: 'command', id: 'voice', title: 'Voice', subtitle: 'Voice interface', icon: Mic, score: 0 },
  { category: 'command', id: 'room', title: 'Room', subtitle: 'Sub-agent canvas', icon: Users, score: 0 },
  { category: 'command', id: 'approvals', title: 'Approvals', subtitle: 'Pending approvals', icon: Shield, score: 0 },
  { category: 'command', id: 'timeline', title: 'Timeline', subtitle: 'Workspace activity history', icon: Clock, score: 0 },
  { category: 'command', id: 'settings', title: 'Settings', subtitle: 'Configuration', icon: Settings, score: 0 },
];

/* ── Category display config ── */
const CATEGORY_LABELS: Record<SearchCategory, string> = {
  command: 'Commands',
  workspace: 'Workspaces',
  memory: 'Memories',
  session: 'Recent Sessions',
  skill: 'Skills',
};

const CATEGORY_ORDER: SearchCategory[] = ['command', 'workspace', 'session', 'memory', 'skill'];

/* ── Component ── */
const GlobalSearch = ({ open, onClose, onNavigate }: GlobalSearchProps) => {
  const [query, setQuery] = useState('');
  const [workspaces, setWorkspaces] = useState<SearchResult[]>([]);
  const [sessions, setSessions] = useState<SearchResult[]>([]);
  const [skills, setSkills] = useState<SearchResult[]>([]);
  const [memoryResults, setMemoryResults] = useState<SearchResult[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Pre-fetch workspaces, sessions, and skills on open
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMemoryResults([]);
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    adapter.getWorkspaces().then(async wsList => {
      setWorkspaces(wsList.map(w => ({
        id: w.id,
        category: 'workspace' as const,
        title: w.name,
        subtitle: w.group,
        icon: Sparkles,
        score: 0,
      })));

      // Fetch recent sessions across all workspaces
      const allSessions: SearchResult[] = [];
      for (const ws of wsList.slice(0, 5)) {
        try {
          const wsSessions = await adapter.getSessions(ws.id);
          for (const s of wsSessions.slice(0, 3)) {
            allSessions.push({
              id: `${ws.id}:${s.id}`,
              category: 'session' as const,
              title: s.title || `Session ${s.id.slice(0, 8)}`,
              subtitle: ws.name,
              icon: MessageSquare,
              score: 0,
              badge: ws.name,
            });
          }
        } catch { /* skip */ }
      }
      setSessions(allSessions);
    }).catch(() => {});

    adapter.getSkills().then(skillsList => {
      setSkills(skillsList.slice(0, 20).map(s => ({
        id: s.id ?? s.name,
        category: 'skill' as const,
        title: s.name,
        subtitle: s.description?.slice(0, 60),
        icon: Package,
        score: 0,
      })));
    }).catch(() => {});
  }, [open]);

  // Debounced memory search (300ms, min 2 chars)
  useEffect(() => {
    if (query.length < 2) {
      setMemoryResults([]);
      return;
    }
    setMemoryLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const frames = await adapter.searchMemory(query);
        setMemoryResults(frames.slice(0, 5).map(f => ({
          id: String(f.id),
          category: 'memory' as const,
          title: typeof f.content === 'string'
            ? f.content.split('\n')[0].slice(0, 80)
            : (f.title ?? 'Memory frame'),
          subtitle: f.importance ?? f.type ?? undefined,
          icon: Brain,
          score: 50,
        })));
      } catch {
        setMemoryResults([]);
      }
      setMemoryLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  // Build categorized flat list for keyboard nav
  const { flatItems, sections } = useMemo(() => {
    const q = query.trim();
    const grouped: Record<SearchCategory, SearchResult[]> = {
      command: [], workspace: [], memory: [], session: [], skill: [],
    };

    const matchAndSort = (items: SearchResult[], target: SearchCategory) => {
      if (q) {
        for (const item of items) {
          const r = fuzzyMatch(q, item.title + ' ' + (item.subtitle ?? '') + ' ' + (item.badge ?? ''));
          if (r.match) grouped[target].push({ ...item, score: r.score });
        }
        grouped[target].sort((a, b) => b.score - a.score);
      } else {
        grouped[target] = [...items];
      }
    };

    matchAndSort(COMMANDS, 'command');
    matchAndSort(workspaces, 'workspace');
    matchAndSort(sessions, 'session');
    matchAndSort(skills, 'skill');

    // Memory results from API (already filtered server-side)
    grouped.memory = memoryResults;

    // Build flat list + section metadata
    const flat: SearchResult[] = [];
    const secs: Array<{ category: SearchCategory; startIndex: number; count: number }> = [];

    for (const cat of CATEGORY_ORDER) {
      const items = grouped[cat];
      if (items.length === 0) continue;
      secs.push({ category: cat, startIndex: flat.length, count: items.length });
      flat.push(...items);
    }

    return { flatItems: flat, sections: secs };
  }, [query, workspaces, sessions, skills, memoryResults]);

  // Clamp selection when results change
  useEffect(() => {
    setSelected(s => Math.min(s, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-idx="${selected}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selected]) {
      e.preventDefault();
      const item = flatItems[selected];
      onNavigate(item.category, item.id);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
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
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
          style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--hive-700)' }}>
            <Search className="w-5 h-5" style={{ color: 'var(--hive-400)' }} />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search everything — workspaces, memories, sessions, skills..."
              className="flex-1 bg-transparent text-sm border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {memoryLoading && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--honey-500)' }} />}
            <kbd className="px-1.5 py-0.5 text-[11px] rounded font-display" style={{ backgroundColor: 'var(--hive-800)', color: 'var(--hive-400)' }}>ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-auto p-2">
            {flatItems.length === 0 && query.length > 0 && !memoryLoading && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--hive-400)' }}>
                No results for "{query}"
              </p>
            )}

            {sections.map(sec => (
              <div key={sec.category}>
                {/* Category header */}
                <p
                  className="text-[11px] font-display font-semibold uppercase tracking-wider px-3 pt-3 pb-1"
                  style={{ color: 'var(--hive-400)' }}
                >
                  {CATEGORY_LABELS[sec.category]}
                  {sec.category === 'memory' && memoryLoading && ' ...'}
                </p>

                {/* Items */}
                {flatItems.slice(sec.startIndex, sec.startIndex + sec.count).map((item, i) => {
                  const globalIdx = sec.startIndex + i;
                  const Icon = item.icon;
                  const isSelected = globalIdx === selected;
                  return (
                    <button
                      key={`${item.category}-${item.id}`}
                      data-idx={globalIdx}
                      onClick={() => { onNavigate(item.category, item.id); onClose(); }}
                      onMouseEnter={() => setSelected(globalIdx)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: isSelected ? 'var(--honey-glow, rgba(229,160,0,0.08))' : 'transparent',
                        borderLeft: isSelected ? '2px solid var(--honey-500)' : '2px solid transparent',
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" style={{ color: isSelected ? 'var(--honey-500)' : 'var(--hive-400)' }} />
                      <div className="flex-1 text-left min-w-0">
                        <span className="font-display truncate block" style={{ color: 'var(--hive-100)' }}>{item.title}</span>
                        {item.subtitle && (
                          <span className="text-xs truncate block" style={{ color: 'var(--hive-400)' }}>{item.subtitle}</span>
                        )}
                      </div>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: 'var(--hive-800)', color: 'var(--honey-500)' }}>
                          {item.badge}
                        </span>
                      )}
                      <span className="text-[11px] capitalize shrink-0" style={{ color: 'var(--hive-500)' }}>{item.category}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer hints */}
          <div className="px-4 py-2 flex items-center gap-4 text-[11px]" style={{ borderTop: '1px solid var(--hive-700)', color: 'var(--hive-500)' }}>
            <span>{'\u2191\u2193'} Navigate</span>
            <span>{'\u21B5'} Open</span>
            <span>{'\u2318'}K Toggle</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default GlobalSearch;
