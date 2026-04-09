/**
 * LoginBriefing — shown on desktop load after boot screen.
 * Displays a cross-workspace summary: where you are across all workspaces,
 * pending items, memory highlights, with links to each workspace.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Clock, MessageSquare, Sparkles, ChevronRight,
  Loader2, X, AlertTriangle,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';

interface LoginBriefingProps {
  onDismiss: () => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

interface WorkspaceSummary {
  id: string;
  name: string;
  group: string;
  memoryCount: number;
  sessionCount: number;
  lastActive: string;
  summary?: string;
  pendingTasks?: string[];
}

const LoginBriefing = ({ onDismiss, onOpenWorkspace }: LoginBriefingProps) => {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    loadBriefing();
  }, []);

  const loadBriefing = async () => {
    try {
      const workspaces = await adapter.getWorkspaces();
      // Fetch context for top 5 most recent workspaces
      const sorted = workspaces
        .filter((w: Workspace) => w.id !== 'default')
        .slice(0, 5);

      const contextPromises = sorted.map(async (ws: Workspace) => {
        try {
          const ctx = await adapter.getWorkspaceContext(ws.id);
          return {
            id: ws.id,
            name: ws.name,
            group: ws.group ?? 'Personal',
            memoryCount: ctx.stats?.memoryCount ?? ctx.memoryCount ?? 0,
            sessionCount: ctx.stats?.sessionCount ?? ctx.sessionCount ?? 0,
            lastActive: ctx.lastActive ?? '',
            summary: ctx.summary,
            pendingTasks: ctx.pendingTasks,
          };
        } catch {
          return {
            id: ws.id,
            name: ws.name,
            group: ws.group ?? 'Personal',
            memoryCount: 0,
            sessionCount: 0,
            lastActive: '',
          };
        }
      });

      const results = await Promise.all(contextPromises);
      setSummaries(results.filter(r => r.memoryCount > 0 || r.sessionCount > 0));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const totalMemories = summaries.reduce((acc, s) => acc + s.memoryCount, 0);
  const totalPending = summaries.reduce((acc, s) => acc + (s.pendingTasks?.length ?? 0), 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-8"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25 }}
          className="w-full max-w-lg glass rounded-2xl p-6 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-display font-bold text-foreground">{greeting}, Marko</h2>
              <p className="text-xs text-muted-foreground">
                <Brain className="w-3 h-3 inline mr-1" />
                {totalMemories} memories across {summaries.length} workspaces
                {totalPending > 0 && <span className="text-amber-400 ml-2"><AlertTriangle className="w-3 h-3 inline mr-0.5" />{totalPending} pending</span>}
              </p>
            </div>
            <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : summaries.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 text-primary/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No active workspaces yet. Create one to get started!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {summaries.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => { onOpenWorkspace(ws.id); onDismiss(); }}
                  className="w-full text-left p-3 rounded-xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-display font-medium text-foreground">{ws.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{ws.group}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>

                  {ws.summary && (
                    <p className="text-[11px] text-muted-foreground mb-1.5 line-clamp-2">{ws.summary}</p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span><Brain className="w-2.5 h-2.5 inline mr-0.5" />{ws.memoryCount}</span>
                    <span><MessageSquare className="w-2.5 h-2.5 inline mr-0.5" />{ws.sessionCount}</span>
                    {ws.lastActive && (
                      <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{new Date(ws.lastActive).toLocaleDateString()}</span>
                    )}
                    {ws.pendingTasks && ws.pendingTasks.length > 0 && (
                      <span className="text-amber-400"><AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />{ws.pendingTasks.length} pending</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center">
            <p className="text-[11px] text-muted-foreground">Waggle remembers everything important.</p>
            <button onClick={onDismiss}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors font-display">
              Start Working
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoginBriefing;
