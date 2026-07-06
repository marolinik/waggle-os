/**
 * HomeCockpit — the daily landing (S01, warm-Hive Editorial / Variation A).
 *
 * Opens with one human sentence, tells the overnight story, and offers one
 * obvious next move, in a calm single 920px column: greeting (mono date row +
 * live dot) → "While you slept" overnight hero → "Pick up where you left off"
 * → "Waggle suggests" → "Up next" → ask bar.
 *
 * Cross-workspace aggregation stays server-side (GET /api/home/briefing,
 * /api/home/overnight) per the §5 privacy gate — the FE never re-runs the old
 * N+1 fan-out. Personal-only in v1 (founder A2). Render states (PRD §12.1 /
 * §14.2): Loading · Permission-denied · Error/offline · First-run · Normal.
 *
 * Honesty (PR3-BUILD-PLAN §5): the overnight story sentence + run chips are
 * COMPOSED client-side from the real OvernightSummary counts (no narrative
 * producer); the 🔥 streak has no backend field yet (SHOW_STREAK gate, below);
 * "Continue" lands at chat root because the server omits continueSessionId.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Sparkles, ChevronRight, Clock, Brain, AlertTriangle, Plus,
  Lightbulb, Calendar, ListTodo, WifiOff, RefreshCw,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { DATE_LOCALE } from '@/lib/date-locale';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import WorkspaceActionsMenu from '../WorkspaceActionsMenu';
import {
  HexAvatar, SectionLabel, DotLive, RunChip, IconTile, OvernightHero, AskBar,
  StreakChip, type RunChipProps,
} from '../warm';
import type {
  HomeBriefing,
  OvernightSummary,
  RecentWorkspaceCard,
  SuggestedAction,
  UpNextItem,
  QuickCaptureInput,
} from '@/lib/types';

/**
 * The 🔥 streak is a designed habit-loop mechanic (SCREENS §15) but no backend
 * streak field exists yet (PR3-BUILD-PLAN §5). Keep the wiring ready, gated off,
 * so it lights up when a real field lands — never ship a fabricated number.
 * TODO(backend): expose a real streak on HomeBriefing, then flip this to true.
 */
const SHOW_STREAK = false;
const STREAK_DAYS = 0;

const UP_NEXT_ICON: Record<UpNextItem['kind'], typeof Calendar> = {
  event: Calendar,
  task: ListTodo,
  schedule: Clock,
};

interface StartHereMove {
  title: string;
  workspaceName?: string;
  reason: string;
  primaryLabel: string;
  workspaceId: string;
  sessionId?: string;
  mode: 'continue' | 'open';
}

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

/** The briefing ships `date` as a raw ISO string — render it as a human date.
 *  KEEP this exact format: the P2 test asserts `getByText(toLocaleDateString(
 *  undefined,{weekday,month,day}))`, an exact full-node match, so the date must
 *  stay in its own text node (the time is a separate sibling). */
function formatBriefingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(DATE_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(DATE_LOCALE, { hour: 'numeric', minute: '2-digit' });
}

/** Honey-accented key number inside a composed sentence. */
function honey(n: ReactNode): ReactNode {
  return <span className="font-semibold text-[var(--honey)]">{n}</span>;
}

