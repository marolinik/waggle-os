/**
 * WorkspaceRail — Phase B.1 of the Killer Story plan.
 *
 * The left-rail in the Files app: one entry per workspace, clickable to
 * switch the file view without leaving the app. Active workspace is
 * highlighted. Drag target support lets users drop files from one
 * workspace onto another to trigger a cross-workspace copy.
 *
 * This rail is purely presentational — ownership of the "active files
 * workspace" state lives in Desktop so Chat and other surfaces can stay
 * on a different workspace while the user browses files elsewhere.
 */

import { useState } from 'react';
import { HardDrive, Folder, FolderOpen, Cloud, Users } from 'lucide-react';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import type { Workspace } from '@/lib/types';

interface WorkspaceRailProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelect: (workspaceId: string) => void;
  /** Called when a file is dropped on a workspace row (cross-workspace copy). */
  onDropFiles?: (targetWorkspaceId: string) => void;
}

function storageIcon(storageType?: string) {
  if (storageType === 'team' || storageType === 'remote') return Cloud;
  if (storageType === 'local') return HardDrive;
  return Folder;
}

const WorkspaceRail = ({ workspaces, activeWorkspaceId, onSelect, onDropFiles }: WorkspaceRailProps) => {
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragEnter = (id: string) => (e: React.DragEvent) => {
    if (id === activeWorkspaceId) return; // can't drop on the source workspace
    e.preventDefault();
    setDropTarget(id);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = () => setDropTarget(null);
  const handleDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    if (id !== activeWorkspaceId && onDropFiles) onDropFiles(id);
  };

  return (
    <div className="w-52 flex flex-col border-r border-border/30 bg-secondary/20 shrink-0">
      <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
          Workspaces
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground/60">{workspaces.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {workspaces.map(ws => {
          const Icon = ws.id === activeWorkspaceId ? FolderOpen : storageIcon(ws.storageType);
          const isActive = ws.id === activeWorkspaceId;
          const isDropTarget = dropTarget === ws.id;
          return (
            <HintTooltip key={ws.id} content={ws.name} side="right">
              <button
                onClick={() => onSelect(ws.id)}
                onDragEnter={handleDragEnter(ws.id)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop(ws.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-l-2 ${
                  isActive
                    ? 'bg-primary/15 border-primary text-foreground'
                    : isDropTarget
                    ? 'bg-primary/20 border-primary/60 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                <span className="text-xs truncate flex-1">{ws.name}</span>
                {ws.storageType === 'team' && (
                  <span className="text-[10px] text-emerald-400 uppercase tracking-wide font-display">team</span>
                )}
              </button>
            </HintTooltip>
          );
        })}
        {workspaces.length === 0 && (
          <div className="px-3 py-6 text-center">
            <Folder className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">No workspaces yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceRail;
