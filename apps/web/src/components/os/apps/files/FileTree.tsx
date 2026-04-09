/**
 * FileTree — Sidebar tree view showing directory structure.
 * Extracted from FilesApp.tsx.
 */

import { Folder, ChevronRight, ChevronDown, Home } from 'lucide-react';
import type { FileEntry, StorageType } from '@/lib/types';
import { STORAGE_LABELS } from './file-utils';

interface FileTreeProps {
  readonly treeDirs: readonly FileEntry[];
  readonly currentPath: string;
  readonly workspaceName?: string;
  readonly storageType: StorageType;
  readonly onNavigate: (path: string) => void;
}

const FileTree = ({ treeDirs, currentPath, workspaceName, storageType, onNavigate }: FileTreeProps) => {
  const storageMeta = STORAGE_LABELS[storageType];

  return (
    <div className="w-48 border-r border-border/30 flex flex-col">
      <div className="p-2 border-b border-border/20">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <storageMeta.icon className={`w-3.5 h-3.5 ${storageMeta.color}`} />
          <span className="text-[11px] font-display text-muted-foreground">{storageMeta.label} Storage</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-1">
        <button
          onClick={() => onNavigate('/')}
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${
            currentPath === '/' ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted/50'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          <span className="truncate">{workspaceName || 'Root'}</span>
        </button>
        {treeDirs.map(dir => (
          <button
            key={dir.path}
            onClick={() => onNavigate(dir.path)}
            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ml-2 ${
              currentPath === dir.path ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted/50'
            }`}
          >
            {currentPath === dir.path ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">{dir.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default FileTree;
