import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Loader2, Brain, Pencil, Trash2, Clock, Check, Save } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { consumeDeepLink } from '@/lib/app-deeplink';
import type { Memory, MemoryStatus } from '@/lib/types';
import { frameSourceLabel } from '@/lib/frame-source';
import { ConfidenceRing } from '../../warm';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { EvidencePanel } from '@/components/ui/evidence-panel';
import { renderChatMarkdown } from '@/lib/render-markdown';
import { cn } from '@/lib/utils';

/**
 * Memory-Trust "Manage" view (screen 19 §3–§5, PR3.5 Phase B+C). The editorial
 * body that replaces the embedded MemoryCenterTab on the Trust front door:
 * stat bar → search + filter chips → native confidence-ring rows with the
 * 3-segment ⬡ provenance line and real forget / correct / confirm actions.
 *
 * No-fabrication contract: confidence is harvest-only → the ring shows "—" and
 * the "High confidence & fresh" stat gates to "—" when absent; freshness is
 * derived as honest AGE (never a stored %); the "Forgotten" filter is gated off
 * (hard delete leaves no tombstone). Stats are computed from the fetched
 * working set (single-mind; cap-aware "500+") — never a cross-mind count.
 */

interface MemoryTrustManageProps {
  mind: 'personal' | 'workspace';
  workspaceId?: string;
  onToast: (msg: string) => void;
  /** "Why is this here?" — hand the memory id to the trace (Why) view. */
  onWhy?: (id: string) => void;
  /** When set (e.g. from the Why view's "correct it"), open that memory's editor. */
  openMemoryId?: string | null;
  /** Called once the openMemoryId request has been handled (one-shot). */
  onOpenConsumed?: () => void;
}

type TrustFilter = 'all' | 'stale' | 'needs_confirm';

const FETCH_LIMIT = 500;
const DAY_MS = 86_400_000;
const STALE_DAYS = 30;
const FRESH_DAYS = 7;

interface Freshness {
  state: 'fresh' | 'aging';
  label: string;
}

/** Honest age from created_at — never a stored decay %. */
function freshness(createdAt: string): Freshness {
  const days = (Date.now() - new Date(createdAt).getTime()) / DAY_MS;
  if (!Number.isFinite(days) || days <= FRESH_DAYS) return { state: 'fresh', label: 'fresh' };
  const weeks = Math.max(1, Math.round(days / 7));
  // "added" not "last seen" — decay anchors on created_at (write time), not
  // last_accessed (review M: the label must match what it measures).
  return { state: 'aging', label: `aging — added ${weeks}w ago` };
}

/** A memory is "stale · worth a review" when it's aged past a half-life and
 *  isn't a high-salience frame (critical/important never go stale). */
function isStale(m: Memory): boolean {
  const days = (Date.now() - new Date(m.createdAt).getTime()) / DAY_MS;
  return days > STALE_DAYS && m.importance !== 'critical' && m.importance !== 'important';
}

function ageLabel(createdAt: string): string {
  const days = (Date.now() - new Date(createdAt).getTime()) / DAY_MS;
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  if (days >= 2) return `${Math.round(days)} days`;
  return 'a day';
}

// ── Stat bar (§3) ──────────────────────────────────────────────────────────

interface StatCardProps {
  value: string;
  label: string;
  tone?: 'default' | 'healthy' | 'attention';
}

