import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, Brain, Archive, Trash2, GitMerge, RotateCcw, Check, Save, AlertTriangle, ShieldOff } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { consumeDeepLink } from '@/lib/app-deeplink';
import type { Memory, MemoryKind, MemoryStatus } from '@/lib/types';
import { MEMORY_KIND_META, memoryKindLabel } from '@/lib/harvest-kind-map';
import { MemoryCard } from './MemoryCard';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { EvidencePanel } from '@/components/ui/evidence-panel';
import { Input } from '@/components/ui/input';
import { renderChatMarkdown } from '@/lib/render-markdown';
import { cn } from '@/lib/utils';

/**
 * Memory Center (UX-Refactor Phase 2, S04). Self-contained tab (like HarvestTab):
 * fetches the shared Memory entity via the new /api/memory* adapter methods and
 * exposes source / confidence / evidence / scope + edit / archive / delete / merge
 * (PRD §12.4, DoD #4; C11 merge). The 'Needs review' filter surfaces C33 imports
 * (status=unreviewed).
 *
 * P3/D2 two-mind split: the tab is the per-mind LIST, parameterized by `mind`
 * (+ `workspaceId` for the workspace mind). Defaults to personal — the J08 deep
 * link and pre-P3 call sites keep their behavior. Workspace-mind mutations MUST
 * carry workspaceId or the server's candidateStores lookup misses the frame
 * (personal-store-only search → 404).
 */

export interface MemoryCenterTabProps {
  /** Which mind this list reads/writes. Default: personal. */
  mind?: 'personal' | 'workspace';
  /** Required when mind='workspace' — the workspace whose mind to show. */
  workspaceId?: string;
  /**
   * Whether this instance consumes `waggle:open-app {appId:'memory'}` deep links
   * (J08). The /memory route instance does; secondary embeds (WorkspaceDesktop's
   * Memory tab) must NOT steal a stash meant for the route. Default: true.
   */
  consumeDeepLinks?: boolean;
}

const KINDS = Object.keys(MEMORY_KIND_META) as MemoryKind[];

const STATUS_FILTERS: { value: '' | MemoryStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'unreviewed', label: 'Needs review' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'deprecated', label: 'Deprecated' },
];

const CONFIDENCE_FILTERS: { value: number; label: string }[] = [
  { value: 0, label: 'Any confidence' },
  { value: 40, label: 'Medium+' },
  { value: 75, label: 'High only' },
];

