/**
 * FilePreview — main file preview panel component.
 *
 * Shows in the right panel when agent reads/writes files.
 * Displays code files, images, or diffs depending on content.
 * Includes file history sidebar for recent files accessed in the session.
 */

import type { FileEntry, DiffEntry } from './utils.js';
import { getFileIcon, getLanguageFromExtension, truncateFilePath } from './utils.js';
import { CodePreview } from './CodePreview.js';
import { DiffViewer } from './DiffViewer.js';
import { ImagePreview } from './ImagePreview.js';

export interface FilePreviewProps {
  file?: FileEntry;
  diff?: DiffEntry;
  recentFiles?: FileEntry[];
  onOpenInApp?: (path: string) => void;
  onCopyPath?: (path: string) => void;
  onSaveAs?: (path: string) => void;
  onSelectFile?: (file: FileEntry) => void;
}

const ACTION_COLORS = {
  read: 'text-primary',
  write: 'text-green-400',
  edit: 'text-yellow-400',
} as const;

const ACTION_LABELS = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
} as const;

export function FilePreview({
  file,
  diff,
  recentFiles = [],
  onOpenInApp,
  onCopyPath,
  onSaveAs,
  onSelectFile,
}: FilePreviewProps) {
  // Nothing selected
  if (!file && !diff) {
    return (
      <div className="file-preview flex items-center justify-center h-full text-muted-foreground text-sm">
        No file selected
      </div>
    );
  }

  const activePath = diff?.path ?? file?.path ?? '';
  const activeName = diff?.name ?? file?.name ?? '';

  return (
    <div className="file-preview flex flex-col h-full bg-card">
      {/* Header */}
      <div className="file-preview__header flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">{getFileIcon(file?.extension ?? '')}</span>
        <span className="text-sm text-foreground font-medium truncate" title={activePath}>
          {activeName}
        </span>
        {file && (
          <span className={`text-xs ${ACTION_COLORS[file.action]}`}>
            {ACTION_LABELS[file.action]}
          </span>
        )}

        {/* Actions */}
        <div className="ml-auto flex gap-1">
          {onOpenInApp && (
            <button
              className="file-preview__action text-xs text-muted-foreground hover:text-primary-foreground px-1.5 py-0.5 rounded hover:bg-secondary"
              onClick={() => onOpenInApp(activePath)}
              title="Open in default app"
              type="button"
            >
              Open
            </button>
          )}
          {onCopyPath && (
            <button
              className="file-preview__action text-xs text-muted-foreground hover:text-primary-foreground px-1.5 py-0.5 rounded hover:bg-secondary"
              onClick={() => onCopyPath(activePath)}
              title="Copy file path"
              type="button"
            >
              Copy Path
            </button>
          )}
          {onSaveAs && (
            <button
              className="file-preview__action text-xs text-muted-foreground hover:text-primary-foreground px-1.5 py-0.5 rounded hover:bg-secondary"
              onClick={() => onSaveAs(activePath)}
              title="Save as..."
              type="button"
            >
              Save As
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="file-preview__content flex-1 overflow-auto">
        {diff ? (
          <DiffViewer diff={diff} />
        ) : file?.isImage && file.imageUrl ? (
          <ImagePreview src={file.imageUrl} alt={file.name} />
        ) : file?.content != null ? (
          <CodePreview
            content={file.content}
            language={file.language ?? getLanguageFromExtension(file.extension)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No preview available
          </div>
        )}
      </div>

      {/* Recent files sidebar */}
      {recentFiles.length > 0 && (
        <div className="file-preview__history border-t border-border">
          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">Recent Files</div>
          <div className="max-h-32 overflow-y-auto">
            {recentFiles.map((f, i) => (
              <button
                key={`${f.path}-${f.timestamp}-${i}`}
                className={`file-preview__history-item w-full text-left flex items-center gap-2 px-3 py-1 text-xs hover:bg-card ${
                  f.path === activePath ? 'bg-card text-primary-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => onSelectFile?.(f)}
                type="button"
              >
                <span className={ACTION_COLORS[f.action]}>{ACTION_LABELS[f.action]}</span>
                <span className="truncate" title={f.path}>
                  {truncateFilePath(f.path, 40)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
