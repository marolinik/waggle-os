import { motion } from 'framer-motion';
import { FolderPlus, Briefcase, Users2, Microscope, User, Loader2 } from 'lucide-react';
import type { ElementType } from 'react';
import { fadeSlide } from './constants';
import type { WorkspaceCreateStepProps, OnboardingWorkspaceType } from './types';

/**
 * S17 (thin / onboarding-embedded) — Workspace Creation. A trimmed type-picker
 * (C6: `project | client | research | personal`) + a name field, routed through
 * the SAME existing create path (`handleFinish` → `adapter.createWorkspace`).
 * The full stepped S17 wizard (suggested skills/agents/connectors panels) is a
 * separate standalone card; per C35 no installs/OAuth run here. The full
 * 6-type `WorkspaceType` reserves `team`/`organization` — onboarding offers the
 * 4 personal-scope types only.
 */
const WORKSPACE_TYPES: ReadonlyArray<{
  id: OnboardingWorkspaceType;
  name: string;
  desc: string;
  icon: ElementType;
}> = [
  { id: 'project',  name: 'Project',  desc: 'A focused piece of work', icon: Briefcase },
  { id: 'client',   name: 'Client',   desc: 'Work for a specific client', icon: Users2 },
  { id: 'research', name: 'Research',  desc: 'Explore a topic or question', icon: Microscope },
  { id: 'personal', name: 'Personal',  desc: 'Your own space', icon: User },
];

const WorkspaceCreateStep = ({
  workspaceType,
  workspaceName,
  onSelectType,
  onNameChange,
  onCreate,
  onBack,
  creating,
  createError,
}: WorkspaceCreateStepProps) => (
  <motion.div key="step-workspace-create" {...fadeSlide}>
    <div className="text-center mb-6">
      <FolderPlus className="w-10 h-10 text-honey mx-auto mb-3" />
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">
        Create your first workspace
      </h2>
      <p className="text-sm text-muted-foreground">
        Each workspace is its own brain — memory, files, and agents stay isolated.
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1.5">
        Your agent learns each workspace's patterns and can propose new skills — you approve every change.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2.5 mb-5">
      {WORKSPACE_TYPES.map((t) => {
        const Icon = t.icon;
        const selected = workspaceType === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectType(t.id)}
            aria-pressed={selected}
            className={`glass-strong rounded-xl p-3.5 text-left transition-colors flex flex-col gap-1 ${
              selected ? 'ring-2 ring-primary border-primary/40' : 'hover:border-primary/40'
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${selected ? 'text-honey' : 'text-muted-foreground'}`} />
            <h3 className="text-sm font-display font-semibold text-foreground">{t.name}</h3>
            <p className="text-[11px] text-muted-foreground">{t.desc}</p>
          </button>
        );
      })}
    </div>

    <div className="mb-5">
      <label className="text-xs text-muted-foreground block mb-1" htmlFor="ws-name">Workspace name</label>
      <input
        id="ws-name"
        value={workspaceName}
        onChange={e => onNameChange(e.target.value)}
        placeholder="My Workspace"
        className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
    </div>

    {createError && (
      <p className="text-xs text-[var(--sem-risk,theme(colors.red.400))] mb-3">{createError}</p>
    )}

    <div className="flex items-center justify-between gap-4">
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display rounded-md px-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Back
      </button>
      <button
        onClick={onCreate}
        disabled={creating || !workspaceName.trim()}
        aria-busy={creating}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {creating ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : null}
        {creating ? 'Creating…' : 'Create workspace →'}
      </button>
    </div>
  </motion.div>
);

export default WorkspaceCreateStep;
