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
import { useService } from '@/providers/ServiceProvider';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import type { Workspace } from '@/lib/types';
import { selectBriefingHighlights } from '@/lib/briefing-highlights';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import {
  computeBragSummary,
  formatBragLine,
  timeAgo as bragTimeAgo,
  type BragSummary,
} from '@/lib/login-briefing-brag';

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

// timeAgo was moved into @/lib/login-briefing-brag (shared with the brag
// summary so the header and per-frame labels use one formatter). Keep a
// local alias so callsites below read naturally.
const timeAgo = bragTimeAgo;

function truncateHighlight(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
}

// Workspace names matching these patterns are E2E/test artefacts that leaked
// into the user's real workspace store and should not surface in the
// briefing's workspace summary list. Filtered at the UI layer (defensive),
// not deleted from the data store.
const TEST_WORKSPACE_PATTERNS: ReadonlyArray<RegExp> = [
  /^E2E-Audit-\d+$/,
  /^test-/i,
  /^smoke-/i,
  /^audit-/i,
];

const isTestWorkspace = (name: string): boolean =>
  TEST_WORKSPACE_PATTERNS.some(p => p.test(name));

const LoginBriefing = ({ onDismiss, onOpenWorkspace }: LoginBriefingProps) => {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [highlights, setHighlights] = useState<MemoryHighlight[]>([]);
  const [brag, setBrag] = useState<BragSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // P1b D3: a failed briefing load must NOT render the Day-0 empty-hook —
  // backend failure was indistinguishable from a brand-new user (and the
  // brag header sat on 'Loading…' forever).
  const [errored, setErrored] = useState(false);
  const [greeting, setGreeting] = useState('');
  // P1b D3: defer the batch until the connect attempt settles (the 0609
  // HomeCockpit gate pattern) — gates on connecting-SETTLED, not connected,
  // so a failed connect still reaches the errored UI instead of a skeleton.
  const { connecting } = useService();

  useEffect(() => {
    const hour = new Date().getHours();
    const timeGreeting =
      hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    setGreeting(timeGreeting);
    if (connecting) return;
    // Best-effort identity fetch — appends the user's name to the greeting
    // when configured. Silent on failure so the briefing never blocks on it.
    adapter.getIdentity()
      .then(id => {
        if (id?.name) setGreeting(`${timeGreeting}, ${id.name}`);
      })
      .catch(() => { /* no identity yet — leave greeting time-only */ });

    loadBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting]);

  // D3 plus-clause: an errored briefing revalidates on focus/online/connect-settled.
  useRevalidateOnError(errored, () => { void loadBriefing(); });

  const loadBriefing = async () => {
    try {
      const [workspaces, frames, stats] = await Promise.all([
        adapter.getWorkspaces(),
        adapter.searchMemory('important decision project plan', 'global').catch(() => []),
        adapter.getMemoryStats().catch(() => null),
      ]);

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

      // Workspace summaries — show all, not just ones with content.
      // Drop E2E/test workspaces that leaked into the real store (see
      // TEST_WORKSPACE_PATTERNS) so the briefing surfaces only user work.
      const sorted = workspaces
        .filter((ws: Workspace) => !isTestWorkspace(ws.name))
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

      const resolved = await Promise.all(contextPromises);
      setSummaries(resolved);

      // L-22: build the richer "N memories · N entities · N relations
      // across N workspaces · active Xago" header. computeBragSummary
      // reads adapter.getMemoryStats()'s normalised shape and the
      // workspace summaries we just built.
      setBrag(computeBragSummary(stats, resolved));
      setErrored(false);
    } catch {
      // P1b D3: surface the failure — do not let it fall through to the
      // Day-0 empty-hook render path.
      setErrored(true);
    }
    finally { setLoading(false); }
  };

  const bragLine = brag ? formatBragLine(brag) : null;
  const totalPending = brag?.pendingCount ?? 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
        onClick={() => onDismiss()}
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
            <div className="min-w-0">
              <h2 className="text-lg font-display font-bold text-foreground">{greeting}</h2>
              <p className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-1 gap-y-0.5" data-testid="login-briefing-brag-line">
                <Brain className="w-3 h-3 inline mr-0.5 shrink-0" />
                <span>{bragLine ?? (errored ? 'Briefing unavailable' : 'Loading…')}</span>
                {totalPending > 0 && (
                  <span className="text-amber-400 inline-flex items-center gap-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    {totalPending} pending
                  </span>
                )}
              </p>
            </div>
            <button onClick={() => onDismiss()} className="p-1 rounded-lg hover:bg-muted/50 transition-colors shrink-0">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : errored ? (
            // P1b D3: failure state — distinct from the Day-0 empty hook.
            // Auto-recovers via useRevalidateOnError (focus / online /
            // connect-settled); the button is the manual escape hatch.
            <div className="py-4 space-y-2 text-center" data-testid="login-briefing-error">
              <p className="text-xs text-muted-foreground">
                Couldn’t load your briefing — I’ll retry when the connection is back.
              </p>
              <button
                onClick={() => { setLoading(true); void loadBriefing(); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 transition-colors"
              >
                Retry now
              </button>
            </div>
          ) : highlights.length === 0 && summaries.length === 0 ? (
            // Day-0 user — no workspaces AND no memory yet. The bare
            // "no workspaces" line failed dim 3 (first-session hook in
            // <60s) in the 2026-05-28 addictiveness audit. Three demo
            // "what I'll remember for you" bubbles teach the value prop
            // concretely. Examples are explicitly labelled so this isn't
            // deceptive copy.
            // (FR-5's sample-workspace-load buttons were reverted 2026-05-28
            // as a redundant parallel of the existing workspace-templates
            // starterMemory system — see REDUNDANCY-AUDIT.md. The non-
            // redundant consolidation is to wire these to POST
            // /api/workspaces?templateId, tracked in FEATURE-REQUESTS.md.)
            <div className="py-2 space-y-3" data-testid="login-briefing-empty-hook">
              <div className="space-y-1.5">
                <p className="text-[11px] font-display font-semibold text-primary/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Lightbulb className="w-3 h-3" /> Here's what I'll remember for you
                </p>
                {[
                  '"Last week we decided to prioritise compliance over speed for the launch."',
                  '"Sarah\'s feedback on the deck — slide 4 needs the regional breakdown."',
                  '"Voice for the Wednesday newsletter — punchy, contrarian, second-person."',
                ].map((demo, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.12 }}
                    className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10 border-dashed"
                  >
                    <Sparkles className="w-3 h-3 text-primary/60 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-foreground/70 italic leading-relaxed">{demo}</p>
                  </motion.div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground italic px-1">
                Examples. Your real memory populates as you chat — or import an existing ChatGPT/Claude export from the Memory app.
              </p>
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
                          {/* FR #27: tooltip clarifies what the Personal/Team
                              tag means. Personal workspaces are private to the
                              account; Team workspaces (Pro/Teams tiers) are
                              shared. Without this hint the colored chip reads
                              as decorative metadata. */}
                          <HintTooltip
                            content={
                              ws.group === 'Personal'
                                ? 'Personal workspaces are visible only to you.'
                                : 'Team workspaces (Pro/Enterprise) are shared across the organisation.'
                            }
                          >
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground cursor-help">{ws.group}</span>
                          </HintTooltip>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>

                      {ws.summary && (
                        <p className="text-[11px] text-muted-foreground mb-1.5 line-clamp-2">{ws.summary}</p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span><Brain className="w-2.5 h-2.5 inline mr-0.5" />{ws.memoryCount}</span>
                        <span><MessageSquare className="w-2.5 h-2.5 inline mr-0.5" />{ws.sessionCount}</span>
                        {/* FR #24/#26: only render the lastActive chip when the
                            workspace has actual activity. For a brand-new
                            workspace `lastActive` reflects creation time, not
                            work, so "Last active 5/1/2026" reads as if the user
                            already worked there when they haven't. */}
                        {ws.lastActive && (ws.memoryCount > 0 || ws.sessionCount > 0) && (
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
            <HintTooltip content="Hide the briefing permanently. Re-enable in Settings → Advanced.">
              <button
                onClick={() => onDismiss(true)}
                data-testid="login-briefing-dont-show-again"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-display"
              >
                Don't show again
              </button>
            </HintTooltip>
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