export default function MemoryCenterTab({
  mind = 'personal',
  workspaceId,
  consumeDeepLinks = true,
}: MemoryCenterTabProps = {}) {
  // Workspace-mind ops carry the workspace param; personal ops must not.
  const wsParam = mind === 'workspace' ? workspaceId : undefined;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | MemoryKind>('');
  // Default to the curated Active view: deprecated/superseded frames are
  // version archaeology — surfacing them by default reads as "my memory is
  // full of junk" to a first-time user. 'All' stays one click away.
  const [status, setStatus] = useState<'' | MemoryStatus>('active');
  const [minConfidence, setMinConfidence] = useState(0);

  const [selected, setSelected] = useState<Memory | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [draftKind, setDraftKind] = useState<MemoryKind>('fact');

  // #7 "View original source": inline expandable verbatim-source view in the
  // detail drawer (not a nested modal). A frame can link MULTIPLE verbatim
  // sources (metadata.archiveUids) → render each in its own escaped block;
  // sourceRows is empty when the frame has no linked source → friendly empty state.
  type ArchiveRow = { content: string; source: string; sourceRef: string | null; injectionFlagged: boolean; injectionFlags: string };
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [sourceRows, setSourceRows] = useState<ArchiveRow[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  // #7 P1 GDPR erasure receipt — a transient, dismissible confirmation of what
  // the last Art.17 erase actually purged (compliance-grade transparency; the
  // drawer closes on success, so the receipt lives at the list level).
  const [eraseNotice, setEraseNotice] = useState<string | null>(null);
  // Latest source-fetch token: the id whose fetch is allowed to write state. A
  // selection change (reset effect → undefined) or a newer fetch invalidates any
  // in-flight request so a stale result can't land on the wrong memory.
  const sourceReqIdRef = useRef<string | undefined>(undefined);

  // J08: Home's "N memories need review" banner deep-links here with
  // {appId:'memory', filter:'unreviewed'}. Two paths (AutomationCenterApp
  // pattern): cold open consumes the stashed intent on mount; an already-
  // mounted tab applies the live event directly (and drops the stash so a
  // later remount can't replay it). The filter value is validated against
  // STATUS_FILTERS before seeding.
  const applyDeepLink = useCallback((detail: { filter?: string }) => {
    if (detail.filter && STATUS_FILTERS.some((f) => f.value === detail.filter)) {
      setStatus(detail.filter as MemoryStatus);
    }
  }, []);

  useEffect(() => {
    if (!consumeDeepLinks) return;
    const pending = consumeDeepLink('memory');
    if (pending) applyDeepLink(pending);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { appId?: string; filter?: string } | undefined;
      if (detail?.appId === 'memory') {
        consumeDeepLink('memory');
        applyDeepLink(detail);
      }
    };
    window.addEventListener('waggle:open-app', handler);
    return () => window.removeEventListener('waggle:open-app', handler);
  }, [applyDeepLink, consumeDeepLinks]);

  // Monotonic request guard: rapid filter changes (and the J08 deep-link
  // seeding the status filter right after mount) can leave two listMemories
  // calls in flight — only the latest one may win setMemories, or a stale
  // unfiltered response can render under the 'Needs review' pill.
  const loadSeq = useRef(0);
  // Post-mutation refetch trigger. mutate() must NOT call its render's closured
  // load() — that stale call would claim the newest seq and could commit
  // old-mind/old-filter rows after a mid-mutation mind or filter switch (P3
  // review MED). Bumping state re-runs the load effect with CURRENT props.
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    // Workspace mind with no workspace resolved yet (e.g. shell still booting):
    // don't fall through to a personal-mind fetch mislabeled as workspace data.
    if (mind === 'workspace' && !wsParam) {
      setMemories([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await adapter.listMemories({
        mind,
        workspaceId: wsParam,
        q: q.trim() || undefined,
        kind: kind || undefined,
        status: status || undefined,
        minConfidence: minConfidence || undefined,
        limit: 200,
      });
      if (seq === loadSeq.current) setMemories(res);
    } catch (e) {
      if (seq === loadSeq.current) setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [q, kind, status, minConfidence, mind, wsParam]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // debounce text search only
    return () => clearTimeout(t);
  }, [load, q, reloadTick]);

  // Mind switch invalidates EVERYTHING in flight and on screen (keyed on the
  // EFFECTIVE scope, so personal-mind instances ignore workspace churn):
  //  - selection/checklist: a drawer or merge set carried across minds would
  //    mutate the wrong store (ids collide across the per-mind SQLite DBs);
  //  - the list: stale rows must not render under the new mind's pill;
  //  - loadSeq: an in-flight old-mind response must not commit into the window
  //    between this reset and the (debounced) next load starting;
  //  - loading: with a typed q, the 250ms debounce window would otherwise show
  //    a misleading "No memories match these filters." empty state.
  useEffect(() => {
    loadSeq.current++;
    setSelected(null);
    setChecked(new Set());
    setMemories([]);
    setLoading(true);
    setEraseNotice(null);   // a receipt for the prior mind must not persist across the switch
  }, [mind, wsParam]);

  const openDetail = (m: Memory) => {
    setSelected(m);
    setDraftContent(m.content);
    setDraftKind(m.kind);
  };

  // Reset the verbatim-source view whenever the selected memory changes (incl.
  // closing the drawer) so a previously-opened source can't leak into another row.
  useEffect(() => {
    setSourceExpanded(false);
    setSourceRows([]);
    setSourceError(null);
    setSourceLoading(false);
    sourceReqIdRef.current = undefined;   // invalidate any in-flight fetch for the prior memory
  }, [selected?.id]);

  // Toggle the inline source view; lazy-fetch the verbatim row on first open.
  const viewOriginalSource = async () => {
    if (!selected) return;
    if (sourceExpanded) { setSourceExpanded(false); return; }
    const reqId = selected.id;
    sourceReqIdRef.current = reqId;
    setSourceExpanded(true);
    setSourceLoading(true);
    setSourceError(null);
    try {
      const res = await adapter.getMemoryOriginalSource(reqId, wsParam, mind);
      if (sourceReqIdRef.current !== reqId) return;   // selection changed mid-flight — drop stale result
      setSourceRows(res.archiveRows);
    } catch (e) {
      if (sourceReqIdRef.current !== reqId) return;
      setSourceError(e instanceof Error ? e.message : 'Failed to load original source');
    } finally {
      if (sourceReqIdRef.current === reqId) setSourceLoading(false);
    }
  };

  const toggleChecked = (id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const mutate = async (fn: () => Promise<unknown>, closeDrawer = false) => {
    setEraseNotice(null);   // drop any stale receipt; erase()'s own fn re-sets it on success
    setBusy(true);
    try {
      await fn();
      if (closeDrawer) setSelected(null);
      // Refetch via the effect (NOT the closured load) so post-mutation rows
      // always load with the props of the render that is current by then.
      setReloadTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = () => {
    if (!selected) return;
    const patch: { content?: string; kind?: string } = {};
    if (draftContent !== selected.content) patch.content = draftContent;
    if (draftKind !== selected.kind) patch.kind = draftKind;
    if (Object.keys(patch).length === 0) { setSelected(null); return; }
    void mutate(() => adapter.patchMemory(selected.id, patch, wsParam, mind), true);
  };

  const archive = (m: Memory) => void mutate(() => adapter.archiveMemory(m.id, wsParam, mind), true);
  const unarchive = (m: Memory) => void mutate(() => adapter.patchMemory(m.id, { status: 'active' }, wsParam, mind), true);
  const markReviewed = (m: Memory) => void mutate(() => adapter.patchMemory(m.id, { status: 'active' }, wsParam, mind), true);
  const remove = (m: Memory) => {
    if (!window.confirm(`Delete this memory permanently?\n\n"${m.title}"\n\nThis cannot be undone. To keep it but hide it, use Archive instead.`)) return;
    void mutate(() => adapter.deleteMemoryById(m.id, wsParam, mind), true);
  };
  // #7 P1 GDPR Art.17 "right to erasure" — the FULL sweep (this memory + its
  // original source text + every search-index entry + knowledge-graph facts
  // derived solely from it + the verbatim conversation turns behind it). Runs
  // server-side in one atomic transaction. Distinct from Delete (removes just
  // this one record) and Archive (hides it). Irreversible → strong confirm +
  // a receipt of exactly what was purged.
  const erase = (m: Memory) => {
    if (!window.confirm(
      `Erase this memory and ALL data derived from it?\n\n"${m.title}"\n\n` +
      `This is a GDPR "right to erasure" action. It permanently removes the memory, ` +
      `its original source text, every search index entry, the verbatim conversation ` +
      `turns behind it, and any knowledge-graph facts derived solely from it. ` +
      `It cannot be undone.\n\n` +
      `(To simply hide it, use Archive. To remove only this one record, use Delete.)`,
    )) return;
    void mutate(async () => {
      const { result } = await adapter.eraseMemory({ frameId: m.id }, { workspaceId: wsParam, mind });
      const parts = [
        `${result.framesDeleted} ${result.framesDeleted === 1 ? 'memory' : 'memories'} erased`,
        result.archiveRedacted > 0 ? `${result.archiveRedacted} source ${result.archiveRedacted === 1 ? 'record' : 'records'} redacted` : null,
        result.entitiesErased > 0 ? `${result.entitiesErased} knowledge ${result.entitiesErased === 1 ? 'entity' : 'entities'} removed` : null,
      ].filter(Boolean);
      setEraseNotice(`Erased "${m.title}": ${parts.join(' · ')}.`);
    }, true);
  };
  const mergeSelected = () => {
    const ids = [...checked];
    if (ids.length < 2) return;
    void mutate(async () => {
      await adapter.mergeMemories(ids, { workspaceId: wsParam, mind });
      setChecked(new Set());
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="border-b border-border/50 p-2.5 space-y-2 bg-background/60">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1 flex-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search memories..."
              className="flex-1 bg-transparent text-xs h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="text-[11px] rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground"
            aria-label="Filter by confidence"
          >
            {CONFIDENCE_FILTERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'all'}
              onClick={() => setStatus(s.value)}
              aria-pressed={status === s.value}
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] transition-colors border',
                status === s.value ? 'border-primary/40 bg-primary/15 text-primary' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setKind('')}
            aria-pressed={kind === ''}
            className={cn('px-1.5 py-0.5 rounded text-[11px] transition-colors', kind === '' ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
          >
            All kinds
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(kind === k ? '' : k)}
              aria-pressed={kind === k}
              className={cn('px-1.5 py-0.5 rounded text-[11px] transition-colors', kind === k ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
            >
              {memoryKindLabel(k)}
            </button>
          ))}
        </div>

        {checked.size >= 2 && (
          <button
            onClick={mergeSelected}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <GitMerge className="w-3 h-3" /> Merge {checked.size} memories
          </button>
        )}
      </div>

      {/* #7 P1 GDPR erasure receipt — dismissible confirmation of what was purged. */}
      {eraseNotice && (
        <div role="status" aria-live="polite" className="mx-2.5 mt-2 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-foreground">
          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
          <span className="flex-1">{eraseNotice}</span>
          <button onClick={() => setEraseNotice(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto p-2.5">
        {loading && memories.length === 0 ? (
          <div role="status" aria-live="polite" className="text-center py-12"><Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" /><p className="text-xs text-muted-foreground">Loading memories…</p></div>
        ) : error ? (
          <div role="alert" className="text-center py-12">
            <p className="text-xs text-destructive mb-2">{error}</p>
            <button onClick={() => load()} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        ) : memories.length === 0 ? (
          <div role="status" aria-live="polite" className="text-center py-12">
            <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {mind === 'workspace' && !workspaceId
                ? 'No workspace selected — open a workspace to see what it has learned.'
                : q || kind || status || minConfidence
                  ? 'No memories match these filters.'
                  : mind === 'workspace'
                    ? 'Nothing learned in this workspace yet — memories appear here as you work.'
                    : 'No memories yet — import or capture some to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {memories.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                onClick={() => openDetail(m)}
                selected={checked.has(m.id)}
                onSelect={(on) => toggleChecked(m.id, on)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        title={selected?.title ?? 'Memory'}
        subtitle={selected ? `${memoryKindLabel(selected.kind)} · ${selected.scope}` : undefined}
        headerExtra={selected ? <ConfidenceBadge value={selected.confidence} compact /> : undefined}
        footer={selected ? (
          <div className="flex flex-wrap items-center gap-2 gap-y-1.5 w-full [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            <button onClick={saveEdits} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              <Save className="w-3 h-3" /> Save
            </button>
            {selected.status === 'unreviewed' && (
              <button onClick={() => markReviewed(selected)} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted">
                <Check className="w-3 h-3" /> Mark reviewed
              </button>
            )}
            {selected.status === 'archived' ? (
              <button onClick={() => unarchive(selected)} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted">
                <RotateCcw className="w-3 h-3" /> Unarchive
              </button>
            ) : (
              <button onClick={() => archive(selected)} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted">
                <Archive className="w-3 h-3" /> Archive
              </button>
            )}
            <button onClick={() => remove(selected)} disabled={busy} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button
              onClick={() => erase(selected)}
              disabled={busy}
              title="GDPR erasure: permanently removes this memory, its original source, the conversation turns behind it, and everything derived from it. Cannot be undone."
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-destructive/40 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <ShieldOff className="w-3 h-3" /> Erase
            </button>
          </div>
        ) : undefined}
      >
        {selected && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge
                tone={selected.status === 'archived' || selected.status === 'deprecated' ? 'neutral' : selected.status === 'conflict' ? 'risk' : selected.status === 'active' ? 'healthy' : 'attention'}
                label={selected.status}
              />
              {selected.tags?.map((t) => <span key={t} className="text-[11px] text-muted-foreground">#{t}</span>)}
            </div>

            <div>
              <label htmlFor="mc-draft-kind" className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Kind</label>
              <select
                id="mc-draft-kind"
                value={draftKind}
                onChange={(e) => setDraftKind(e.target.value as MemoryKind)}
                className="mt-1 block w-full text-xs rounded-md border border-border bg-muted/40 px-2 py-1"
              >
                {KINDS.map((k) => <option key={k} value={k}>{memoryKindLabel(k)}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="mc-draft-content" className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Content</label>
              <textarea
                id="mc-draft-content"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={6}
                className="mt-1 block w-full text-sm rounded-md border border-border bg-background px-2 py-1.5 leading-relaxed resize-y"
              />
              {/* Read-only rendered preview below the editor for markdown context.
                  Safe: renderChatMarkdown escapes &/</> before formatting (same
                  established escaper TimelineTab uses), so harvested content can't
                  inject markup. */}
              <div className="mt-2 text-xs text-muted-foreground/80 max-h-32 overflow-auto" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(draftContent) }} />
            </div>

            <EvidencePanel source={selected.source} sourceId={selected.sourceId} sourceUrl={selected.sourceUrl} evidence={selected.evidence} onViewOriginalSource={viewOriginalSource} expanded={sourceExpanded} busy={sourceLoading} />

            {sourceExpanded && (
              <div className="rounded-md border border-border bg-muted/30 p-2 space-y-2">
                {sourceLoading ? (
                  <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading original source…
                  </div>
                ) : sourceError ? (
                  <div role="alert" className="text-xs text-destructive">{sourceError}</div>
                ) : sourceRows.length > 0 ? (
                  /* One frame can be distilled from MULTIPLE verbatim sources — render
                     each in its own React-escaped <pre> (NEVER dangerouslySetInnerHTML:
                     the archive is hostile-by-assumption) with its own provenance label
                     and advisory injection badge. */
                  sourceRows.map((row, i) => (
                    <div key={i} className={cn('space-y-2', i > 0 && 'border-t border-border/60 pt-2')}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">
                          Original source{sourceRows.length > 1 ? ` ${i + 1} of ${sourceRows.length}` : ''}
                        </span>
                        {row.injectionFlagged && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                            title={`Advisory: a prompt-injection pattern was detected in a 4KB probe of this source${row.injectionFlags ? ` (${row.injectionFlags})` : ''}. This is a probe, not a full-content guarantee.`}
                          >
                            <AlertTriangle className="w-3 h-3" /> Injection flagged
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {row.source}{row.sourceRef ? ` · ${row.sourceRef}` : ''}
                      </p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-[11px] font-mono leading-relaxed text-foreground">
                        {row.content}
                      </pre>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No original source recorded for this memory.</p>
                )}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Created {new Date(selected.createdAt).toLocaleString()}
              {selected.updatedAt && ` · updated ${new Date(selected.updatedAt).toLocaleString()}`}
            </p>
          </>
        )}
      </DetailDrawer>
    </div>
  );
}
