import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Folder, File, ChevronRight, ChevronDown, Upload, Plus,
  Grid3X3, List, ArrowLeft, Home, MoreHorizontal, Download, Eye,
  Trash2, Copy, Scissors, ClipboardPaste, Edit, FolderPlus, X as XIcon,
  RefreshCw, HardDrive, Cloud, Server, Search, X, FileText,
  Image, FileCode, FileSpreadsheet, Archive, Music, Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FileEntry, StorageType } from '@/lib/types';
import { adapter } from '@/lib/adapter';

interface FilesAppProps {
  workspaceId: string;
  workspaceName?: string;
  storageType?: StorageType;
}

// File icon by extension/mime
const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return File;
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return Image;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Video;
  if (['mp3', 'wav', 'flac', 'ogg', 'aac'].includes(ext)) return Music;
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return Archive;
  if (['js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'toml', 'xml', 'html', 'css'].includes(ext)) return FileCode;
  if (['csv', 'xls', 'xlsx'].includes(ext)) return FileSpreadsheet;
  if (['md', 'txt', 'doc', 'docx', 'pdf', 'rtf'].includes(ext)) return FileText;
  return File;
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const STORAGE_LABELS: Record<StorageType, { label: string; icon: React.ElementType; color: string }> = {
  virtual: { label: 'Virtual', icon: Cloud, color: 'text-violet-400' },
  local: { label: 'Local', icon: HardDrive, color: 'text-emerald-400' },
  team: { label: 'Team', icon: Server, color: 'text-sky-400' },
};

// Mock initial tree for offline mode
const MOCK_FILES: FileEntry[] = [
  { name: 'attachments', path: '/attachments', type: 'directory', modifiedAt: '2026-03-25T10:00:00Z' },
  { name: 'exports', path: '/exports', type: 'directory', modifiedAt: '2026-03-24T14:30:00Z' },
  { name: 'notes', path: '/notes', type: 'directory', modifiedAt: '2026-03-23T09:15:00Z' },
  { name: 'meeting-notes.md', path: '/meeting-notes.md', type: 'file', size: 4200, mimeType: 'text/markdown', modifiedAt: '2026-03-25T08:00:00Z' },
  { name: 'report.pdf', path: '/report.pdf', type: 'file', size: 245000, mimeType: 'application/pdf', modifiedAt: '2026-03-24T16:20:00Z' },
  { name: 'data.csv', path: '/data.csv', type: 'file', size: 18300, mimeType: 'text/csv', modifiedAt: '2026-03-22T11:45:00Z' },
];

const FilesApp = ({ workspaceId, workspaceName, storageType = 'virtual' }: FilesAppProps) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [files, setFiles] = useState<FileEntry[]>(MOCK_FILES);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file?: FileEntry } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [clipboard, setClipboard] = useState<{ files: FileEntry[]; operation: 'copy' | 'cut' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageMeta = STORAGE_LABELS[storageType];

  // Breadcrumbs from path
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const crumbs = [{ label: 'Root', path: '/' }];
    parts.forEach((part, i) => {
      crumbs.push({ label: part, path: '/' + parts.slice(0, i + 1).join('/') });
    });
    return crumbs;
  }, [currentPath]);

  // Filtered files in current directory
  const visibleFiles = useMemo(() => {
    let filtered = files.filter(f => {
      const parentPath = f.path.substring(0, f.path.lastIndexOf('/')) || '/';
      return parentPath === currentPath;
    });
    if (searchQuery) {
      filtered = filtered.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    // Sort: dirs first, then alpha
    return filtered.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [files, currentPath, searchQuery]);

  // Tree sidebar data
  const treeDirs = useMemo(() => {
    return files.filter(f => f.type === 'directory').sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const refreshFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adapter.listFiles(workspaceId, currentPath);
      setFiles(result);
    } catch {
      // offline — keep mock
    } finally {
      setLoading(false);
    }
  }, [workspaceId, currentPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
    setContextMenu(null);
  };

  // Check if a file is previewable
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

  const openPreview = async (file: FileEntry) => {
    setPreviewFile(file);
    if (isImageFile(file.name)) {
      // For images, we'll construct a URL — in offline mode show placeholder
      setPreviewContent(null);
    } else {
      // For text files, fetch content
      setPreviewLoading(true);
      try {
        const blob = await adapter.downloadFile(workspaceId, file.path);
        const text = await blob.text();
        setPreviewContent(text);
      } catch {
        // Offline mock
        setPreviewContent(`// Preview of ${file.name}\n// Content would load from backend\n\n# ${file.name}\n\nThis is a preview placeholder.\nConnect to the backend to see actual file contents.`);
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
      try {
        await adapter.uploadFile(workspaceId, currentPath, file);
      } catch {
        // offline
      }
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
    adapter.createDirectory(workspaceId, path).catch(() => {});
    setCreating(null);
    setNewName('');
  };

  const handleDelete = (file: FileEntry) => {
    setFiles(prev => prev.filter(f => f.path !== file.path && !f.path.startsWith(file.path + '/')));
    adapter.deleteFile(workspaceId, file.path).catch(() => {});
    setContextMenu(null);
  };

  const handleRename = (file: FileEntry) => {
    if (!renameValue.trim() || renameValue === file.name) { setRenaming(null); return; }
    const newPath = file.path.replace(file.name, renameValue.trim());
    setFiles(prev => prev.map(f => f.path === file.path ? { ...f, name: renameValue.trim(), path: newPath } : f));
    adapter.moveFile(workspaceId, file.path, newPath).catch(() => {});
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

  const goUp = () => {
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    handleNavigate(parent);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files?.length) {
      handleUpload(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="flex h-full bg-background/50 relative"
      onClick={() => setContextMenu(null)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[50] flex items-center justify-center bg-primary/5 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-xl pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-10 h-10 text-primary animate-bounce" />
              <p className="text-sm font-display text-primary">Drop files to upload</p>
              <p className="text-[10px] text-muted-foreground">Files will be added to <span className="font-mono text-foreground">{currentPath}</span></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tree sidebar */}
      <div className="w-48 border-r border-border/30 flex flex-col">
        <div className="p-2 border-b border-border/20">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <storageMeta.icon className={`w-3.5 h-3.5 ${storageMeta.color}`} />
            <span className="text-[10px] font-display text-muted-foreground">{storageMeta.label} Storage</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1">
          <button
            onClick={() => handleNavigate('/')}
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
              onClick={() => handleNavigate(dir.path)}
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30">
          <button onClick={goUp} disabled={currentPath === '/'} className="p-1 rounded hover:bg-muted/50 disabled:opacity-30">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={refreshFiles} className={`p-1 rounded hover:bg-muted/50 ${loading ? 'animate-spin' : ''}`}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-0.5 ml-1 flex-1 min-w-0 overflow-hidden">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
                <button
                  onClick={() => handleNavigate(crumb.path)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors truncate max-w-[100px]"
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
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter..."
                  className="bg-transparent text-xs outline-none w-24"
                  autoFocus
                />
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="p-1 rounded hover:bg-muted/50">
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setCreating('folder')} className="p-1 rounded hover:bg-muted/50" title="New Folder">
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-muted/50" title="Upload">
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            <div className="w-px h-4 bg-border/30 mx-0.5" />
            <button onClick={() => setViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'}`}>
              <List className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-1 rounded ${viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted/50'}`}>
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

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
                  className="flex-1 bg-transparent text-xs outline-none"
                  autoFocus
                />
                <button onClick={handleCreateFolder} className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground">Create</button>
                <button onClick={() => { setCreating(null); setNewName(''); }} className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground">Cancel</button>
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
              <button onClick={() => fileInputRef.current?.click()} className="text-[10px] px-3 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                Upload files
              </button>
            </div>
          ) : viewMode === 'list' ? (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-muted-foreground border-b border-border/20">
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
                      onClick={e => { e.ctrlKey || e.metaKey ? handleFileSelect(file, true) : handleFileClick(file); }}
                      onDoubleClick={() => file.type === 'directory' && handleNavigate(file.path)}
                      onContextMenu={e => handleContextMenu(e, file)}
                      className={`group text-xs cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/15' : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="py-1 pl-1 flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${file.type === 'directory' ? 'text-amber-400' : 'text-muted-foreground'}`} />
                        {renaming === file.path ? (
                          <input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(file); if (e.key === 'Escape') setRenaming(null); }}
                            onBlur={() => handleRename(file)}
                            className="bg-muted/50 rounded px-1 text-xs outline-none"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate">{file.name}</span>
                        )}
                      </td>
                      <td className="py-1 text-right text-muted-foreground text-[10px]">{file.type === 'file' ? formatSize(file.size) : '—'}</td>
                      <td className="py-1 text-right text-muted-foreground text-[10px] pr-1">
                        {file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString() : '—'}
                      </td>
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
                    onClick={e => { e.ctrlKey || e.metaKey ? handleFileSelect(file, true) : handleFileClick(file); }}
                    onDoubleClick={() => file.type === 'directory' && handleNavigate(file.path)}
                    onContextMenu={e => handleContextMenu(e, file)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-colors ${
                      isSelected ? 'bg-primary/15 border border-primary/30' : 'hover:bg-muted/30 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-8 h-8 ${file.type === 'directory' ? 'text-amber-400' : 'text-muted-foreground'}`} />
                    <span className="text-[10px] text-foreground truncate w-full text-center">{file.name}</span>
                    {file.type === 'file' && <span className="text-[9px] text-muted-foreground">{formatSize(file.size)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/20 text-[10px] text-muted-foreground">
          <span>{visibleFiles.length} items{selectedFiles.size > 0 && ` · ${selectedFiles.size} selected`}</span>
          <span className="flex items-center gap-1">
            <storageMeta.icon className={`w-3 h-3 ${storageMeta.color}`} />
            {storageMeta.label}
          </span>
        </div>
      </div>

      {/* Preview panel */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="border-l border-border/30 flex flex-col overflow-hidden"
          >
            {/* Preview header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
              <div className="flex items-center gap-1.5 min-w-0">
                <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-display text-foreground truncate">{previewFile.name}</span>
              </div>
              <button onClick={() => { setPreviewFile(null); setPreviewContent(null); }} className="p-0.5 rounded hover:bg-muted/50">
                <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-auto p-3">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              ) : isImageFile(previewFile.name) ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-full aspect-square rounded-lg bg-muted/30 border border-border/20 flex items-center justify-center overflow-hidden">
                    <Image className="w-12 h-12 text-muted-foreground/30" />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Image preview loads from backend
                  </p>
                </div>
              ) : previewContent ? (
                <SyntaxPreview content={previewContent} fileName={previewFile.name} />
              ) : (
                <p className="text-xs text-muted-foreground text-center mt-8">No preview available</p>
              )}
            </div>

            {/* Preview footer with file info */}
            <div className="border-t border-border/20 px-3 py-2 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Size</span>
                <span className="text-foreground">{formatSize(previewFile.size)}</span>
              </div>
              {previewFile.mimeType && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Type</span>
                  <span className="text-foreground font-mono">{previewFile.mimeType}</span>
                </div>
              )}
              {previewFile.modifiedAt && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Modified</span>
                  <span className="text-foreground">{new Date(previewFile.modifiedAt).toLocaleString()}</span>
                </div>
              )}
              <div className="pt-1.5 flex gap-1">
                <button onClick={() => handleDownload(previewFile)} className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Download className="w-3 h-3" /> Download
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[200] glass-strong rounded-xl shadow-2xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            {contextMenu.file ? (
              <>
                {contextMenu.file.type === 'file' && (
                  <button onClick={() => handleDownload(contextMenu.file!)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                )}
                <button onClick={() => { setRenaming(contextMenu.file!.path); setRenameValue(contextMenu.file!.name); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                  <Edit className="w-3.5 h-3.5" /> Rename
                </button>
                <button onClick={() => { setClipboard({ files: [contextMenu.file!], operation: 'copy' }); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                <button onClick={() => { setClipboard({ files: [contextMenu.file!], operation: 'cut' }); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                  <Scissors className="w-3.5 h-3.5" /> Cut
                </button>
                <div className="h-px bg-border/30 my-0.5" />
                <button onClick={() => handleDelete(contextMenu.file!)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setCreating('folder'); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                  <FolderPlus className="w-3.5 h-3.5" /> New Folder
                </button>
                <button onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> Upload Files
                </button>
                {clipboard && (
                  <button onClick={() => { handlePaste(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                    <ClipboardPaste className="w-3.5 h-3.5" /> Paste
                  </button>
                )}
                <button onClick={() => { refreshFiles(); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilesApp;
