import { useState } from 'react';
import { Brain, ChevronRight, Plus, Archive, Check } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById } from '@/lib/personas';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { Workspace } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import WorkspaceActionsMenu from '../WorkspaceActionsMenu';
import { isDevNoiseWorkspace, compareWorkspaceRecency, workspaceCounts } from '@/lib/workspace-counts';

interface WorkspaceSwitcherProps {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelect: (id: string) => void;
  /** G1 (UX-Northstar 2026-06-13): create from the switcher itself. */
  onCreateNew?: () => void;
  /** W2B: jump to the full workspace shelf when the switcher is capped. */
  onViewAll?: () => void;
  /** P1b D3: load failure — an errored empty list must not read as "No workspaces". */
  error?: string | null;
  onRetry?: () => void;
}

// W2B: cap the un-searchable switcher list so the ~55-row store doesn't flood a
// 256px scrollbox; the rest is one click away via "view all".
const MAX_SWITCHER_ROWS = 12;

/** Compact relative time — disambiguates same-named workspaces (issue 2b). */
function relativeTime(iso?: string): string | null {
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
  return `${Math.round(days / 7)}w ago`;
}

function WorkspaceRow({ ws, isActive, isDuplicateName, onSelect }: {
  ws: Workspace;
  isActive: boolean;
  /** True when another visible workspace shares this name — show a date subtitle. */
  isDuplicateName: boolean;
  onSelect: (id: string) => void;
}) {
  const persona = ws.persona ? getPersonaById(ws.persona) : null;
  // On a name collision, append last-active so two "Research Hub"s differ.
  const rel = isDuplicateName ? relativeTime(ws.lastActive ?? ws.updatedAt) : null;
  // Never render an empty subtitle row: prefer "group · rel", fall back to whichever exists.
  const subtitle = rel ? (ws.group ? `${ws.group} · ${rel}` : rel) : (ws.group || null);
  return (
    <div
      className={`group flex items-center gap-1 rounded-xl transition-all ${
        isActive
          ? 'bg-primary/20 border border-primary/50'
          : 'bg-secondary/20 border border-transparent hover:bg-secondary/40'
      }`}
    >
      <button
        onClick={() => onSelect(ws.id)}
        className="flex-1 min-w-0 flex items-center gap-3 p-2.5 text-left"
      >
        {persona ? (
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarImage src={persona.avatar} />
            <AvatarFallback className="text-[11px] bg-primary/20">{persona.name[0]}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Brain className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-display font-medium text-foreground truncate block">{ws.name}</span>
          {subtitle && <span className="text-[11px] text-muted-foreground truncate block">{subtitle}</span>}
        </div>
        {isActive
          ? <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Current workspace" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>
      <WorkspaceActionsMenu
        workspace={{ id: ws.id, name: ws.name, status: ws.status }}
        buttonClassName="mr-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
      />
    </div>
  );
}

const WorkspaceSwitcher = ({ open, onClose, workspaces, activeWorkspaceId, onSelect, onCreateNew, onViewAll, error, onRetry }: WorkspaceSwitcherProps) => {
  const [showArchived, setShowArchived] = useState(false);
  // A11y (WCAG 2.1.1/2.4.3): Escape closes, Tab is trapped within the dialog,
  // focus moves in on open and restores on close — the same shared hook the
  // other modal overlays use. Replaces the prior Escape-only handler (which
  // had no focus trap or restore, so keyboard users tabbed out into the shell).
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);

  if (!open) return null;

  const visibleWorkspaces = workspaces.filter(
    ws => ws.id === activeWorkspaceId || !isDevNoiseWorkspace(ws.name),
  );
  // W2B: recency-sorted (most recent first, missing timestamps last), then
  // capped so the un-searchable list can't flood the scrollbox.
  const activeListFull = visibleWorkspaces
    .filter(ws => ws.status !== 'archived')
    .sort(compareWorkspaceRecency);
  const activeList = activeListFull.slice(0, MAX_SWITCHER_ROWS);
  const hiddenCount = activeListFull.length - activeList.length;
  const totalCount = workspaceCounts(workspaces).total;
  const archivedList = visibleWorkspaces.filter(ws => ws.status === 'archived');

  // Names shared by more than one visible workspace — those rows get a date
  // subtitle so they're tellable apart (issue 2b).
  const nameCounts = new Map<string, number>();
  for (const ws of visibleWorkspaces) {
    const k = ws.name.trim().toLowerCase();
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  const isDup = (ws: Workspace) => (nameCounts.get(ws.name.trim().toLowerCase()) ?? 0) > 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-switcher-title"
          tabIndex={-1}
          className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-5 focus:outline-none"
          onClick={e => e.stopPropagation()}
        >
          <h2 id="workspace-switcher-title" className="text-sm font-display font-semibold text-foreground mb-1">Switch Workspace</h2>
          <p className="text-[11px] text-muted-foreground mb-3">
            One workspace per project or area — each remembers its own work.
          </p>
          <div className="space-y-1 max-h-64 overflow-auto">
            {activeList.map(ws => (
              <WorkspaceRow
                key={ws.id}
                ws={ws}
                isActive={ws.id === activeWorkspaceId}
                isDuplicateName={isDup(ws)}
                onSelect={(id) => { onSelect(id); onClose(); }}
              />
            ))}
            {hiddenCount > 0 && (
              <button
                onClick={() => { onViewAll?.(); onClose(); }}
                data-testid="workspace-switcher-overflow"
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Showing {activeList.length} of {totalCount} — view all
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {visibleWorkspaces.length === 0 && (
              error ? (
                <div className="text-center py-4 space-y-2" data-testid="workspace-switcher-error">
                  <p className="text-xs text-muted-foreground">Couldn’t load workspaces — retrying when the connection is back.</p>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="px-3 py-1 text-xs rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 transition-colors"
                    >
                      Retry now
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No workspaces</p>
              )
            )}
            {archivedList.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowArchived(v => !v)}
                  data-testid="workspace-switcher-archived-toggle"
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Archive className="w-3 h-3" />
                  Archived ({archivedList.length})
                  <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${showArchived ? 'rotate-90' : ''}`} />
                </button>
                {showArchived && archivedList.map(ws => (
                  <WorkspaceRow
                    key={ws.id}
                    ws={ws}
                    isActive={ws.id === activeWorkspaceId}
                    isDuplicateName={isDup(ws)}
                    onSelect={(id) => { onSelect(id); onClose(); }}
                  />
                ))}
              </div>
            )}
          </div>
          {onCreateNew && (
            <button
              onClick={() => { onCreateNew(); onClose(); }}
              data-testid="workspace-switcher-create"
              className="w-full flex items-center justify-center gap-2 mt-3 px-3 py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New workspace
            </button>
          )}
          <p className="text-[11px] text-muted-foreground mt-3 text-center">Ctrl+Tab to toggle</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WorkspaceSwitcher;
