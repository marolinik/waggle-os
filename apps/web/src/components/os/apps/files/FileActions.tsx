/**
 * FileActions — Toolbar with navigation, search, upload, view mode, and keyboard shortcuts.
 * Extracted from FilesApp.tsx.
 */

import type { RefObject } from 'react';
import {
  ArrowLeft, RefreshCw, ChevronRight, Search, X,
  FolderPlus, Upload, List, Grid3X3, Info,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import type { StorageType } from '@/lib/types';
import { STORAGE_LABELS } from './file-utils';

interface Breadcrumb {
  readonly label: string;
  readonly path: string;
}

interface FileActionsProps {
  readonly currentPath: string;
  readonly storageType: StorageType;
  readonly breadcrumbs: readonly Breadcrumb[];
  readonly viewMode: 'grid' | 'list';
  readonly loading: boolean;
  readonly showSearch: boolean;
  readonly searchQuery: string;
  readonly onGoUp: () => void;
  readonly onRefresh: () => void;
  readonly onNavigate: (path: string) => void;
  readonly onSetViewMode: (mode: 'grid' | 'list') => void;
  readonly onSetShowSearch: (show: boolean) => void;
  readonly onSetSearchQuery: (query: string) => void;
  readonly onCreateFolder: () => void;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onBreadcrumbDragOver: (e: React.DragEvent, crumbPath: string) => void;
  readonly onBreadcrumbDragLeave: () => void;
  readonly onBreadcrumbDrop: (e: React.DragEvent, crumbPath: string) => void;
  readonly breadcrumbDropTarget: string | null;
}

const KEYBOARD_SHORTCUTS = [
  ['Ctrl+A', 'Select all'],
  ['Delete', 'Delete selected'],
  ['Ctrl+C', 'Copy'],
  ['Ctrl+X', 'Cut'],
  ['Ctrl+V', 'Paste'],
  ['Ctrl+D', 'Download'],
  ['F2', 'Rename'],
  ['Enter', 'Open'],
  ['Esc', 'Clear selection'],
] as const;

const FileActions = ({
  currentPath,
  storageType,
  breadcrumbs,
  viewMode,
  loading,
  showSearch,
  searchQuery,
  onGoUp,
  onRefresh,
  onNavigate,
  onSetViewMode,
  onSetShowSearch,
  onSetSearchQuery,
  onCreateFolder,
  fileInputRef,
  onBreadcrumbDragOver,
  onBreadcrumbDragLeave,
  onBreadcrumbDrop,
  breadcrumbDropTarget,
}: FileActionsProps) => {
  const meta = STORAGE_LABELS[storageType];
  const StorageIcon = meta.icon;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30">
      <button onClick={onGoUp} disabled={currentPath === '/'} className="p-1 rounded hover:bg-muted/50 disabled:opacity-30">
        <ArrowLeft className="w-3.5 h-3.5" />
      </button>
      <button onClick={onRefresh} className={`p-1 rounded hover:bg-muted/50 ${loading ? 'animate-spin' : ''}`}>
        <RefreshCw className="w-3.5 h-3.5" />
      </button>

      {/* Storage type badge */}
      <span
        className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${meta.color}`}
        style={{ backgroundColor: 'var(--hive-800)', border: '1px solid var(--hive-700)' }}
      >
        <StorageIcon className="w-2.5 h-2.5" />{meta.label}
      </span>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-0.5 ml-1 flex-1 min-w-0 overflow-hidden">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-0.5">
            {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
            <button
              onClick={() => onNavigate(crumb.path)}
              onDragOver={e => onBreadcrumbDragOver(e, crumb.path)}
              onDragLeave={onBreadcrumbDragLeave}
              onDrop={e => onBreadcrumbDrop(e, crumb.path)}
              className={`text-[11px] transition-colors truncate max-w-[100px] px-1.5 py-0.5 rounded-md ${
                breadcrumbDropTarget === crumb.path
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        {showSearch ? (
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-2 py-0.5">
            <Search className="w-3 h-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => onSetSearchQuery(e.target.value)}
              placeholder="Filter..."
              className="bg-transparent text-xs w-24 h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            <button onClick={() => { onSetShowSearch(false); onSetSearchQuery(''); }}>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <button onClick={() => onSetShowSearch(true)} className="p-1 rounded hover:bg-muted/50">
            <Search className="w-3.5 h-3.5" />
          </button>
        )}
        <HintTooltip content="New Folder">
          <button onClick={onCreateFolder} className="p-1 rounded hover:bg-muted/50">
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </HintTooltip>
        <HintTooltip content="Upload">
          <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-muted/50">
            <Upload className="w-3.5 h-3.5" />
          </button>
        </HintTooltip>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => {
          const target = e.target as HTMLInputElement;
          if (target.files) {
            // Trigger upload via a custom event; the parent handles the actual upload
            const event = new CustomEvent('files-upload', { detail: target.files });
            target.dispatchEvent(event);
          }
        }} />
        <div className="w-px h-4 bg-border/30 mx-0.5" />
        <button onClick={() => onSetViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'}`}>
          <List className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onSetViewMode('grid')} className={`p-1 rounded ${viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted/50'}`}>
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border/30 mx-0.5" />
        <div className="relative group">
          <button className="p-1 rounded hover:bg-muted/50" aria-label="Keyboard Shortcuts">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border/40 bg-popover p-3 text-popover-foreground shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Keyboard Shortcuts</p>
            {KEYBOARD_SHORTCUTS.map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-0.5">
                <span className="text-[11px] text-foreground/80">{desc}</span>
                <kbd className="text-[11px] font-mono bg-muted text-muted-foreground rounded px-1.5 py-0.5">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileActions;
