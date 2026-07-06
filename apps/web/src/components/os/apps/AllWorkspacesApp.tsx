/**
 * AllWorkspacesApp — screen 04 "All workspaces" (Warm-Hive PR6c · §4 C1).
 *
 * The full workspace shelf. Home greets you with the day; THIS is everything —
 * every workspace, where it lives, and what's happening in it. A grid of rich
 * cards (hex avatar · storage badge · summary · real stats), a name search, and
 * storage-type filter pills (All / Virtual / Local / Team). Per-card management
 * via the shared WorkspaceActionsMenu; a zero-workspace visit lands on a
 * create-your-first empty state rather than dead-ending (D16).
 *
 * Honesty (PR3/PR3.5 no-fabrication contract): cards render ONLY real Workspace
 * fields. memoryCount / sessionCount / health / lastActive are all optional on
 * the type — each is gated off (or shown as "—") when absent. We never invent a
 * count. The Grid variation ships (D14).
 *
 * Data + selection reuse the canonical bundle: `useShell()` exposes the single
 * `useWorkspaces` instance (list · selectWorkspace · createWorkspace · refresh),
 * so this view and the rest of the shell never diverge. The route wrapper passes
 * `onOpenWorkspace` to navigate into a workspace (same target HomeCockpit uses,
 * `/workspaces/:id`); with no prop it degrades to selection-only.
 */
import { useMemo, useState } from 'react';
import { Search, Plus, Hexagon, AlertTriangle, ArrowRight } from 'lucide-react';
import { useShell } from '@/providers/ShellContext';
import { DATE_LOCALE } from '@/lib/date-locale';
import { isDevNoiseWorkspace } from '@/lib/workspace-counts';
import WorkspaceActionsMenu from '../WorkspaceActionsMenu';
import CreateWorkspaceDialog from '../overlays/CreateWorkspaceDialog';
import { HexAvatar, SectionLabel, DotLive } from '../warm';
import type { StorageType, Workspace } from '@/lib/types';

interface AllWorkspacesAppProps {
  /**
   * Open a workspace — selection is handled here; the wrapper navigates into it
   * (the same `/workspaces/:id` target HomeCockpit's onOpenWorkspaceDesktop
   * uses). Optional: with no handler the card still selects the workspace.
   */
  onOpenWorkspace?: (workspaceId: string) => void;
}

type StorageFilter = 'all' | StorageType;

const STORAGE_FILTERS: { id: StorageFilter; label: string; dot?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'virtual', label: 'Virtual', dot: 'var(--intel)' },
  { id: 'local', label: 'Local', dot: 'var(--honey)' },
  { id: 'team', label: 'Team', dot: 'var(--healthy)' },
];

/** Storage badge: Local=honey, Virtual=intel, Team=healthy (design §04). */
const STORAGE_BADGE: Record<StorageType, { label: string; color: string; wash: string }> = {
  local: { label: 'Local', color: 'var(--honey)', wash: 'var(--honey-wash)' },
  virtual: { label: 'Virtual', color: 'var(--intel)', wash: 'var(--intel-wash)' },
  team: { label: 'Team', color: 'var(--healthy)', wash: 'var(--healthy-wash)' },
};

