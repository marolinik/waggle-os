import { useState, useCallback, useEffect } from 'react';
import {
  X, Plus, Users, Cloud, HardDrive, Server, FolderOpen, Folder,
  FolderPlus, ChevronRight, Home, Check, Loader2, LayoutTemplate,
  Sparkles, Info, Wand2, Target, Microscope, Code, Megaphone,
  Rocket, Scale, Building, FileText, Laptop, PenLine, BarChart3,
  ClipboardList, Mail, Plug, Terminal, Pencil, Trash2,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import { motion, AnimatePresence } from 'framer-motion';
import { adapter } from '@/lib/adapter';
import type { StorageType, WorkspaceTemplate, Connector } from '@/lib/types';

/* ── Shared constants ─────────────────────────────────────────────── */

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string; group: string; persona?: string; shared?: boolean;
    storageType?: StorageType; storagePath?: string; templateId?: string;
  }) => void;
}

const GROUPS = ['Personal', 'Work', 'Research', 'Team'];

const STORAGE_OPTIONS: { type: StorageType; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { type: 'virtual', label: 'Virtual', desc: 'Server-managed storage', icon: Cloud, color: 'text-violet-400' },
  { type: 'local', label: 'Local', desc: 'Local disk directory', icon: HardDrive, color: 'text-emerald-400' },
  { type: 'team', label: 'Team', desc: 'Remote S3/MinIO storage', icon: Server, color: 'text-sky-400' },
];

/** Icon map for known template IDs */
const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  'sales-pipeline': Target,
  'research-project': Microscope,
  'code-review': Laptop,
  'marketing-campaign': Megaphone,
  'product-launch': Rocket,
  'legal-review': Scale,
  'agency-consulting': Building,
};

/** Available slash commands in the system */
const AVAILABLE_COMMANDS = [
  { id: '/research', label: '/research', desc: 'Deep-dive investigation' },
  { id: '/draft', label: '/draft', desc: 'Write content & documents' },
  { id: '/review', label: '/review', desc: 'Analyze & review' },
  { id: '/plan', label: '/plan', desc: 'Create plans & checklists' },
  { id: '/status', label: '/status', desc: 'Progress reports' },
  { id: '/catchup', label: '/catchup', desc: 'Quick briefing' },
  { id: '/memory', label: '/memory', desc: 'Search memory' },
  { id: '/spawn', label: '/spawn', desc: 'Spawn sub-agents' },
];

/** Available persona roles for templates */
const TEMPLATE_PERSONAS = [
  { id: 'researcher', name: 'Researcher', icon: Microscope },
  { id: 'writer', name: 'Writer', icon: PenLine },
  { id: 'analyst', name: 'Analyst', icon: BarChart3 },
  { id: 'coder', name: 'Coder', icon: Code },
  { id: 'project-manager', name: 'Project Manager', icon: ClipboardList },
  { id: 'executive-assistant', name: 'Executive Assistant', icon: Mail },
  { id: 'sales-rep', name: 'Sales Rep', icon: Target },
  { id: 'marketer', name: 'Marketer', icon: Megaphone },
];

function defaultVirtualPath(workspaceName: string): string {
  const slug = workspaceName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'untitled';
  return `/workspaces/${slug}`;
}

