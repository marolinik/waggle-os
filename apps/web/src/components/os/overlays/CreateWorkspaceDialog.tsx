import { useState, useCallback, useEffect } from 'react';
import { X, Plus, Users, Cloud, HardDrive, Server, FolderOpen, Folder, FolderPlus, ChevronRight, Home, Check, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import { motion, AnimatePresence } from 'framer-motion';
import { adapter } from '@/lib/adapter';
import type { StorageType } from '@/lib/types';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; group: string; persona?: string; shared?: boolean; storageType?: StorageType; storagePath?: string }) => void;
}

const GROUPS = ['Personal', 'Work', 'Research', 'Team'];

const STORAGE_OPTIONS: { type: StorageType; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { type: 'virtual', label: 'Virtual', desc: 'Server-managed storage', icon: Cloud, color: 'text-violet-400' },
  { type: 'local', label: 'Local', desc: 'Local disk directory', icon: HardDrive, color: 'text-emerald-400' },
  { type: 'team', label: 'Team', desc: 'Remote S3/MinIO storage', icon: Server, color: 'text-sky-400' },
];

function defaultVirtualPath(workspaceName: string): string {
  const slug = workspaceName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'untitled';
  return `/workspaces/${slug}`;
}

/* ── Types ─────────────────────────────────────────────────────────── */

interface BrowseEntry {
  name: string;
  path: string;
  type: string;
}

/* ── Folder Picker Modal (live API) ───────────────────────────────── */

