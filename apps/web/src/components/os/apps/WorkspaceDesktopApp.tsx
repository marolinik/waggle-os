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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LayoutGrid, MessageSquare, FileBox, Brain,
  Users, WifiOff, ShieldAlert, ChevronRight,
  FileText, SearchX, RefreshCw,
} from 'lucide-react';
import { tierSatisfies, TIER_LABELS } from '@waggle/shared';
import { adapter } from '@/lib/adapter';
import { useShell } from '@/providers/ShellContext';
import { useRoomState } from '@/hooks/useRoomState';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import MemoryCenterTab from './memory/MemoryCenterTab';
import TasksTab from './workspace/TasksTab';
import WorkspaceActionsMenu from '../WorkspaceActionsMenu';
import { HexAvatar, DotLive, SectionLabel, HexCheckTile, IconTile, ProvenanceLine } from '../warm';
import { frameSourceLabel } from '@/lib/frame-source';
import { formatModelLabel } from '@/lib/model-label';
import type {
  WorkspaceContext,
  WorkspaceStateView,
  WorkspaceActivityEvent,
} from '@/lib/types';

// ── Tabs ────────────────────────────────────────────────────────────────
// The 8 PRD §12.2 tabs (Settings included). The shell renders Overview
// itself; the other tabs are embedded by the integrator (Chat / Memory /
// Timeline / Settings have hosts; Research / Artifacts are interim panels).
// Warm-Hive (SCREENS §03): the calm 6-tab bar. `tasks` stays a valid id (so
// /workspaces/:id/tasks still deep-links the full TasksTab + the Overview "Up
// next" card can route to it) but is NOT shown in the bar — Research / Timeline
// / Settings are dropped (their URLs fall back to Overview, see WorkspaceRoute).
export type WorkspaceTabId =
  | 'overview' | 'chat' | 'memory' | 'artifacts'
  | 'files' | 'team' | 'tasks';

interface WorkspaceTabDef {
  id: WorkspaceTabId;
  label: string;
  icon: React.ElementType;
}

const TABS: readonly WorkspaceTabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'artifacts', label: 'Artifacts', icon: FileBox },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'team', label: 'Team', icon: Users },
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
  /**
   * UX Refactor v2.1 §5.2 seam (a) — controlled tab pair (founder-ratified
   * two-seam edit, 2026-06-10). When `activeTab` is provided the tab bar is
   * URL-driven by the integrator (`/workspaces/:id/:tab?`); when omitted the
   * component keeps its original internal tab state, so existing call sites
   * behave identically.
   */
  activeTab?: WorkspaceTabId;
  onTabChange?: (tab: WorkspaceTabId) => void;
  /**
   * UX Refactor v2.1 §5.2 seam (b) — chat-widget slot (founder-ratified
   * two-seam edit). When provided, the `chat` tab body renders this node
   * (ChatHost portals the live per-workspace ChatWindowInstance into it,
   * plan §4.2) instead of the deep-link placeholder. When omitted the
   * placeholder is preserved.
   */
  chatSlot?: React.ReactNode;
}

// ── Small presentational helpers ─────────────────────────────────────────

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

interface ArtifactRow {
  id: string;
  name: string;
  subtitle?: string;
}

// ── Overview tab body ────────────────────────────────────────────────────

/** "What Waggle knows" — decisions + memories the workspace has recorded.
 *  Renders the ⬡ source · when provenance pill from the projected frame.source
 *  (PR3.5 keystone). Rows whose source is absent fall back to the REAL date
 *  only — never a fabricated source. */
