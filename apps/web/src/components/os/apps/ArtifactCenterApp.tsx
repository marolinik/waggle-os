import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Loader2, FileText, Presentation, Table2, LayoutDashboard, Microscope,
  Code2, Image as ImageIcon, Palette, File, Archive, Trash2, RotateCcw, Save, Plus, Link2,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { DATE_LOCALE } from '@/lib/date-locale';
import type { Artifact, ArtifactKind, ArtifactStatus, RelatedSearchResult } from '@/lib/types';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Artifact Center (UX-Refactor Phase 2C, S05). The outcome layer: produced
 * OUTCOMES (decks/docs/sheets/dashboards/research/...) as first-class relational
 * objects, not file attachments (PRD §12.5). Cross-workspace by default — workspace
 * is a facet, not a hard scope (the differentiator vs the Files app). Backed by the
 * A6 artifacts.json index via the /api/artifacts* adapter methods. The detail
 * drawer's "Related" section calls the federated search-related endpoint (PRD
 * line 532): a topic returns related memories / sessions / tasks too.
 */

const KIND_META: Record<ArtifactKind, { label: string; Icon: typeof FileText }> = {
  document: { label: 'Document', Icon: FileText },
  presentation: { label: 'Presentation', Icon: Presentation },
  spreadsheet: { label: 'Spreadsheet', Icon: Table2 },
  dashboard: { label: 'Dashboard', Icon: LayoutDashboard },
  research: { label: 'Research', Icon: Microscope },
  code: { label: 'Code', Icon: Code2 },
  media: { label: 'Media', Icon: ImageIcon },
  design: { label: 'Design', Icon: Palette },
  other: { label: 'Other', Icon: File },
};
/** Per-kind warm tint for the card icon (design §16 6-color palette → warm semantics, D21). */
const KIND_TINT: Record<ArtifactKind, { bg: string; fg: string }> = {
  document:     { bg: 'var(--work-wash)',    fg: 'var(--work)' },
  presentation: { bg: 'var(--honey-wash)',   fg: 'var(--honey)' },
  spreadsheet:  { bg: 'var(--healthy-wash)', fg: 'var(--healthy)' },
  dashboard:    { bg: 'var(--intel-wash)',   fg: 'var(--intel)' },
  research:     { bg: 'var(--intel-wash)',   fg: 'var(--intel)' },
  code:         { bg: 'var(--work-wash)',    fg: 'var(--work)' },
  media:        { bg: 'var(--honey-wash)',   fg: 'var(--honey)' },
  design:       { bg: 'var(--intel-wash)',   fg: 'var(--intel)' },
  other:        { bg: 'var(--honey-wash)',   fg: 'var(--honey)' },
};
const KINDS = Object.keys(KIND_META) as ArtifactKind[];

const STATUS_FILTERS: { value: '' | ArtifactStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_review', label: 'In review' },
  { value: 'final', label: 'Final' },
  { value: 'archived', label: 'Archived' },
];

function statusTone(s: ArtifactStatus): 'neutral' | 'healthy' | 'attention' {
  if (s === 'final' || s === 'ready') return 'healthy';
  if (s === 'in_review') return 'attention';
  return 'neutral'; // draft, archived
}

interface ArtifactCenterAppProps {
  activeWorkspaceId?: string;
  workspaceName?: string;
}

