import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { AgentType, AutonomyLevel, Scope } from '@waggle/shared';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Compact agent create dialog (UX-Refactor Phase 3B, S09). The full Agent
 * Builder (S18) is Phase 3C — this is the Center-side minimal create path
 * (PRD §22.1 exit criterion: "create an agent"): name, goal, model, type,
 * autonomy + explicit memory scopes (§12.9: no hidden memory access).
 * Agent create is FREE-tier (no gate).
 *
 * Body-portaled (AppWindow's transform confines inline fixed overlays to the
 * window box) with useFocusTrap for Escape / Tab trap / focus restore.
 */
export interface CreateAgentInput {
  name: string;
  goal: string;
  model: string;
  type: AgentType;
  autonomyLevel: AutonomyLevel;
  memoryScopes: Scope[];
  personaId?: string;
}

interface CreateAgentDialogProps {
  busy?: boolean;
  /** Prefill from a persona template (Templates side affordance). */
  initial?: Partial<CreateAgentInput>;
  onCreate: (input: CreateAgentInput) => void;
  onCancel: () => void;
}

const AGENT_TYPES: AgentType[] = ['personal', 'workspace', 'team', 'autonomous'];
const AUTONOMY_LEVELS: AutonomyLevel[] = ['manual', 'guided', 'medium', 'high'];
const SCOPES: Scope[] = ['personal', 'workspace', 'team', 'organization'];

const CreateAgentDialog = ({ busy, initial, onCreate, onCancel }: CreateAgentDialogProps) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  const [name, setName] = useState(initial?.name ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [model, setModel] = useState(initial?.model ?? 'auto');
  const [type, setType] = useState<AgentType>(initial?.type ?? 'personal');
  const [autonomy, setAutonomy] = useState<AutonomyLevel>(initial?.autonomyLevel ?? 'guided');
  const [scopes, setScopes] = useState<Scope[]>(initial?.memoryScopes ?? ['personal']);

  const toggleScope = (s: Scope) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const valid = name.trim().length > 0 && goal.trim().length > 0 && scopes.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
      data-testid="create-agent-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create agent"
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        data-testid="create-agent-dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-display font-semibold text-foreground">New agent</h3>
          <button onClick={onCancel} aria-label="Close create agent" className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Quick create — the full Agent Builder (skills, connectors, permissions) arrives in the next phase.
          {initial?.personaId ? ` Based on persona "${initial.personaId}".` : ''}
        </p>

        <div className="space-y-1">
          <label htmlFor="ca-name" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Name</label>
          <Input id="ca-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Research scout" className="text-xs h-8" autoFocus />
        </div>
        <div className="space-y-1">
          <label htmlFor="ca-goal" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Goal</label>
          <Input id="ca-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this agent achieve?" className="text-xs h-8" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label htmlFor="ca-model" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Model</label>
            <Input id="ca-model" value={model} onChange={(e) => setModel(e.target.value)} className="text-xs h-8" />
          </div>
          <div className="space-y-1">
            <label htmlFor="ca-type" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Type</label>
            <select id="ca-type" value={type} onChange={(e) => setType(e.target.value as AgentType)} className="w-full text-xs h-8 rounded-md border border-border bg-muted/40 px-2 capitalize">
              {AGENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="ca-autonomy" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Autonomy</label>
            <select id="ca-autonomy" value={autonomy} onChange={(e) => setAutonomy(e.target.value as AutonomyLevel)} className="w-full text-xs h-8 rounded-md border border-border bg-muted/40 px-2 capitalize">
              {AUTONOMY_LEVELS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Memory scopes (explicit — nothing else is readable)</legend>
          <div className="flex flex-wrap gap-1">
            {SCOPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleScope(s)}
                aria-pressed={scopes.includes(s)}
                className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors capitalize ${
                  scopes.includes(s) ? 'border-primary/40 bg-primary/15 text-primary' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={() => onCreate({ name: name.trim(), goal: goal.trim(), model: model.trim() || 'auto', type, autonomyLevel: autonomy, memoryScopes: scopes, personaId: initial?.personaId })}
            disabled={busy || !valid}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="create-agent-submit"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Create agent
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CreateAgentDialog;
