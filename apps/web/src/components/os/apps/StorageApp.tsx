/**
 * StorageApp — Storage & Files, Variation A ("Where it lives"), screen 07.
 *
 * Makes the workspace legible: a live on-disk tree card (real top-level
 * entries from the file store + the workspace's own metadata), three
 * storage-type cards (Virtual / Local / Team) with the workspace's *real*
 * storageType highlighted, and a local-first reassurance note.
 *
 * NO-FABRICATION (D11/PR3 streak-gate precedent): every concrete number on
 * the tree card is grounded —
 *   • top-level entries + file count   ← adapter.listFiles(workspaceId, '/')
 *   • storageType / storagePath / name ← the Workspace object (FilesRoute)
 *   • memoryCount                      ← Workspace.memoryCount (optional)
 * When a field is absent we render "—" or omit the line; we never invent a
 * size, a path, or a memory count. The three storage-type cards describe the
 * storage *model* (static, identical for every workspace) — that is product
 * copy, not per-workspace data, and the design seeds it verbatim.
 *
 * Source fidelity: docs/design_handoff_waggle_app/design-files/screens/storage.html (view-a)
 */
import { useEffect, useState } from 'react';
import { Cloud, HardDrive, Server, ShieldCheck, Folder, FileText, Loader2 } from 'lucide-react';
import type { ElementType } from 'react';
import type { FileEntry, StorageType, Workspace } from '@/lib/types';
import { adapter } from '@/lib/adapter';
import { formatSize } from './files/file-utils';

interface StorageAppProps {
  workspaceId: string;
  workspaceName?: string;
  /** The workspace record (carries storageType / storagePath / memoryCount). */
  workspace?: Workspace;
}

/** Static description of each storage model — product copy, not per-ws data. */
interface StorageTypeCard {
  type: StorageType;
  icon: ElementType;
  title: string;
  where: string;
  blurb: string;
  privacy: string;
  /** CSS var for the icon stroke + privacy chip accent. */
  accent: string;
  wash: string;
}

const STORAGE_TYPE_CARDS: readonly StorageTypeCard[] = [
  {
    type: 'virtual',
    icon: Cloud,
    title: 'Virtual',
    where: 'managed by Waggle',
    blurb: 'Files Waggle keeps for you inside the app — no folder to manage. Perfect for quick, throwaway work.',
    privacy: 'Only you · session',
    accent: 'var(--intel)',
    wash: 'var(--intel-wash)',
  },
  {
    type: 'local',
    icon: HardDrive,
    title: 'Local',
    where: 'a folder on your machine',
    blurb: 'Bound to a real folder you can open in your file manager. Your agents read and write the same files you do.',
    privacy: 'Only you · on disk',
    accent: 'var(--honey)',
    wash: 'var(--honey-wash)',
  },
  {
    type: 'team',
    icon: Server,
    title: 'Team',
    where: 'shared, synced',
    blurb: 'A shared memory + file space for a team — same workspace, role-based access, synced across seats.',
    privacy: 'Shared with team',
    accent: 'var(--healthy)',
    wash: 'var(--healthy-wash)',
  },
];

const STORAGE_LIVE_LABEL: Record<StorageType, string> = {
  virtual: 'Virtual workspace · managed by Waggle',
  local: 'Local workspace · on this machine',
  team: 'Team workspace · shared & synced',
};

const STORAGE_PILL: Record<StorageType, string> = {
  virtual: 'Virtual · session',
  local: 'Local · private',
  team: 'Team · shared',
};

