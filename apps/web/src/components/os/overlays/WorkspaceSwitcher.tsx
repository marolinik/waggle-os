import { useState } from 'react';
import { Brain, ChevronRight, Plus, Archive } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById } from '@/lib/personas';
import type { Workspace } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import WorkspaceActionsMenu from '../WorkspaceActionsMenu';

interface WorkspaceSwitcherProps {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelect: (id: string) => void;
  /** G1 (UX-Northstar 2026-06-13): create from the switcher itself. */
  onCreateNew?: () => void;
  /** P1b D3: load failure — an errored empty list must not read as "No workspaces". */
  error?: string | null;
  onRetry?: () => void;
}

// Mirrors the LoginBriefing filter — workspace names matching these patterns
// are E2E/test artefacts that leaked into the real store. Filtered defensively
// at the UI surface so they don't pollute the switcher.
const TEST_WORKSPACE_PATTERNS: ReadonlyArray<RegExp> = [
  /^E2E-Audit-\d+$/,
  /^test-/i,
  /^smoke-/i,
  /^audit-/i,
];

function WorkspaceRow({ ws, isActive, onSelect }: {
  ws: Workspace;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const persona = ws.persona ? getPersonaById(ws.persona) : null;
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
          <span className="text-[11px] text-muted-foreground">{ws.group}</span>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>
      <WorkspaceActionsMenu
        workspace={{ id: ws.id, name: ws.name, status: ws.status }}
        buttonClassName="mr-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
      />
    </div>
  );
}

const WorkspaceSwitcher = ({ open, onClose, workspaces, activeWorkspaceId, onSelect, onCreateNew, error, onRetry }: WorkspaceSwitcherProps) => {
  const [showArchived, setShowArchived] = useState(false);
  if (!open) return null;

  const visibleWorkspaces = workspaces.filter(
    ws => ws.id === activeWorkspaceId || !TEST_WORKSPACE_PATTERNS.some(p => p.test(ws.name)),
  );
  const activeList = visibleWorkspaces.filter(ws => ws.status !== 'archived');
  const archivedList = visibleWorkspaces.filter(ws => ws.status === 'archived');

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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-5"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-display font-semibold text-foreground mb-1">Switch Workspace</h2>
          <p className="text-[11px] text-muted-foreground mb-3">
            One workspace per project or area — each remembers its own work.
          </p>
          <div className="space-y-1 max-h-64 overflow-auto">
            {activeList.map(ws => (
              <WorkspaceRow
                key={ws.id}
                ws={ws}
                isActive={ws.id === activeWorkspaceId}
                onSelect={(id) => { onSelect(id); onClose(); }}
              />
            ))}
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