function rankTimestamp(iso?: string): number {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function mostUrgentWorkspace(cards: RecentWorkspaceCard[]): RecentWorkspaceCard | undefined {
  const pending = cards.filter(card => card.pendingCount > 0);
  if (pending.length > 0) {
    return [...pending].sort((a, b) => b.pendingCount - a.pendingCount || rankTimestamp(b.lastActive) - rankTimestamp(a.lastActive))[0];
  }
  return cards[0];
}

function buildStartHereMove(briefing: HomeBriefing, wsById: Map<string, RecentWorkspaceCard>): StartHereMove | null {
  const suggested = briefing.suggestedActions?.[0];
  if (suggested?.workspaceId) {
    const workspace = wsById.get(suggested.workspaceId);
    return {
      title: suggested.label,
      workspaceName: workspace?.name,
      reason: 'Because Waggle found this as the next useful move in your current work.',
      primaryLabel: 'Resume',
      workspaceId: suggested.workspaceId,
      sessionId: suggested.sessionId,
      mode: 'continue',
    };
  }

  const workspace = mostUrgentWorkspace(briefing.recentWorkspaces ?? []);
  if (workspace) {
    if (workspace.pendingCount > 0) {
      return {
        title: `Review ${workspace.pendingCount} pending ${workspace.pendingCount === 1 ? 'item' : 'items'}`,
        workspaceName: workspace.name,
        reason: 'Because this workspace has unresolved decisions and the most live context.',
        primaryLabel: 'Resume',
        workspaceId: workspace.id,
        sessionId: workspace.continueSessionId,
        mode: 'continue',
      };
    }

    return {
      title: `Continue ${workspace.name}`,
      // Wave F (fix 2a): the title already names the workspace — a second
      // "WORKSPACE NAME" eyebrow under it was pure redundancy.
      reason: workspace.summary
        ? `Because you left off here: ${workspace.summary}`
        : 'Because this is your most recent workspace.',
      primaryLabel: 'Resume',
      workspaceId: workspace.id,
      sessionId: workspace.continueSessionId,
      mode: 'continue',
    };
  }

  const upcoming = (briefing.upNext ?? []).find(item => item.workspaceId);
  if (upcoming?.workspaceId) {
    const workspaceForEvent = wsById.get(upcoming.workspaceId);
    return {
      title: upcoming.label,
      workspaceName: workspaceForEvent?.name,
      reason: 'Because this is next on your work timeline.',
      primaryLabel: 'Open',
      workspaceId: upcoming.workspaceId,
      mode: 'open',
    };
  }

  return null;
}

// ── Loading skeleton ─────────────────────────────────────────────────────
function CockpitSkeleton() {
  return (
    <div className="mx-auto h-full max-w-[920px] animate-pulse overflow-auto px-8 pb-20 pt-[46px]" data-testid="home-cockpit-loading">
      <div className="mb-2 h-4 w-44 rounded bg-[var(--surface-2)]" />
      <div className="mb-8 h-12 w-80 rounded-lg bg-[var(--surface-2)]" />
      <div className="mb-8 h-40 rounded-[26px] border border-[var(--line-soft)] bg-[var(--surface)]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map(i => (
          <div key={i} className="h-28 rounded-[18px] border border-[var(--line-soft)] bg-[var(--surface)]" />
        ))}
      </div>
    </div>
  );
}

