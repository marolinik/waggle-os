/**
 * HomeCockpit — the daily executive briefing and launch surface (S01, PRD §12.1).
 *
 * This is the new default `home` surface that replaces the interim DashboardApp
 * under the "home" route. It greets the user by name + date, ranks active/recent
 * workspaces with a one-click Continue, surfaces the overnight summary, lists
 * suggested next actions + "Up next", and offers quick capture (note/task/link/
 * file) — all WITHOUT opening a workspace.
 *
 * Cross-workspace aggregation lives server-side (GET /api/home/briefing,
 * /api/home/overnight) per the gap card §5 privacy gate — the FE never re-runs
 * the N+1 fan-out the old LoginBriefing did. Personal-only in v1 (founder
 * decision A2): no team/shared slice is requested or rendered.
 *
 * States (PRD §12.1 + §14.2): Loading (skeleton) · First-run empty · Normal ·
 * Attention required · Offline/local-only. Status colour-coding uses the new
 * Hive DS --sem-* semantic tokens (index.css §IA color semantics).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, ChevronRight, Clock, Brain, AlertTriangle, Plus,
  CheckCircle2, Lightbulb, Calendar, ListTodo, Loader2, WifiOff,
  StickyNote, Link2, Paperclip, Command, RefreshCw,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useService } from '@/providers/ServiceProvider';
import type {
  HomeBriefing,
  OvernightSummary,
  RecentWorkspaceCard,
  SuggestedAction,
  UpNextItem,
  QuickCaptureInput,
} from '@/lib/types';

interface HomeCockpitProps {
  /** Continue a workspace → open its chat runtime (founder A-flow: continue→openChat). */
  onContinue: (workspaceId: string, sessionId?: string) => void;
  /** Open the full Workspace Desktop for a workspace (S02). */
  onOpenWorkspaceDesktop: (workspaceId: string) => void;
  /** Start the new-workspace flow (first-run + empty-state CTA). */
  onCreateWorkspace: () => void;
  /**
   * Fallback display name when the briefing has no userName yet (e.g. before
   * onboarding seeds identity — founder B8). Optional; the greeting from the
   * server wins when present.
   */
  userName?: string;
}

// Quick-capture kinds rendered as a small segmented selector. Each maps to a
// QuickCaptureInput.kind the server route understands (gap card §5).
const CAPTURE_KINDS: ReadonlyArray<{ kind: QuickCaptureInput['kind']; label: string; icon: typeof StickyNote; placeholder: string }> = [
  { kind: 'note', label: 'Note', icon: StickyNote, placeholder: 'Jot a note to remember…' },
  { kind: 'task', label: 'Task', icon: ListTodo, placeholder: 'Add a task…' },
  { kind: 'link', label: 'Link', icon: Link2, placeholder: 'Paste a URL to keep…' },
  { kind: 'file', label: 'File', icon: Paperclip, placeholder: 'Path or note about a file…' },
];

const UP_NEXT_ICON: Record<UpNextItem['kind'], typeof Calendar> = {
  event: Calendar,
  task: ListTodo,
  schedule: Clock,
};

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ── Loading skeleton ─────────────────────────────────────────────────────
function CockpitSkeleton() {
  return (
    <div className="h-full overflow-auto p-6 max-w-3xl mx-auto animate-pulse" data-testid="home-cockpit-loading">
      <div className="h-7 w-56 rounded-lg bg-muted/60 mb-2" />
      <div className="h-4 w-40 rounded bg-muted/40 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-secondary/30 border border-border/30" />
        ))}
      </div>
      <div className="h-24 rounded-xl bg-secondary/20 border border-border/30 mb-4" />
      <div className="h-32 rounded-xl bg-secondary/20 border border-border/30" />
    </div>
  );
}

// ── First-run empty state ────────────────────────────────────────────────
function FirstRunEmpty({ greeting, onCreateWorkspace }: { greeting: string; onCreateWorkspace: () => void }) {
  return (
    <div className="h-full overflow-auto p-6 max-w-3xl mx-auto" data-testid="home-cockpit-empty">
      <h1 className="text-2xl font-display font-bold text-foreground mb-1">{greeting}</h1>
      <p className="text-sm text-muted-foreground mb-6">Let's set up your first workspace.</p>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
        <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--sem-intelligence)' }} />
        <h2 className="text-base font-display font-semibold text-foreground mb-1">Your cockpit is empty — for now</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
          Create a workspace and Waggle starts remembering your work. Tomorrow this screen
          greets you with what you did, what ran overnight, and what to do next.
        </p>
        <button
          type="button"
          onClick={onCreateWorkspace}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
          data-testid="home-cockpit-create-first"
        >
          <Plus className="w-4 h-4" /> Create your first workspace
        </button>
      </div>
    </div>
  );
}

