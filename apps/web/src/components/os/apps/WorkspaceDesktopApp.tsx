/**
 * WorkspaceDesktopApp — the Workspace Desktop runtime (S02 · PRD §12.2).
 *
 * The primary surface for a single bounded work context. It demotes chat from
 * "the whole product" to ONE widget among many, surfacing workspace state,
 * artifacts, memory, tasks, research, and activity on a single fixed-layout
 * screen sized for a maximized window.
 *
 * Layout (A1/C4 — FIXED layout, NO drag/resize grid engine):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header: name · type · status pill · members stack             │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Tab bar: Overview · Chat · Research · Artifacts · Memory ·    │
 *   │          Tasks · Timeline · Settings                          │
 *   ├──────────────────────────────────────┬───────────────────────┤
 *   │ Main canvas (per-tab)                 │ Right context panel    │
 *   │  Overview = widget grid:              │  workspace info        │
 *   │   chat preview (read-only, C5) ·      │  members               │
 *   │   key artifacts · tasks (C7) ·        │  last activity         │
 *   │   memory highlights · recent activity │  quick actions         │
 *   └──────────────────────────────────────┴───────────────────────┘
 *
 * Reuse: consumes adapter.getWorkspaceState / getWorkspaceContext /
 * getWorkspaceActivity / getTeamMembers (the Phase-1 contract surface) and
 * useRoomState for the live agents-running indicator. Other tabs (Chat,
 * Memory, Timeline, Settings, Research, Artifacts) are integrator-embedded;
 * this shell owns the header, tab routing, Overview canvas, and right panel.
 *
 * Overview chat = READ-ONLY preview that deep-links to the Chat tab (C5 — no
 * live composer here). Tasks seeded from WorkspaceState pending+blocked (C7).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutGrid, MessageSquare, BookOpen, FileBox, Brain, ListTodo,
  Clock, Settings as SettingsIcon, Loader2, CheckCircle2, AlertTriangle,
  Lightbulb, Sparkles, Users, Activity, WifiOff, ShieldAlert, ChevronRight,
  Circle, FileText, ArrowUpRight,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useRoomState } from '@/hooks/useRoomState';
import type {
  WorkspaceContext,
  WorkspaceStateView,
  WorkspaceStateItem,
  WorkspaceActivityEvent,
} from '@/lib/types';

// ── Tabs ────────────────────────────────────────────────────────────────
// The 8 PRD §12.2 tabs (Settings included). The shell renders Overview
// itself; the other tabs are embedded by the integrator (Chat / Memory /
// Timeline / Settings have hosts; Research / Artifacts are interim panels).
type WorkspaceTabId =
  | 'overview' | 'chat' | 'research' | 'artifacts'
  | 'memory' | 'tasks' | 'timeline' | 'settings';

interface WorkspaceTabDef {
  id: WorkspaceTabId;
  label: string;
  icon: React.ElementType;
}

const TABS: readonly WorkspaceTabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'artifacts', label: 'Artifacts', icon: FileBox },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

// ── Member view-model (from adapter.getTeamMembers) ──────────────────────
interface WorkspaceMember {
  id: string;
  name: string;
  status: string;
  avatar?: string;
}

interface WorkspaceDesktopAppProps {
  workspaceId: string;
  workspaceName: string;
  /**
   * Integrator-supplied deep-link to the live Chat tab/window for this
   * workspace (C5). The Overview chat widget and the Chat tab placeholder
   * both call this — the shell never embeds a live composer itself.
   */
  onOpenChat?: (workspaceId: string) => void;
}

// ── Small presentational helpers ─────────────────────────────────────────

