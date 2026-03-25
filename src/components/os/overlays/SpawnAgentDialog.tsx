import { useState, useEffect } from 'react';
import { Rocket, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
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
  const [form, setForm] = useState({
    task: '',
    persona: '',
    model: MODELS[0],
    workspaceMode: 'existing' as 'existing' | 'new',
    workspaceId: '',
    newWorkspaceName: '',
  });

  // Default to active workspace when dialog opens
  useEffect(() => {
    if (open && activeWorkspaceId) {
      setForm(f => ({ ...f, workspaceId: f.workspaceId || activeWorkspaceId }));
    }
  }, [open, activeWorkspaceId]);

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
      setForm({ task: '', persona: '', model: MODELS[0], workspaceMode: 'existing', workspaceId: activeWorkspaceId || '', newWorkspaceName: '' });
      onSpawned?.();
    } catch { /* ignore */ }
    finally { setSpawning(false); }
  };

  const canSubmit = form.task.trim() && (
    form.workspaceMode === 'existing' ? form.workspaceId : form.newWorkspaceName.trim()
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Rocket className="w-5 h-5 text-primary" /> Spawn Agent
          </DialogTitle>
          <DialogDescription>
            Configure and launch a sub-agent to handle a task autonomously.
          </DialogDescription>
        </DialogHeader>

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

          {/* Persona */}
          <div className="space-y-2">
            <Label className="text-foreground">Persona <span className="text-muted-foreground font-normal">(optional)</span></Label>
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
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label className="text-foreground">Model</Label>
            <div className="flex flex-wrap gap-1.5">
              {MODELS.map(m => (
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!canSubmit || spawning}
            onClick={handleSpawn}
            className="gap-1.5"
          >
            {spawning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            {spawning ? 'Spawning…' : 'Launch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SpawnAgentDialog;
