/**
 * WorkspaceActionsMenu — the single management surface for a workspace
 * (UX-Northstar 2026-06-13 G1). Kebab trigger → ContextMenu with:
 *   Rename · Archive/Restore · Export summary · Delete…
 *
 * Mounted wherever a workspace is shown (Home cards, WorkspaceSwitcher rows,
 * Workspace Desktop header). Mutations go through ShellContext so the
 * canonical workspace list stays in sync; hosts with their own server-fed
 * views (Home briefing) refresh via `onChanged`.
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Download, Trash2 } from 'lucide-react';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { useShell } from '@/providers/ShellContext';
import { useToast } from '@/hooks/use-toast';
import { adapter } from '@/lib/adapter';

export type WorkspaceAction = 'rename' | 'archive' | 'restore' | 'delete' | 'export';

interface WorkspaceActionsMenuProps {
  workspace: { id: string; name: string; status?: 'active' | 'paused' | 'archived' };
  /** Host-local refresh (e.g. Home briefing reload, Desktop context reload). */
  onChanged?: (action: WorkspaceAction) => void;
  /** Extra classes for the kebab trigger button. */
  buttonClassName?: string;
}

function downloadMarkdown(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const WorkspaceActionsMenu = ({ workspace, onChanged, buttonClassName }: WorkspaceActionsMenuProps) => {
  const { patchWorkspace, deleteWorkspace } = useShell();
  const { toast } = useToast();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const isArchived = workspace.status === 'archived';

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = triggerRef.current?.getBoundingClientRect();
    setMenuPos(rect ? { x: rect.left, y: rect.bottom + 4 } : { x: e.clientX, y: e.clientY });
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (!name || name === workspace.name) { setRenameOpen(false); return; }
    setBusy(true);
    const ok = await patchWorkspace(workspace.id, { name });
    setBusy(false);
    setRenameOpen(false);
    if (ok) {
      toast({ title: `Renamed to "${name}"` });
      onChanged?.('rename');
    } else {
      toast({ title: 'Couldn’t rename workspace', description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const handleArchiveToggle = async () => {
    const next = isArchived ? 'active' : 'archived';
    const ok = await patchWorkspace(workspace.id, { status: next });
    if (ok) {
      toast({
        title: isArchived ? `"${workspace.name}" is back` : `"${workspace.name}" archived`,
        description: isArchived
          ? 'It will show up in your lists again.'
          : 'Its memory is kept safe. Restore it anytime from the workspace switcher.',
      });
      onChanged?.(isArchived ? 'restore' : 'archive');
    } else {
      toast({ title: `Couldn’t ${isArchived ? 'restore' : 'archive'} workspace`, description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await adapter.exportWorkspaceBriefing(workspace.id);
      downloadMarkdown(blob, `${workspace.name.replace(/[^\w-]+/g, '-')}-summary.md`);
      toast({ title: 'Summary downloaded' });
      onChanged?.('export');
    } catch {
      toast({ title: 'Couldn’t export summary', description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const openDeleteDialog = () => {
    setDeleteConfirm('');
    setMemoryCount(null);
    setDeleteOpen(true);
    // Best-effort: show what's at stake. The dialog works without it.
    adapter.getWorkspaceContext(workspace.id)
      .then(ctx => setMemoryCount(ctx.stats?.memoryCount ?? null))
      .catch(() => {});
  };

  const handleDelete = async () => {
    setBusy(true);
    const ok = await deleteWorkspace(workspace.id);
    setBusy(false);
    setDeleteOpen(false);
    if (ok) {
      toast({ title: `"${workspace.name}" deleted` });
      onChanged?.('delete');
    } else {
      toast({ title: 'Couldn’t delete workspace', description: 'Nothing was removed. Check your connection and try again.', variant: 'destructive' });
    }
  };

  const items: ContextMenuItem[] = [
    {
      label: 'Rename',
      icon: <Pencil className="w-3.5 h-3.5" />,
      onClick: () => { setRenameValue(workspace.name); setRenameOpen(true); },
    },
    {
      label: isArchived ? 'Restore' : 'Archive',
      icon: isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />,
      onClick: () => { void handleArchiveToggle(); },
    },
    {
      label: 'Export summary',
      icon: <Download className="w-3.5 h-3.5" />,
      onClick: () => { void handleExport(); },
    },
    { label: '', onClick: () => {}, separator: true },
    {
      label: 'Delete…',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      danger: true,
      onClick: openDeleteDialog,
    },
  ];

  const deleteMatches = deleteConfirm.trim() === workspace.name;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openMenu}
        aria-label={`Workspace actions for ${workspace.name}`}
        data-testid="workspace-actions-trigger"
        className={`p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ${buttonClassName ?? ''}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Portal: hosts include transformed ancestors (the switcher modal's
          framer-motion scale), which turn position:fixed into position-
          relative-to-ancestor — the menu/dialogs must escape to the body
          (same fix class as the dock-tray portal, 0de190f). */}
      {createPortal(<>
      {menuPos && (
        // Wave W Lane B (item 2): the menu opens at the kebab's bottom-left, so it
        // scales in from its top-left corner (roomier "comfortable" density too).
        // Escape-returns-focus is preserved — ContextMenu never steals focus from
        // the trigger, so closing lands it back on the kebab.
        <ContextMenu items={items} position={menuPos} onClose={() => setMenuPos(null)} origin="top left" />
      )}

      {renameOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={() => setRenameOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-display font-semibold text-foreground mb-3">Rename workspace</h2>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') setRenameOpen(false); }}
              data-testid="workspace-rename-input"
              className="w-full px-3 py-2 rounded-xl bg-secondary/30 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRenameOpen(false)} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => void handleRename()}
                disabled={busy || !renameValue.trim()}
                data-testid="workspace-rename-save"
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={() => setDeleteOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-display font-semibold text-foreground mb-2">Delete "{workspace.name}"?</h2>
            <p className="text-xs text-muted-foreground mb-3">
              This permanently deletes the workspace and everything it remembers —{' '}
              {memoryCount != null && memoryCount > 0 ? `${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}, ` : 'its memories, '}
              chats, and files. This can&rsquo;t be undone.
              {!isArchived && ' If you just want it out of the way, Archive keeps the memory safe.'}
            </p>
            <label className="block text-xs text-muted-foreground mb-1">
              Type <span className="font-medium text-foreground">{workspace.name}</span> to confirm
            </label>
            <input
              autoFocus
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && deleteMatches) void handleDelete(); if (e.key === 'Escape') setDeleteOpen(false); }}
              data-testid="workspace-delete-confirm-input"
              className="w-full px-3 py-2 rounded-xl bg-secondary/30 border border-border text-sm text-foreground focus:outline-none focus:border-destructive/50"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteOpen(false)} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={busy || !deleteMatches}
                data-testid="workspace-delete-confirm-button"
                className="px-3 py-1.5 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
      </>, document.body)}
    </>
  );
};

export default WorkspaceActionsMenu;