// ── Greeting header ──────────────────────────────────────────────────────
function GreetingHeader({ greeting, date, offline }: { greeting: string; date: string; offline: boolean }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-display font-bold text-foreground leading-tight">{greeting}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{date}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {offline && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-display"
            style={{ color: 'var(--sem-attention)', backgroundColor: 'color-mix(in srgb, var(--sem-attention) 12%, transparent)' }}
            data-testid="home-cockpit-offline-pill"
          >
            <WifiOff className="w-3 h-3" /> Local only
          </span>
        )}
        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-display text-muted-foreground bg-secondary/40 border border-border/30">
          <Command className="w-3 h-3" /> Win+K
        </span>
      </div>
    </div>
  );
}

// ── Recent workspaces ────────────────────────────────────────────────────
function RecentWorkspacesPanel({
  cards, onContinue, onOpenDesktop,
}: {
  cards: RecentWorkspaceCard[];
  onContinue: (id: string, sessionId?: string) => void;
  onOpenDesktop: (id: string) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="mb-6" data-testid="home-cockpit-recent">
      <h2 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        You were working on
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map(ws => (
          <div
            key={ws.id}
            className="group relative text-left p-3 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/50 hover:border-border transition-all"
            data-testid={`home-cockpit-ws-${ws.id}`}
          >
            <button
              type="button"
              onClick={() => onOpenDesktop(ws.id)}
              className="block w-full text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-display font-medium text-foreground truncate flex-1">{ws.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{ws.group}</span>
              </div>
              {ws.summary && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5">{ws.summary}</p>
              )}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {ws.lastActive && (
                  <span className="inline-flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatRelative(ws.lastActive)}</span>
                )}
                {ws.pendingCount > 0 && (
                  <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--sem-attention)' }}>
                    <AlertTriangle className="w-2.5 h-2.5" />{ws.pendingCount} pending
                  </span>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onContinue(ws.id, ws.continueSessionId)}
              className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-display rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              data-testid={`home-cockpit-continue-${ws.id}`}
            >
              Continue <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Overnight summary ────────────────────────────────────────────────────
function OvernightPanel({ summary }: { summary: OvernightSummary | null }) {
  if (!summary) return null;
  const hasActivity =
    summary.consolidated > 0 || summary.artifactsCreated > 0 ||
    summary.automationsCompleted > 0 || summary.failures.length > 0;
  if (!hasActivity) return null;

  const counters: ReadonlyArray<{ label: string; value: number; color: string }> = [
    { label: 'Memories consolidated', value: summary.consolidated, color: 'var(--sem-intelligence)' },
    { label: 'Artifacts created', value: summary.artifactsCreated, color: 'var(--sem-work)' },
    { label: 'Automations completed', value: summary.automationsCompleted, color: 'var(--sem-healthy)' },
  ];

  return (
    <section className="mb-4 p-3 rounded-xl bg-secondary/20 border border-border/30" data-testid="home-cockpit-overnight">
      <h2 className="text-xs font-display font-semibold text-foreground mb-2.5 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--sem-intelligence)' }} /> Overnight
      </h2>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {counters.map(c => (
          <div key={c.label} className="rounded-lg bg-background/40 px-2.5 py-2">
            <div className="text-lg font-display font-semibold tabular-nums" style={{ color: c.color }}>{c.value}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{c.label}</div>
          </div>
        ))}
      </div>
      {summary.failures.length > 0 && (
        <div
          className="mt-2 rounded-lg px-2.5 py-2"
          style={{ backgroundColor: 'color-mix(in srgb, var(--sem-risk) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--sem-risk) 25%, transparent)' }}
          data-testid="home-cockpit-overnight-failures"
        >
          <h3 className="text-[11px] font-display font-semibold mb-1.5 flex items-center gap-1" style={{ color: 'var(--sem-risk)' }}>
            <AlertTriangle className="w-3 h-3" /> {summary.failures.length} failure{summary.failures.length === 1 ? '' : 's'}
          </h3>
          <ul className="space-y-1">
            {summary.failures.slice(0, 4).map(f => (
              <li key={f.id}>
                {/* Journey 16: a failed automation deep-links into the
                    Automation Center's Logs tab (retry/pause/edit live there).
                    automationId preselects the failing automation's log. */}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('waggle:open-app', {
                    detail: { appId: 'scheduled-jobs', tab: 'logs', automationId: f.automationId },
                  }))}
                  className="w-full text-left text-[11px] text-foreground hover:text-primary rounded px-1 py-0.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground"> — {f.error}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Up next ──────────────────────────────────────────────────────────────
function UpNextPanel({ items, onOpen }: { items: UpNextItem[]; onOpen: (id?: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-4 p-3 rounded-xl bg-secondary/20 border border-border/30" data-testid="home-cockpit-upnext">
      <h2 className="text-xs font-display font-semibold text-foreground mb-2 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--sem-work)' }} /> Up next
      </h2>
      <ul className="space-y-1">
        {items.slice(0, 6).map(item => {
          const Icon = UP_NEXT_ICON[item.kind];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.workspaceId)}
                className="w-full flex items-center gap-2 text-xs text-foreground hover:text-primary px-1.5 py-1 rounded hover:bg-muted/40 transition-colors text-left"
              >
                <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.at && <span className="text-[10px] text-muted-foreground shrink-0">{item.at}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Suggested next actions ───────────────────────────────────────────────
function SuggestedActionsPanel({ actions, onRun }: { actions: SuggestedAction[]; onRun: (a: SuggestedAction) => void }) {
  if (actions.length === 0) return null;
  return (
    <section className="mb-4 p-3 rounded-xl bg-secondary/20 border border-border/30" data-testid="home-cockpit-suggested">
      <h2 className="text-xs font-display font-semibold text-foreground mb-2 flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5" style={{ color: 'var(--sem-attention)' }} /> Suggested next actions
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.slice(0, 6).map((a, i) => (
          <button
            key={`${a.workspaceId}-${a.kind}-${a.label}`}
            type="button"
            onClick={() => onRun(a)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
            data-testid={`home-cockpit-action-${i}`}
          >
            <CheckCircle2 className="w-3 h-3" /> {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Quick capture ────────────────────────────────────────────────────────
function QuickCapturePanel() {
  const [kind, setKind] = useState<QuickCaptureInput['kind']>('note');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Track the "saved → idle" reset timer so it can't fire setState after unmount.
  const resetTimer = useRef<number | null>(null);

  const active = CAPTURE_KINDS.find(k => k.kind === kind) ?? CAPTURE_KINDS[0];

  const submit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setStatus('saving');
    try {
      await adapter.quickCapture({ kind, content: trimmed });
      setContent('');
      setStatus('saved');
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = null;
        setStatus('idle');
      }, 1800);
    } catch {
      setStatus('error');
    }
  }, [content, kind]);

  // Clear any pending reset timer on unmount (avoids setState-on-unmount).
  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  return (
    <section className="mb-4 p-3 rounded-xl bg-secondary/20 border border-border/30" data-testid="home-cockpit-quickcapture">
      <h2 className="text-xs font-display font-semibold text-foreground mb-2">Quick capture</h2>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CAPTURE_KINDS.map(k => {
          const Icon = k.icon;
          const selected = k.kind === kind;
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-display transition-colors ${
                selected ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`home-cockpit-capture-kind-${k.kind}`}
            >
              <Icon className="w-3 h-3" /> {k.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={content}
          onChange={e => { setContent(e.target.value); if (status === 'error' || status === 'saved') setStatus('idle'); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder={active.placeholder}
          aria-label={active.placeholder}
          className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          data-testid="home-cockpit-capture-input"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={status === 'saving' || content.trim().length === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="home-cockpit-capture-submit"
        >
          {status === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Capture
        </button>
      </div>
      {status === 'saved' && (
        <p className="mt-1.5 text-[11px] flex items-center gap-1" style={{ color: 'var(--sem-healthy)' }}>
          <CheckCircle2 className="w-3 h-3" /> Captured
        </p>
      )}
      {status === 'error' && (
        <p className="mt-1.5 text-[11px] flex items-center gap-1" style={{ color: 'var(--sem-risk)' }}>
          <AlertTriangle className="w-3 h-3" /> Couldn't capture — try again
        </p>
      )}
    </section>
  );
}

// ── Active models tile (only when relevant — PRD §12.1 "do not clutter") ──
function ActiveModelsTile({ models }: { models?: string[] }) {
  if (!models || models.length === 0) return null;
  return (
    <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap" data-testid="home-cockpit-models">
      <Brain className="w-3 h-3" style={{ color: 'var(--sem-intelligence)' }} />
      <span>Active models:</span>
      {models.slice(0, 3).map(m => (
        <span key={m} className="px-1.5 py-0.5 rounded bg-secondary/40 text-foreground">{m}</span>
      ))}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────
const HomeCockpit = ({ onContinue, onOpenWorkspaceDesktop, onCreateWorkspace, userName }: HomeCockpitProps) => {
  const [briefing, setBriefing] = useState<HomeBriefing | null>(null);
  const [overnight, setOvernight] = useState<OvernightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const offline = useOfflineStatus();
  // Cold-load race guard: the adapter attaches the session token during its
  // initial connect(); firing authed briefing/overnight calls before that 401s
  // and yields malformed data. Defer load() until the attempt has settled.
  const { connecting } = useService();
  // Guards every async set* against firing after unmount (mirrors
  // WorkspaceDesktopApp's `cancelled` flag — but ref-scoped since `load` is a
  // reusable callback driven by both the effect and the Retry button).
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setPermissionDenied(false);
    try {
      const b = await adapter.getHomeBriefing();
      if (cancelled.current) return;
      setBriefing(b);
      // Overnight is a secondary, best-effort tile — its failure must never
      // blank the whole cockpit (offline/local-only degrades it gracefully).
      try {
        const o = await adapter.getHomeOvernight();
        if (!cancelled.current) setOvernight(o);
      } catch {
        if (!cancelled.current) setOvernight(null);
      }
    } catch (err: unknown) {
      if (cancelled.current) return;
      setBriefing(null);
      // PERMISSION-DENIED (PRD §12.1): a 403 gets a dedicated message rather
      // than the generic "couldn't load" / offline framing.
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('403') || msg.includes('forbid') || msg.includes('denied')) {
        setPermissionDenied(true);
      } else {
        setLoadError(true);
      }
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer until the adapter's initial connect attempt has settled. Gates on
    // `connecting` (settled), NOT `connected`, so a failed connect still runs
    // load() → the existing offline/retry UI rather than a permanent skeleton.
    if (connecting) return;
    cancelled.current = false;
    void load();
    return () => { cancelled.current = true; };
  }, [load, connecting]);

  if (loading) return <CockpitSkeleton />;

  // PERMISSION-DENIED (PRD §12.1): the briefing route rejected with 403 — a
  // distinct, non-retry message so the user understands it's an access gate,
  // not an outage.
  if (permissionDenied) {
    return (
      <div className="h-full overflow-auto p-6 max-w-3xl mx-auto" data-testid="home-cockpit-permission-denied">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-10 h-10 mb-3" style={{ color: 'var(--sem-attention)' }} />
          <p className="text-sm font-display font-semibold text-foreground mb-1">Access not permitted</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Your account doesn't have permission to view this briefing. Check your workspace
            access or sign in with an authorized account.
          </p>
        </div>
      </div>
    );
  }

  // Briefing fetch failed entirely (and not first-run): offer a retry rather
  // than a blank screen. Offline-aware copy so local-only isn't read as a crash.
  if (loadError || !briefing) {
    return (
      <div className="h-full overflow-auto p-6 max-w-3xl mx-auto" data-testid="home-cockpit-error">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {offline ? (
            <WifiOff className="w-10 h-10 mb-3" style={{ color: 'var(--sem-attention)' }} />
          ) : (
            <AlertTriangle className="w-10 h-10 mb-3" style={{ color: 'var(--sem-risk)' }} />
          )}
          <p className="text-sm text-muted-foreground mb-3">
            {offline ? "You're offline — your daily briefing needs the local service." : "Couldn't load your briefing."}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
            data-testid="home-cockpit-retry"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const greeting = briefing.greeting || (userName ? `Welcome back, ${userName}` : 'Welcome back');

  if (briefing.isFirstRun) {
    return <FirstRunEmpty greeting={greeting} onCreateWorkspace={onCreateWorkspace} />;
  }

  const onOpenFromAction = (a: SuggestedAction) => onContinue(a.workspaceId, a.sessionId);

  // ATTENTION-REQUIRED (PRD §12.1): overnight failures get a visible top banner
  // regardless of the OvernightPanel — which is suppressed when offline and
  // hidden when there's no activity, so failures would otherwise go unseen.
  const failureCount = overnight?.failures?.length ?? 0;

  return (
    <div className="h-full overflow-auto p-6 max-w-3xl mx-auto" data-testid="home-cockpit">
      <GreetingHeader greeting={greeting} date={briefing.date} offline={offline} />

      {failureCount > 0 && (
        <div
          className="mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{
            color: 'var(--sem-attention)',
            backgroundColor: 'color-mix(in srgb, var(--sem-attention) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--sem-attention) 30%, transparent)',
          }}
          role="alert"
          data-testid="home-cockpit-attention-banner"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs font-display">
            {failureCount} overnight {failureCount === 1 ? 'task needs' : 'tasks need'} your attention.
          </p>
        </div>
      )}

      <RecentWorkspacesPanel
        cards={briefing.recentWorkspaces}
        onContinue={onContinue}
        onOpenDesktop={onOpenWorkspaceDesktop}
      />

      {/* Overnight is suppressed when offline (it aggregates cron/automation
          history the local-only session can't trust); the offline pill in the
          header already signals the degraded surface. */}
      {!offline && <OvernightPanel summary={overnight} />}

      <SuggestedActionsPanel actions={briefing.suggestedActions} onRun={onOpenFromAction} />

      <UpNextPanel items={briefing.upNext} onOpen={(id) => { if (id) onOpenWorkspaceDesktop(id); }} />

      <QuickCapturePanel />

      <ActiveModelsTile models={briefing.activeModels} />
    </div>
  );
};

export default HomeCockpit;