// ── First-run empty state ────────────────────────────────────────────────
function FirstRunEmpty({ greeting, onCreateWorkspace }: { greeting: string; onCreateWorkspace: () => void }) {
  return (
    <div className="mx-auto h-full max-w-[920px] overflow-auto px-8 pb-20 pt-[46px]" data-testid="home-cockpit-empty">
      <h1 className="mb-1 font-display text-[clamp(28px,4vw,40px)] font-semibold leading-tight text-[var(--text)]">{greeting}</h1>
      <p className="mb-8 text-[15px] text-[var(--text-muted)]">Your AI should know how you work. Let's set up your first workspace.</p>

      <div className="relative overflow-hidden rounded-[26px] border border-[var(--line-soft)] bg-[linear-gradient(150deg,var(--surface),var(--surface-2))] p-8 text-center shadow-[var(--shadow)]">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,var(--honey-glow),transparent_70%)]" />
        <div className="relative">
          <HexAvatar label="W" size={48} className="mx-auto mb-4" />
          <h2 className="mb-1.5 font-display text-[19px] font-semibold text-[var(--text)]">Your personal AI workspace starts here</h2>
          <p className="mx-auto mb-6 max-w-md text-[14px] leading-relaxed text-[var(--text-muted)]">
            Waggle remembers you, knows your projects, evolves with each decision, and guides the next step
            while it runs the right AI underneath.
          </p>
          <button
            type="button"
            onClick={onCreateWorkspace}
            className="inline-flex items-center gap-1.5 rounded-[12px] bg-[var(--honey)] px-5 py-2.5 text-[14px] font-medium text-[#1a1407] transition-opacity hover:opacity-90"
            data-testid="home-cockpit-create-first"
          >
            <Plus className="h-4 w-4" /> Create your first workspace
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Greeting (mono date row + live dot + streak + two-line H1) ────────────
function GreetingHeader({
  greeting, date, workspaceCount, pendingTotal, lastActive,
}: {
  greeting: string;
  date: string;
  workspaceCount: number;
  /** Sum of pendingCount across the briefing's workspace cards (real data). */
  pendingTotal: number;
  /** Most recent lastActive across the briefing's workspace cards. */
  lastActive?: string;
}) {
  const lastActiveRel = formatRelative(lastActive);
  return (
    <header className="mb-9">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--honey)]">
          <DotLive tone="healthy" size={7} />
          <span>{formatBriefingDate(date)}</span>
          {formatClock(date) && <span className="text-[var(--text-dim)]">· {formatClock(date)}</span>}
        </div>
        {SHOW_STREAK && <StreakChip days={STREAK_DAYS} />}
      </div>
      <h1 className="font-display text-[clamp(34px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.02em] text-[var(--text)]">
        {greeting}
      </h1>
      {/* Wave F (fix 2): a RETURNING user gets their real deltas, not marketing
          copy — composed from data the briefing already carries (no new fetch).
          The positioning paragraph stays only for the day-0 user (no workspaces),
          who has nothing real to show yet. */}
      {workspaceCount > 0 ? (
        <p
          className="mt-3 text-[clamp(16px,2vw,19px)] font-medium text-[var(--text-2)]"
          data-testid="home-cockpit-facts"
        >
          {honey(`${workspaceCount} ${workspaceCount === 1 ? 'workspace' : 'workspaces'}`)} waiting for you
          {pendingTotal > 0 && <> · {pendingTotal} {pendingTotal === 1 ? 'item' : 'items'} to review</>}
          {lastActiveRel && <> · last active {lastActiveRel}</>}
        </p>
      ) : (
        <p
          className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--text-muted)]"
          data-testid="home-cockpit-positioning"
        >
          Waggle is your personal AI workspace: it remembers you, knows your projects, evolves with each decision,
          guides the next step, and runs the right AI underneath.
        </p>
      )}
    </header>
  );
}

function StartHereCard({
  move, onContinue, onOpenWorkspaceDesktop,
}: {
  move: StartHereMove | null;
  onContinue: (id: string, sessionId?: string) => void;
  onOpenWorkspaceDesktop: (id: string) => void;
}) {
  if (!move) return null;
  const handlePrimary = () => {
    if (move.mode === 'open') {
      onOpenWorkspaceDesktop(move.workspaceId);
      return;
    }
    onContinue(move.workspaceId, move.sessionId);
  };

  return (
    <section
      className="mb-9 overflow-hidden rounded-[22px] border border-[var(--honey-line)] bg-[linear-gradient(145deg,var(--honey-wash),var(--surface))] p-5 shadow-[var(--shadow-honey)]"
      data-testid="home-cockpit-start-here"
    >
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--honey)]">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Start here</span>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-[clamp(22px,3vw,30px)] font-semibold leading-tight text-[var(--text)]">
            {move.title}
          </h2>
          {move.workspaceName && (
            <p className="mt-1 font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--text-dim)]">
              {move.workspaceName}
            </p>
          )}
          <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-[var(--text-muted)]">
            {move.reason}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePrimary}
            className="inline-flex items-center gap-1.5 rounded-[12px] bg-[var(--honey)] px-4 py-2 text-[13px] font-semibold text-[#1a1407] transition-opacity hover:opacity-90"
            data-testid="home-cockpit-start-primary"
          >
            {move.primaryLabel} <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onOpenWorkspaceDesktop(move.workspaceId)}
            className="inline-flex items-center gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)]"
          >
            Open workspace
          </button>
        </div>
      </div>
    </section>
  );
}