interface FolderPickerProps {
  open: boolean;
  storageType: StorageType;
  currentPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

function FolderPickerModal({ open, storageType, currentPath, onSelect, onClose }: FolderPickerProps) {
  const rootLabel = storageType === 'local' ? '/' : 'Buckets';

  const [browsePath, setBrowsePath] = useState(currentPath || '/');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const fetchEntries = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      if (storageType === 'local') {
        const result = await adapter.browseLocal(dirPath);
        setEntries(result.entries);
      } else {
        setEntries([]);
        setError('Team storage browsing is not yet available');
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to browse');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [storageType]);

  useEffect(() => {
    if (open) fetchEntries(browsePath);
  }, [open, browsePath, fetchEntries]);

  const handleNavigate = useCallback((dirPath: string) => {
    setBrowsePath(dirPath);
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const folderName = newFolderName.trim();
    if (!folderName) return;
    const newPath = browsePath.endsWith('/') ? `${browsePath}${folderName}` : `${browsePath}/${folderName}`;
    setCreatingFolder(true);
    try {
      if (storageType === 'local') await adapter.browseLocalMkdir(newPath);
      await fetchEntries(browsePath);
      setBrowsePath(newPath);
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  }, [browsePath, newFolderName, storageType, fetchEntries]);

  const breadcrumbs = (() => {
    if (browsePath === '/') return [{ label: rootLabel, path: '/' }];
    const parts = browsePath.split('/').filter(Boolean);
    const crumbs = [{ label: rootLabel, path: '/' }];
    let acc = '';
    parts.forEach(part => {
      acc = storageType === 'local' ? `${acc}/${part}` : (acc ? `${acc}/${part}` : part);
      crumbs.push({ label: part, path: acc });
    });
    return crumbs;
  })();

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <FolderOpen className={`w-4 h-4 ${storageType === 'local' ? 'text-emerald-400' : 'text-sky-400'}`} />
            <h3 className="text-sm font-display font-semibold text-foreground">
              {storageType === 'local' ? 'Browse Folders' : 'Browse Buckets'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border/20 overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
              <button
                onClick={() => handleNavigate(crumb.path)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  browsePath === crumb.path ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {i === 0 ? <Home className="w-3 h-3" /> : crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Directory listing */}
        <div className="px-2 py-2 max-h-[280px] min-h-[120px] overflow-y-auto space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-[11px]">Loading…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-[11px] text-destructive">{error}</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-[11px] text-muted-foreground">No subdirectories</span>
            </div>
          ) : (
            entries.map(entry => (
              <button
                key={entry.path}
                onClick={() => handleNavigate(entry.path)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-left transition-colors hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400/70" />
                <span className="text-[11px] truncate">{entry.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/30 space-y-2">
          <AnimatePresence>
            {showNewFolder && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-1.5 overflow-hidden"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="New folder name…"
                  className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                  }}
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || creatingFolder}
                  className="px-2 py-1 text-[10px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors"
                >
                  {creatingFolder ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
                </button>
                <button
                  onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
                  className="px-1.5 py-1 text-[10px] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5">
            <span className="text-[9px] text-muted-foreground shrink-0">Path:</span>
            <span className="text-[11px] font-mono text-foreground truncate">{browsePath}</span>
          </div>
          <div className="flex justify-between">
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
            >
              <FolderPlus className="w-3 h-3" /> New Folder
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-[11px] rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { onSelect(browsePath); onClose(); }}
                disabled={!browsePath || browsePath === '/'}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors"
              >
                <Check className="w-3 h-3" /> Select
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Dialog ──────────────────────────────────────────────────── */

const CreateWorkspaceDialog = ({ open, onClose, onCreate }: CreateWorkspaceDialogProps) => {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('Personal');
  const [selectedPersona, setSelectedPersona] = useState<string | undefined>();
  const [shared, setShared] = useState(false);
  const [storageType, setStorageType] = useState<StorageType>('virtual');
  const [storagePath, setStoragePath] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(), group, persona: selectedPersona, shared,
      storageType,
      storagePath: storagePath.trim() || undefined,
    });
    setName('');
    setGroup('Personal');
    setSelectedPersona(undefined);
    setShared(false);
    setStorageType('virtual');
    setStoragePath('');
    onClose();
  };

  if (!open) return null;

  const virtualPath = defaultVirtualPath(name);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md glass-strong rounded-2xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">Create Workspace</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Workspace Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Workspace"
                className="w-full bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Group</label>
              <div className="flex gap-2">
                {GROUPS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                      group === g ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Storage Type */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Storage Type</label>
              <div className="grid grid-cols-3 gap-2">
                {STORAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => setStorageType(opt.type)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                      storageType === opt.type
                        ? 'bg-primary/20 border border-primary/50'
                        : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}
                  >
                    <opt.icon className={`w-5 h-5 ${opt.color}`} />
                    <span className="text-[10px] font-display text-foreground">{opt.label}</span>
                    <span className="text-[8px] text-muted-foreground">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Storage Path */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                {storageType === 'virtual'
                  ? 'Storage Path'
                  : storageType === 'local'
                    ? 'Local Directory Path'
                    : 'Bucket / Prefix'}
              </label>

              {storageType === 'virtual' ? (
                <div className="flex items-center gap-2 w-full bg-muted/30 border border-border/30 rounded-xl px-3 py-2">
                  <Cloud className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-[11px] font-mono text-muted-foreground truncate">
                    {virtualPath}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    value={storagePath}
                    onChange={e => setStoragePath(e.target.value)}
                    placeholder={storageType === 'local' ? '/home/user/projects/my-workspace' : 'my-bucket/workspace-prefix'}
                    className="flex-1 bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono text-[11px]"
                  />
                  <button
                    onClick={() => setShowFolderPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/50 border border-border/40 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors shrink-0"
                    title={storageType === 'local' ? 'Browse local folders' : 'Browse remote storage'}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Browse</span>
                  </button>
                </div>
              )}

              {storageType === 'virtual' && (
                <p className="text-[9px] text-muted-foreground/60 mt-1">
                  Managed automatically — files stored in server-managed storage.
                </p>
              )}
              {storageType === 'local' && (
                <p className="text-[9px] text-muted-foreground/60 mt-1">
                  Select or type the local directory where workspace files will be stored.
                </p>
              )}
              {storageType === 'team' && (
                <p className="text-[9px] text-muted-foreground/60 mt-1">
                  Browse or type the S3/MinIO bucket and prefix for shared storage.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Persona (optional)</label>
              <div className="grid grid-cols-4 gap-2">
                {PERSONAS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersona(selectedPersona === p.id ? undefined : p.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                      selectedPersona === p.id
                        ? 'bg-primary/20 border border-primary/50 scale-105'
                        : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={p.avatar} />
                      <AvatarFallback className="text-[8px] bg-primary/20">{p.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Share with team toggle */}
          <div className="flex items-center justify-between p-3 mt-4 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <div>
                <p className="text-xs font-display text-foreground">Share with team</p>
                <p className="text-[10px] text-muted-foreground">Make visible to all team members</p>
              </div>
            </div>
            <button
              onClick={() => setShared(!shared)}
              className={`w-10 h-5 rounded-full transition-colors ${shared ? 'bg-sky-500' : 'bg-muted'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${shared ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-xs font-display rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Folder Picker overlay */}
      <FolderPickerModal
        open={showFolderPicker}
        storageType={storageType}
        currentPath={storagePath}
        onSelect={(path) => setStoragePath(path)}
        onClose={() => setShowFolderPicker(false)}
      />
    </AnimatePresence>
  );
};

export default CreateWorkspaceDialog;
