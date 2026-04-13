/**
 * FilesApp — Layout shell for the file manager.
 * Sub-components: FileTree, FilePreview, FileActions, FileUploadZone.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Folder, Upload, Download,
  Trash2, Copy, Scissors, ClipboardPaste, Edit, FolderPlus, X as XIcon,
  RefreshCw, CheckSquare, XSquare, FolderInput,
  Info, Shield, MapPin, Clock, Hash, Lock, Unlock, FileText, HardDrive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FileEntry, StorageType, Workspace } from '@/lib/types';
import { adapter } from '@/lib/adapter';
import { getFileIcon, formatSize, STORAGE_LABELS } from './files/file-utils';
import { useToast } from '@/hooks/use-toast';

import FileTree from './files/FileTree';
import FilePreview from './files/FilePreview';
import FileActions from './files/FileActions';
import FileUploadZone from './files/FileUploadZone';
import WorkspaceRail from './files/WorkspaceRail';

/* ── Inline version history panel ── */
const VersionHistory = ({ workspaceId, fileName }: { workspaceId: string; fileName: string }) => {
  const [versions, setVersions] = useState<{ version: number; createdAt: string; sizeBytes: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    adapter.getDocumentVersions(workspaceId, fileName).then(v => { setVersions(v); setLoaded(true); }).catch(() => setLoaded(true));
  }, [workspaceId, fileName]);

  if (!loaded || versions.length === 0) return null;

  return (
    <>
      <div className="h-px bg-border/20" />
      <div>
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Version History</h4>
        <div className="space-y-1.5">
          {versions.map(v => (
            <div key={v.version} className="flex items-center justify-between text-xs">
              <span className="text-foreground">v{v.version}</span>
              <span className="text-muted-foreground">{formatSize(v.sizeBytes)}</span>
              <span className="text-muted-foreground/60 text-[11px]">{new Date(v.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

/* ── Helpers ── */
const isPreviewable = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp',
          'md', 'txt', 'log', 'csv', 'json', 'yaml', 'toml', 'xml',
          'js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h',
          'html', 'css', 'sh', 'bash', 'env', 'ini', 'cfg'].includes(ext);
};

const isImageFile = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
};

/* ── Props ── */
interface FilesAppProps {
  workspaceId: string;
  workspaceName?: string;
  storageType?: StorageType;
  /**
   * Phase B.1: when provided, renders a workspace rail on the left and
   * lets the user switch which workspace's files are shown without
   * leaving the Files app. Omit to keep single-workspace mode.
   */
  workspaces?: Workspace[];
  onSelectWorkspace?: (workspaceId: string) => void;
  onContextRail?: (target: { type: 'file'; id: string; label: string }) => void;
}

const FilesApp = ({
  workspaceId,
  workspaceName,
  storageType = 'virtual',
  workspaces,
  onSelectWorkspace,
  onContextRail,
}: FilesAppProps) => {
  const { toast } = useToast();
  const [currentPath, setCurrentPath] = useState('/');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file?: FileEntry } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [clipboard, setClipboard] = useState<{ files: FileEntry[]; operation: 'copy' | 'cut' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [propertiesFile, setPropertiesFile] = useState<FileEntry | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [breadcrumbDropTarget, setBreadcrumbDropTarget] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalDragPaths = useRef<string[]>([]);

  const storageMeta = STORAGE_LABELS[storageType];

  const selectedFileObjects = useMemo(() => files.filter(f => selectedFiles.has(f.path)), [files, selectedFiles]);
  const selectedFileCount = selectedFiles.size;
  const selectedTotalSize = useMemo(() => selectedFileObjects.reduce((sum, f) => sum + (f.size || 0), 0), [selectedFileObjects]);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const crumbs = [{ label: 'Root', path: '/' }];
    parts.forEach((part, i) => {
      crumbs.push({ label: part, path: '/' + parts.slice(0, i + 1).join('/') });
    });
    return crumbs;
  }, [currentPath]);

  const visibleFiles = useMemo(() => {
    let filtered = files.filter(f => {
      const parentPath = f.path.substring(0, f.path.lastIndexOf('/')) || '/';
      return parentPath === currentPath;
    });
    if (searchQuery) {
      filtered = filtered.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return filtered.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [files, currentPath, searchQuery]);

  const treeDirs = useMemo(() => files.filter(f => f.type === 'directory').sort((a, b) => a.path.localeCompare(b.path)), [files]);

  /* ── Data fetching ── */
  const refreshFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adapter.listFiles(workspaceId, currentPath);
      setFiles(result);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, currentPath]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  /* ── Navigation ── */
  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
    setContextMenu(null);
  };

  const goUp = () => {
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    handleNavigate(parent);
  };

  /* ── File operations ── */
  const openPreview = async (file: FileEntry) => {
    setPreviewFile(file);
    if (isImageFile(file.name)) {
      setPreviewContent(null);
    } else {
      setPreviewLoading(true);
      try {
        const blob = await adapter.downloadFile(workspaceId, file.path);
        const text = await blob.text();
        setPreviewContent(text);
      } catch {
        setPreviewContent(`# ${file.name}\n\nUnable to load file preview. The file may not be accessible or the backend may be offline.`);
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const handleFileClick = (file: FileEntry) => {
    if (file.type === 'directory') {
      handleNavigate(file.path);
    } else if (isPreviewable(file.name)) {
      openPreview(file);
      setSelectedFiles(new Set([file.path]));
    } else {
      setSelectedFiles(new Set([file.path]));
    }
    if (file.type !== 'directory' && onContextRail) {
      onContextRail({ type: 'file', id: file.path, label: file.name });
    }
  };

  const handleFileSelect = (file: FileEntry, multi: boolean) => {
    setSelectedFiles(prev => {
      const next = new Set(multi ? prev : []);
      if (next.has(file.path)) next.delete(file.path);
      else next.add(file.path);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, file?: FileEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleUpload = async (uploadFiles: FileList | null) => {
    if (!uploadFiles) return;
    for (const file of Array.from(uploadFiles)) {
      try { await adapter.uploadFile(workspaceId, currentPath, file); } catch { /* offline */ }
      setFiles(prev => [...prev, {
        name: file.name,
        path: `${currentPath === '/' ? '' : currentPath}/${file.name}`,
        type: 'file',
        size: file.size,
        mimeType: file.type,
        modifiedAt: new Date().toISOString(),
      }]);
    }
  };

  const handleCreateFolder = () => {
    if (!newName.trim()) return;
    const path = `${currentPath === '/' ? '' : currentPath}/${newName.trim()}`;
    setFiles(prev => [...prev, { name: newName.trim(), path, type: 'directory', modifiedAt: new Date().toISOString() }]);
    adapter.createDirectory(workspaceId, path).catch(() => toast({ title: 'Failed to create folder', variant: 'destructive' }));
    setCreating(null);
    setNewName('');
  };

  const handleDelete = (file: FileEntry) => {
    setFiles(prev => prev.filter(f => f.path !== file.path && !f.path.startsWith(file.path + '/')));
    adapter.deleteFile(workspaceId, file.path).catch(() => toast({ title: 'Failed to delete file', variant: 'destructive' }));
    setContextMenu(null);
  };

  const handleRename = (file: FileEntry) => {
    if (!renameValue.trim() || renameValue === file.name) { setRenaming(null); return; }
    const newPath = file.path.replace(file.name, renameValue.trim());
    setFiles(prev => prev.map(f => f.path === file.path ? { ...f, name: renameValue.trim(), path: newPath } : f));
    adapter.moveFile(workspaceId, file.path, newPath).catch(() => toast({ title: 'Failed to move file', variant: 'destructive' }));
    setRenaming(null);
  };

  const handleDownload = (file: FileEntry) => {
    adapter.downloadFile(workspaceId, file.path).catch(() => {});
    setContextMenu(null);
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    for (const file of clipboard.files) {
      const destPath = `${currentPath === '/' ? '' : currentPath}/${file.name}`;
      if (clipboard.operation === 'copy') {
        await adapter.copyFile(workspaceId, file.path, destPath);
      } else {
        await adapter.moveFile(workspaceId, file.path, destPath);
      }
    }
    setClipboard(null);
    refreshFiles();
  };

  const handleBulkDelete = () => {
    setFiles(prev => prev.filter(f => !selectedFiles.has(f.path) && !Array.from(selectedFiles).some(s => f.path.startsWith(s + '/'))));
    selectedFiles.forEach(path => adapter.deleteFile(workspaceId, path).catch(() => {}));
    setSelectedFiles(new Set());
  };
  const handleBulkCopy = () => { setClipboard({ files: selectedFileObjects, operation: 'copy' }); setSelectedFiles(new Set()); };
  const handleBulkCut = () => { setClipboard({ files: selectedFileObjects, operation: 'cut' }); setSelectedFiles(new Set()); };
  const handleBulkDownload = () => { selectedFileObjects.filter(f => f.type === 'file').forEach(f => { adapter.downloadFile(workspaceId, f.path).catch(() => {}); }); };
  const handleBulkMove = (destPath: string) => {
    selectedFileObjects.forEach(f => {
      const newPath = `${destPath === '/' ? '' : destPath}/${f.name}`;
      adapter.moveFile(workspaceId, f.path, newPath).catch(() => {});
      setFiles(prev => prev.map(pf => pf.path === f.path ? { ...pf, path: newPath } : pf));
    });
    setSelectedFiles(new Set());
    setShowMoveDialog(false);
  };
  const handleSelectAll = () => { setSelectedFiles(new Set(visibleFiles.map(f => f.path))); };

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'a') { e.preventDefault(); handleSelectAll(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFiles.size > 0) { e.preventDefault(); handleBulkDelete(); return; }
      if (mod && e.key === 'c' && selectedFiles.size > 0) { e.preventDefault(); handleBulkCopy(); return; }
      if (mod && e.key === 'x' && selectedFiles.size > 0) { e.preventDefault(); handleBulkCut(); return; }
      if (mod && e.key === 'v' && clipboard) { e.preventDefault(); handlePaste(); return; }
      if (mod && e.key === 'd' && selectedFiles.size > 0) { e.preventDefault(); handleBulkDownload(); return; }
      if (e.key === 'Escape') {
        if (previewFile) { setPreviewFile(null); setPreviewContent(null); }
        else if (propertiesFile) setPropertiesFile(null);
        else if (showMoveDialog) setShowMoveDialog(false);
        else if (selectedFiles.size > 0) setSelectedFiles(new Set());
        return;
      }
      if (e.key === 'F2' && selectedFiles.size === 1) {
        e.preventDefault();
        const path = Array.from(selectedFiles)[0];
        const file = files.find(f => f.path === path);
        if (file) { setRenaming(file.path); setRenameValue(file.name); }
        return;
      }
      if (e.key === 'Enter' && selectedFiles.size === 1) {
        const path = Array.from(selectedFiles)[0];
        const file = files.find(f => f.path === path);
        if (file) handleFileClick(file);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedFiles, clipboard, files, previewFile, propertiesFile, showMoveDialog, visibleFiles]);

  /* ── Drag & drop (external files) ── */
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer.types.includes('Files')) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0; if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files); };

  /* ── Breadcrumb drop ── */
  const onBreadcrumbDragOver = (e: React.DragEvent, crumbPath: string) => {
    if (internalDragPaths.current.length > 0) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setBreadcrumbDropTarget(crumbPath); }
  };
  const onBreadcrumbDragLeave = () => setBreadcrumbDropTarget(null);
  const onBreadcrumbDrop = (e: React.DragEvent, crumbPath: string) => {
    e.preventDefault(); e.stopPropagation(); setBreadcrumbDropTarget(null);
    const paths = internalDragPaths.current;
    if (paths.length === 0) return;
    const filesToMove = files.filter(f => paths.includes(f.path));
    filesToMove.forEach(f => {
      const newPath = `${crumbPath === '/' ? '' : crumbPath}/${f.name}`;
      if (newPath !== f.path) {
        adapter.moveFile(workspaceId, f.path, newPath).catch(() => {});
        setFiles(prev => prev.map(pf => pf.path === f.path ? { ...pf, path: newPath } : pf));
      }
    });
    setSelectedFiles(new Set());
    internalDragPaths.current = [];
  };

  /* ── Internal row drag helpers ── */
  const startInternalDrag = (e: React.DragEvent, file: FileEntry) => {
    const paths = selectedFiles.has(file.path) && selectedFiles.size > 1 ? Array.from(selectedFiles) : [file.path];
    internalDragPaths.current = paths;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', paths.join(','));
  };
  const endInternalDrag = () => { internalDragPaths.current = []; };

  /* ── Render ── */
  return (
    <div
      className="flex h-full bg-background/50 relative"
      onClick={() => setContextMenu(null)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Offline banner */}
      {offline && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 py-2 text-xs text-center" style={{ backgroundColor: 'var(--hive-800)', borderBottom: '1px solid var(--hive-700)', color: 'var(--honey-500)' }}>
          Server unreachable — showing cached files. <button onClick={refreshFiles} className="underline ml-1">Retry</button>
        </div>
      )}

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && <FileUploadZone currentPath={currentPath} />}
      </AnimatePresence>

      {/* Phase B.1: workspace rail — shown when caller provides workspaces.
          Lets the user switch workspaces without leaving the Files app. */}
      {workspaces && workspaces.length > 0 && onSelectWorkspace && (
        <WorkspaceRail
          workspaces={workspaces}
          activeWorkspaceId={workspaceId}
          onSelect={onSelectWorkspace}
          onDropFiles={(targetWorkspaceId) => {
            toast({
              title: 'Cross-workspace copy coming soon',
              description: `Dropping files to "${workspaces.find(w => w.id === targetWorkspaceId)?.name ?? targetWorkspaceId}" will be wired up in Phase B.2.`,
            });
          }}
        />
      )}

      {/* Tree sidebar */}
      <FileTree
        treeDirs={treeDirs}
        currentPath={currentPath}
        workspaceName={workspaceName}
        storageType={storageType}
        onNavigate={handleNavigate}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <FileActions
          currentPath={currentPath}
          storageType={storageType}
          breadcrumbs={breadcrumbs}
          viewMode={viewMode}
          loading={loading}
          showSearch={showSearch}
          searchQuery={searchQuery}
          onGoUp={goUp}
          onRefresh={refreshFiles}
          onNavigate={handleNavigate}
          onSetViewMode={setViewMode}
          onSetShowSearch={setShowSearch}
          onSetSearchQuery={setSearchQuery}
          onCreateFolder={() => setCreating('folder')}
          fileInputRef={fileInputRef}
          onBreadcrumbDragOver={onBreadcrumbDragOver}
          onBreadcrumbDragLeave={onBreadcrumbDragLeave}
          onBreadcrumbDrop={onBreadcrumbDrop}
          breadcrumbDropTarget={breadcrumbDropTarget}
        />
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />

        {/* New folder input */}
        <AnimatePresence>
          {creating === 'folder' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-3 border-b border-border/20 overflow-hidden">
              <div className="flex items-center gap-2 py-1.5">
                <Folder className="w-4 h-4 text-amber-400" />
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreating(null); setNewName(''); } }}
                  placeholder="New folder name..."
                  className="flex-1 bg-transparent text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  autoFocus
                />
                <button onClick={handleCreateFolder} className="text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground">Create</button>
                <button onClick={() => { setCreating(null); setNewName(''); }} className="text-[11px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File list/grid */}
        <div className="flex-1 overflow-auto p-2" onContextMenu={e => handleContextMenu(e)}>
          {visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Folder className="w-10 h-10 opacity-30" />
              <p className="text-xs">Empty directory</p>
              <button onClick={() => fileInputRef.current?.click()} className="text-[11px] px-3 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                Upload files
              </button>
            </div>
          ) : viewMode === 'list' ? (
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border/20">
                  <th className="text-left font-normal pb-1 pl-1">Name</th>
                  <th className="text-right font-normal pb-1 w-20">Size</th>
                  <th className="text-right font-normal pb-1 w-28 pr-1">Modified</th>
                </tr>
              </thead>
              <tbody>
                {visibleFiles.map(file => {
                  const Icon = file.type === 'directory' ? Folder : getFileIcon(file.name);
                  const isSelected = selectedFiles.has(file.path);
                  return (
                    <tr
                      key={file.path}
                      draggable
                      onDragStart={e => startInternalDrag(e, file)}
                      onDragEnd={endInternalDrag}
                      onClick={e => { e.ctrlKey || e.metaKey ? handleFileSelect(file, true) : handleFileClick(file); }}
                      onDoubleClick={() => file.type === 'directory' && handleNavigate(file.path)}
                      onContextMenu={e => handleContextMenu(e, file)}
                      className={`group text-xs cursor-pointer transition-colors ${isSelected ? 'bg-primary/15' : 'hover:bg-muted/30'}`}
                    >
                      <td className="py-1 pl-1 flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${file.type === 'directory' ? 'text-amber-400' : 'text-muted-foreground'}`} />
                        {renaming === file.path ? (
                          <input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(file); if (e.key === 'Escape') setRenaming(null); }}
                            onBlur={() => handleRename(file)}
                            className="bg-muted/50 rounded px-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate">{file.name}</span>
                        )}
                      </td>
                      <td className="py-1 text-right text-muted-foreground text-[11px]">{file.type === 'file' ? formatSize(file.size) : '\u2014'}</td>
                      <td className="py-1 text-right text-muted-foreground text-[11px] pr-1">{file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString() : '\u2014'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {visibleFiles.map(file => {
                const Icon = file.type === 'directory' ? Folder : getFileIcon(file.name);
                const isSelected = selectedFiles.has(file.path);
                return (
                  <button
                    key={file.path}
                    draggable
                    onDragStart={e => startInternalDrag(e, file)}
                    onDragEnd={endInternalDrag}
                    onClick={e => { e.ctrlKey || e.metaKey ? handleFileSelect(file, true) : handleFileClick(file); }}
                    onDoubleClick={() => file.type === 'directory' && handleNavigate(file.path)}
                    onContextMenu={e => handleContextMenu(e, file)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${isSelected ? 'bg-primary/15 border border-primary/30' : 'hover:bg-muted/30 border border-transparent'}`}
                  >
                    <Icon className={`w-8 h-8 ${file.type === 'directory' ? 'text-amber-400' : 'text-muted-foreground'}`} />
                    <span className="text-[11px] text-foreground truncate w-full text-center">{file.name}</span>
                    {file.type === 'file' && <span className="text-[11px] text-muted-foreground">{formatSize(file.size)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bulk actions toolbar */}
        <AnimatePresence>
          {selectedFileCount > 1 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="overflow-hidden border-t border-primary/20">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5">
                <div className="flex items-center gap-1.5 mr-2">
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-medium text-primary">{selectedFileCount} selected</span>
                  <span className="text-[11px] text-muted-foreground">({formatSize(selectedTotalSize)})</span>
                </div>
                <div className="h-4 w-px bg-border/30" />
                <button onClick={handleBulkDownload} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-foreground hover:bg-muted/50 transition-colors" title="Download selected files"><Download className="w-3 h-3" /> Download</button>
                <button onClick={handleBulkCopy} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-foreground hover:bg-muted/50 transition-colors" title="Copy selected"><Copy className="w-3 h-3" /> Copy</button>
                <button onClick={handleBulkCut} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-foreground hover:bg-muted/50 transition-colors" title="Cut selected"><Scissors className="w-3 h-3" /> Cut</button>
                <button onClick={() => setShowMoveDialog(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-foreground hover:bg-muted/50 transition-colors" title="Move selected to folder"><FolderInput className="w-3 h-3" /> Move</button>
                <div className="h-4 w-px bg-border/30" />
                <button onClick={handleBulkDelete} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-destructive hover:bg-destructive/10 transition-colors" title="Delete selected"><Trash2 className="w-3 h-3" /> Delete</button>
                <div className="flex-1" />
                <button onClick={handleSelectAll} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Select all</button>
                <button onClick={() => setSelectedFiles(new Set())} className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"><XSquare className="w-3 h-3" /> Clear</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/20 text-[11px] text-muted-foreground">
          <span>{visibleFiles.length} items{selectedFiles.size > 0 && ` \u00b7 ${selectedFiles.size} selected`}</span>
          <span className="flex items-center gap-1">
            <storageMeta.icon className={`w-3 h-3 ${storageMeta.color}`} />
            {storageMeta.label}
          </span>
        </div>
      </div>

      {/* Move dialog */}
      <AnimatePresence>
        {showMoveDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowMoveDialog(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="w-[300px] bg-background border border-border/40 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Move {selectedFileCount} items to...</h3>
                <button onClick={() => setShowMoveDialog(false)} className="p-0.5 rounded hover:bg-muted/50"><XIcon className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="p-2 max-h-[250px] overflow-auto space-y-0.5">
                <button onClick={() => handleBulkMove('/')} className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs hover:bg-muted/50 transition-colors ${currentPath === '/' ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Folder className="w-3.5 h-3.5 text-muted-foreground" /><span>Root</span>
                </button>
                {treeDirs.filter(d => !selectedFiles.has(d.path)).map(dir => (
                  <button key={dir.path} onClick={() => handleBulkMove(dir.path)} className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs hover:bg-muted/50 transition-colors ${dir.path === currentPath ? 'opacity-40 pointer-events-none' : ''}`}>
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    <span>{dir.name}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto font-mono">{dir.path}</span>
                  </button>
                ))}
                {treeDirs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No folders available</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview panel */}
      <AnimatePresence>
        {previewFile && (
          <FilePreview
            file={previewFile}
            content={previewContent}
            loading={previewLoading}
            isImage={isImageFile(previewFile.name)}
            onClose={() => { setPreviewFile(null); setPreviewContent(null); }}
            onDownload={handleDownload}
          />
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed z-[200] glass-strong rounded-xl shadow-2xl py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
            {contextMenu.file ? (
              <>
                {contextMenu.file.type === 'file' && (
                  <button onClick={() => handleDownload(contextMenu.file!)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><Download className="w-3.5 h-3.5" /> Download</button>
                )}
                <button onClick={() => { setRenaming(contextMenu.file!.path); setRenameValue(contextMenu.file!.name); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><Edit className="w-3.5 h-3.5" /> Rename</button>
                <button onClick={() => { setClipboard({ files: [contextMenu.file!], operation: 'copy' }); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><Copy className="w-3.5 h-3.5" /> Copy</button>
                <button onClick={() => { setClipboard({ files: [contextMenu.file!], operation: 'cut' }); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><Scissors className="w-3.5 h-3.5" /> Cut</button>
                <button onClick={() => { setPropertiesFile(contextMenu.file!); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><Info className="w-3.5 h-3.5" /> Properties</button>
                <div className="h-px bg-border/30 my-0.5" />
                <button onClick={() => handleDelete(contextMenu.file!)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              </>
            ) : (
              <>
                <button onClick={() => { setCreating('folder'); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><FolderPlus className="w-3.5 h-3.5" /> New Folder</button>
                <button onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><Upload className="w-3.5 h-3.5" /> Upload Files</button>
                {clipboard && (
                  <button onClick={() => { handlePaste(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><ClipboardPaste className="w-3.5 h-3.5" /> Paste</button>
                )}
                <button onClick={() => { refreshFiles(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Properties dialog */}
      <AnimatePresence>
        {propertiesFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPropertiesFile(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="w-[360px] max-h-[80vh] bg-background border border-border/40 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/20 bg-muted/20">
                {(() => {
                  const Icon = propertiesFile.type === 'directory' ? Folder : getFileIcon(propertiesFile.name);
                  return <Icon className={`w-8 h-8 ${propertiesFile.type === 'directory' ? 'text-amber-400' : 'text-primary'}`} />;
                })()}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground truncate">{propertiesFile.name}</h3>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{propertiesFile.path}</p>
                </div>
                <button onClick={() => setPropertiesFile(null)} className="p-1 rounded-lg hover:bg-muted/50 transition-colors"><XIcon className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="px-5 py-4 space-y-4 overflow-auto max-h-[60vh]">
                <div>
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">General</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs"><FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Name</span><span className="text-foreground truncate flex-1">{propertiesFile.name}</span></div>
                    <div className="flex items-center gap-2 text-xs"><Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Type</span><span className="text-foreground">{propertiesFile.type === 'directory' ? 'Directory' : (propertiesFile.mimeType || propertiesFile.name.split('.').pop()?.toUpperCase() + ' File' || 'File')}</span></div>
                    {propertiesFile.type === 'file' && (
                      <div className="flex items-center gap-2 text-xs"><HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Size</span><span className="text-foreground">{formatSize(propertiesFile.size)}{propertiesFile.size ? ` (${propertiesFile.size.toLocaleString()} bytes)` : ''}</span></div>
                    )}
                  </div>
                </div>
                <div className="h-px bg-border/20" />
                <div>
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Dates</h4>
                  <div className="space-y-2">
                    {propertiesFile.modifiedAt && <div className="flex items-center gap-2 text-xs"><Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Modified</span><span className="text-foreground">{new Date(propertiesFile.modifiedAt).toLocaleString()}</span></div>}
                    {propertiesFile.createdAt && <div className="flex items-center gap-2 text-xs"><Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Created</span><span className="text-foreground">{new Date(propertiesFile.createdAt).toLocaleString()}</span></div>}
                    {!propertiesFile.modifiedAt && !propertiesFile.createdAt && <p className="text-[11px] text-muted-foreground/60 italic">No date information available</p>}
                  </div>
                </div>
                <div className="h-px bg-border/20" />
                <div>
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Storage</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs"><storageMeta.icon className={`w-3.5 h-3.5 ${storageMeta.color} shrink-0`} /><span className="text-muted-foreground w-20">Provider</span><span className="text-foreground">{storageMeta.label} Storage</span></div>
                    <div className="flex items-center gap-2 text-xs"><MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Path</span><span className="text-foreground font-mono text-[11px] truncate flex-1">{propertiesFile.path}</span></div>
                    <div className="flex items-center gap-2 text-xs"><Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Workspace</span><span className="text-foreground">{workspaceName || workspaceId}</span></div>
                  </div>
                </div>
                <div className="h-px bg-border/20" />
                <div>
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Permissions</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs"><Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Access</span><span className="text-foreground">{storageType === 'team' ? 'Team (shared)' : storageType === 'local' ? 'Local (private)' : 'Virtual (session)'}</span></div>
                    <div className="flex items-center gap-2 text-xs">{storageType === 'team' ? <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}<span className="text-muted-foreground w-20">Visibility</span><span className="text-foreground">{storageType === 'team' ? 'Shared with team' : 'Only you'}</span></div>
                    <div className="flex items-center gap-2 text-xs"><Edit className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground w-20">Writable</span><span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Yes</span></div>
                  </div>
                </div>
                {propertiesFile.type === 'file' && <VersionHistory workspaceId={workspaceId} fileName={propertiesFile.name} />}
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/20 bg-muted/10">
                <button onClick={() => setPropertiesFile(null)} className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilesApp;