function StatCard({ value, label, tone = 'default' }: StatCardProps) {
  const valueColor =
    tone === 'healthy' ? 'text-[var(--healthy)]' : tone === 'attention' ? 'text-[var(--attention)]' : 'text-[var(--text)]';
  return (
    <div
      className={cn(
        'rounded-[18px] border bg-[var(--surface)] p-4',
        tone === 'attention' ? 'border-[color-mix(in_srgb,var(--attention)_35%,transparent)]' : 'border-[var(--line-soft)]',
      )}
    >
      <div className={cn('text-[24px] font-[750] leading-none tracking-[-0.02em]', valueColor)}>{value}</div>
      <div className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

// ── Memory row (§5) ──────────────────────────────────────────────────────────

interface MemoryRowProps {
  memory: Memory;
  onOpen: () => void;
  onForget: () => void;
  onConfirm: () => void;
  busy: boolean;
}

function MemoryRow({ memory, onOpen, onForget, onConfirm, busy }: MemoryRowProps) {
  const fresh = freshness(memory.createdAt);
  const srcLabel = frameSourceLabel(memory.source);
  const stale = isStale(memory);
  const needsConfirm = memory.status === 'unreviewed';
  return (
    <li
      className={cn(
        'rounded-[18px] border bg-[var(--surface)] p-4 transition-colors',
        stale ? 'border-[color-mix(in_srgb,var(--attention)_30%,var(--line-soft))]' : 'border-[var(--line-soft)]',
      )}
    >
      <div className="flex items-start gap-3.5">
        <ConfidenceRing value={memory.confidence} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="block w-full text-left">
            <p className="line-clamp-3 text-[14.5px] leading-[1.5] text-[var(--text)] hover:text-[var(--honey)]">
              {memory.content}
            </p>
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[10.5px] text-[var(--text-dim)]">
            <span className="text-[var(--intel)]">⬡ M-{memory.id}</span>
            {srcLabel && <span>source: {srcLabel}</span>}
            <span className={fresh.state === 'fresh' ? 'text-[var(--healthy)]' : 'text-[var(--attention)]'}>
              ● {fresh.label}
            </span>
          </div>

          {stale && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--honey-line)] bg-[var(--honey-wash)] px-3 py-2">
              <Clock className="h-4 w-4 shrink-0 text-[var(--honey)]" strokeWidth={1.9} />
              <span className="text-[12.5px] text-[var(--text-2)]">This is {ageLabel(memory.createdAt)} old — still true?</span>
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={busy}
                  className="rounded-[8px] bg-[var(--honey)] px-2.5 py-1 text-[12px] font-medium text-[#1a1407] disabled:opacity-50"
                >
                  Still true
                </button>
                <button
                  type="button"
                  onClick={onForget}
                  disabled={busy}
                  className="rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1 text-[12px] text-[var(--text-2)] disabled:opacity-50"
                >
                  Forget
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          {needsConfirm && !stale && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              title="Confirm this memory"
              aria-label={`Confirm memory M-${memory.id}`}
              className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--healthy)] hover:text-[var(--healthy)] disabled:opacity-50"
            >
              <Check className="h-[15px] w-[15px]" strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            title="Edit / correct"
            aria-label={`Edit or correct memory M-${memory.id}`}
            className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--honey-line)] hover:text-[var(--honey)]"
          >
            <Pencil className="h-[15px] w-[15px]" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onForget}
            disabled={busy}
            title="Forget this"
            aria-label={`Forget memory M-${memory.id}`}
            className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[color-mix(in_srgb,var(--risk)_45%,transparent)] hover:text-[var(--risk)] disabled:opacity-50"
          >
            <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const FILTERS: { id: TrustFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stale', label: 'Stale' },
  { id: 'needs_confirm', label: 'Needs confirm' },
];