/** Names (lower-cased) that appear on more than one card — used to surface a
 *  disambiguator (group) so two identically-named workspaces aren't confused. */
function duplicateNameSet(names: string[]): Set<string> {
  const seen = new Map<string, number>();
  for (const n of names) {
    const k = n.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k));
}

// ── "Pick up where you left off" ─────────────────────────────────────────
function RecentWorkspacesPanel({
  cards, onContinue, onOpenDesktop, onWorkspaceChanged,
}: {
  cards: RecentWorkspaceCard[];
  onContinue: (id: string, sessionId?: string) => void;
  onOpenDesktop: (id: string) => void;
  onWorkspaceChanged: () => void;
}) {
  if (cards.length === 0) return null;
  const dupes = duplicateNameSet(cards.map(c => c.name));
  return (
    <section className="mb-9" data-testid="home-cockpit-recent">
      <SectionLabel rule className="mb-3.5">Pick up where you left off</SectionLabel>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {cards.map(ws => (
          <div
            key={ws.id}
            className="group relative rounded-[18px] border border-[var(--line-soft)] bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--honey-line)] hover:shadow-[var(--shadow)]"
            data-testid={`home-cockpit-ws-${ws.id}`}
          >
            <button type="button" onClick={() => onOpenDesktop(ws.id)} className="block w-full text-left">
              <div className="mb-2 flex items-start gap-2.5">
                <HexAvatar label={ws.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-semibold leading-tight text-[var(--text)]">{ws.name}</div>
                  {(() => {
                    // Disambiguate same-named workspaces with their group so two
                    // "Research Hub"s aren't indistinguishable (issue 2b).
                    const dupe = dupes.has(ws.name.trim().toLowerCase());
                    const rel = ws.lastActive ? formatRelative(ws.lastActive) : '';
                    const label = dupe && ws.group ? (rel ? `${ws.group} · ${rel}` : ws.group) : rel;
                    return label
                      ? <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-dim)]">{label}</div>
                      : null;
                  })()}
                </div>
              </div>
              {ws.summary && (
                <p className="mb-2 line-clamp-2 text-[13.5px] leading-snug text-[var(--text-muted)]">{ws.summary}</p>
              )}
            </button>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onContinue(ws.id, ws.continueSessionId)}
                className="inline-flex items-center gap-0.5 text-[13px] font-medium text-[var(--honey)] transition-opacity hover:opacity-80"
                data-testid={`home-cockpit-continue-${ws.id}`}
              >
                Continue <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                {ws.pendingCount > 0 && (
                  <span className="rounded-full border border-[var(--honey-line)] bg-[var(--honey-wash)] px-2 py-0.5 text-[11px] text-[var(--attention)]">
                    {ws.pendingCount} to review
                  </span>
                )}
                <WorkspaceActionsMenu
                  workspace={{ id: ws.id, name: ws.name }}
                  onChanged={onWorkspaceChanged}
                  buttonClassName="opacity-0 group-hover:opacity-100 focus:opacity-100"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── "Waggle suggests" — stacked move rows ─────────────────────────────────
function SuggestedActionsPanel({
  actions, subFor, onRun,
}: {
  actions: SuggestedAction[];
  subFor: (a: SuggestedAction) => string | undefined;
  onRun: (a: SuggestedAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <section className="mb-9" data-testid="home-cockpit-suggested">
      <SectionLabel rule className="mb-3.5">Waggle suggests</SectionLabel>
      <div className="space-y-2">
        {actions.slice(0, 4).map((a, i) => {
          const sub = subFor(a);
          return (
            <button
              key={`${a.workspaceId}-${a.kind}-${a.label}`}
              type="button"
              onClick={() => onRun(a)}
              className="group flex w-full items-center gap-3 rounded-[14px] border border-[var(--line-soft)] bg-card px-3.5 py-3 text-left transition-colors hover:border-[var(--honey-line)]"
              data-testid={`home-cockpit-action-${i}`}
            >
              <IconTile icon={Lightbulb} tone="attention" size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold text-[var(--text)]">{a.label}</div>
                {sub && <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">{sub}</div>}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-dim)] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Up next ──────────────────────────────────────────────────────────────
function UpNextPanel({ items, onOpen }: { items: UpNextItem[]; onOpen: (id?: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-9" data-testid="home-cockpit-upnext">
      <SectionLabel rule className="mb-3.5">Up next</SectionLabel>
      <ul className="space-y-1">
        {items.slice(0, 6).map(item => {
          const Icon = UP_NEXT_ICON[item.kind];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.workspaceId)}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[13.5px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-dim)]" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.at && <span className="shrink-0 font-mono text-[11px] text-[var(--text-dim)]">{item.at}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Overnight story / run-chip composition (honest, from real counts) ─────
function overnightHasActivity(o: OvernightSummary | null): o is OvernightSummary {
  return !!o && (o.consolidated > 0 || o.artifactsCreated > 0 || o.automationsCompleted > 0 || o.failures.length > 0);
}

function composeOvernightStory(o: OvernightSummary): ReactNode {
  const clauses: ReactNode[] = [];
  if (o.consolidated > 0)
    clauses.push(<>folded {honey(o.consolidated)} new {o.consolidated === 1 ? 'memory' : 'memories'} into the hive</>);
  if (o.artifactsCreated > 0)
    clauses.push(<>created {honey(o.artifactsCreated)} {o.artifactsCreated === 1 ? 'artifact' : 'artifacts'}</>);
  if (o.automationsCompleted > 0)
    clauses.push(<>ran {honey(o.automationsCompleted)} {o.automationsCompleted === 1 ? 'automation' : 'automations'}</>);
  if (o.failures.length > 0)
    clauses.push(<>ran into {honey(o.failures.length)} {o.failures.length === 1 ? 'snag' : 'snags'} worth a look</>);

  return (
    <>
      Overnight, Waggle{' '}
      {clauses.map((c, i) => (
        <span key={i}>
          {i > 0 && (i === clauses.length - 1 ? (clauses.length === 2 ? ' and ' : ', and ') : ', ')}
          {c}
        </span>
      ))}
      .
    </>
  );
}

function buildRunChips(o: OvernightSummary): RunChipProps[] {
  const chips: RunChipProps[] = [];
  if (o.consolidated > 0) chips.push({ label: `${o.consolidated} ${o.consolidated === 1 ? 'memory' : 'memories'} consolidated`, tone: 'intel' });
  if (o.artifactsCreated > 0) chips.push({ label: `${o.artifactsCreated} ${o.artifactsCreated === 1 ? 'artifact' : 'artifacts'} created`, tone: 'work' });
  if (o.automationsCompleted > 0) chips.push({ label: `${o.automationsCompleted} ${o.automationsCompleted === 1 ? 'automation' : 'automations'} completed`, tone: 'healthy' });
  if (o.failures.length > 0) chips.push({ label: `${o.failures.length} ${o.failures.length === 1 ? 'run' : 'runs'} failed`, tone: 'risk' });
  return chips;
}

// ── Root ─────────────────────────────────────────────────────────────────
const HomeCockpit = ({ onContinue, onOpenWorkspaceDesktop, onCreateWorkspace, userName, totalWorkspaceCount }: HomeCockpitProps) => {
  const [briefing, setBriefing] = useState<HomeBriefing | null>(null);
  const [overnight, setOvernight] = useState<OvernightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const offline = useOfflineStatus();
  const { toast } = useToast();
  // Cold-load race guard: the adapter attaches the session token during its
  // initial connect(); firing authed briefing/overnight calls before that 401s
  // and yields malformed data. Defer load() until the attempt has settled.
  const { connecting } = useService();
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

  // Ask bar "+" with no typed text → open the command palette (⌘K) rather than
  // being a dead button. We synthesize the same global Ctrl/⌘-K keystroke the
  // window-level shortcut handler (useKeyboardShortcuts) already listens for, so
  // Home doesn't need a new prop threaded through AppShell to reach the overlay.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }, []);

  // Ask bar → quick-capture the typed intent (the real backend the old
  // QuickCapture panel used). Send = a task to pick up; "+" = a quick note.
  // NOTE: a future "start a chat from this prompt" flow could replace the task
  // capture once Home can seed a workspace-less chat.
  const captureAsk = useCallback(async (text: string, kind: QuickCaptureInput['kind']) => {
    try {
      await adapter.quickCapture({ kind, content: text });
      toast({ description: kind === 'task' ? 'Added to your hive — a task to pick up.' : 'Noted — saved to your hive.' });
    } catch {
      toast({ variant: 'destructive', description: "Couldn't save that — try again." });
    }
  }, [toast]);

  if (loading) return <CockpitSkeleton />;

  // PERMISSION-DENIED (PRD §12.1): the briefing route rejected with 403 — a
  // distinct, non-retry message so the user understands it's an access gate.
  if (permissionDenied) {
    return (
      <div className="mx-auto h-full max-w-[920px] overflow-auto px-8 pt-[46px]" data-testid="home-cockpit-permission-denied">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="mb-3 h-10 w-10 text-[var(--attention)]" />
          <p className="mb-1 text-[15px] font-semibold text-[var(--text)]">Access not permitted</p>
          <p className="max-w-md text-[14px] text-[var(--text-muted)]">
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
      <div className="mx-auto h-full max-w-[920px] overflow-auto px-8 pt-[46px]" data-testid="home-cockpit-error">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {offline
            ? <WifiOff className="mb-3 h-10 w-10 text-[var(--attention)]" />
            : <AlertTriangle className="mb-3 h-10 w-10 text-[var(--risk)]" />}
          <p className="mb-3 text-[14px] text-[var(--text-muted)]">
            {offline ? "You're offline — your daily briefing needs the local service." : "Couldn't load your briefing."}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--honey)] px-3.5 py-1.5 text-[13px] font-medium text-[#1a1407] transition-opacity hover:opacity-90"
            data-testid="home-cockpit-retry"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const greeting = briefing.greeting || (userName ? `Welcome back, ${userName}` : 'Welcome back');

  if (briefing.isFirstRun) {
    return <FirstRunEmpty greeting={greeting} onCreateWorkspace={onCreateWorkspace} />;
  }

  const recentWorkspaces = briefing.recentWorkspaces ?? [];
  const onOpenFromAction = (a: SuggestedAction) => onContinue(a.workspaceId, a.sessionId);

  // Suggestion sub-line, composed from the linked workspace (label-only server
  // payload has no sub — derive an honest one from the workspace + recency).
  const wsById = new Map(recentWorkspaces.map(w => [w.id, w]));
  const startHereMove = buildStartHereMove(briefing, wsById);
  const subForAction = (a: SuggestedAction): string | undefined => {
    const w = wsById.get(a.workspaceId);
    if (!w) return undefined;
    const rel = formatRelative(w.lastActive);
    return rel ? `${w.name} · ${rel}` : w.name;
  };

  // ATTENTION (PRD §12.1): overnight failures surface as a visible banner that
  // deep-links into the Automation Center logs (where retry/pause/edit live).
  const failureCount = overnight?.failures?.length ?? 0;
  const openAutomationLogs = () => {
    window.dispatchEvent(new CustomEvent('waggle:open-app', {
      detail: { appId: 'scheduled-jobs', tab: 'logs' },
    }));
  };

  // J08 (D6, Journey 6): imported memories awaiting review deep-link to the
  // Memory Center "Needs review" filter via the established waggle:open-app shim.
  const needsReviewCount = briefing.needsReviewCount ?? 0;
  const openMemoryReview = () => {
    window.dispatchEvent(new CustomEvent('waggle:open-app', {
      detail: { appId: 'memory', filter: 'unreviewed' },
    }));
  };

  // Overnight hero copy: compose the story from real counts; degrade to a quiet
  // line when there's no activity (the test stubs overnight → null).
  const hasOvernight = overnightHasActivity(overnight);
  const overnightStatement = hasOvernight ? composeOvernightStory(overnight) : null;
  const runChips = hasOvernight ? buildRunChips(overnight) : [];
  const overnightEmpty = offline
    ? 'Your overnight summary needs the local service.'
    : 'A calm night — nothing ran while you were away.';

  // Wave F (fix 2): factual hero deltas for a returning user — reuse the
  // briefing's own card data (most recent activity + attention debt), no fetch.
  const heroLastActive = recentWorkspaces.reduce<string | undefined>(
    (best, w) => (w.lastActive && (!best || rankTimestamp(w.lastActive) > rankTimestamp(best)) ? w.lastActive : best),
    undefined,
  );
  const heroPendingTotal = recentWorkspaces.reduce((n, w) => n + (w.pendingCount || 0), 0);

  return (
    <div className="relative mx-auto h-full max-w-[920px] overflow-auto px-8 pb-20 pt-[46px]" data-testid="home-cockpit">
      <GreetingHeader
        greeting={greeting}
        date={briefing.date}
        workspaceCount={totalWorkspaceCount ?? recentWorkspaces.length}
        pendingTotal={heroPendingTotal}
        lastActive={heroLastActive}
      />

      <StartHereCard
        move={startHereMove}
        onContinue={onContinue}
        onOpenWorkspaceDesktop={onOpenWorkspaceDesktop}
      />

      {needsReviewCount > 0 && (
        <div
          className="mb-6 flex items-center gap-2.5 rounded-[14px] border border-[var(--honey-line)] bg-[var(--honey-wash)] px-4 py-3"
          role="alert"
          data-testid="home-cockpit-review-banner"
        >
          <Brain className="h-4 w-4 shrink-0 text-[var(--attention)]" />
          <p className="flex-1 text-[13.5px] text-[var(--text-2)]">
            {needsReviewCount} imported {needsReviewCount === 1 ? 'memory needs' : 'memories need'} your review.
          </p>
          <button
            type="button"
            onClick={openMemoryReview}
            className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-[var(--honey)] transition-opacity hover:opacity-80"
            data-testid="home-cockpit-review-cta"
          >
            Review <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mb-9">
        <OvernightHero statement={overnightStatement ?? overnightEmpty} runs={runChips} emptyText={overnightEmpty} />
        {failureCount > 0 && (
          <button
            type="button"
            onClick={openAutomationLogs}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-[var(--risk)] transition-opacity hover:opacity-80"
            data-testid="home-cockpit-attention-banner"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            View {failureCount === 1 ? 'the snag' : `${failureCount} snags`} in the Automation Center
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <RecentWorkspacesPanel
        onWorkspaceChanged={() => { void load(); }}
        cards={recentWorkspaces}
        onContinue={onContinue}
        onOpenDesktop={onOpenWorkspaceDesktop}
      />

      <SuggestedActionsPanel actions={briefing.suggestedActions} subFor={subForAction} onRun={onOpenFromAction} />

      {/* Rendered only when there is at least one item — zero schedule items
          (or a sidecar omitting the field) must not leave an empty section. */}
      <UpNextPanel items={briefing.upNext ?? []} onOpen={(id) => { if (id) onOpenWorkspaceDesktop(id); }} />

      <AskBar
        onSubmit={(text) => void captureAsk(text, 'task')}
        onPlus={(text) => { if (text) void captureAsk(text, 'note'); else openCommandPalette(); }}
      />
    </div>
  );
};

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
  /**
   * W2B: canonical count of the user's real workspaces (non-noise, non-archived)
   * for the "N workspaces waiting" line. The briefing's recentWorkspaces is a
   * recency-ranked, content-filtered SUBSET (≤6) — using its length here read as
   * a misleadingly small total. Optional; falls back to the subset length.
   */
  totalWorkspaceCount?: number;
}

export default HomeCockpit;