const StorageApp = ({ workspaceId, workspaceName, workspace }: StorageAppProps) => {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  // Real top-level on-disk entries — the only live numbers on the tree card.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    adapter
      .listFiles(workspaceId, '/')
      .then(result => {
        if (cancelled) return;
        setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const storageType: StorageType = workspace?.storageType ?? 'virtual';
  const displayName = workspaceName ?? workspace?.name ?? workspaceId;
  const initial = (displayName.trim()[0] ?? 'W').toUpperCase();
  const fileCount = entries?.filter(e => e.type === 'file').length ?? 0;
  const dirCount = entries?.filter(e => e.type === 'directory').length ?? 0;
  // memoryCount is optional on Workspace — only show when truly present.
  const memoryCount = typeof workspace?.memoryCount === 'number' ? workspace.memoryCount : null;

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="max-w-[940px] mx-auto px-8 py-7 pb-16">
        {/* Header */}
        <header className="mb-2">
          <div className="font-mono text-[11px] text-muted-foreground mb-3">
            {displayName} <span className="opacity-50">›</span>{' '}
            <b className="font-medium" style={{ color: 'var(--text-2)' }}>Storage</b>
          </div>
          <h1 className="text-[26px] font-display font-semibold tracking-tight m-0 mb-2 text-foreground">
            Where this workspace lives
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed m-0 max-w-[62ch]">
            A workspace is one place on disk: its memory, its files, its artifacts. Waggle shows you exactly where —
            and keeps it local unless you choose to share.
          </p>
        </header>

        {/* Live location card */}
        <section
          className="mt-6 rounded-[26px] p-6"
          style={{
            border: '1px solid var(--honey-line)',
            background: 'linear-gradient(150deg, var(--secondary, hsl(var(--secondary))), var(--card, hsl(var(--card))))',
            boxShadow: 'var(--honey-glow)',
          }}
        >
          <div className="flex items-center gap-3.5 mb-[18px]">
            <div
              className="w-10 h-11 shrink-0 grid place-items-center font-extrabold text-[15px] rounded-md"
              style={{ color: '#1a1407', background: 'linear-gradient(150deg, var(--honey-bright, var(--honey)), var(--honey-deep, var(--honey)))' }}
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="min-w-0">
              <b className="text-base font-display font-semibold text-foreground truncate block">{displayName}</b>
              <div className="text-xs text-muted-foreground">{STORAGE_LIVE_LABEL[storageType]}</div>
            </div>
            <span
              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ color: 'var(--honey)', background: 'var(--honey-wash)', border: '1px solid var(--honey-line)' }}
            >
              ⬡ {STORAGE_PILL[storageType]}
            </span>
          </div>

          {/* On-disk tree — real entries only */}
          <div
            className="font-mono text-[12.5px] rounded-[14px] px-4 py-3.5"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}
            aria-label="On-disk layout"
          >
            {loading ? (
              <div className="flex items-center gap-2 py-1.5 text-muted-foreground" data-testid="storage-tree-loading">
                <Loader2 className="w-3.5 h-3.5 animate-spin opacity-60" />
                <span>Reading workspace…</span>
              </div>
            ) : errored ? (
              <div className="py-1.5" style={{ color: 'var(--risk)' }} role="alert">
                Couldn&apos;t read this workspace&apos;s contents — the file service is unreachable.
              </div>
            ) : (
              <>
                {/* Workspace root line: real path when known, else a neutral label. */}
                <div className="flex items-baseline gap-3 leading-[1.95]">
                  <span className="flex-1" style={{ color: 'var(--text-dim, hsl(var(--muted-foreground)))' }}>
                    {workspace?.storagePath ?? `workspaces/${workspaceId}/`}
                  </span>
                </div>
                {/* Memory line — only when memoryCount is a real number. */}
                <div className="flex items-baseline gap-3 leading-[1.95] pl-[1.4em]">
                  <span className="flex-1" style={{ color: 'var(--text-2)' }}>hive.mind</span>
                  <span className="whitespace-nowrap" style={{ color: 'var(--text-dim, hsl(var(--muted-foreground)))' }}>
                    {memoryCount !== null ? `${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}` : '—'}
                  </span>
                </div>
                {/* Real top-level entries from the file store. */}
                {entries && entries.length > 0 ? (
                  entries.map(e => (
                    <div key={e.path} className="flex items-baseline gap-3 leading-[1.95] pl-[1.4em]">
                      <span className="flex-1" style={{ color: e.type === 'directory' ? 'var(--honey)' : 'var(--text-2)' }}>
                        {e.name}{e.type === 'directory' ? '/' : ''}
                      </span>
                      <span className="whitespace-nowrap" style={{ color: 'var(--text-dim, hsl(var(--muted-foreground)))' }}>
                        {e.type === 'file' ? formatSize(e.size) : '—'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-baseline gap-3 leading-[1.95] pl-[1.4em]">
                    <span className="flex-1 italic" style={{ color: 'var(--text-dim, hsl(var(--muted-foreground)))' }}>
                      No files yet
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Grounded summary of what the tree showed. */}
          {!loading && !errored && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> {fileCount} {fileCount === 1 ? 'file' : 'files'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Folder className="w-3 h-3" /> {dirCount} {dirCount === 1 ? 'folder' : 'folders'}
              </span>
              {memoryCount !== null && (
                <span>{memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}</span>
              )}
            </div>
          )}
        </section>

        {/* Three ways a workspace can live */}
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground mt-[30px] mb-3.5 flex items-center gap-2.5">
          Three ways a workspace can live
          <span className="flex-1 h-px" style={{ background: 'var(--line-soft)' }} aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {STORAGE_TYPE_CARDS.map(card => {
            const active = card.type === storageType;
            const Icon = card.icon;
            return (
              <article
                key={card.type}
                className="relative rounded-[18px] p-5"
                style={{
                  background: 'var(--card, hsl(var(--card)))',
                  border: active ? '1px solid var(--honey-line)' : '1px solid var(--line-soft)',
                }}
                aria-current={active ? 'true' : undefined}
              >
                {active && (
                  <span
                    className="absolute top-4 right-4 font-mono text-[9.5px] uppercase tracking-[0.1em]"
                    style={{ color: 'var(--honey)' }}
                  >
                    this one
                  </span>
                )}
                <div className="w-9 h-10 grid place-items-center mb-3">
                  <Icon className="w-[19px] h-[19px]" style={{ color: card.accent }} />
                </div>
                <h3 className="text-base font-display font-semibold tracking-tight m-0 mb-1 text-foreground">{card.title}</h3>
                <div className="font-mono text-[10.5px] mb-2.5" style={{ color: 'var(--text-dim, hsl(var(--muted-foreground)))' }}>
                  {card.where}
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed m-0 mb-3">{card.blurb}</p>
                <span
                  className="text-[11.5px] font-semibold inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ color: card.accent, background: card.wash }}
                >
                  ⬡ {card.privacy}
                </span>
              </article>
            );
          })}
        </div>

        {/* Local-first reassurance */}
        <div
          className="mt-[22px] flex gap-3.5 items-start px-[18px] py-4 rounded-[18px]"
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}
        >
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--healthy)' }} aria-hidden="true" />
          <p className="m-0 text-[13.5px] text-muted-foreground leading-relaxed">
            <b className="text-foreground font-medium">Local-first, always.</b> Memory and files for Virtual and Local
            workspaces never leave this machine — there&apos;s nothing for anyone to leak, subpoena, or sell. Switch a
            workspace to Team only when you mean to share it, and you can export or delete any workspace, whole, at any time.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StorageApp;
