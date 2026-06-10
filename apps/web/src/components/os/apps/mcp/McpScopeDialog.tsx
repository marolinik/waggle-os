/**
 * McpScopeDialog — C19 scope picker (UX-Refactor Phase 4B, S08). v1 model:
 * an MCP server is either personal (every workspace) or pinned to ONE
 * workspaceId — PATCH /api/mcps/:id/permissions accepts exactly
 * `{ workspaceId }` or `{ scope: 'personal' }` (N:N mcpIds[] deferred).
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface McpScopeDialogProps {
  /** Server being scoped (null = closed). */
  serverId: string | null;
  currentWorkspaceId?: string;
  busy?: boolean;
  onSubmit: (payload: { scope: 'personal' } | { workspaceId: string }) => void;
  onClose: () => void;
}

const McpScopeDialog = ({ serverId, currentWorkspaceId, busy, onSubmit, onClose }: McpScopeDialogProps) => {
  const [mode, setMode] = useState<'personal' | 'workspace'>(currentWorkspaceId ? 'workspace' : 'personal');
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId ?? '');
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const trapRef = useFocusTrap<HTMLDivElement>(!!serverId, onClose);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!serverId || loadedRef.current) return;
    loadedRef.current = true;
    adapter.getWorkspaces()
      .then(ws => setWorkspaces(ws.map(w => ({ id: w.id, name: w.name }))))
      .catch(() => setWorkspaces([]));
  }, [serverId]);

  useEffect(() => {
    // Re-sync when the dialog re-opens for a different server.
    setMode(currentWorkspaceId ? 'workspace' : 'personal');
    setWorkspaceId(currentWorkspaceId ?? '');
  }, [serverId, currentWorkspaceId]);

  if (!serverId) return null;

  const canSubmit = mode === 'personal' || workspaceId.length > 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Scope MCP server ${serverId}`}
        data-testid="mcp-scope-dialog"
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-display font-semibold text-foreground">Scope: {serverId}</h3>
          <button type="button" onClick={onClose} aria-label="Close scope dialog" className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Personal servers are available in every workspace. Workspace-scoped servers expose their tools
          only inside the chosen workspace (single-workspace scoping in v1).
        </p>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="radio" name="mcp-scope" checked={mode === 'personal'} onChange={() => setMode('personal')} className="accent-primary" />
            Personal — all workspaces
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="radio" name="mcp-scope" checked={mode === 'workspace'} onChange={() => setMode('workspace')} className="accent-primary" />
            Pin to one workspace
          </label>
          {mode === 'workspace' && (
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              aria-label="Target workspace"
              className="w-full text-xs bg-muted/50 border border-border/40 rounded-md px-2 py-1.5 text-foreground"
            >
              <option value="">Select a workspace…</option>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            data-testid="mcp-scope-save"
            onClick={() => onSubmit(mode === 'personal' ? { scope: 'personal' } : { workspaceId })}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors font-display"
          >
            Save scope
          </button>
        </div>
      </div>
    </div>
  );
};

export default McpScopeDialog;
