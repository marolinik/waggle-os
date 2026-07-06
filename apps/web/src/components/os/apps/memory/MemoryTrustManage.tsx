import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Search, Loader2, Brain, Pencil, Trash2, Clock, Check, Save, Tag } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { memoryListCacheKey, readMemoryListCache, writeMemoryListCache } from './memory-list-cache';
import { DATE_LOCALE } from '@/lib/date-locale';
import { consumeDeepLink } from '@/lib/app-deeplink';
import type { Memory, MemoryStatus } from '@/lib/types';
import { dedupeMemoriesForDisplay } from '@/lib/memory-dedup';
import { buildMemoryPreview } from '@/lib/memory-text-normalize';
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
  /** Reports the live working-set size after each load — the host sizes the
   *  hero from it (full manifesto only while the store is effectively empty). */
  onTotal?: (total: number) => void;
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

interface DimensionChipProps {
  value: string;
  label: string;
  tone?: 'default' | 'healthy' | 'attention';
  /** Round-6 fix 2c: when set the chip is a real button (e.g. "to review" →
   *  seeds the needs-confirm filter) instead of a static stat. */
  onClick?: () => void;
  title?: string;
}

/** A subordinate, non-summing "dimension" of the hive (fresh / stale / to
 *  review). These overlap — they are NOT parts of the total, so they render as
 *  small inline chips beneath the headline count, never as equal-weight cards. */
function DimensionChip({ value, label, tone = 'default', onClick, title }: DimensionChipProps) {
  // Round-9 Lane C: the chips are subordinate to the one headline count, so the
  // value reads smaller/quieter (fix 2). A zero (or not-applicable "—") count
  // renders in dim text with NO surface wash so it reads as a calm "nothing
  // here", never as a disabled control (fix 3); non-zero counts keep their tone.
  const isZeroish = value === '0' || value === '—';
  const valueColor = isZeroish
    ? 'text-[var(--text-dim)]'
    : tone === 'healthy'
      ? 'text-[var(--healthy)]'
      : tone === 'attention'
        ? 'text-[var(--attention)]'
        : 'text-[var(--text-2)]';
  const className = cn(
    'inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1',
    isZeroish
      ? 'border-[var(--line-soft)] bg-transparent'
      : cn(
          'bg-[var(--surface-2)]',
          tone === 'attention' ? 'border-[color-mix(in_srgb,var(--attention)_30%,transparent)]' : 'border-[var(--line-soft)]',
        ),
    onClick && 'cursor-pointer transition-colors hover:border-[var(--honey-line)]',
  );
  const inner = (
    <>
      <span className={cn('text-[12px] font-[650] leading-none tracking-[-0.01em]', valueColor)}>{value}</span>
      <span className="text-[11.5px] text-[var(--text-muted)]">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={className}>
        {inner}
      </button>
    );
  }
  return <span title={title} className={className}>{inner}</span>;
}

// Wave V Lane A (item 1): the count-up entrance is a once-per-APP-SESSION
// flourish, not a per-mount one. Gating it on a module-level flag (mirrors
// AllWorkspacesApp's shelfSessionResolved) means a Trust↔Memories tab-return
// remount — or any background refresh — initializes straight to the real number
// instead of re-animating from 0, so the hero can never paint a transient 0 on
// re-entry. Reset via resetMemoryHeroSession() (test-only).
let heroCountAnimatedThisSession = false;

/** Wave T Lane D (item 3) / Wave V Lane A (item 1) — the hero total LANDS
 *  instead of popping: a ~600ms ease-out count-up the FIRST time a real count
 *  arrives THIS app session, then settles instantly on every later mount and
 *  refresh (so a tab-return never re-animates from 0). Honors
 *  prefers-reduced-motion (instant set, no animation). `0` is a legitimate
 *  landed value here — the loading/unknown state is gated upstream
 *  (StatBarSkeleton), so this never renders a false loading-zero. */