export default function MemoryTrustManage({ mind, workspaceId, onToast, onWhy, openMemoryId, onOpenConsumed }: MemoryTrustManageProps) {
  const wsParam = mind === 'workspace' ? workspaceId : undefined;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<TrustFilter>('all');
  const [selected, setSelected] = useState<Memory | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSeq = useRef(0);
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (mind === 'workspace' && !wsParam) {
      setMemories([]); setLoading(false); setError(null);
      return;
    }
    setLoading(true); setError(null);
    try {
      // Fetch the whole working set (no q) so the stat bar reflects the HIVE,
      // not the current search (review M). Search filters client-side below.
      const res = await adapter.listMemories({ mind, workspaceId: wsParam, limit: FETCH_LIMIT });
      if (seq === loadSeq.current) setMemories(res);
    } catch (e) {
      if (seq === loadSeq.current) setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [mind, wsParam]);

  // Defer to a macrotask so load() captures loadSeq AFTER the mind-reset effect
  // below bumps it on mount — otherwise the reset invalidates the in-flight load
  // and the list never commits. (The old q-debounce is gone; the deferral isn't.)
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load, reloadTick]);

  // Mind switch clears everything in flight + on screen (ids collide across stores).
  useEffect(() => {
    loadSeq.current++;
    setSelected(null); setMemories([]); setLoading(true); setFilter('all');
  }, [mind, wsParam]);

  // J08 deep-link: Home's "N need review" banner lands here (Trust is the default
  // landing) → seed the "Needs confirm" filter.
  useEffect(() => {
    const pending = consumeDeepLink('memory');
    if (pending?.filter === 'unreviewed') setFilter('needs_confirm');
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { appId?: string; filter?: string } | undefined;
      if (detail?.appId === 'memory' && detail.filter === 'unreviewed') {
        consumeDeepLink('memory');
        setFilter('needs_confirm');
      }
    };
    window.addEventListener('waggle:open-app', handler);
    return () => window.removeEventListener('waggle:open-app', handler);
  }, []);

  // Live working set: hide archived/deprecated (version archaeology, not "what
  // the hive believes"). All stats + filters operate on this set.
  const live = useMemo(
    () => memories.filter((m) => m.status !== 'archived' && m.status !== 'deprecated'),
    [memories],
  );

  const stats = useMemo(() => {
    const total = live.length >= FETCH_LIMIT ? `${FETCH_LIMIT}+` : String(live.length);
    const hasAnyConfidence = live.some((m) => typeof m.confidence === 'number');
    const highConfFresh = hasAnyConfidence
      ? String(live.filter((m) => typeof m.confidence === 'number' && m.confidence >= 85 && freshness(m.createdAt).state === 'fresh').length)
      : '—';
    const staleCount = String(live.filter(isStale).length);
    const needsConfirm = String(live.filter((m) => m.status === 'unreviewed').length);
    return { total, highConfFresh, staleCount, needsConfirm };
  }, [live]);

  const shown = useMemo(() => {
    let set = live;
    if (filter === 'stale') set = set.filter(isStale);
    else if (filter === 'needs_confirm') set = set.filter((m) => m.status === 'unreviewed');
    const ql = q.trim().toLowerCase();
    if (ql) set = set.filter((m) => m.content.toLowerCase().includes(ql) || (m.title?.toLowerCase().includes(ql) ?? false));
    return set;
  }, [live, filter, q]);

  // One-shot: open a specific memory's editor when asked (the Why view's
  // "that memory is wrong → correct it" hands the id back here).
  useEffect(() => {
    if (!openMemoryId) return;
    const m = live.find((x) => x.id === openMemoryId);
    if (m) { setSelected(m); setDraft(m.content); onOpenConsumed?.(); }
    else if (!loading) { onOpenConsumed?.(); }
  }, [openMemoryId, live, loading, onOpenConsumed]);

  const mutate = async (fn: () => Promise<unknown>, toast: string, closeDrawer = false) => {
    setBusy(true);
    try {
      await fn();
      if (closeDrawer) setSelected(null);
      setReloadTick((t) => t + 1);
      onToast(toast);
    } catch (e) {
      // A failed ACTION must not blow away the list (that's the load-error
      // branch) — surface it transiently instead (review L).
      onToast(e instanceof Error ? `Couldn't complete that — ${e.message}` : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  // Row-level actions keep the drawer untouched; drawer-initiated ones pass
  // closeDrawer=true so the editor doesn't strand on a deleted/confirmed memory
  // (review M).
  const forget = (m: Memory, closeDrawer = false) =>
    void mutate(() => adapter.deleteMemoryById(m.id, wsParam, mind), `Forgotten M-${m.id} — removed from recall`, closeDrawer);
  const confirm = (m: Memory, closeDrawer = false) =>
    void mutate(() => adapter.confirmMemory(m.id, wsParam, mind), `Confirmed M-${m.id} — marked reviewed`, closeDrawer);
  const saveCorrection = () => {
    if (!selected) return;
    if (draft === selected.content) { setSelected(null); return; }
    void mutate(() => adapter.patchMemory(selected.id, { content: draft }, wsParam, mind), `Corrected M-${selected.id}`, true);
  };

  const openDetail = (m: Memory) => { setSelected(m); setDraft(m.content); };

  return (
    <>
      {/* §3 stat bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={stats.total} label="Memories in this hive" />
        <StatCard value={stats.highConfFresh} label="High confidence & fresh" tone={stats.highConfFresh === '—' ? 'default' : 'healthy'} />
        <StatCard value={stats.staleCount} label="Stale · worth a review" tone="attention" />
        <StatCard value={stats.needsConfirm} label="Awaiting your confirm" tone="attention" />
      </div>

      {/* §4 search + filters */}
      <div className="flex flex-wrap gap-2.5">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-dim)]" strokeWidth={1.9} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search memories"
            placeholder="Search what Waggle knows… or ask it to forget something"
            className="w-full bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none"
          />
        </div>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              className={cn(
                'rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold transition-colors',
                on
                  ? 'border-[var(--honey-line)] bg-[var(--honey-wash)] text-[var(--text)]'
                  : 'border-[var(--line-soft)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {f.label}
            </button>
          );
        })}
        {/* "Forgotten" is gated off — hard delete leaves no tombstone (no list to show). */}
        <button
          type="button"
          aria-disabled="true"
          aria-label="Forgotten filter unavailable — forgetting is permanent, there's no recoverable list (hard delete, by design)"
          title="Forgetting is permanent — there's no recoverable list (hard delete, by design)"
          className="cursor-not-allowed rounded-[9px] border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text-dim)] opacity-50"
        >
          Forgotten
        </button>
      </div>

      {/* §5 rows */}
      {loading && memories.length === 0 ? (
        <div role="status" aria-live="polite" className="py-12 text-center">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[var(--text-dim)]" />
          <p className="text-[13px] text-[var(--text-muted)]">Loading memories…</p>
        </div>
      ) : error ? (
        <div role="alert" className="py-12 text-center">
          <p className="mb-2 text-[13px] text-[var(--risk)]">{error}</p>
          <button onClick={() => load()} className="text-[13px] text-[var(--honey)] hover:underline">Retry</button>
        </div>
      ) : shown.length === 0 ? (
        <div role="status" aria-live="polite" className="py-12 text-center">
          <Brain className="mx-auto mb-2 h-8 w-8 text-[var(--text-dim)]/40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            {mind === 'workspace' && !workspaceId
              ? 'No workspace selected — open a workspace to see what it has learned.'
              : q || filter !== 'all'
                ? 'No memories match this filter.'
                : mind === 'workspace'
                  ? 'Nothing learned in this workspace yet — memories appear here as you work.'
                  : 'No memories yet — import or capture some to get started.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5">
          {shown.map((m) => (
            <MemoryRow
              key={m.id}
              memory={m}
              busy={busy}
              onOpen={() => openDetail(m)}
              onForget={() => forget(m)}
              onConfirm={() => confirm(m)}
            />
          ))}
        </ul>
      )}

      {/* Correct / detail drawer */}
      <DetailDrawer
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        title={selected?.title ?? 'Memory'}
        subtitle={selected ? `M-${selected.id} · ${selected.scope}` : undefined}
        footer={selected ? (
          <div className="flex w-full items-center gap-2">
            <button
              onClick={saveCorrection}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--honey)] px-2.5 py-1 text-xs font-medium text-[#1a1407] disabled:opacity-50"
            >
              <Save className="h-3 w-3" /> Save correction
            </button>
            {onWhy && (
              <button
                onClick={() => onWhy(selected.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2.5 py-1 text-xs hover:bg-[var(--surface-2)]"
              >
                Why is this here?
              </button>
            )}
            {selected.status === 'unreviewed' && (
              <button
                onClick={() => confirm(selected, true)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2.5 py-1 text-xs hover:bg-[var(--surface-2)]"
              >
                <Check className="h-3 w-3" /> Confirm
              </button>
            )}
            <button
              onClick={() => forget(selected, true)}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[var(--risk)] hover:bg-[var(--risk-wash)]"
            >
              <Trash2 className="h-3 w-3" /> Forget
            </button>
          </div>
        ) : undefined}
      >
        {selected && (
          <>
            <div>
              <label htmlFor="trust-correct" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Correct this memory
              </label>
              <textarea
                id="trust-correct"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="mt-1 block w-full resize-y rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm leading-relaxed text-[var(--text)]"
              />
              {/* Read-only markdown preview. Safe: renderChatMarkdown escapes
                  &/</> BEFORE formatting (the established escaper MemoryCenterTab
                  + TimelineTab use), so harvested/edited content can't inject markup. */}
              <div
                className="mt-2 max-h-32 overflow-auto text-xs text-[var(--text-muted)]"
                dangerouslySetInnerHTML={{ __html: renderChatMarkdown(draft) }}
              />
            </div>
            <EvidencePanel source={selected.source} sourceId={selected.sourceId} sourceUrl={selected.sourceUrl} evidence={selected.evidence} />
            <p className="text-[11px] text-[var(--text-muted)]">
              Created {new Date(selected.createdAt).toLocaleString()}
              {selected.updatedAt && ` · updated ${new Date(selected.updatedAt).toLocaleString()}`}
            </p>
          </>
        )}
      </DetailDrawer>
    </>
  );
}

export { freshness, isStale };
export type { MemoryStatus };
