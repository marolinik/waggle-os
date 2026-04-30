/**
 * WorkspaceBriefing — "home screen" shown in ChatApp when no messages exist.
 * Displays workspace context: greeting, memories, decisions, tasks, suggested prompts.
 * Fetches from GET /api/workspaces/:id/context.
 */

import { useState, useEffect } from 'react';
import {
  Brain, Clock, CheckCircle2, AlertTriangle, MessageSquare,
  Lightbulb, Loader2, ChevronRight, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import type { WorkspaceContext } from '@/lib/types';
import {
  readWorkspaceBriefingCollapsed,
  writeWorkspaceBriefingCollapsed,
} from '@/lib/workspace-briefing-state';

interface WorkspaceBriefingProps {
  workspaceId: string;
  onSendMessage?: (msg: string) => void;
  onSelectSession?: (id: string) => void;
}

const WorkspaceBriefing = ({ workspaceId, onSendMessage, onSelectSession }: WorkspaceBriefingProps) => {
  const [ctx, setCtx] = useState<WorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);
  // M-23 / ENG-2: collapse state persists per-workspace so it survives
  // reload and stays scoped to the current workspace.
  const [collapsed, setCollapsedState] = useState(() => readWorkspaceBriefingCollapsed(workspaceId));

  useEffect(() => {
    setLoading(true);
    setCollapsedState(readWorkspaceBriefingCollapsed(workspaceId));
    adapter.getWorkspaceContext(workspaceId)
      .then(setCtx)
      .catch(() => setCtx(null))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsedState(next);
    writeWorkspaceBriefingCollapsed(workspaceId, next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading workspace...</span>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <Brain className="w-8 h-8 text-primary/50" />
        <p className="text-sm">Ready to chat</p>
      </div>
    );
  }

  const hasContent = ctx.greeting || ctx.summary || (ctx.recentMemories?.length ?? 0) > 0 || (ctx.suggestedPrompts?.length ?? 0) > 0;

  if (collapsed) {
    return (
      <div className="shrink-0 p-3 flex items-center justify-between border-b border-border/30" data-testid="workspace-briefing-collapsed">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="workspace-briefing-expand"
          aria-expanded="false"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          <span className="font-display">
            {ctx.greeting || (ctx.workspace?.name ? `Briefing for ${ctx.workspace.name}` : 'Briefing')}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl mx-auto" data-testid="workspace-briefing-expanded">
      {/* Greeting with collapse toggle */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground mb-1">
            {ctx.greeting || (ctx.workspace?.name ? `Welcome to ${ctx.workspace.name}` : 'Welcome')}
          </h2>
          {ctx.summary && (
            <p className="text-sm text-muted-foreground">{ctx.summary}</p>
          )}
          {ctx.welcomeMessage && !ctx.summary && (
            <p className="text-sm text-muted-foreground">{ctx.welcomeMessage}</p>
          )}
        </div>
        <HintTooltip content="Hide briefing">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/40"
            data-testid="workspace-briefing-collapse"
            aria-expanded="true"
          >
            <ChevronUp className="w-3 h-3" /> Hide
          </button>
        </HintTooltip>
      </div>

      {/* Stats bar */}
      {ctx.stats && (
        <div className="flex gap-4 mb-5 text-[11px] text-muted-foreground">
          <span><Brain className="w-3 h-3 inline mr-1" />{ctx.stats.memoryCount} memories</span>
          <span><MessageSquare className="w-3 h-3 inline mr-1" />{ctx.stats.sessionCount} sessions</span>
          {ctx.lastActive && (
            <span><Clock className="w-3 h-3 inline mr-1" />Last active: {new Date(ctx.lastActive).toLocaleDateString()}</span>
          )}
        </div>
      )}

      {/* Pending tasks */}
      {ctx.pendingTasks && ctx.pendingTasks.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <h3 className="text-xs font-display font-semibold text-amber-400 mb-2">
            <AlertTriangle className="w-3 h-3 inline mr-1" />Pending ({ctx.pendingTasks.length})
          </h3>
          <ul className="space-y-1">
            {ctx.pendingTasks.slice(0, 5).map((t, i) => (
              <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                <span className="text-amber-400 mt-0.5">○</span> {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent decisions */}
      {ctx.recentDecisions && ctx.recentDecisions.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-border/30">
          <h3 className="text-xs font-display font-semibold text-foreground mb-2">
            <Lightbulb className="w-3 h-3 inline mr-1 text-primary" />Recent Decisions
          </h3>
          <ul className="space-y-1.5">
            {ctx.recentDecisions.slice(0, 3).map((d, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="text-foreground">{d.content}</span>
                {d.date && <span className="text-[11px] text-muted-foreground/60 ml-2">{new Date(d.date).toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key memories */}
      {ctx.recentMemories && ctx.recentMemories.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-border/30">
          <h3 className="text-xs font-display font-semibold text-foreground mb-2">
            <Brain className="w-3 h-3 inline mr-1 text-amber-400" />I Remember
          </h3>
          <ul className="space-y-1.5">
            {ctx.recentMemories.slice(0, 5).map((m, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className={`mt-0.5 text-[11px] px-1 rounded ${
                  m.importance === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                  m.importance === 'important' ? 'bg-primary/20 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>{m.importance === 'critical' ? '!' : m.importance === 'important' ? '★' : '·'}</span>
                <span className="text-foreground">{m.content.slice(0, 120)}{m.content.length > 120 ? '...' : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent threads */}
      {ctx.recentThreads && ctx.recentThreads.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-secondary/30 border border-border/30">
          <h3 className="text-xs font-display font-semibold text-foreground mb-2">
            <MessageSquare className="w-3 h-3 inline mr-1 text-sky-400" />Recent Conversations
          </h3>
          <div className="space-y-1">
            {ctx.recentThreads.slice(0, 4).map(t => (
              <button key={t.id} onClick={() => onSelectSession?.(t.id)}
                className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors">
                <span className="truncate">{t.title}</span>
                <ChevronRight className="w-3 h-3 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cross-workspace hints */}
      {ctx.crossWorkspaceHints && ctx.crossWorkspaceHints.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
          <h3 className="text-xs font-display font-semibold text-violet-400 mb-2">
            <Sparkles className="w-3 h-3 inline mr-1" />From Other Workspaces
          </h3>
          <ul className="space-y-1">
            {ctx.crossWorkspaceHints.map((h, i) => (
              <li key={i} className="text-xs text-muted-foreground">{h}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested prompts */}
      {ctx.suggestedPrompts && ctx.suggestedPrompts.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-display font-semibold text-muted-foreground mb-2">Get Started</h3>
          <div className="flex flex-wrap gap-2">
            {ctx.suggestedPrompts.slice(0, 5).map((p, i) => (
              <button key={i} onClick={() => onSendMessage?.(p)}
                className="px-3 py-1.5 text-xs rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20">
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming schedules */}
      {ctx.upcomingSchedules && ctx.upcomingSchedules.length > 0 && (
        <div className="mt-4 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3 inline mr-1" />
          Upcoming: {ctx.upcomingSchedules.slice(0, 2).join(' · ')}
        </div>
      )}
    </div>
  );
};

export default WorkspaceBriefing;
