/**
 * StorageAndFilesApp — screen 07 unified A/B shell.
 *
 * One screen, two views behind a segmented toggle (storage.html:97-100):
 *   • A · Where it lives — the storage map (StorageApp): on-disk tree +
 *     storage-type cards + local-first reassurance.
 *   • B · Files — the classic browser (the existing FilesAppTabs, unchanged).
 *
 * D10 correction (recon): the FilesAppTabs storage-type tabs (Virtual / Local /
 * Team) are a DIFFERENT axis from the A/B variation toggle — they live INSIDE
 * Variation B and coexist with it, they do not conflate. This wrapper adds the
 * A/B layer on top and passes every FilesApp prop through to B verbatim, so all
 * existing file-manager behaviour (rail, deep-link, context-rail) is preserved.
 *
 * Source fidelity: docs/design_handoff_waggle_app/design-files/screens/storage.html
 */
import { useState } from 'react';
import { MapPin, FolderTree } from 'lucide-react';
import type { StorageType, Workspace } from '@/lib/types';
import FilesAppTabs from './FilesAppTabs';
import StorageApp from './StorageApp';

interface StorageAndFilesAppProps {
  workspaceId: string;
  workspaceName?: string;
  /** Forwarded to FilesAppTabs to pick the initial storage-type tab in B. */
  defaultStorageType?: StorageType;
  /** The full workspace record — feeds Variation A's live location card. */
  workspace?: Workspace;
  workspaces?: Workspace[];
  onSelectWorkspace?: (workspaceId: string) => void;
  onContextRail?: (target: { type: 'file'; id: string; label: string }) => void;
}

type Variation = 'a' | 'b';

const VARIATIONS: ReadonlyArray<{ id: Variation; label: string; icon: typeof MapPin }> = [
  { id: 'a', label: 'Where it lives', icon: MapPin },
  { id: 'b', label: 'Files', icon: FolderTree },
];

const VARIATION_HINT: Record<Variation, string> = {
  a: 'the workspace, made legible',
  b: 'a clean browser, with provenance',
};

const StorageAndFilesApp = ({
  workspaceId,
  workspaceName,
  defaultStorageType,
  workspace,
  workspaces,
  onSelectWorkspace,
  onContextRail,
}: StorageAndFilesAppProps) => {
  const [variation, setVariation] = useState<Variation>('a');

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar — A/B segmented toggle + live hint */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border/40 shrink-0">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground hidden sm:inline">
          Storage · view
        </span>
        <div
          role="tablist"
          aria-label="Storage view"
          className="inline-flex gap-[3px] p-[3px] rounded-[10px]"
          style={{ background: 'var(--secondary, hsl(var(--secondary)))', border: '1px solid var(--line-soft)' }}
        >
          {VARIATIONS.map(({ id, label, icon: Icon }) => {
            const active = variation === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`storage-view-${id}`}
                data-testid={`storage-view-${id}`}
                onClick={() => setVariation(id)}
                className={`flex items-center gap-1.5 text-[12.5px] font-display font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  active ? '' : 'text-muted-foreground hover:text-foreground'
                }`}
                style={active ? { background: 'var(--honey)', color: '#1a1407' } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        <span className="text-[12.5px] text-muted-foreground ml-1 hidden md:inline">
          <b className="text-foreground font-semibold">{VARIATIONS.find(v => v.id === variation)?.label}</b>
          {' — '}
          {VARIATION_HINT[variation]}
        </span>
      </div>

      {/* Active view. B mounts always (preserves FilesApp state across toggles);
          A is cheap and remounts. We hide rather than unmount B so a file
          selection / nav state survives a trip to the storage map and back. */}
      <div className="flex-1 min-h-0 relative">
        {variation === 'a' ? (
          <div id="storage-view-a" role="tabpanel" aria-label="Where it lives" className="h-full flex flex-col">
            <StorageApp workspaceId={workspaceId} workspaceName={workspaceName} workspace={workspace} />
          </div>
        ) : (
          <div id="storage-view-b" role="tabpanel" aria-label="Files" className="h-full">
            <FilesAppTabs
              workspaceId={workspaceId}
              workspaceName={workspaceName}
              defaultStorageType={defaultStorageType}
              workspaces={workspaces}
              onSelectWorkspace={onSelectWorkspace}
              onContextRail={onContextRail}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default StorageAndFilesApp;