function HeroCount({ total, capped, reduceMotion }: { total: number; capped: boolean; reduceMotion: boolean }) {
  const [display, setDisplay] = useState(() =>
    reduceMotion || heroCountAnimatedThisSession ? total : 0,
  );
  useEffect(() => {
    if (reduceMotion || heroCountAnimatedThisSession) {
      heroCountAnimatedThisSession = true;
      setDisplay(total);
      return;
    }
    heroCountAnimatedThisSession = true;
    const durationMs = 600;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic — decisive, then settles
      setDisplay(Math.round(total * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setDisplay(total);
    });
    return () => cancelAnimationFrame(raf);
  }, [total, reduceMotion]);
  const text = capped && display >= FETCH_LIMIT ? `${FETCH_LIMIT}+` : String(display);
  return (
    <span
      data-testid="memory-trust-total"
      className="text-[34px] font-[750] leading-none tracking-[-0.02em] text-[var(--text)]"
    >
      {text}
    </span>
  );
}

/** Wave T Lane D (item 1) — the loading state for the stat bar. A trust surface
 *  must never show a false "0 Memories in this hive" while the count is still in
 *  flight, so the whole stat block renders as a shimmer skeleton until the real
 *  numbers land. Decorative (aria-hidden) — the row list below owns the
 *  "Loading memories…" live announcement. */
function StatBarSkeleton() {
  return (
    <div data-testid="memory-trust-stat-skeleton" aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
      <div className="flex items-center gap-3">
        <div className="h-[34px] w-16 rounded-[10px] bg-[var(--surface-2)]" />
        <div className="h-3.5 w-52 max-w-[60%] rounded bg-[var(--surface-2)]" />
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {[64, 88, 96, 72].map((w) => (
          <div key={w} className="h-7 rounded-full bg-[var(--surface-2)]" style={{ width: w }} />
        ))}
      </div>
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
  /** Display-layer dedup (F22, Wave F fix 3b): how many near-identical records
   *  this row represents. When > 1 an "×N" badge renders — purely informational,
   *  nothing is merged or deleted in the store. */
  duplicateCount?: number;
  /** Wave T Lane D (item 3): staggered entrance delay (ms) so the confidence-ring
   *  rows draw in one after another as the data lands. Undefined → no animation
   *  (reduced-motion). CSS runs once per row mount; persisted rows never re-run. */
  enterDelayMs?: number;
}

function MemoryRow({ memory, onOpen, onForget, onConfirm, busy, duplicateCount, enterDelayMs }: MemoryRowProps) {
  const fresh = freshness(memory.createdAt);
  const srcLabel = frameSourceLabel(memory.source);
  const stale = isStale(memory);
  const needsConfirm = memory.status === 'unreviewed';
  // Round-6 fix 2b: the ring renders only when a confidence actually exists;
  // the unscored state is a single quiet inline badge on the provenance row
  // (the old stacked "unscored / CONF" micro-label was illegible).
  const scored = typeof memory.confidence === 'number' && Number.isFinite(memory.confidence);
  // Round-5..9: raw harvest strings read as log output — buildMemoryPreview
  // leads with the first line as a title, clamps the rest as a muted excerpt,
  // strips markdown tokens, skips machine-provenance leads, and (round-9 Lane C
  // fix 1) lifts a "session handoff <date> sN" slug out of the title into the
  // provenance row's titleMeta. Pure display split; the drawer stays raw.
  const preview = buildMemoryPreview(memory.content);
  // Wave-S Lane C: compress the mono provenance dump (handoff meta + source)
  // into ONE FILLED glyph chip; the full string lives in the tooltip
  // ("transparency without terminal dump"). The M-id stays visible below — it
  // is the correction handle.
  const provFull = [preview.titleMeta, srcLabel ? `source: ${srcLabel}` : null].filter(Boolean).join(' · ');
  const provShort = srcLabel ?? preview.titleMeta?.split('·')[0].trim();
  return (
    <li
      style={enterDelayMs != null ? { animation: 'card-enter 0.32s ease-out both', animationDelay: `${enterDelayMs}ms` } : undefined}
      className={cn(
        'rounded-[18px] border bg-[var(--surface)] p-4 transition-colors',
        stale ? 'border-[color-mix(in_srgb,var(--attention)_30%,var(--line-soft))]' : 'border-[var(--line-soft)]',
      )}
    >
      <div className="flex items-start gap-3.5">
        {scored && <ConfidenceRing value={memory.confidence} className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="group block w-full text-left">
            <p className="line-clamp-2 text-[14.5px] font-medium leading-[1.45] text-[var(--text)] group-hover:text-[var(--honey-text)]">
              {preview.title}
            </p>
            {preview.excerpt && (
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.5] text-[var(--text-muted)]">
                {preview.excerpt}
              </p>
            )}
          </button>
          {/* Provenance micro-metadata is trust-critical — 12px + --text-muted
              (AA), not the sub-11px --text-dim decoration tier (a11y review). */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[12px] text-[var(--text-muted)]">
            {/* Round-9 Lane C fix 4: the M-id used a violet (--intel) that read as
                an unmanaged third hue on this warm surface — fold it into the
                neutral --text-dim tier. */}
            <span className="text-[var(--text-dim)]">⬡ M-{memory.id}</span>
            {/* Wave-S Lane C: handoff meta + source folded into one glyph chip
                (short label at rest, full provenance in the tooltip). */}
            {provShort && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-0.5 font-sans text-[11px] text-[var(--text-muted)]"
                title={provFull}
              >
                <Tag className="h-3 w-3 shrink-0" strokeWidth={1.8} aria-hidden />
                {provShort}
              </span>
            )}
            {!scored && (
              <span
                className="rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 py-0.5 font-sans text-[11px] text-[var(--text-muted)]"
                title="No confidence stored for this memory — only harvested memories carry a score."
              >
                not scored yet
              </span>
            )}
            <span className={fresh.state === 'fresh' ? 'text-[var(--healthy)]' : 'text-[var(--attention)]'}>
              ● {fresh.label}
            </span>
            {duplicateCount != null && duplicateCount > 1 && (
              <span
                className="rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--text-muted)]"
                title={`${duplicateCount} near-identical memories collapsed here — display only, nothing was merged or deleted.`}
              >
                ×{duplicateCount}
              </span>
            )}
          </div>

          {stale && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--honey-line)] bg-[var(--honey-wash)] px-3 py-2">
              <Clock className="h-4 w-4 shrink-0 text-[var(--honey-text)]" strokeWidth={1.9} />
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
            className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--honey-line)] hover:text-[var(--honey-text)]"
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

