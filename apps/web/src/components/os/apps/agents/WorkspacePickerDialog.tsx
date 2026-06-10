import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Workspace } from '@/lib/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * C23 workspace picker (UX-Refactor Phase 3B, S09). Shown when
 * POST /api/agents/:id/run 400s with `workspace_ambiguous` — the agent
 * declares several workspaceIds and none was chosen. Picking one retries
 * the run with that workspaceId.
 *
 * Rendered through a body portal: AppWindow's framer-motion transform makes
 * the window the containing block for position:fixed, so an inline overlay
 * would cover only the window box. useFocusTrap supplies initial focus, Tab
 * trapping, Escape-to-close and focus restore (WCAG 2.1.1 / 2.4.3).
 */
interface WorkspacePickerDialogProps {
  agentName: string;
  workspaceIds: string[];
  workspaces?: Workspace[];
  onPick: (workspaceId: string) => void;
  onCancel: () => void;
}

const WorkspacePickerDialog = ({ agentName, workspaceIds, workspaces, onPick, onCancel }: WorkspacePickerDialogProps) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  const nameOf = (id: string) => workspaces?.find((w) => w.id === id)?.name ?? id;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
      data-testid="agent-workspace-picker-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a workspace to run ${agentName}`}
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        data-testid="agent-workspace-picker"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-display font-semibold text-foreground">Where should “{agentName}” run?</h3>
          <button onClick={onCancel} aria-label="Cancel run" className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          This agent is attached to several workspaces — pick the one this run should target.
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {workspaceIds.map((id) => (
            <button
              key={id}
              onClick={() => onPick(id)}
              className="w-full text-left px-2.5 py-2 rounded-lg border border-border/60 bg-secondary/20 hover:border-primary/40 hover:bg-secondary/40 transition-colors text-xs text-foreground"
            >
              {nameOf(id)}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default WorkspacePickerDialog;