/* ── Tooltip ──────────────────────────────────────────────────────── */

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-popover border border-border text-[10px] text-popover-foreground whitespace-nowrap z-50 shadow-lg max-w-[200px] text-center"
            style={{ whiteSpace: 'normal' }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ── Multi-Select Chip Picker ─────────────────────────────────────── */

interface ChipOption { id: string; label: string; desc?: string }

function ChipPicker({ options, selected, onChange, label }: {
  options: ChipOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  return (
    <div>
      <label className="text-[11px] text-muted-foreground font-medium block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const isActive = selected.includes(opt.id);
          return (
            <Tooltip key={opt.id} text={opt.desc || opt.label}>
              <button
                type="button"
                onClick={() => toggle(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all border ${
                  isActive
                    ? 'bg-primary/20 border-primary/50 text-foreground'
                    : 'bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/* ── Browse Entry ─────────────────────────────────────────────────── */

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <FolderOpen className={`w-4 h-4 ${storageType === 'local' ? 'text-emerald-400' : 'text-sky-400'}`} />
            <h3 className="text-sm font-display font-semibold text-foreground">
              {storageType === 'local' ? 'Browse Folders' : 'Browse Buckets'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border/20 overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
              <button onClick={() => handleNavigate(crumb.path)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${browsePath === crumb.path ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                {i === 0 ? <Home className="w-3 h-3" /> : crumb.label}
              </button>
            </span>
          ))}
        </div>
        <div className="px-2 py-2 max-h-[280px] min-h-[120px] overflow-y-auto space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /><span className="text-[11px]">Loading…</span></div>
          ) : error ? (
            <div className="flex items-center justify-center py-8"><span className="text-[11px] text-destructive">{error}</span></div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-8"><span className="text-[11px] text-muted-foreground">No subdirectories</span></div>
          ) : entries.map(entry => (
            <button key={entry.path} onClick={() => handleNavigate(entry.path)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-left transition-colors hover:bg-muted/50 text-muted-foreground hover:text-foreground">
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400/70" /><span className="text-[11px] truncate">{entry.name}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border/30 space-y-2">
          <AnimatePresence>
            {showNewFolder && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-1.5 overflow-hidden">
                <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="New folder name…"
                  className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }} />
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder}
                  className="px-2 py-1 text-[10px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors">
                  {creatingFolder ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
                </button>
                <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
                  className="px-1.5 py-1 text-[10px] rounded-lg text-muted-foreground hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5">
            <span className="text-[9px] text-muted-foreground shrink-0">Path:</span>
            <span className="text-[11px] font-mono text-foreground truncate">{browsePath}</span>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors">
              <FolderPlus className="w-3 h-3" /> New Folder
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-[11px] rounded-lg text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={() => { onSelect(browsePath); onClose(); }} disabled={!browsePath || browsePath === '/'}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors">
                <Check className="w-3 h-3" /> Select
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Template Creator Modal ───────────────────────────────────────── */

interface TemplateCreatorProps {
  open: boolean;
  onClose: () => void;
  onCreated: (t: WorkspaceTemplate) => void;
  availableConnectors: ChipOption[];
  editingTemplate?: WorkspaceTemplate | null;
}

function TemplateCreatorModal({ open, onClose, onCreated, availableConnectors, editingTemplate }: TemplateCreatorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [persona, setPersona] = useState('');
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [selectedCommands, setSelectedCommands] = useState<string[]>([]);
  const [starterMemory, setStarterMemory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate fields when editing
  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name);
      setDescription(editingTemplate.description);
      setPersona(editingTemplate.persona);
      setSelectedConnectors(editingTemplate.connectors);
      setSelectedCommands(editingTemplate.suggestedCommands);
      setStarterMemory(editingTemplate.starterMemory.join('\n'));
    } else {
      setName(''); setDescription(''); setPersona(''); setSelectedConnectors([]); setSelectedCommands([]); setStarterMemory('');
    }
  }, [editingTemplate, open]);

  // AI generation state
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await adapter.generateTemplateFromPrompt(aiPrompt.trim(), {
        availableConnectors: availableConnectors.map(c => c.id),
        availableCommands: AVAILABLE_COMMANDS.map(c => c.id),
        availablePersonas: TEMPLATE_PERSONAS.map(p => p.id),
      });
      if (result.name) setName(result.name);
      if (result.description) setDescription(result.description);
      if (result.persona) setPersona(result.persona);
      if (result.connectors) setSelectedConnectors(result.connectors);
      if (result.suggestedCommands) setSelectedCommands(result.suggestedCommands);
      if (result.starterMemory) setStarterMemory(result.starterMemory.join('\n'));
    } catch (err: any) {
      setError(err.message ?? 'AI generation failed — fill fields manually.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        persona: persona || 'analyst',
        connectors: selectedConnectors,
        suggestedCommands: selectedCommands,
        starterMemory: starterMemory.split('\n').map(s => s.trim()).filter(Boolean),
      };
      const template = editingTemplate
        ? await adapter.updateWorkspaceTemplate(editingTemplate.id, payload)
        : await adapter.createWorkspaceTemplate(payload);
      onCreated(template);
      onClose();
    } catch (err: any) {
      setError(err.message ?? `Failed to ${editingTemplate ? 'update' : 'create'} template`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-display font-semibold text-foreground">{editingTemplate ? 'Edit Template' : 'Create Template'}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
        </div>

        {/* AI Generation */}
        <div className="mx-5 mt-3 space-y-2">
          <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Describe your use case and AI will auto-fill all fields, or fill them manually below.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="e.g. I need a workspace for managing customer support tickets via Slack and email"
              className="flex-1 bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-[11px] text-foreground outline-none focus:border-primary/50"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
              disabled={generating}
            />
            <button
              onClick={handleAiGenerate}
              disabled={!aiPrompt.trim() || generating}
              className="flex items-center gap-1.5 px-3 py-2 text-[11px] rounded-xl bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              {generating ? 'Generating…' : 'AI Fill'}
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="px-5 py-3 space-y-3.5 max-h-[55vh] overflow-y-auto">

          {/* Name */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="text-[11px] text-muted-foreground font-medium">Template Name</label>
              <Tooltip text="A short name for this template (e.g. 'Customer Support', 'Data Pipeline')"><Info className="w-3 h-3 text-primary/60 cursor-help" /></Tooltip>
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Customer Support Hub"
              className="w-full bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-[11px] text-foreground outline-none focus:border-primary/50" />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="text-[11px] text-muted-foreground font-medium">Description</label>
              <Tooltip text="Describe the purpose and use case. This helps AI understand the workspace domain."><Info className="w-3 h-3 text-primary/60 cursor-help" /></Tooltip>
            </div>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Handle customer tickets, track satisfaction…" rows={2}
              className="w-full bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-[11px] text-foreground outline-none focus:border-primary/50 resize-none" />
          </div>

          {/* Persona picker */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <label className="text-[11px] text-muted-foreground font-medium">Default Persona</label>
              <Tooltip text="The AI persona sets the agent's behavior style for workspaces using this template."><Info className="w-3 h-3 text-primary/60 cursor-help" /></Tooltip>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TEMPLATE_PERSONAS.map(p => {
                const Icon = p.icon;
                const isSelected = persona === p.id;
                return (
                  <button key={p.id} onClick={() => setPersona(isSelected ? '' : p.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                      isSelected ? 'bg-primary/20 border border-primary/50' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}>
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-[8px] text-muted-foreground text-center leading-tight">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connectors picker */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Plug className="w-3 h-3 text-muted-foreground" />
              <Tooltip text="Select which integrations (GitHub, Slack, Email, etc.) this template pre-configures."><Info className="w-3 h-3 text-primary/60 cursor-help" /></Tooltip>
            </div>
            <ChipPicker label="Connectors" options={availableConnectors} selected={selectedConnectors} onChange={setSelectedConnectors} />
          </div>

          {/* Commands picker */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Terminal className="w-3 h-3 text-muted-foreground" />
              <Tooltip text="Slash commands the agent can run in workspaces using this template."><Info className="w-3 h-3 text-primary/60 cursor-help" /></Tooltip>
            </div>
            <ChipPicker label="Suggested Commands"
              options={AVAILABLE_COMMANDS.map(c => ({ id: c.id, label: c.label, desc: c.desc }))}
              selected={selectedCommands} onChange={setSelectedCommands} />
          </div>

          {/* Starter Memory */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="text-[11px] text-muted-foreground font-medium">Starter Memory</label>
              <Tooltip text="One instruction per line. Seeds the agent's memory so it knows the workspace context from the start."><Info className="w-3 h-3 text-primary/60 cursor-help" /></Tooltip>
            </div>
            <textarea value={starterMemory} onChange={e => setStarterMemory(e.target.value)}
              placeholder={"e.g. This workspace tracks customer support tickets.\nKey workflow: triage → investigate → respond → close."} rows={3}
              className="w-full bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-[11px] text-foreground outline-none focus:border-primary/50 resize-none font-mono" />
          </div>
        </div>

        {error && <div className="mx-5 mb-2 text-[10px] text-destructive">{error}</div>}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border/30">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] rounded-lg text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || !description.trim() || saving}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : editingTemplate ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingTemplate ? 'Save Changes' : 'Create Template'}
          </button>
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

  // Templates
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplateCreator, setShowTemplateCreator] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkspaceTemplate | null>(null);

  // Connectors from backend
  const [connectors, setConnectors] = useState<Connector[]>([]);

  // Fetch templates + connectors when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingTemplates(true);
    Promise.all([
      adapter.getWorkspaceTemplates().catch(() => ({ templates: [] as WorkspaceTemplate[] })),
      adapter.getConnectors().catch(() => [] as Connector[]),
    ]).then(([tmplData, connData]) => {
      setTemplates(tmplData.templates);
      setConnectors(connData);
    }).finally(() => setLoadingTemplates(false));
  }, [open]);

  // When a template is selected, auto-fill persona
  useEffect(() => {
    if (!selectedTemplate) return;
    const tmpl = templates.find(t => t.id === selectedTemplate);
    if (tmpl?.persona) {
      const matchedPersona = PERSONAS.find(p => p.role === tmpl.persona || p.id === tmpl.persona);
      if (matchedPersona) setSelectedPersona(matchedPersona.id);
    }
  }, [selectedTemplate, templates]);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(), group, persona: selectedPersona, shared,
      storageType, storagePath: storagePath.trim() || undefined,
      templateId: selectedTemplate || undefined,
    });
    setName(''); setGroup('Personal'); setSelectedPersona(undefined); setShared(false);
    setStorageType('virtual'); setStoragePath(''); setSelectedTemplate(null);
    onClose();
  };

  // Build connector chip options — merge backend connectors + known names from templates
  const connectorChipOptions: ChipOption[] = (() => {
    const known = new Map<string, string>();
    // From backend
    connectors.forEach(c => known.set(c.id, c.name));
    // From templates (catch any mentioned but not in backend)
    templates.forEach(t => t.connectors.forEach(cid => { if (!known.has(cid)) known.set(cid, cid); }));
    // Ensure some common ones always show
    ['github', 'slack', 'email', 'jira', 'google-docs'].forEach(id => { if (!known.has(id)) known.set(id, id); });
    return Array.from(known.entries()).map(([id, name]) => ({ id, label: name, desc: `Connect to ${name}` }));
  })();

  if (!open) return null;

  const virtualPath = defaultVirtualPath(name);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md glass-strong rounded-2xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">Create Workspace</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-4">

            {/* ── Template Selection ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">Template</label>
                  <Tooltip text="Start from a pre-configured template with persona, tools, and starter memory already set up">
                    <Info className="w-3 h-3 text-primary/60 cursor-help" />
                  </Tooltip>
                </div>
                <button onClick={() => setShowTemplateCreator(true)}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors">
                  <Plus className="w-3 h-3" /> New Template
                </button>
              </div>

              {loadingTemplates ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {/* Blank option */}
                  <button onClick={() => setSelectedTemplate(null)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                      selectedTemplate === null ? 'bg-primary/20 border border-primary/50' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[8px] text-muted-foreground text-center leading-tight">Blank</span>
                  </button>
                  {templates.map(tmpl => {
                    const Icon = TEMPLATE_ICONS[tmpl.id] || LayoutTemplate;
                    const isSelected = selectedTemplate === tmpl.id;
                    return (
                      <Tooltip key={tmpl.id} text={tmpl.description}>
                        <button onClick={() => setSelectedTemplate(isSelected ? null : tmpl.id)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-full ${
                            isSelected ? 'bg-primary/20 border border-primary/50' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                          }`}>
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className="text-[8px] text-muted-foreground text-center leading-tight truncate w-full">
                            {tmpl.name.length > 12 ? tmpl.name.split(' ')[0] : tmpl.name}
                          </span>
                          {!tmpl.builtIn && <span className="text-[7px] text-primary/60">custom</span>}
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              )}

              {/* Template detail card */}
              {selectedTemplate && (() => {
                const tmpl = templates.find(t => t.id === selectedTemplate);
                if (!tmpl) return null;
                return (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 p-2.5 bg-primary/5 border border-primary/20 rounded-xl">
                    <p className="text-[10px] text-foreground font-medium mb-1">{tmpl.name}</p>
                    <p className="text-[9px] text-muted-foreground mb-1.5">{tmpl.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {tmpl.connectors.map(c => (
                        <span key={c} className="px-1.5 py-0.5 rounded bg-secondary/50 text-[8px] text-muted-foreground">{c}</span>
                      ))}
                      {tmpl.suggestedCommands.slice(0, 4).map(cmd => (
                        <span key={cmd} className="px-1.5 py-0.5 rounded bg-primary/10 text-[8px] text-primary font-mono">{cmd}</span>
                      ))}
                    </div>
                    <p className="text-[8px] text-muted-foreground/60 mt-1">Persona: {tmpl.persona}</p>
                  </motion.div>
                );
              })()}
            </div>

            {/* ── Workspace Name ── */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Workspace Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="My Workspace"
                className="w-full bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            </div>

            {/* ── Group ── */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Group</label>
              <div className="flex gap-2">
                {GROUPS.map(g => (
                  <button key={g} onClick={() => setGroup(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                      group === g ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
                    }`}>{g}</button>
                ))}
              </div>
            </div>

            {/* ── Storage Type ── */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Storage Type</label>
              <div className="grid grid-cols-3 gap-2">
                {STORAGE_OPTIONS.map(opt => (
                  <button key={opt.type} onClick={() => setStorageType(opt.type)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                      storageType === opt.type ? 'bg-primary/20 border border-primary/50' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}>
                    <opt.icon className={`w-5 h-5 ${opt.color}`} />
                    <span className="text-[10px] font-display text-foreground">{opt.label}</span>
                    <span className="text-[8px] text-muted-foreground">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Storage Path ── */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                {storageType === 'virtual' ? 'Storage Path' : storageType === 'local' ? 'Local Directory Path' : 'Bucket / Prefix'}
              </label>
              {storageType === 'virtual' ? (
                <div className="flex items-center gap-2 w-full bg-muted/30 border border-border/30 rounded-xl px-3 py-2">
                  <Cloud className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-[11px] font-mono text-muted-foreground truncate">{virtualPath}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input value={storagePath} onChange={e => setStoragePath(e.target.value)}
                    placeholder={storageType === 'local' ? '/home/user/projects/my-workspace' : 'my-bucket/workspace-prefix'}
                    className="flex-1 bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono text-[11px]" />
                  <button onClick={() => setShowFolderPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/50 border border-border/40 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors shrink-0"
                    title={storageType === 'local' ? 'Browse local folders' : 'Browse remote storage'}>
                    <FolderOpen className="w-3.5 h-3.5" /><span className="text-[11px]">Browse</span>
                  </button>
                </div>
              )}
              <p className="text-[9px] text-muted-foreground/60 mt-1">
                {storageType === 'virtual' && 'Managed automatically — files stored in server-managed storage.'}
                {storageType === 'local' && 'Select or type the local directory where workspace files will be stored.'}
                {storageType === 'team' && 'Browse or type the S3/MinIO bucket and prefix for shared storage.'}
              </p>
            </div>

            {/* ── Persona ── */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Persona (optional)</label>
              <div className="grid grid-cols-4 gap-2">
                {PERSONAS.map(p => (
                  <button key={p.id} onClick={() => setSelectedPersona(selectedPersona === p.id ? undefined : p.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                      selectedPersona === p.id ? 'bg-primary/20 border border-primary/50 scale-105' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}>
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

          {/* Share toggle */}
          <div className="flex items-center justify-between p-3 mt-4 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <div>
                <p className="text-xs font-display text-foreground">Share with team</p>
                <p className="text-[10px] text-muted-foreground">Make visible to all team members</p>
              </div>
            </div>
            <button onClick={() => setShared(!shared)}
              className={`w-10 h-5 rounded-full transition-colors ${shared ? 'bg-sky-500' : 'bg-muted'}`}>
              <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${shared ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-xs font-display rounded-lg text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={!name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          </div>
        </motion.div>
      </motion.div>

      <FolderPickerModal open={showFolderPicker} storageType={storageType} currentPath={storagePath}
        onSelect={(path) => setStoragePath(path)} onClose={() => setShowFolderPicker(false)} />

      <TemplateCreatorModal open={showTemplateCreator} onClose={() => setShowTemplateCreator(false)}
        availableConnectors={connectorChipOptions}
        onCreated={(t) => { setTemplates(prev => [...prev, t]); setSelectedTemplate(t.id); }} />
    </AnimatePresence>
  );
};

export default CreateWorkspaceDialog;