export default function MemoryTrustManage({ mind, workspaceId, onToast, onWhy, openMemoryId, onOpenConsumed, onTotal }: MemoryTrustManageProps) {
  const wsParam = mind === 'workspace' ? workspaceId : undefined;
  const reduceMotion = !!useReducedMotion();
  // Wave T Lane D (item 2): session cache key — the Trust list fetches the whole
  // working set (no server-side filters), so (mind, workspace) fully identifies
  // it. Seeding from cache lets a tab-switch remount show its last rows instantly
  // (no re-spin) while it refreshes silently underneath.
  const cacheKey = memoryListCacheKey(['trust', mind, wsParam]);
  const [memories, setMemories] = useState<Memory[]>(() => readMemoryListCache(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => readMemoryListCache(cacheKey) === undefined);
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
      if (seq === loadSeq.current) { setMemories(res); writeMemoryListCache(cacheKey, res); }
    } catch (e) {
      if (seq === loadSeq.current) setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [mind, wsParam, cacheKey]);

  // Defer to a macrotask so load() captures loadSeq AFTER the mind-reset effect
  // below bumps it on mount — otherwise the reset invalidates the in-flight load
  // and the list never commits. (The old q-debounce is gone; the deferral isn't.)
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load, reloadTick]);

  // Mind switch invalidates everything in flight + on screen (ids collide across
  // stores). Wave T Lane D (item 2): reseed the new mind's rows from cache
  // instead of blanking to a spinner — a scope the user has already visited this
  // session re-shows instantly; a first visit still shows the honest loader.
  useEffect(() => {
    loadSeq.current++;
    const cached = readMemoryListCache(cacheKey);
    setSelected(null);
    setMemories(cached ?? []);
    setLoading(cached === undefined);
    setFilter('all');
  }, [cacheKey]);

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

  // Report the settled working-set size to the host (deterministic hero sizing).
  useEffect(() => {
    if (!loading) onTotal?.(live.length);
  }, [live, loading, onTotal]);

  const stats = useMemo(() => {
    const total = live.length >= FETCH_LIMIT ? `${FETCH_LIMIT}+` : String(live.length);
    // W2D: the old "high confidence & fresh" conjunction was structurally ~0 —
    // confidence is harvest-only (chat/agent frames carry none) and harvest
    // imports are bulk-dated >7d ago, so the two populations barely overlap
    // while rows showed "fresh". Split into two honest, independent dimensions.
    const hasAnyConfidence = live.some((m) => typeof m.confidence === 'number');
    const freshCount = String(live.filter((m) => freshness(m.createdAt).state === 'fresh').length);
    const highConf = hasAnyConfidence
      ? String(live.filter((m) => typeof m.confidence === 'number' && m.confidence >= 85).length)
      : '—';
    const staleCount = String(live.filter(isStale).length);
    const needsConfirm = String(live.filter((m) => m.status === 'unreviewed').length);
    return { total, freshCount, highConf, staleCount, needsConfirm };
  }, [live]);

  // Wave T Lane D (item 1): the count is UNKNOWN only while the first load is in
  // flight with nothing on screen. Once loaded, 0 is a real value (empty hive),
  // never a loading placeholder — so the stat bar shows a skeleton in that window
  // instead of a false "0 Memories in this hive".
  const totalUnknown = loading && memories.length === 0;
  const totalNum = Math.min(live.length, FETCH_LIMIT);
  const totalCapped = live.length >= FETCH_LIMIT;

  // Wave R Lane E: order the subordinate dimension chips by value desc so the
  // row never LEADS with a zero (the round-10 shot opened on "0 fresh"). Zero
  // and not-applicable ("—") chips sink to the end, where their already-quiet
  // styling reads as a calm "nothing here" rather than a headline. Ties keep
  // the source order (Array.sort is stable).
  const dimensionChips = useMemo(() => {
    const chips: {
      key: string;
      value: string;
      label: string;
      tone: 'default' | 'healthy' | 'attention';
      title?: string;
      onClick?: () => void;
    }[] = [
      { key: 'fresh', value: stats.freshCount, label: 'fresh (last 7 days)', tone: stats.freshCount === '0' ? 'default' : 'healthy' },
      { key: 'highConf', value: stats.highConf, label: 'high confidence', tone: stats.highConf === '—' || stats.highConf === '0' ? 'default' : 'healthy' },
      { key: 'stale', value: stats.staleCount, label: 'stale · worth a review', tone: 'attention' },
      // Round-6 fix 2c: "to review" jumps straight to the needs-confirm filter.
      // Round-7 fix 4: the tooltip reframes a big count honestly (imported backlog).
      {
        key: 'review',
        value: stats.needsConfirm,
        label: 'to review',
        tone: 'attention',
        title: 'Most of these are imported memories waiting for a first look — reviewing a few at a time is plenty.',
        onClick: () => setFilter('needs_confirm'),
      },
    ];
    const rank = (v: string) => { const n = parseInt(v, 10); return Number.isNaN(n) ? -1 : n; };
    return [...chips].sort((a, b) => rank(b.value) - rank(a.value));
  }, [stats]);

  const shown = useMemo(() => {
    let set = live;
    if (filter === 'stale') set = set.filter(isStale);
    else if (filter === 'needs_confirm') set = set.filter((m) => m.status === 'unreviewed');
    const ql = q.trim().toLowerCase();
    if (ql) set = set.filter((m) => m.content.toLowerCase().includes(ql) || (m.title?.toLowerCase().includes(ql) ?? false));
    return set;
  }, [live, filter, q]);

  // Wave F (fix 3b): same display-layer collapse the Memories tab uses (F22) —
  // near-identical rows fold into one representative with an ×N badge. Render
  // only; every underlying record stays in the store and row actions key off
  // the representative's real id.
  const shownDeduped = useMemo(() => dedupeMemoriesForDisplay(shown), [shown]);

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
    // Wave U Lane E (item 4): a ~150ms fade-slide when the Manage body mounts on
    // the Trust↔Memories tab swap (same card-enter keyframe + Wave T hover
    // timing as the Memories panel). The wrapper carries the parent's space-y-6
    // so the stat-bar / search / rows rhythm is unchanged. motion-safe — reduced
    // motion keeps the instant swap.
    <div
      className="space-y-6"
      style={reduceMotion ? undefined : { animation: 'card-enter 0.15s ease-out both' }}
    >
      {/* §3 stat bar — one TOTAL headline + subordinate, non-summing dimension
          chips. The three views overlap (a memory can be fresh AND awaiting
          confirm), so they must never read as a partition of the total. */}
      <div className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--surface)] p-4 sm:p-5">
        {totalUnknown ? (
          <StatBarSkeleton />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <HeroCount total={totalNum} capped={totalCapped} reduceMotion={reduceMotion} />
              <span className="text-[13.5px] text-[var(--text-muted)]">
                Memories in this hive · {mind === 'workspace' ? 'this workspace' : 'personal mind'}
              </span>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {/* W2D: independent (non-summing) dimensions; Wave R Lane E orders them
                  by value desc so a zero never leads the row (see dimensionChips). */}
              {dimensionChips.map((c) => (
                <DimensionChip key={c.key} value={c.value} label={c.label} tone={c.tone} title={c.title} onClick={c.onClick} />
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-snug text-[var(--text-muted)]">
              Overlapping views — a memory can be counted in more than one.
            </p>
          </>
        )}
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
        {/* "Forgotten" is gated off — hard delete leaves no tombstone (no list to
            show). Same contrast as the live chips (a11y: the old dim+opacity-50
            treatment was near-invisible in both themes); disabled reads from the
            dashed border + cursor + tooltip instead of low contrast. */}
        <button
          type="button"
          aria-disabled="true"
          aria-label="Forgotten filter unavailable — forgetting is permanent, there's no recoverable list (hard delete, by design)"
          title="Forgetting is permanent — there's no recoverable list (hard delete, by design)"
          className="cursor-not-allowed rounded-[9px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text-muted)]"
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
          <button onClick={() => load()} className="text-[13px] text-[var(--honey-text)] hover:underline">Retry</button>
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
          {shownDeduped.map(({ memory: m, duplicateCount }, i) => (
            <MemoryRow
              key={m.id}
              memory={m}
              duplicateCount={duplicateCount}
              busy={busy}
              enterDelayMs={reduceMotion ? undefined : Math.min(i, 10) * 40}
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
            <p className="text-[12px] text-[var(--text-muted)]">
              Created {new Date(selected.createdAt).toLocaleString(DATE_LOCALE)}
              {selected.updatedAt && ` · updated ${new Date(selected.updatedAt).toLocaleString(DATE_LOCALE)}`}
            </p>
          </>
        )}
      </DetailDrawer>
    </div>
  );
}

/** Test-only: reset the session-scoped hero count-up flag so animation state
 *  can't leak across tests. Behind a fast-refresh exemption (the lane is scoped
 *  to this file, so the helper co-locates here — mirrors resetWorkspaceShelfCache). */
// eslint-disable-next-line react-refresh/only-export-components
export function resetMemoryHeroSession(): void {
  heroCountAnimatedThisSession = false;
}

export { freshness, isStale };
export type { MemoryStatus };
