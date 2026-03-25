import { useState, useEffect } from 'react';
import { Rocket, RefreshCw, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { PERSONAS } from '@/lib/personas';
import type { Workspace } from '@/lib/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SpawnAgentDialogProps {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  onWorkspaceCreated?: (ws: Workspace) => void;
  onSpawned?: () => void;
}

const SpawnAgentDialog = ({ open, onClose, workspaces, activeWorkspaceId, onWorkspaceCreated, onSpawned }: SpawnAgentDialogProps) => {
  const [spawning, setSpawning] = useState(false);
  const [step, setStep] = useState<'config' | 'confirm'>('config');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showPersona, setShowPersona] = useState(false);
  const [form, setForm] = useState({
    task: '',
    persona: '',
    model: '',
    workspaceMode: 'existing' as 'existing' | 'new',
    workspaceId: '',
    newWorkspaceName: '',
  });

  // Fetch models from backend and default model to active workspace's model
  useEffect(() => {
    if (open) {
      if (activeWorkspaceId) {
        setForm(f => ({ ...f, workspaceId: f.workspaceId || activeWorkspaceId }));
      }

      // Find the active workspace's model to use as default
      const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
      const wsModel = activeWs?.model;

      setLoadingModels(true);
      adapter.getModels()
        .then(m => {
          setModels(m);
          // Prefer workspace model if available and in the list, otherwise first model
          const defaultModel = wsModel && m.includes(wsModel) ? wsModel : m[0] || '';
          setForm(f => ({ ...f, model: f.model || defaultModel }));
        })
        .catch(() => {})
        .finally(() => setLoadingModels(false));
    }
  }, [open, activeWorkspaceId, workspaces]);

  const handleSpawn = async () => {
    if (!form.task.trim()) return;
    setSpawning(true);
    try {
      let targetWorkspaceId = form.workspaceId;

      // Create new workspace if needed
      if (form.workspaceMode === 'new' && form.newWorkspaceName.trim()) {
        const ws = await adapter.createWorkspace({
          name: form.newWorkspaceName.trim(),
          group: 'spawned',
          persona: form.persona || undefined,
        });
        targetWorkspaceId = ws.id;
        onWorkspaceCreated?.(ws);
      }

      await adapter.spawnAgent({
        task: form.task,
        persona: form.persona || undefined,
        model: form.model,
        parentWorkspaceId: targetWorkspaceId || undefined,
      });

      onClose();
      setStep('config');
      setForm({ task: '', persona: '', model: models[0] || '', workspaceMode: 'existing', workspaceId: activeWorkspaceId || '', newWorkspaceName: '' });
      onSpawned?.();
    } catch { /* ignore */ }
    finally { setSpawning(false); }
  };

  const canSubmit = form.task.trim() && (
    form.workspaceMode === 'existing' ? form.workspaceId : form.newWorkspaceName.trim()
  );

  const targetWorkspaceName = form.workspaceMode === 'existing'
    ? workspaces.find(w => w.id === form.workspaceId)?.name || 'Unknown'
    : form.newWorkspaceName.trim();

  const selectedPersona = PERSONAS.find(p => p.id === form.persona);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Rocket className="w-5 h-5 text-primary" />
            {step === 'config' ? 'Spawn Agent' : 'Confirm Launch'}
          </DialogTitle>
          <DialogDescription>
            {step === 'config'
              ? 'Configure and launch a sub-agent to handle a task autonomously.'
              : 'Review the details below before launching.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'config' ? (
          <>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              {/* Workspace */}
              <div className="space-y-2">
                <Label className="text-foreground">Workspace</Label>
                <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 w-fit">
                  {(['existing', 'new'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, workspaceMode: mode }))}
                      className={`px-3 py-1.5 text-xs rounded-md font-display transition-colors capitalize ${
                        form.workspaceMode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'existing' ? 'Existing' : '+ New'}
                    </button>
                  ))}
                </div>

                {form.workspaceMode === 'existing' ? (
                  <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto">
                    {workspaces.map(ws => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, workspaceId: ws.id }))}
                        className={`px-2.5 py-1.5 text-xs rounded-lg border text-left transition-all truncate ${
                          form.workspaceId === ws.id
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                            : 'border-border/30 bg-secondary/20 text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                        }`}
                      >
                        {ws.name}
                      </button>
                    ))}
                    {workspaces.length === 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground py-2 text-center">No workspaces — create a new one</p>
                    )}
                  </div>
                ) : (
                  <Input
                    placeholder="New workspace name..."
                    value={form.newWorkspaceName}
                    onChange={e => setForm(f => ({ ...f, newWorkspaceName: e.target.value }))}
                    className="bg-secondary/30 border-border/50 text-foreground placeholder:text-muted-foreground"
                  />
                )}
              </div>

              {/* Task */}
              <div className="space-y-2">
                <Label htmlFor="spawn-task" className="text-foreground">Task</Label>
                <Textarea
                  id="spawn-task"
                  placeholder="Describe what this agent should do..."
                  value={form.task}
                  onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
                  className="min-h-[80px] bg-secondary/30 border-border/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* Persona (collapsible override) */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowPersona(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPersona ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span>Persona override</span>
                  {form.persona && (
                    <span className="text-[10px] text-primary ml-1">({PERSONAS.find(p => p.id === form.persona)?.name})</span>
                  )}
                </button>
                {showPersona && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {PERSONAS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, persona: f.persona === p.id ? '' : p.id }))}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all ${
                          form.persona === p.id
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                            : 'border-border/30 bg-secondary/20 hover:bg-secondary/40'
                        }`}
                      >
                        <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-[10px] text-foreground font-medium leading-tight truncate w-full">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Model */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-foreground">Model</Label>
                  {workspaces.find(w => w.id === activeWorkspaceId)?.model && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/50">
                            inherited from {workspaces.find(w => w.id === activeWorkspaceId)?.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          Changing the model here only affects this spawned agent, not the parent workspace.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {loadingModels ? (
                  <p className="text-xs text-muted-foreground">Loading models…</p>
                ) : models.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No models available — check backend config</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {models.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, model: m }))}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          form.model === m
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/30 bg-secondary/20 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!canSubmit}
                onClick={() => setStep('confirm')}
                className="gap-1.5"
              >
                Review & Launch
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div className="rounded-xl bg-secondary/30 border border-border/30 p-4 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Workspace</p>
                  <p className="text-sm text-foreground font-display">
                    {form.workspaceMode === 'new' ? `${targetWorkspaceName} (new)` : targetWorkspaceName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Task</p>
                  <p className="text-sm text-foreground leading-relaxed">{form.task}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Model</p>
                  <p className="text-sm text-foreground font-mono">{form.model}</p>
                </div>
                {selectedPersona && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Persona</p>
                    <div className="flex items-center gap-2">
                      <img src={selectedPersona.avatar} alt={selectedPersona.name} className="w-6 h-6 rounded-full object-cover" />
                      <span className="text-sm text-foreground">{selectedPersona.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setStep('config')} className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <Button
                size="sm"
                disabled={spawning}
                onClick={handleSpawn}
                className="gap-1.5"
              >
                {spawning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                {spawning ? 'Spawning…' : 'Confirm & Launch'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SpawnAgentDialog;