function statusPillClass(status: WorkspaceContext['workspace']['status']): string {
  switch (status) {
    case 'paused':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'archived':
      return 'bg-muted/40 text-muted-foreground border-border/30';
    default:
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Shared widget card frame so every Overview widget matches the Hive DS. */
function WidgetCard({
  title, icon: Icon, accent, action, children, testId,
}: {
  title: string;
  icon: React.ElementType;
  accent?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="flex flex-col rounded-xl bg-secondary/30 border border-border/30 overflow-hidden"
      data-testid={testId}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${accent ?? 'text-primary'}`} />
          <h3 className="text-xs font-display font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

// ── Overview widgets ─────────────────────────────────────────────────────

/** C5: read-only chat preview that deep-links to the Chat tab. No composer. */
function ChatPreviewWidget({
  ctx, onOpenChat,
}: {
  ctx: WorkspaceContext | null;
  onOpenChat: () => void;
}) {
  const threads = ctx?.recentThreads ?? [];
  return (
    <WidgetCard
      title="AI Workspace"
      icon={MessageSquare}
      testId="ws-widget-chat"
      action={
        <button
          type="button"
          onClick={onOpenChat}
          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
          data-testid="ws-chat-open"
        >
          Open chat <ArrowUpRight className="w-3 h-3" />
        </button>
      }
    >
      {ctx?.greeting && (
        <p className="text-xs text-foreground mb-2 line-clamp-2">{ctx.greeting}</p>
      )}
      {threads.length === 0 ? (
        <EmptyHint>No conversations yet. Open chat to start working here.</EmptyHint>
      ) : (
        <div className="space-y-1">
          {threads.slice(0, 4).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={onOpenChat}
              className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors"
            >
              <span className="truncate">{t.title}</span>
              <ChevronRight className="w-3 h-3 shrink-0" />
            </button>
          ))}
          <p className="text-[10px] text-muted-foreground/60 pt-1">
            Preview only — open chat to reply.
          </p>
        </div>
      )}
    </WidgetCard>
  );
}

interface ArtifactRow {
  id: string;
  name: string;
  subtitle?: string;
}

/** Interim artifacts view sourced from the workspace file registry (S05 gates the real entity). */
function ArtifactsWidget({
  artifacts, ready, onOpenTab,
}: {
  artifacts: ArtifactRow[];
  ready: boolean;
  onOpenTab: () => void;
}) {
  return (
    <WidgetCard
      title="Key Artifacts"
      icon={FileBox}
      accent="text-sky-400"
      testId="ws-widget-artifacts"
      action={
        <button
          type="button"
          onClick={onOpenTab}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      }
    >
      {artifacts.length === 0 ? (
        <EmptyHint>No artifacts yet. Files and documents you create here will appear in this list.</EmptyHint>
      ) : (
        <ul className="space-y-1" data-testid="ws-artifacts-list" data-artifact-ready={ready}>
          {artifacts.slice(0, 5).map(a => (
            <li key={a.id} className="flex items-start gap-2 text-xs">
              <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-400/80" />
              <div className="min-w-0">
                <p className="text-foreground truncate">{a.name}</p>
                {a.subtitle && (
                  <p className="text-[10px] text-muted-foreground/70 truncate">{a.subtitle}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** C7: tasks seeded from WorkspaceState (pending + blocked). */
function TasksWidget({
  pending, blocked, onOpenTab,
}: {
  pending: WorkspaceStateItem[];
  blocked: WorkspaceStateItem[];
  onOpenTab: () => void;
}) {
  const total = pending.length + blocked.length;
  return (
    <WidgetCard
      title="Tasks"
      icon={ListTodo}
      accent="text-amber-400"
      testId="ws-widget-tasks"
      action={
        total > 0 ? (
          <button
            type="button"
            onClick={onOpenTab}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {total} open
          </button>
        ) : undefined
      }
    >
      {total === 0 ? (
        <EmptyHint>Nothing pending. Tasks surface here as work accrues in this workspace.</EmptyHint>
      ) : (
        <ul className="space-y-1.5" data-testid="ws-tasks-list">
          {blocked.slice(0, 3).map(t => (
            <li key={t.id} className="flex items-start gap-1.5 text-xs">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-destructive" />
              <span className="text-foreground">{t.content}</span>
              <span className="text-[10px] text-destructive/80 ml-auto shrink-0">blocked</span>
            </li>
          ))}
          {pending.slice(0, 5).map(t => (
            <li key={t.id} className="flex items-start gap-1.5 text-xs">
              <Circle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
              <span className="text-foreground">{t.content}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function MemoryHighlightsWidget({ ctx }: { ctx: WorkspaceContext | null }) {
  const memories = ctx?.recentMemories ?? [];
  const decisions = ctx?.recentDecisions ?? [];
  const hasAny = memories.length > 0 || decisions.length > 0;
  return (
    <WidgetCard title="Memory Highlights" icon={Brain} accent="text-amber-400" testId="ws-widget-memory">
      {!hasAny ? (
        <EmptyHint>No memory yet. As you work, key facts and decisions are remembered here.</EmptyHint>
      ) : (
        <div className="space-y-3">
          {decisions.length > 0 && (
            <div>
              <p className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-1">
                <Lightbulb className="w-3 h-3 inline mr-1 text-primary" />Recent decisions
              </p>
              <ul className="space-y-1">
                {decisions.slice(0, 3).map(d => (
                  <li key={d.date ?? d.content.slice(0, 32)} className="text-xs text-foreground">{d.content}</li>
                ))}
              </ul>
            </div>
          )}
          {memories.length > 0 && (
            <div>
              <p className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-1">
                <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" />I remember
              </p>
              <ul className="space-y-1">
                {memories.slice(0, 4).map(m => (
                  <li key={m.date ?? m.content.slice(0, 32)} className="text-xs text-muted-foreground">
                    <span className="text-foreground">
                      {m.content.slice(0, 110)}{m.content.length > 110 ? '…' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function ActivityWidget({ events }: { events: WorkspaceActivityEvent[] }) {
  return (
    <WidgetCard title="Recent Activity" icon={Activity} accent="text-violet-400" testId="ws-widget-activity">
      {events.length === 0 ? (
        <EmptyHint>No activity recorded yet.</EmptyHint>
      ) : (
        <ul className="space-y-1.5">
          {events.slice(0, 6).map(e => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400/70 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-foreground truncate">{e.summary}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {e.actor ? `${e.actor} · ` : ''}{relativeTime(e.ts)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ── Right context panel ──────────────────────────────────────────────────

function WorkspaceInfoPanel({
  ctx, workspaceName, members, lastEvent, agentsRunning, onOpenChat, onOpenTab,
}: {
  ctx: WorkspaceContext | null;
  workspaceName: string;
  members: WorkspaceMember[];
  lastEvent?: WorkspaceActivityEvent;
  agentsRunning: number;
  onOpenChat: () => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  const ws = ctx?.workspace;
  return (
    <aside
      className="hidden lg:flex w-72 shrink-0 flex-col border-l border-border/30 bg-background/40 overflow-auto"
      data-testid="ws-info-panel"
    >
      {/* Workspace info */}
      <div className="p-4 border-b border-border/30">
        <h3 className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-2">
          Workspace
        </h3>
        <p className="text-sm font-display font-semibold text-foreground">{ws?.name ?? workspaceName}</p>
        {ws?.description && (
          <p className="text-[11px] text-muted-foreground mt-1">{ws.description}</p>
        )}
        <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-muted-foreground">
          {typeof ctx?.stats?.memoryCount === 'number' && (
            <span><Brain className="w-3 h-3 inline mr-1" />{ctx.stats.memoryCount} memories</span>
          )}
          {typeof ctx?.stats?.sessionCount === 'number' && (
            <span><MessageSquare className="w-3 h-3 inline mr-1" />{ctx.stats.sessionCount} sessions</span>
          )}
        </div>
      </div>

      {/* Team members — global team roster, NOT workspace-scoped (see fetch site). */}
      <div className="p-4 border-b border-border/30">
        <h3 className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-2">
          <Users className="w-3 h-3 inline mr-1" />Team members
        </h3>
        {members.length === 0 ? (
          <EmptyHint>Just you for now.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {members.slice(0, 6).map(m => (
              <li key={m.id} className="flex items-center gap-2 text-xs">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center font-display shrink-0">
                  {initialsOf(m.name)}
                </span>
                <span className="text-foreground truncate">{m.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Last activity */}
      <div className="p-4 border-b border-border/30">
        <h3 className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-2">
          <Clock className="w-3 h-3 inline mr-1" />Last activity
        </h3>
        {lastEvent ? (
          <div className="text-xs">
            <p className="text-foreground">{lastEvent.summary}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{relativeTime(lastEvent.ts)}</p>
          </div>
        ) : (
          <EmptyHint>No activity yet.</EmptyHint>
        )}
        {agentsRunning > 0 && (
          <p className="mt-2 text-[11px] text-primary flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {agentsRunning} agent{agentsRunning === 1 ? '' : 's'} running
          </p>
        )}
      </div>

      {/* Quick actions */}
      <div className="p-4">
        <h3 className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-2">
          Quick actions
        </h3>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onOpenChat}
            className="w-full flex items-center gap-2 text-xs text-foreground px-2 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-primary" /> Open chat
          </button>
          <button
            type="button"
            onClick={() => onOpenTab('memory')}
            className="w-full flex items-center gap-2 text-xs text-foreground px-2 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-colors"
          >
            <Brain className="w-3.5 h-3.5 text-amber-400" /> View memory
          </button>
          <button
            type="button"
            onClick={() => onOpenTab('tasks')}
            className="w-full flex items-center gap-2 text-xs text-foreground px-2 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-colors"
          >
            <ListTodo className="w-3.5 h-3.5 text-amber-400" /> Review tasks
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Overview tab body ────────────────────────────────────────────────────

function OverviewTab({
  ctx, state, artifacts, activity, artifactReady, onOpenChat, onOpenTab,
}: {
  ctx: WorkspaceContext | null;
  state: WorkspaceStateView | null;
  artifacts: ArtifactRow[];
  activity: WorkspaceActivityEvent[];
  artifactReady: boolean;
  onOpenChat: () => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-[minmax(0,16rem)] p-4"
      data-testid="ws-overview-grid"
    >
      <ChatPreviewWidget ctx={ctx} onOpenChat={onOpenChat} />
      <ArtifactsWidget artifacts={artifacts} ready={artifactReady} onOpenTab={() => onOpenTab('artifacts')} />
      <TasksWidget
        pending={state?.pending ?? []}
        blocked={state?.blocked ?? []}
        onOpenTab={() => onOpenTab('tasks')}
      />
      <MemoryHighlightsWidget ctx={ctx} />
      <ActivityWidget events={activity} />
    </div>
  );
}

/** Placeholder body for tabs the integrator embeds (or that gate on later screens). */
function TabPlaceholder({
  icon: Icon, title, body, cta,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8" data-testid="ws-tab-placeholder">
      <Icon className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-display text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">{body}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

/** Tasks tab — full list seeded from WorkspaceState (C7). */
function TasksTabBody({ state }: { state: WorkspaceStateView | null }) {
  const pending = state?.pending ?? [];
  const blocked = state?.blocked ?? [];
  const completed = state?.completed ?? [];
  const total = pending.length + blocked.length + completed.length;

  if (total === 0) {
    return (
      <TabPlaceholder
        icon={ListTodo}
        title="No tasks yet"
        body="Tasks are seeded from this workspace's active state — pending and blocked items will show here as work accrues."
      />
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-auto h-full" data-testid="ws-tasks-tab">
      {blocked.length > 0 && (
        <section>
          <h3 className="text-xs font-display font-semibold text-destructive mb-2">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Blocked ({blocked.length})
          </h3>
          <ul className="space-y-1.5">
            {blocked.map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-destructive" />
                <span className="text-foreground">{t.content}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pending.length > 0 && (
        <section>
          <h3 className="text-xs font-display font-semibold text-amber-400 mb-2">
            <Circle className="w-3.5 h-3.5 inline mr-1" />Pending ({pending.length})
          </h3>
          <ul className="space-y-1.5">
            {pending.map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-secondary/30 border border-border/30">
                <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                <span className="text-foreground">{t.content}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <h3 className="text-xs font-display font-semibold text-emerald-400 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Completed ({completed.length})
          </h3>
          <ul className="space-y-1.5 opacity-70">
            {completed.slice(0, 10).map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                <span className="text-muted-foreground line-through">{t.content}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Main shell ───────────────────────────────────────────────────────────

const WorkspaceDesktopApp = ({ workspaceId, workspaceName, onOpenChat }: WorkspaceDesktopAppProps) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('overview');
  const [ctx, setCtx] = useState<WorkspaceContext | null>(null);
  const [state, setState] = useState<WorkspaceStateView | null>(null);
  const [activity, setActivity] = useState<WorkspaceActivityEvent[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish a hard fetch failure (offline) from a permission denial so
  // the two required states render differently (PRD §12.2 state list).
  const [errorKind, setErrorKind] = useState<'offline' | 'permission' | null>(null);

  // Live agents-running indicator for THIS workspace (reuse Room SSE state).
  const { workspaceMap } = useRoomState();
  const agentsRunning = useMemo(
    () => workspaceMap.get(workspaceId)?.live.length ?? 0,
    [workspaceMap, workspaceId],
  );

  const openChat = useCallback(() => {
    onOpenChat?.(workspaceId);
  }, [onOpenChat, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorKind(null);

    (async () => {
      // Context is the spine of the Overview — a failure here decides the
      // whole-screen error state. The other feeds degrade independently.
      try {
        const c = await adapter.getWorkspaceContext(workspaceId);
        if (!cancelled) setCtx(c);
      } catch (err: unknown) {
        if (cancelled) return;
        setCtx(null);
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        setErrorKind(msg.includes('403') || msg.includes('forbid') || msg.includes('denied')
          ? 'permission'
          : 'offline');
        // Context decides the whole-screen error state — bail before the
        // best-effort feeds fire, so a permission denial doesn't fan out into
        // four more 403s against the same workspace.
        setLoading(false);
        return;
      }

      // State / activity / members / artifacts are best-effort — each one
      // empties gracefully without taking down the screen.
      try {
        const s = await adapter.getWorkspaceState(workspaceId);
        if (!cancelled) setState(s);
      } catch { if (!cancelled) setState(null); }

      try {
        const a = await adapter.getWorkspaceActivity(workspaceId, 20);
        if (!cancelled) setActivity(Array.isArray(a?.events) ? a.events : []);
      } catch { if (!cancelled) setActivity([]); }

      // getTeamMembers() returns the GLOBAL team roster, not a per-workspace
      // membership list — the UI is labelled "Team members" accordingly.
      // TODO(Phase 5/S10): workspace-scoped members endpoint.
      try {
        const m = await adapter.getTeamMembers();
        if (!cancelled) setMembers(Array.isArray(m) ? m : []);
      } catch { if (!cancelled) setMembers([]); }

      // Interim "artifacts" = the workspace file registry (S05 owns the real
      // Artifact entity; until then we surface files/documents read-only).
      try {
        const files = await adapter.getWorkspaceFiles(workspaceId);
        if (!cancelled) setArtifacts(normalizeArtifacts(files));
      } catch { if (!cancelled) setArtifacts([]); }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [workspaceId]);

  const displayName = ctx?.workspace?.name ?? workspaceName;
  const wsType = ctx?.workspace?.type;
  const wsStatus = ctx?.workspace?.status ?? 'active';
  const hasMemory = (ctx?.stats?.memoryCount ?? ctx?.memoryCount ?? 0) > 0
    || (ctx?.recentMemories?.length ?? 0) > 0;
  const artifactReady = artifacts.length > 0;
  const lastEvent = activity[0];

  // ── Whole-screen states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground" data-testid="ws-desktop-loading">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading workspace…</span>
      </div>
    );
  }

  if (errorKind === 'permission') {
    return (
      <FullScreenState
        icon={ShieldAlert}
        iconClass="text-destructive"
        title="Permission denied"
        body={`You don't have access to "${displayName}". Ask a workspace owner to grant you access.`}
        testId="ws-desktop-permission-denied"
      />
    );
  }

  if (errorKind === 'offline') {
    return (
      <FullScreenState
        icon={WifiOff}
        iconClass="text-muted-foreground"
        title="Can't reach this workspace"
        body="The workspace couldn't be loaded. Check your connection — the server may be offline."
        testId="ws-desktop-offline"
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background" data-testid="ws-desktop-root" data-workspace-id={workspaceId}>
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-display font-semibold text-foreground truncate">{displayName}</h2>
          {wsType && (
            <span className="px-1.5 py-0.5 rounded text-[10px] border border-border/30 bg-muted/30 text-muted-foreground font-display uppercase tracking-wide capitalize">
              {wsType}
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] border font-display capitalize ${statusPillClass(wsStatus)}`}
            data-testid="ws-status-pill"
          >
            {wsStatus}
          </span>
          {agentsRunning > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-primary" data-testid="ws-agents-running">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {agentsRunning} running
            </span>
          )}
        </div>

        {/* Members stack */}
        <div className="flex items-center -space-x-2 shrink-0" data-testid="ws-members-stack">
          {members.slice(0, 5).map(m => (
            <span
              key={m.id}
              title={m.name}
              className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] flex items-center justify-center font-display border border-background"
            >
              {initialsOf(m.name)}
            </span>
          ))}
          {members.length > 5 && (
            <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[10px] flex items-center justify-center font-display border border-background">
              +{members.length - 5}
            </span>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <nav className="shrink-0 flex items-center gap-1 px-3 border-b border-border/30 overflow-x-auto" role="tablist" data-testid="ws-tab-bar">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`ws-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="ws-tabpanel"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-display whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`ws-tab-${tab.id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Body: main canvas + right context panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <main
          id="ws-tabpanel"
          className="flex-1 min-w-0 overflow-auto"
          role="tabpanel"
          aria-labelledby={`ws-tab-${activeTab}`}
          data-testid="ws-tab-panel"
        >
          {activeTab === 'overview' && (
            !hasMemory && artifacts.length === 0 && activity.length === 0
              && (state?.pending?.length ?? 0) === 0 && (state?.blocked?.length ?? 0) === 0 ? (
              <FullScreenState
                icon={Brain}
                iconClass="text-primary/50"
                title="This workspace is empty"
                body="Nothing has happened here yet. Open chat to start working — memory, tasks, and artifacts will fill in as you go."
                testId="ws-overview-no-memory"
                cta={
                  <button
                    type="button"
                    onClick={openChat}
                    className="px-4 py-2 text-xs rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
                  >
                    Open chat
                  </button>
                }
              />
            ) : (
              <OverviewTab
                ctx={ctx}
                state={state}
                artifacts={artifacts}
                activity={activity}
                artifactReady={artifactReady}
                onOpenChat={openChat}
                onOpenTab={setActiveTab}
              />
            )
          )}

          {activeTab === 'chat' && (
            <TabPlaceholder
              icon={MessageSquare}
              title="Chat"
              body="The full conversation surface for this workspace opens in the chat runtime."
              cta={
                <button
                  type="button"
                  onClick={openChat}
                  className="px-4 py-2 text-xs rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
                  data-testid="ws-chat-tab-open"
                >
                  Open chat
                </button>
              }
            />
          )}

          {activeTab === 'tasks' && <TasksTabBody state={state} />}

          {activeTab === 'research' && (
            <TabPlaceholder
              icon={BookOpen}
              title="Research & Notes"
              body="Notes and research for this workspace live here. This surface is wired in a later phase."
            />
          )}

          {activeTab === 'artifacts' && (
            artifacts.length === 0 ? (
              <TabPlaceholder
                icon={FileBox}
                title="No artifacts yet"
                body="Files and documents created in this workspace appear here. The full Artifact Center arrives in a later phase."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 overflow-auto h-full" data-testid="ws-artifacts-tab">
                {artifacts.map(a => (
                  <div key={a.id} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                    <FileText className="w-4 h-4 text-sky-400 mb-2" />
                    <p className="text-xs text-foreground truncate">{a.name}</p>
                    {a.subtitle && <p className="text-[10px] text-muted-foreground/70 truncate">{a.subtitle}</p>}
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'memory' && (
            <TabPlaceholder
              icon={Brain}
              title="Memory"
              body="The Memory Center for this workspace embeds here."
            />
          )}

          {activeTab === 'timeline' && (
            <TabPlaceholder
              icon={Clock}
              title="Timeline"
              body="The execution timeline for this workspace embeds here."
            />
          )}

          {activeTab === 'settings' && (
            <TabPlaceholder
              icon={SettingsIcon}
              title="Workspace Settings"
              body="Configuration for this workspace embeds here."
            />
          )}
        </main>

        <WorkspaceInfoPanel
          ctx={ctx}
          workspaceName={workspaceName}
          members={members}
          lastEvent={lastEvent}
          agentsRunning={agentsRunning}
          onOpenChat={openChat}
          onOpenTab={setActiveTab}
        />
      </div>
    </div>
  );
};

// ── Local utilities ──────────────────────────────────────────────────────

/** Coerce the loosely-typed file registry into the Overview's artifact rows. */
function normalizeArtifacts(files: unknown[]): ArtifactRow[] {
  if (!Array.isArray(files)) return [];
  const rows: ArtifactRow[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f && typeof f === 'object') {
      const rec = f as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name
        : typeof rec.path === 'string' ? rec.path
        : '';
      if (!name) continue;
      const id = typeof rec.path === 'string' ? rec.path
        : typeof rec.id === 'string' ? rec.id
        : `artifact-${i}`;
      const subtitle = typeof rec.mimeType === 'string' ? rec.mimeType
        : typeof rec.modifiedAt === 'string' ? relativeTime(rec.modifiedAt)
        : undefined;
      rows.push({ id, name, subtitle });
    }
  }
  return rows;
}

function FullScreenState({
  icon: Icon, iconClass, title, body, testId, cta,
}: {
  icon: React.ElementType;
  iconClass: string;
  title: string;
  body: string;
  testId: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-background" data-testid={testId}>
      <Icon className={`w-12 h-12 mb-4 ${iconClass}`} />
      <p className="text-base font-display font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-md">{body}</p>
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}

export default WorkspaceDesktopApp;
