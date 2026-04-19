/**
 * FilesAppTabs — P16 three-tab layout wrapper around FilesApp.
 *
 * Adds a "Virtual | Local | Team" tab strip above the existing FilesApp
 * shell. Each tab remounts FilesApp with a different `storageType`; the
 * remount intentionally resets per-storage navigation state (currentPath,
 * selection, preview) so flipping back to Virtual doesn't carry a local
 * absolute path through.
 *
 * All FilesApp props pass through unchanged except `storageType`, which
 * becomes the tab state instead of a caller-provided default.
 */
import { useState } from 'react';
import type { StorageType, Workspace } from '@/lib/types';
import { STORAGE_LABELS } from './files/file-utils';
import { FILES_TAB_ORDER, initialTabFor } from './files/files-tabs';
import FilesApp from './FilesApp';

interface FilesAppTabsProps {
  workspaceId: string;
  workspaceName?: string;
  /**
   * The workspace's configured default storageType. Used to pick which
   * tab opens first; the user can switch freely from there.
   */
  defaultStorageType?: StorageType;
  workspaces?: Workspace[];
  onSelectWorkspace?: (workspaceId: string) => void;
  onContextRail?: (target: { type: 'file'; id: string; label: string }) => void;
}

const FilesAppTabs = ({
  workspaceId,
  workspaceName,
  defaultStorageType,
  workspaces,
  onSelectWorkspace,
  onContextRail,
}: FilesAppTabsProps) => {
  const [activeTab, setActiveTab] = useState<StorageType>(() =>
    initialTabFor(defaultStorageType),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Storage location"
        className="flex items-center gap-1 px-2 pt-2 border-b border-border/20 shrink-0"
      >
        {FILES_TAB_ORDER.map(tab => {
          const meta = STORAGE_LABELS[tab];
          const Icon = meta.icon;
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`files-tab-panel-${tab}`}
              data-testid={`files-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-t-md border border-b-0 transition-colors ${
                active
                  ? `bg-background ${meta.color} border-border/40`
                  : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/20'
              }`}
            >
              <Icon className="w-3 h-3" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Active panel — key-based remount resets per-tab FilesApp state */}
      <div
        id={`files-tab-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`files-tab-${activeTab}`}
        className="flex-1 min-h-0"
      >
        <FilesApp
          key={`${workspaceId}:${activeTab}`}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          storageType={activeTab}
          workspaces={workspaces}
          onSelectWorkspace={onSelectWorkspace}
          onContextRail={onContextRail}
        />
      </div>
    </div>
  );
};

export default FilesAppTabs;