function FactsSection({ ctx }: { ctx: WorkspaceContext | null }) {
  // The server-composed summary card above often quotes the newest memory
  // verbatim — don't render the identical string twice on one screen (2026-07
  // judge finding). Substring test on normalized text, display-only.
  const summaryNorm = (ctx?.summary ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const inSummary = (text: string) => {
    if (!summaryNorm) return false;
    const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
    return t.length > 20 && summaryNorm.includes(t);
  };
  const facts = [
    ...(ctx?.recentDecisions ?? []).map((d) => ({ text: d.content, source: d.source, when: relativeTime(d.date) })),
    ...(ctx?.recentMemories ?? []).map((m) => ({ text: m.content, source: m.source, when: relativeTime(m.date) })),
  ].filter((f) => !inSummary(f.text)).slice(0, 6);
  if (facts.length === 0) return null;
  return (
    <section>
      <SectionLabel rule className="mb-3">What Waggle knows</SectionLabel>
      <ul className="space-y-2.5">
        {facts.map((f, i) => (
          <li key={i} className="flex items-start gap-3 rounded-[14px] border border-[var(--line-soft)] bg-card px-3.5 py-3">
            <HexCheckTile tone="healthy" size={26} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug text-[var(--text)]">{f.text}</p>
              {frameSourceLabel(f.source) ? (
                <div className="mt-1">
                  <ProvenanceLine source={frameSourceLabel(f.source)!} when={f.when} />
                </div>
              ) : f.when ? (
                <div className="mt-1 font-mono text-[10.5px] text-[var(--text-dim)]">{f.when}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentWorkSection({ artifacts }: { artifacts: ArtifactRow[] }) {
  if (artifacts.length === 0) return null;
  return (
    <section>
      <SectionLabel rule className="mb-3">Recent work</SectionLabel>
      <ul className="space-y-2">
        {artifacts.slice(0, 5).map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-[14px] border border-[var(--line-soft)] bg-card px-3.5 py-2.5 transition-colors hover:border-[var(--honey-line)]">
            <IconTile icon={FileText} tone="intel" size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] text-[var(--text)]">{a.name}</p>
              {a.subtitle && <p className="truncate text-[11.5px] text-[var(--text-muted)]">{a.subtitle}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusCard({ ctx, agentsRunning }: { ctx: WorkspaceContext | null; agentsRunning: number }) {
  const model = ctx?.workspace?.model;
  return (
    <div className="rounded-[18px] border border-[var(--line-soft)] bg-card p-4">
      <SectionLabel className="mb-3">Status</SectionLabel>
      <dl className="space-y-2.5 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[var(--text-muted)]">Agent</dt>
          <dd className="inline-flex items-center gap-1.5 text-[var(--text-2)]">
            {agentsRunning > 0 ? <><DotLive tone="healthy" size={6} /> live</> : <span className="text-[var(--text-dim)]">idle</span>}
          </dd>
        </div>
        {model && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--text-muted)]">Model</dt>
            <dd className="max-w-[55%] truncate font-mono text-[12px] text-[var(--text-2)]">{formatModelLabel(model)}</dd>
          </div>
        )}
        {typeof ctx?.stats?.memoryCount === 'number' && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[var(--text-muted)]">Memories</dt>
            <dd className="text-[var(--text-2)]">{ctx.stats.memoryCount}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function UpNextCard({ state, onOpenTab }: { state: WorkspaceStateView | null; onOpenTab: (tab: WorkspaceTabId) => void }) {
  const items = [
    ...(state?.blocked ?? []).map((t) => ({ id: `b-${t.id}`, text: t.content, tone: 'risk' as const, status: 'blocked' })),
    ...(state?.nextActions ?? []).map((t, i) => ({ id: `n-${i}`, text: t.label, tone: 'attention' as const, status: 'next' })),
    ...(state?.pending ?? []).map((t) => ({ id: `p-${t.id}`, text: t.content, tone: 'work' as const, status: '' })),
  ].slice(0, 5);
  if (items.length === 0) return null;
  return (
    <div className="rounded-[18px] border border-[var(--line-soft)] bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Up next</SectionLabel>
        <button type="button" onClick={() => onOpenTab('tasks')} className="font-mono text-[11px] text-[var(--text-dim)] transition-colors hover:text-[var(--text-2)]">all →</button>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2.5 text-[13px]">
            <DotLive tone={it.tone} live={false} size={7} className="mt-1.5" />
            <span className="flex-1 text-[var(--text-2)]">{it.text}</span>
            {it.status && <span className="shrink-0 font-mono text-[11px] text-[var(--text-dim)]">{it.status}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamCard({ members }: { members: WorkspaceMember[] }) {
  if (members.length === 0) return null;
  return (
    <div className="rounded-[18px] border border-[var(--line-soft)] bg-card p-4">
      <SectionLabel className="mb-3">Team</SectionLabel>
      <ul className="space-y-2.5">
        {members.slice(0, 6).map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 text-[13px]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] font-mono text-[11px] text-[var(--text-2)]">{initialsOf(m.name)}</span>
            <span className="flex-1 truncate text-[var(--text)]">{m.name}</span>
            {m.status && <span className="font-mono text-[11px] capitalize text-[var(--text-dim)]">{m.status}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewTab({
  ctx, state, artifacts, members, agentsRunning, onOpenTab,
}: {
  ctx: WorkspaceContext | null;
  state: WorkspaceStateView | null;
  artifacts: ArtifactRow[];
  members: WorkspaceMember[];
  agentsRunning: number;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  return (
    <div
      className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5 p-5 lg:grid-cols-[1.7fr_1fr]"
      data-testid="ws-overview-grid"
    >
      <div className="space-y-5">
        {ctx?.summary && (
          <div className="rounded-[18px] border border-[var(--line-soft)] bg-card p-5">
            <p className="text-[15.5px] leading-[1.6] text-[var(--text-2)]">{ctx.summary}</p>
          </div>
        )}
        <FactsSection ctx={ctx} />
        <RecentWorkSection artifacts={artifacts} />
      </div>
      <div className="space-y-4">
        <StatusCard ctx={ctx} agentsRunning={agentsRunning} />
        <UpNextCard state={state} onOpenTab={onOpenTab} />
        <TeamCard members={members} />
      </div>
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

// Tasks tab body extracted to ./workspace/TasksTab.tsx (G8): the read-only
// state-seeded list became a real task board (adapter CRUD) + memory signals.

// ── Main shell ───────────────────────────────────────────────────────────

const WorkspaceDesktopApp = ({
  workspaceId, workspaceName, onOpenChat,
  activeTab: controlledTab, onTabChange, chatSlot,
}: WorkspaceDesktopAppProps) => {
  // §5.2 seam (a): uncontrolled by default (original behavior); controlled
  // when the integrator passes `activeTab`.
  const [internalTab, setInternalTab] = useState<WorkspaceTabId>('overview');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = useCallback((tab: WorkspaceTabId) => {
    if (controlledTab === undefined) setInternalTab(tab);
    onTabChange?.(tab);
  }, [controlledTab, onTabChange]);
  const [ctx, setCtx] = useState<WorkspaceContext | null>(null);
  const [state, setState] = useState<WorkspaceStateView | null>(null);
  const [activity, setActivity] = useState<WorkspaceActivityEvent[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish a hard fetch failure (offline) from a permission denial and
  // an unknown workspace id so the required states render differently (PRD
  // §12.2 state list; P2 fix — a stale/mistyped URL used to claim "offline").
  const [errorKind, setErrorKind] = useState<'offline' | 'permission' | 'notfound' | null>(null);
  // D3 plus-clause: bumping this re-runs the load effect; wired to Retry and
  // to focus/online/connect-settled revalidation while the screen is errored.
  // Revalidation arms ONLY for the transient 'offline' state — 'notfound' and
  // 'permission' are deterministic (a deleted workspace 404s forever), so
  // auto-refetching them would just flash the loading screen on every refocus.
  const [reloadKey, setReloadKey] = useState(0);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);
  useRevalidateOnError(errorKind === 'offline', retry);

  // Team tab tier gate: Solo users see the upsell, Team users the real roster.
  // `?? 'FREE'` keeps existing useShell test mocks (which don't stub billingTier)
  // green and fail-closed to the upsell.
  const { billingTier, tierResolved } = useShell();
  const isTeam = tierSatisfies(billingTier ?? 'FREE', 'TEAMS');

  // Live agents-running indicator for THIS workspace (reuse Room SSE state).
  const { workspaceMap } = useRoomState();
  const agentsRunning = useMemo(
    () => workspaceMap.get(workspaceId)?.live.length ?? 0,
    [workspaceMap, workspaceId],
  );

  const openChat = useCallback(() => {
    onOpenChat?.(workspaceId);
  }, [onOpenChat, workspaceId]);

  // Files tab upload: writes to the storage provider, then re-reads the union
  // (registry + provider fs) so the new file surfaces immediately.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleUploadFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await adapter.uploadFile(workspaceId, '/', file);
      }
      const files = await adapter.getWorkspaceFiles(workspaceId);
      setArtifacts(normalizeArtifacts(files));
    } catch (err) {
      console.error('[WorkspaceDesktopApp] file upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [workspaceId]);

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
        // Structured branching on the P1b adapter error (status is reliable).
        // Duck-type on error.name, NOT instanceof — the adapter module is
        // mocked away in component tests (p1b-authgate convention) and the
        // name+status contract is the stable surface. Message-sniffing
        // remains only as the non-HTTP fallback.
        const httpErr = err instanceof Error && err.name === 'AdapterHttpError'
          ? (err as Error & { status?: number })
          : null;
        if (httpErr) {
          setErrorKind(httpErr.status === 404 ? 'notfound' : httpErr.status === 403 ? 'permission' : 'offline');
        } else {
          const msg = err instanceof Error ? err.message.toLowerCase() : '';
          setErrorKind(msg.includes('forbid') || msg.includes('denied') ? 'permission' : 'offline');
        }
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
  }, [workspaceId, reloadKey]);

  const displayName = ctx?.workspace?.name ?? workspaceName;
  const wsStatus = ctx?.workspace?.status ?? 'active';
  const hasMemory = (ctx?.stats?.memoryCount ?? ctx?.memoryCount ?? 0) > 0
    || (ctx?.recentMemories?.length ?? 0) > 0;
  const lastEvent = activity[0];

  // Lane C (Pillar 2.2 — no dead clicks on cached surfaces): ONE interactive tab
  // bar, rendered LIVE during the entry skeleton too, so switching tab while the
  // Overview data loads acts immediately (URL-drives in controlled mode) instead
  // of a swallowed click on a lookalike placeholder. Counts are ctx-derived → so
  // simply absent until it lands. The entry variant OMITS the test hooks (nav +
  // per-button `data-testid`/`id`) so the stable loaded bar is the only match
  // for `ws-tab-bar` queries — the entry bar is a transient node that must never
  // be grabbed by a test polling for the loaded one.
  const renderTabBar = (withTestHooks: boolean) => (
    <nav
      className="shrink-0 flex items-center gap-1 border-b border-[var(--line-soft)] px-3 overflow-x-auto"
      role="tablist"
      {...(withTestHooks ? { 'data-testid': 'ws-tab-bar' } : {})}
    >
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        const count =
          tab.id === 'chat' ? ctx?.stats?.sessionCount
          : tab.id === 'memory' ? ctx?.stats?.memoryCount
          : tab.id === 'artifacts' ? (artifacts.length || undefined)
          : tab.id === 'files' ? ctx?.stats?.fileCount
          : tab.id === 'team' ? (members.length || undefined)
          : undefined;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls="ws-tabpanel"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
              isActive
                ? 'border-[var(--honey)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
            {...(withTestHooks ? { id: `ws-tab-${tab.id}`, 'data-testid': `ws-tab-${tab.id}` } : {})}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
            {typeof count === 'number' && count > 0 && (
              <span className="font-mono text-[11px] text-[var(--text-dim)]">{count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  // ── Whole-screen states ────────────────────────────────────────────────

  if (loading) {
    // Wave V Lane E fix 1: cold entry is a layout-preserving skeleton, not a
    // centered "Loading workspace…" spinner in an empty void. The header +
    // tab-bar scaffold hold the page shape; the content area carries the
    // WorkspaceBriefing thread-shaped placeholder idiom, so entering a
    // workspace reads as "your workspace is loading" rather than a blank frame.
    // role=status + sr-only keeps the announcement; reduced-motion stills it.
    return (
      <div
        className="h-full flex flex-col overflow-hidden bg-background"
        role="status"
        aria-label="Loading workspace"
        aria-busy="true"
        data-testid="ws-desktop-loading"
      >
        <span className="sr-only">Loading workspace…</span>
        {/* Header scaffold — mirrors the real header row (avatar + title). */}
        <div className="shrink-0 border-b border-[var(--line-soft)] px-5 py-3.5 animate-pulse motion-reduce:animate-none" aria-hidden="true">
          <div className="flex items-center gap-3">
            <div className="h-[46px] w-[46px] shrink-0 rounded-[14px] bg-[var(--surface-2)]" />
            <div className="space-y-2">
              <div className="h-2.5 w-24 rounded bg-[var(--surface-2)]" />
              <div className="h-5 w-52 rounded bg-[var(--surface-2)]" />
            </div>
          </div>
        </div>
        {/* Lane C: the REAL tab bar (not a placeholder) — clicking a tab while the
            Overview loads acts immediately instead of a dead click. Test hooks
            omitted so this transient node never shadows the stable loaded bar. */}
        {renderTabBar(false)}
        {/* Content — thread-shaped placeholders (WorkspaceBriefing idiom). */}
        <div className="flex-1 min-h-0 overflow-hidden p-6 animate-pulse motion-reduce:animate-none" aria-hidden="true">
          <div className="mx-auto w-full max-w-[680px] space-y-4 py-2">
            <div className="flex gap-2">
              <div className="w-9 h-9 shrink-0 rounded-full bg-[var(--surface-2)]" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-3 w-28 rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-full rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-4/5 rounded bg-[var(--surface-2)]" />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-2/5 rounded-[4px_14px_14px_14px] bg-[var(--surface-2)]" />
            </div>
            <div className="flex gap-2">
              <div className="w-9 h-9 shrink-0 rounded-full bg-[var(--surface-2)]" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-3 w-32 rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-11/12 rounded bg-[var(--surface-2)]" />
              </div>
            </div>
          </div>
        </div>
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

  if (errorKind === 'notfound') {
    return (
      <FullScreenState
        icon={SearchX}
        iconClass="text-muted-foreground"
        title="Workspace not found"
        body="This workspace doesn't exist — it may have been deleted, or the link is stale."
        testId="ws-desktop-notfound"
        cta={
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'home' } }))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
            data-testid="ws-desktop-notfound-home"
          >
            Go to Home <ChevronRight className="w-3.5 h-3.5" />
          </button>
        }
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
        cta={
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
            data-testid="ws-desktop-retry"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background" data-testid="ws-desktop-root" data-workspace-id={workspaceId}>
      {/* Header */}
      <header className="shrink-0 border-b border-[var(--line-soft)] px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <HexAvatar label={displayName} size={46} />
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-dim)]">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'home' } }))}
                  className="transition-colors hover:text-[var(--text-2)]"
                >
                  Home
                </button>
                <span aria-hidden>›</span>
                <span className="truncate text-[var(--text-2)]">{displayName}</span>
              </div>
              <h2 className="truncate font-display text-[clamp(20px,2.4vw,28px)] font-semibold leading-tight tracking-[-0.02em] text-[var(--text)]">
                {displayName}
              </h2>
              {/* UX gold-standard H1: on the Chat tab (highest-dwell surface) the
                  header compacts — the memories/updated subtitle hides so the
                  thread starts higher. Title + actions stay. */}
              {activeTab !== 'chat' && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-[var(--text-muted)]">
                  {agentsRunning > 0 && (
                    <span className="inline-flex items-center gap-1.5" data-testid="ws-agents-running">
                      <DotLive tone="healthy" size={7} />
                      {agentsRunning} agent{agentsRunning === 1 ? '' : 's'} live
                    </span>
                  )}
                  {typeof ctx?.stats?.memoryCount === 'number' && (
                    <span>{ctx.stats.memoryCount} {ctx.stats.memoryCount === 1 ? 'memory' : 'memories'}</span>
                  )}
                  {relativeTime(lastEvent?.ts) && <span>updated {relativeTime(lastEvent?.ts)}</span>}
                  {wsStatus !== 'active' && (
                    <span className="capitalize text-[var(--attention)]" data-testid="ws-status-pill" data-status={wsStatus}>{wsStatus}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('memory')}
              className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
            >
              Memory
            </button>
            <button
              type="button"
              onClick={openChat}
              className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--honey)] px-3.5 py-1.5 text-[13px] font-medium text-[#1a1407] transition-opacity hover:opacity-90"
            >
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {/* G1 (UX-Northstar 2026-06-13): manage the workspace from its own header */}
            <WorkspaceActionsMenu
              workspace={{ id: workspaceId, name: displayName, status: wsStatus }}
              onChanged={(action) => {
                if (action === 'delete') {
                  window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'home' } }));
                } else {
                  retry();
                }
              }}
            />
          </div>
        </div>
      </header>

      {/* Tab bar (shared render — the entry skeleton uses the hookless variant). */}
      {renderTabBar(true)}

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
                iconClass="text-honey/50"
                title="This workspace is empty"
                body="Nothing has happened here yet. Open chat to start working — memory, tasks, and artifacts will fill in as you go."
                testId="ws-overview-no-memory"
                cta={
                  <button
                    type="button"
                    onClick={openChat}
                    className="px-4 py-2 text-xs rounded-xl bg-primary/10 text-honey hover:bg-primary/20 transition-colors border border-primary/20"
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
                members={members}
                agentsRunning={agentsRunning}
                onOpenTab={setActiveTab}
              />
            )
          )}

          {activeTab === 'chat' && (
            // §5.2 seam (b): the chat-widget slot when the integrator
            // provides one; the original deep-link placeholder otherwise.
            chatSlot ?? (
              <TabPlaceholder
                icon={MessageSquare}
                title="Chat"
                body="The full conversation surface for this workspace opens in the chat runtime."
                cta={
                  <button
                    type="button"
                    onClick={openChat}
                    className="px-4 py-2 text-xs rounded-xl bg-primary/10 text-honey hover:bg-primary/20 transition-colors border border-primary/20"
                    data-testid="ws-chat-tab-open"
                  >
                    Open chat
                  </button>
                }
              />
            )
          )}

          {activeTab === 'tasks' && <TasksTab workspaceId={workspaceId} state={state} />}

          {activeTab === 'artifacts' && (
            artifacts.length === 0 ? (
              <TabPlaceholder
                icon={FileBox}
                title="No artifacts yet"
                body="Files and documents created in this workspace appear here. Browse everything across workspaces in Library."
              />
            ) : (
              <div className="grid h-full grid-cols-1 gap-3 overflow-auto p-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="ws-artifacts-tab">
                {artifacts.map(a => (
                  <div key={a.id} className="rounded-[14px] border border-[var(--line-soft)] bg-card p-3.5 transition-colors hover:border-[var(--honey-line)]">
                    <FileText className="mb-2 h-4 w-4 text-[var(--intel)]" />
                    <p className="truncate text-[13px] text-[var(--text)]">{a.name}</p>
                    {a.subtitle && <p className="truncate text-[11px] text-[var(--text-muted)]">{a.subtitle}</p>}
                  </div>
                ))}
              </div>
            )
          )}

          {/* P3/D2 (S02-FR2): the workspace-mind list embeds directly — same
              component as the Memory Center's "About this work" view. Deep-link
              consumption stays off: the J08 stash belongs to the /memory route. */}
          {activeTab === 'memory' && (
            <div className="h-full overflow-hidden" data-testid="ws-memory-tab">
              <MemoryCenterTab mind="workspace" workspaceId={workspaceId} consumeDeepLinks={false} />
            </div>
          )}

          {/* Files = the workspace file registry (getWorkspaceFiles); the
              distinct artifact entity is a later phase, so both surfaces read
              the same registry today. */}
          {activeTab === 'files' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleUploadFiles}
                data-testid="ws-files-upload-input"
              />
              {artifacts.length === 0 ? (
                <TabPlaceholder
                  icon={FileText}
                  title="No files yet"
                  body="Your agents create files here as you work in chat, and Harvest brings your existing documents in as they're ingested. You can also upload files directly."
                  cta={
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="px-4 py-2 text-xs rounded-xl bg-primary/10 text-honey hover:bg-primary/20 transition-colors border border-primary/20 disabled:opacity-60"
                        data-testid="ws-files-upload"
                      >
                        {uploading ? 'Uploading…' : 'Upload file'}
                      </button>
                      {onOpenChat && (
                        <button
                          type="button"
                          onClick={openChat}
                          className="px-4 py-2 text-xs rounded-xl bg-primary/10 text-honey hover:bg-primary/20 transition-colors border border-primary/20"
                          data-testid="ws-files-tab-open-chat"
                        >
                          Open chat
                        </button>
                      )}
                    </div>
                  }
                />
              ) : (
                <div className="h-full overflow-auto p-5" data-testid="ws-files-tab">
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-3 py-1.5 text-xs rounded-xl bg-primary/10 text-honey hover:bg-primary/20 transition-colors border border-primary/20 disabled:opacity-60"
                      data-testid="ws-files-upload"
                    >
                      {uploading ? 'Uploading…' : 'Upload file'}
                    </button>
                  </div>
                  <ul className="divide-y divide-[var(--line-soft)] overflow-hidden rounded-[14px] border border-[var(--line-soft)]">
                    {artifacts.map(a => (
                      <li key={a.id} className="flex items-center gap-3 bg-card px-4 py-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-[var(--text-dim)]" />
                        <span className="flex-1 truncate text-[13.5px] text-[var(--text)]">{a.name}</span>
                        {a.subtitle && <span className="shrink-0 font-mono text-[11px] text-[var(--text-dim)]">{a.subtitle}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Team — Solo users see a Team-tier upsell; Team users the roster.
              While the tier is unresolved, render the neutral roster so a real
              Team user never flashes the upsell during the getTier round-trip. */}
          {activeTab === 'team' && (
            <div className="h-full overflow-auto p-5" data-testid="ws-team-tab">
              {tierResolved && !isTeam ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-8" data-testid="ws-team-upsell">
                  <Users className="mb-3 h-10 w-10 text-violet-400/60" />
                  <p className="text-sm font-display text-foreground">Invite your team</p>
                  <p className="mt-1 max-w-sm text-[11px] text-muted-foreground">
                    Shared memory, WaggleDance multi-agent coordination, and governance —
                    turn this workspace into a shared surface for your whole team.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
                      detail: {
                        required: 'TEAMS',
                        actual: billingTier ?? 'FREE',
                        message: 'Team plan required for shared workspaces and collaboration.',
                      },
                    }))}
                    className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-2 text-xs text-violet-300 transition-colors hover:bg-violet-400/20"
                    data-testid="ws-team-upgrade"
                  >
                    Upgrade to {TIER_LABELS.TEAMS} — $49/seat
                  </button>
                </div>
              ) : members.length === 0 ? (
                <TabPlaceholder icon={Users} title="Just you for now" body="Team members with access to this workspace will appear here." />
              ) : (
                <ul className="space-y-2">
                  {members.map(m => (
                    <li key={m.id} className="flex items-center gap-3 rounded-[14px] border border-[var(--line-soft)] bg-card px-4 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] font-mono text-[12px] text-[var(--text-2)]">{initialsOf(m.name)}</span>
                      <span className="flex-1 truncate text-[14px] text-[var(--text)]">{m.name}</span>
                      {m.status && <span className="shrink-0 font-mono text-[11px] capitalize text-[var(--text-dim)]">{m.status}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>
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