function formatRelative(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

/** Collision key for round-6 fix 1c — same-name AND same-group cards. */
function dupKey(w: Workspace): string {
  return `${w.name.trim().toLowerCase()}|${(w.group ?? '').trim().toLowerCase()}`;
}

/**
 * Round-6 fix 1b: honest "Created …" line for description-less cards. Reads
 * the server record's `created` ISO stamp (WorkspaceConfig.created — present
 * on every list row but not yet declared on the web Workspace type). Relative
 * while recent; a plain date once "NNw ago" stops being useful. Never
 * fabricated — absent/invalid stamps render nothing.
 */
function formatCreated(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = (Date.now() - t) / 86_400_000;
  if (days < 60) return `Created ${formatRelative(iso)}`;
  return `Created ${new Date(t).toLocaleDateString(DATE_LOCALE)}`;
}

// ── Storage filter pills ──────────────────────────────────────────────────
function FilterPills({
  active, counts, onChange,
}: {
  active: StorageFilter;
  counts: Record<StorageFilter, number>;
  onChange: (f: StorageFilter) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Filter by storage type" className="flex flex-wrap gap-1.5">
      {/* W2B: hide never-matching filters — only 'all' plus pills with a count.
          W3: also hide a storage pill whose count equals the All total — it
          would filter to the same set, so it adds zero information. */}
      {STORAGE_FILTERS.filter(f => f.id === 'all' || (counts[f.id] > 0 && counts[f.id] !== counts.all)).map(f => {
        const on = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(f.id)}
            data-testid={`all-workspaces-filter-${f.id}`}
            className={`inline-flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
              on
                ? 'border-[var(--honey-line)] bg-[var(--honey-wash)] text-[var(--text)]'
                : 'border-[var(--line-soft)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {f.dot && <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: f.dot }} />}
            {f.label}
            <span className="text-[var(--text-dim)]">{counts[f.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── One workspace card (real fields only) ─────────────────────────────────
function WorkspaceCard({
  ws, onOpen, onChanged, isDuplicateName, isDuplicateNameAndGroup,
}: {
  ws: Workspace;
  onOpen: () => void;
  onChanged: () => void;
  /** True when another workspace shares this name — show the group to disambiguate. */
  isDuplicateName: boolean;
  /** True when name AND group both collide — the group tag alone no longer
   *  disambiguates, so the full workspace slug renders as a chip too
   *  (round-6 fix 1c; round-7: full slug, not a truncated fragment). */
  isDuplicateNameAndGroup?: boolean;
}) {
  const badge = ws.storageType ? STORAGE_BADGE[ws.storageType] : null;
  const activeAgo = formatRelative(ws.lastActive ?? ws.updatedAt);
  const isHealthy = ws.health === 'healthy' && ws.status !== 'archived';
  // The server list rows carry WorkspaceConfig.created; the web type doesn't
  // declare it yet — narrow local read, no fabrication when absent.
  const createdLine = formatCreated((ws as Workspace & { created?: string }).created);
  // Round-8 v3 fix 2: the activity-preview body for description-less cards.
  // Composed from real server stamps only — created + last-active — e.g.
  // "Created 3w ago · active 2w ago". No `summary` field exists on the list
  // payload (verified in lib/types Workspace), so none is invented. Each part
  // is conditional; an all-absent card renders no body line at all.
  const activityLine =
    [createdLine, activeAgo ? `active ${activeAgo}` : null].filter(Boolean).join(' · ') || null;

  // Honesty: only render a memory count when the field actually exists.
  const hasMemoryCount = typeof ws.memoryCount === 'number';
  const hasSessionCount = typeof ws.sessionCount === 'number';

  return (
    // Wave F (fix 1b): the ENTIRE card is the open target — no floating "Open >"
    // link. The actions menu inside stops propagation so managing never opens.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only when the card itself is focused — Enter on the nested actions
        // menu must not also open the workspace.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      aria-label={`Open ${ws.name}`}
      className="group relative flex min-h-[132px] cursor-pointer flex-col rounded-[18px] border border-[var(--line-soft)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--honey-line)] hover:shadow-[var(--shadow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
      data-testid={`all-workspaces-card-${ws.id}`}
    >
      <div className="mb-3 flex items-center gap-3">
        <HexAvatar label={ws.name} size={36} />
        <div className="min-w-0 flex-1">
          {/* The title carries the open testid — it's the card's primary click
              target (clicks bubble to the card's open handler). */}
          <h3
            className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[var(--text)]"
            data-testid={`all-workspaces-open-${ws.id}`}
          >
            {ws.name}
          </h3>
          {/* Disambiguate same-named workspaces with their group (issue 2b);
              when the group ALSO collides, append the workspace's FULL slug in
              a quiet mono chip (round-7: the truncated "#-hub"/"#ub-2" chip
              read as a bug — full slugs are readable and honest, and BOTH
              cards in a collision set carry theirs). */}
          {isDuplicateName && (ws.group || isDuplicateNameAndGroup) && (
            <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-dim)]">
              {ws.group && <span className="truncate">{ws.group}</span>}
              {isDuplicateNameAndGroup && (
                <span className="min-w-0 truncate rounded-[5px] border border-[var(--line-soft)] bg-[var(--surface-2)] px-1 font-mono text-[10px]">
                  {ws.id}
                </span>
              )}
            </span>
          )}
        </div>
        {badge && (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
            style={{ color: badge.color, background: badge.wash }}
          >
            <Hexagon className="h-3 w-3" fill="currentColor" strokeWidth={0} />
            {badge.label}
          </span>
        )}
      </div>

      {/* Body — the activity-preview zone. It grows (flex-1 via the flex-col
          root) so the footer pins to a shared baseline. Real data only: a
          description (2-line clamp) when present, otherwise the honest
          created/last-active activity line. Never a dead band, never invented
          copy. */}
      {ws.description ? (
        <p className="line-clamp-2 text-[13px] leading-[1.5] text-[var(--text-muted)]">
          {ws.description}
        </p>
      ) : activityLine ? (
        <p className="text-[13px] leading-[1.5] text-[var(--text-muted)]">{activityLine}</p>
      ) : null}

      {/* Meta footer — pinned to the card's bottom baseline (mt-auto) so EVERY
          card's meta row aligns regardless of body length (round-8 fix 1).
          Real fields only (W2B honesty: no fabricated count, no filler dash). */}
      <div className="mt-auto flex items-center gap-3.5 pt-3 text-[12px] text-[var(--text-dim)]">
        {hasMemoryCount && (
          <span className="inline-flex items-center gap-1.5">
            <Hexagon className="h-3 w-3" strokeWidth={1.8} />
            {ws.memoryCount} {ws.memoryCount === 1 ? 'memory' : 'memories'}
          </span>
        )}
        {hasSessionCount && (
          <span className="inline-flex items-center gap-1.5">
            {ws.sessionCount} {ws.sessionCount === 1 ? 'session' : 'sessions'}
          </span>
        )}
        {isHealthy && (
          <span className="inline-flex items-center gap-1.5 text-[var(--healthy)]">
            <DotLive tone="healthy" size={7} /> healthy
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Round-8 fix 3: a quiet "Open →" cue on hover/focus makes the
              whole-card open target legible. Decorative — the card already
              carries the "Open <name>" aria-label — so it's aria-hidden. */}
          <span
            aria-hidden
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--honey-text)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Open <ArrowRight className="h-3 w-3" />
          </span>
          {/* Interactive-within-interactive: keep menu clicks out of the card's
              open handler (keyboard is guarded by the card's target check). */}
          <span onClick={(e) => e.stopPropagation()}>
            <WorkspaceActionsMenu
              workspace={{ id: ws.id, name: ws.name, status: ws.status }}
              onChanged={onChanged}
              buttonClassName="opacity-0 group-hover:opacity-100 focus:opacity-100"
            />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────
const AllWorkspacesApp = ({ onOpenWorkspace }: AllWorkspacesAppProps) => {
  const {
    workspaces, workspacesError,
    selectWorkspace, createWorkspace, refreshWorkspaces,
  } = useShell();

  const [query, setQuery] = useState('');
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('all');
  const [showCreate, setShowCreate] = useState(false);

  // The shelf hides dev/test artefacts (ai-os-audit-*, StressTest-*, E2E-Audit-*…)
  // so it reads as the user's real work — matching the switcher/home visible
  // count. (Previously the grid was the deliberately-unfiltered "full shelf"; the
  // 2026-07 5-judge UX review found the leaked test slugs were the single worst
  // in-app frame, so the grid now filters too. Real installs carry no dev noise,
  // so a real user sees no change; it also makes the shelf count agree with home.)
  const shelfWorkspaces = useMemo(
    () => workspaces.filter(w => !isDevNoiseWorkspace(w.name) && w.status !== 'archived'),
    [workspaces],
  );
  // Archived workspaces live under a collapsed disclosure at the bottom of the
  // shelf — hidden from the working grid, but still reachable so unarchive
  // (via the card's actions menu) stays possible in-UI.
  const archivedWorkspaces = useMemo(
    () => workspaces.filter(w => !isDevNoiseWorkspace(w.name) && w.status === 'archived'),
    [workspaces],
  );
  const [showArchived, setShowArchived] = useState(false);

  // W2B: storageType is persisted only when explicitly set at create (0/56 live
  // today); the runtime treats absent as 'virtual' (storage/index.ts default), so
  // classify the same way here — otherwise Virtual/Local/Team all read 0.
  const counts = useMemo<Record<StorageFilter, number>>(() => {
    const base: Record<StorageFilter, number> = { all: shelfWorkspaces.length, virtual: 0, local: 0, team: 0 };
    for (const w of shelfWorkspaces) {
      base[w.storageType ?? 'virtual'] += 1;
    }
    return base;
  }, [shelfWorkspaces]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shelfWorkspaces.filter(w => {
      if (storageFilter !== 'all' && (w.storageType ?? 'virtual') !== storageFilter) return false;
      if (!q) return true;
      const haystack = `${w.name} ${w.group ?? ''} ${w.description ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [shelfWorkspaces, query, storageFilter]);

  // Names shared by more than one workspace — those cards show their group so
  // two identically-named workspaces aren't indistinguishable (issue 2b).
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of shelfWorkspaces) {
      const k = w.name.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  }, [workspaces]);

  // Round-6 fix 1c: name+group BOTH collide → the group tag alone can't
  // disambiguate, so those cards also get a short id chip.
  const duplicateNameAndGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of shelfWorkspaces) {
      const k = dupKey(w);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  }, [shelfWorkspaces]);

  const handleOpen = (id: string) => {
    selectWorkspace(id);
    onOpenWorkspace?.(id);
  };

  // Empty state (D16): a zero-workspace visit gets a create CTA, never a dead end.
  if (shelfWorkspaces.length === 0) {
    return (
      <div className="mx-auto h-full max-w-[1000px] overflow-auto px-8 pb-16 pt-7" data-testid="all-workspaces-empty">
        <h1 className="mb-1.5 text-[28px] font-semibold tracking-[-0.02em] text-[var(--text)]">Workspaces</h1>
        <p className="mb-6 text-[14px] text-[var(--text-muted)]">Home greets you with the day. This is the full shelf.</p>

        {workspacesError && (
          <div className="mb-6 flex items-center gap-2.5 rounded-[14px] border border-[var(--risk-line,var(--line-soft))] bg-[var(--risk-wash)] px-4 py-3" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--risk)]" />
            <p className="flex-1 text-[13.5px] text-[var(--text-2)]">Couldn't load your workspaces — they may exist but didn't load.</p>
            <button
              type="button"
              onClick={() => void refreshWorkspaces()}
              className="shrink-0 text-[13px] font-medium text-[var(--honey-text)] transition-opacity hover:opacity-80"
              data-testid="all-workspaces-retry"
            >
              Retry
            </button>
          </div>
        )}

        <div className="relative overflow-hidden rounded-[26px] border border-[var(--line-soft)] bg-[linear-gradient(150deg,var(--surface),var(--surface-2))] p-10 text-center shadow-[var(--shadow)]">
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,var(--honey-glow),transparent_70%)]" />
          <div className="relative">
            <HexAvatar label="W" size={48} className="mx-auto mb-4" />
            <h2 className="mb-1.5 text-[19px] font-semibold text-[var(--text)]">No workspaces yet</h2>
            <p className="mx-auto mb-6 max-w-md text-[14px] leading-relaxed text-[var(--text-muted)]">
              A workspace is one project or area — it builds its own memory as you work. Create
              your first and it starts remembering.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-[12px] bg-[var(--honey)] px-5 py-2.5 text-[14px] font-medium text-[#1a1407] transition-opacity hover:opacity-90"
              data-testid="all-workspaces-create-first"
            >
              <Plus className="h-4 w-4" /> Create your first workspace
            </button>
          </div>
        </div>

        <CreateWorkspaceDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={(data) => { void createWorkspace(data); }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-[1000px] overflow-auto px-8 pb-16 pt-7" data-testid="all-workspaces">
      <div className="mb-1.5 flex items-end gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--text)]">Workspaces</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-[10px] bg-[var(--honey)] px-4 py-2.5 text-[13px] font-semibold text-[#1a1407] transition-opacity hover:opacity-90"
          data-testid="all-workspaces-new"
        >
          <Plus className="h-3.5 w-3.5" /> New workspace
        </button>
      </div>
      <p className="mb-5 text-[14px] text-[var(--text-muted)]">
        Home greets you with the day. This is the full shelf — every workspace, where it
        lives, and what's happening in it.
      </p>

      {/* Toolbar: search + storage filter pills */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 focus-within:border-[var(--honey-line)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-dim)]" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search workspaces…"
            aria-label="Search workspaces by name"
            data-testid="all-workspaces-search"
            className="flex-1 border-0 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
          />
        </div>
        <FilterPills active={storageFilter} counts={counts} onChange={setStorageFilter} />
      </div>

      <SectionLabel rule className="mb-4">
        {filtered.length} {filtered.length === 1 ? 'workspace' : 'workspaces'}
      </SectionLabel>

      {filtered.length === 0 ? (
        <p className="px-4 py-12 text-center text-[14px] text-[var(--text-dim)]" data-testid="all-workspaces-no-match">
          No workspaces match.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="all-workspaces-grid">
          {filtered.map(ws => (
            <WorkspaceCard
              key={ws.id}
              ws={ws}
              onOpen={() => handleOpen(ws.id)}
              onChanged={() => { void refreshWorkspaces(); }}
              isDuplicateName={duplicateNames.has(ws.name.trim().toLowerCase())}
              isDuplicateNameAndGroup={duplicateNameAndGroups.has(dupKey(ws))}
            />
          ))}
        </div>
      )}

      {/* Archived — collapsed disclosure so the working shelf stays clean but
          unarchive (card actions menu) remains reachable in-UI. */}
      {archivedWorkspaces.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            aria-expanded={showArchived}
            data-testid="all-workspaces-archived-toggle"
            className="text-[12.5px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            {showArchived ? '▾' : '▸'} Archived ({archivedWorkspaces.length})
          </button>
          {showArchived && (
            <div className="mt-3 grid grid-cols-1 gap-3.5 opacity-70 sm:grid-cols-2 lg:grid-cols-3" data-testid="all-workspaces-archived-grid">
              {archivedWorkspaces.map(ws => (
                <WorkspaceCard
                  key={ws.id}
                  ws={ws}
                  onOpen={() => handleOpen(ws.id)}
                  onChanged={() => { void refreshWorkspaces(); }}
                  isDuplicateName={false}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateWorkspaceDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(data) => { void createWorkspace(data); }}
      />
    </div>
  );
};

export default AllWorkspacesApp;