export default function ArtifactCenterApp({ activeWorkspaceId, workspaceName }: ArtifactCenterAppProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | ArtifactKind>('');
  const [status, setStatus] = useState<'' | ArtifactStatus>('');

  const [selected, setSelected] = useState<Artifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftKind, setDraftKind] = useState<ArtifactKind>('document');
  const [related, setRelated] = useState<RelatedSearchResult | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  // Monotonic token so an out-of-order search-related response (artifact A
  // resolving after B was opened) cannot render under the wrong artifact (F2).
  const relatedReqRef = useRef(0);

  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<ArtifactKind>('document');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adapter.listArtifacts({
        q: q.trim() || undefined,
        kind: kind || undefined,
        status: status || undefined,
        limit: 200,
      });
      setArtifacts(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [q, kind, status]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // debounce text search only
    return () => clearTimeout(t);
  }, [load, q]);

  const openDetail = (a: Artifact) => {
    setSelected(a);
    setDraftTitle(a.title);
    setDraftKind(a.kind);
    setRelated(null);
    setRelatedLoading(true);
    const reqId = ++relatedReqRef.current;
    adapter
      .searchRelatedArtifacts(a.title, a.workspaceId)
      .then((r) => { if (relatedReqRef.current === reqId) setRelated(r); })
      .catch(() => { if (relatedReqRef.current === reqId) setRelated(null); })
      .finally(() => { if (relatedReqRef.current === reqId) setRelatedLoading(false); });
  };

  const mutate = async (fn: () => Promise<unknown>, closeDrawer = false) => {
    setBusy(true);
    try {
      await fn();
      if (closeDrawer) setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!activeWorkspaceId || !newTitle.trim()) return;
    void mutate(async () => {
      await adapter.createArtifact({ title: newTitle.trim(), kind: newKind, workspaceId: activeWorkspaceId });
      setNewTitle('');
    });
  };

  const saveEdits = () => {
    if (!selected) return;
    const patch: { title?: string; kind?: ArtifactKind } = {};
    if (draftTitle.trim() && draftTitle !== selected.title) patch.title = draftTitle.trim();
    if (draftKind !== selected.kind) patch.kind = draftKind;
    if (Object.keys(patch).length === 0) { setSelected(null); return; }
    void mutate(() => adapter.patchArtifact(selected.id, patch, selected.workspaceId), true);
  };

  const archive = (a: Artifact) => void mutate(() => adapter.archiveArtifact(a.id, a.workspaceId), true);
  // Restore the pre-archive status the server stashed in prevStatus (A8 faithful
  // reversibility), falling back to 'draft' only when none was recorded (F3).
  const unarchive = (a: Artifact) => void mutate(() => adapter.patchArtifact(a.id, { status: a.prevStatus ?? 'draft' }, a.workspaceId), true);
  const remove = (a: Artifact) => {
    if (!window.confirm(`Delete this artifact permanently?\n\n"${a.title}"\n\nThis removes the record (the backing file, if any, is left in place). To keep it but hide it, use Archive instead.`)) return;
    void mutate(() => adapter.deleteArtifact(a.id, a.workspaceId), true);
  };

  const relatedCount = related
    ? related.memories.length + related.sessions.length + related.tasks.length
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Filter + create bar */}
      <div className="border-b border-border/50 p-2.5 space-y-2 bg-background/60">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1 flex-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search artifacts..."
              className="flex-1 bg-transparent text-xs h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'all'}
              onClick={() => setStatus(s.value)}
              aria-pressed={status === s.value}
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] transition-colors border',
                status === s.value ? 'border-primary/40 bg-primary/15 text-honey' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground',
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
            className={cn('px-1.5 py-0.5 rounded text-[11px] transition-colors', kind === '' ? 'bg-primary/20 text-honey' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
          >
            All kinds
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(kind === k ? '' : k)}
              aria-pressed={kind === k}
              className={cn('px-1.5 py-0.5 rounded text-[11px] transition-colors', kind === k ? 'bg-primary/20 text-honey' : 'bg-muted/50 text-muted-foreground hover:text-foreground')}
            >
              {KIND_META[k].label}
            </button>
          ))}
        </div>

        {activeWorkspaceId && (
          <div className="flex items-center gap-1.5">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              placeholder={`New artifact in ${workspaceName ?? 'this workspace'}…`}
              className="flex-1 text-xs h-7"
            />
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ArtifactKind)}
              className="text-[11px] rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground"
              aria-label="New artifact kind"
            >
              {KINDS.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
            </select>
            <button
              onClick={create}
              disabled={busy || !newTitle.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-2.5">
        {loading && artifacts.length === 0 ? (
          <div role="status" aria-live="polite" className="text-center py-12"><Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" /><p className="text-xs text-muted-foreground">Loading artifacts…</p></div>
        ) : error && artifacts.length === 0 ? (
          <div role="alert" className="text-center py-12">
            <p className="text-xs text-destructive mb-2">{error}</p>
            <button onClick={() => load()} className="text-xs text-honey hover:underline">Retry</button>
          </div>
        ) : artifacts.length === 0 ? (
          <div role="status" aria-live="polite" className="text-center py-12">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {q || kind || status ? 'No artifacts match these filters.' : 'No artifacts yet — outcomes your agents produce will appear here.'}
            </p>
            {/* Teach-and-invite (5-judge finding: "all mood, no sell — no CTA").
                Ghost tiles show WHAT will appear; the CTA routes to a chat. */}
            {!q && !kind && !status && (
              <>
                <div className="mt-5 flex items-center justify-center gap-2.5" aria-hidden>
                  {(['document', 'presentation', 'spreadsheet'] as ArtifactKind[]).map(k => {
                    const { label, Icon } = KIND_META[k];
                    return (
                      <span key={k} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground/70">
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={() => navigate('/workspaces')}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-display font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Ask Waggle to make something →
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* A transient refetch error must not wipe an already-populated list
                (F5): show it as an inline banner instead of the full-pane error. */}
            {error && (
              <div role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5">
                <span className="text-[11px] text-destructive">{error}</span>
                <button onClick={() => load()} className="text-[11px] text-honey hover:underline shrink-0">Retry</button>
              </div>
            )}
            {/* 3-column card grid (PR6b §16) — provenance-forward outcome
                tiles, not a flat list. Collapses to 2/1 cols on narrow panes. */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {artifacts.map((a) => {
              const { Icon, label } = KIND_META[a.kind];
              const tint = KIND_TINT[a.kind];
              return (
                <li key={a.id}>
                  <button
                    onClick={() => openDetail(a)}
                    className="group w-full h-full flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3 text-left hover:border-primary/40 hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="grid place-items-center w-9 h-10 rounded-lg shrink-0"
                        style={{ background: tint.bg }}
                      >
                        <Icon className="w-4 h-4" style={{ color: tint.fg }} />
                      </span>
                      <StatusBadge tone={statusTone(a.status)} label={a.status.replace('_', ' ')} />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-xs font-medium truncate">{a.title}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {label} · {new Date(a.updatedAt).toLocaleDateString(DATE_LOCALE)}
                      </span>
                    </div>
                    {/* Provenance — gated: render the real source string the
                        backend stored; never fabricate a creator (D11/D20). */}
                    {a.source && (
                      <span className="text-[10px] truncate" style={{ color: 'var(--intel)' }}>
                        ⬡ {a.source}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            </ul>
          </>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        title={selected?.title ?? 'Artifact'}
        subtitle={selected ? `${KIND_META[selected.kind].label} · ${selected.source}` : undefined}
        headerExtra={selected ? <StatusBadge tone={statusTone(selected.status)} label={selected.status.replace('_', ' ')} /> : undefined}
        footer={selected ? (
          <div className="flex items-center gap-2 w-full">
            <button onClick={saveEdits} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              <Save className="w-3 h-3" /> Save
            </button>
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
          </div>
        ) : undefined}
      >
        {selected && (
          <>
            <div>
              <label htmlFor="ac-draft-title" className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Title</label>
              <Input
                id="ac-draft-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="mt-1 text-sm h-8"
              />
            </div>

            <div>
              <label htmlFor="ac-draft-kind" className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Kind</label>
              <select
                id="ac-draft-kind"
                value={draftKind}
                onChange={(e) => setDraftKind(e.target.value as ArtifactKind)}
                className="mt-1 block w-full text-xs rounded-md border border-border bg-muted/40 px-2 py-1"
              >
                {KINDS.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
              </select>
            </div>

            {selected.tags && selected.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {selected.tags.map((t) => <span key={t} className="text-[11px] text-muted-foreground">#{t}</span>)}
              </div>
            )}

            {selected.storagePath && (
              <p className="text-[11px] text-muted-foreground break-all">
                <span className="font-semibold">Path:</span> {selected.storagePath}
              </p>
            )}

            {/* Related — the federated search-related endpoint (PRD line 532) */}
            <div>
              <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> Related {relatedLoading ? '' : `(${relatedCount})`}
              </p>
              {relatedLoading ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Finding related items…</p>
              ) : relatedCount === 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">No related memories, sessions, or tasks found.</p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {related!.memories.length > 0 && (
                    <RelatedGroup label="Memories" items={related!.memories.map((m) => ({ id: m.id, text: m.title }))} />
                  )}
                  {related!.tasks.length > 0 && (
                    <RelatedGroup label="Tasks" items={related!.tasks.map((t) => ({ id: t.id, text: t.title }))} />
                  )}
                  {related!.sessions.length > 0 && (
                    <RelatedGroup label="Sessions" items={related!.sessions.map((s) => ({ id: s.id, text: s.title }))} />
                  )}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Created {new Date(selected.createdAt).toLocaleString(DATE_LOCALE)}
              {` · updated ${new Date(selected.updatedAt).toLocaleString(DATE_LOCALE)}`}
            </p>
          </>
        )}
      </DetailDrawer>
    </div>
  );
}

function RelatedGroup({ label, items }: { label: string; items: { id: string; text: string }[] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it) => (
          <li key={it.id} className="text-[11px] text-foreground/80 truncate">• {it.text}</li>
        ))}
      </ul>
    </div>
  );
}
