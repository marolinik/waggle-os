/**
 * LoginBriefing — shown on desktop load after boot screen.
 * Displays memory highlights ("I remember...") and cross-workspace summary
 * with links to each workspace. Feels like a colleague catching you up.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Clock, MessageSquare, Sparkles, ChevronRight,
  Loader2, X, AlertTriangle, Lightbulb,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';
import { selectBriefingHighlights } from '@/lib/briefing-highlights';

interface LoginBriefingProps {
  /**
   * Called when the user closes the briefing. `permanent=true` signals
   * that the user picked "Don't show again" and the caller should set
   * the persistent dismiss flag; `permanent=false` (default) hides for
   * this session only and the briefing will reappear on next launch.
   */
  onDismiss: (permanent?: boolean) => void;
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

interface MemoryHighlight {
  content: string;
  workspace?: string;
  timestamp: string;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return 'just now';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function truncateHighlight(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
}

const LoginBriefing = ({ onDismiss, onOpenWorkspace }: LoginBriefingProps) => {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [highlights, setHighlights] = useState<MemoryHighlight[]>([]);
  const [personalFrameCount, setPersonalFrameCount] = useState(0);
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
      const [workspaces, frames, stats] = await Promise.all([
        adapter.getWorkspaces(),
        adapter.searchMemory('important decision project plan', 'global').catch(() => []),
        adapter.getMemoryStats().catch(() => null),
      ]);

      const personalCount = (stats as any)?.personal?.frameCount ?? 0;
      setPersonalFrameCount(personalCount);

      // L-22: rank by importance desc, break ties by recency. Concrete
      // content only (≥20 chars). Limit 3.
      const ranked = selectBriefingHighlights(frames as unknown as Array<{
        content?: string | null;
        importance?: string | number | null;
        timestamp?: string | number | null;
        workspaceName?: string | null;
      }>);
      const topFrames = ranked.map((f) => ({
        content: truncateHighlight(f.content ?? ''),
        workspace: f.workspaceName ?? undefined,
        timestamp: (typeof f.timestamp === 'string' ? f.timestamp : '') ?? '',
      }));
      setHighlights(topFrames);

      // Workspace summaries — show all, not just ones with content
      const sorted = workspaces.slice(0, 5);

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

      setSummaries(await Promise.all(contextPromises));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const workspaceMemories = summaries.reduce((acc, s) => acc + s.memoryCount, 0);
  const totalMemories = personalFrameCount + workspaceMemories;
  const totalPending = summaries.reduce((acc, s) => acc + (s.pendingTasks?.length ?? 0), 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
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
              <h2 className="text-lg font-display font-bold text-foreground">{greeting}</h2>
              <p className="text-xs text-muted-foreground">
                <Brain className="w-3 h-3 inline mr-1" />
                {totalMemories} memories across {summaries.length} workspace{summaries.length !== 1 ? 's' : ''}
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
          ) : (
            <>
              {/* Memory highlights — "I remember..." */}
              {highlights.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <p className="text-[11px] font-display font-semibold text-primary/80 uppercase tracking-wider flex items-center gap-1.5">
                    <Lightbulb className="w-3 h-3" /> I remember
                  </p>
                  {highlights.map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.15 }}
                      className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10"
                    >
                      <Sparkles className="w-3 h-3 text-primary/60 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[12px] text-foreground leading-relaxed">{h.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {h.workspace && <span>{h.workspace} · </span>}
                          {h.timestamp && timeAgo(h.timestamp)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Workspace list */}
              {summaries.length === 0 ? (
                <div className="text-center py-6">
                  <Sparkles className="w-8 h-8 text-primary/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active workspaces yet. Create one to get started!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-auto">
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
            </>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center gap-3">
            <button
              onClick={() => onDismiss(true)}
              data-testid="login-briefing-dont-show-again"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-display"
              title="Hide the briefing permanently. Re-enable in Settings → Advanced."
            >
              Don't show again
            </button>
            <button
              onClick={() => onDismiss(false)}
              data-testid="login-briefing-dismiss"
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors font-display"
            >
              Start Working
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoginBriefing;
