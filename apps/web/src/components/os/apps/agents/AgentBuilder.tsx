import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BuilderStepper, type BuilderStep } from '@/components/ui/stepper';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';
import ModelSelector from '@/components/os/ModelSelector';
import { useProviders } from '@/hooks/useProviders';
import { adapter } from '@/lib/adapter';
import type { Persona, Workspace } from '@/lib/types';
import type { AgentType, AutonomyLevel, ConnectorDefinition, Scope } from '@waggle/shared';

/**
 * Agent Builder (UX-Refactor Phase 3C, S18 — PRD §12.9). Replaces the 3B
 * compact CreateAgentDialog with the full 5-step declaration stepper: an
 * agent's goal, scope (workspaces), model, memory scopes, skills, connectors,
 * MCPs and autonomy are all EXPLICIT (rule #6: "no agent has hidden
 * memory/tool access") and the Review step renders every declared field
 * before Create. Elevated selections (connectors / MCP servers) route
 * through the ApprovalModal before the create fires (§17.3).
 *
 * Create is FREE-tier (no gate — agents generate memory, CLAUDE.md §1).
 * v1 deliberate omissions (rendered honestly, not silently):
 *  - no per-tool grants — tools derive from persona + skills (the create
 *    contract carries no tools field);
 *  - no explicit permissions editor — `permissions` stays default and the
 *    review states "elevated actions require approval at run time".
 */
export interface AgentBuilderInput {
  name: string;
  goal: string;
  model: string;
  type: AgentType;
  autonomyLevel: AutonomyLevel;
  memoryScopes: Scope[];
  description?: string;
  personaId?: string;
  workspaceIds?: string[];
  skillIds?: string[];
  connectorIds?: string[];
  mcpIds?: string[];
}

interface AgentBuilderProps {
  busy?: boolean;
  /** Prefill from a persona template (Templates side affordance). */
  initial?: Partial<AgentBuilderInput>;
  workspaces?: Workspace[];
  onCreate: (input: AgentBuilderInput) => void;
  onCancel: () => void;
}

const AGENT_TYPES: AgentType[] = ['personal', 'workspace', 'team', 'autonomous'];
const AUTONOMY_LEVELS: Array<{ id: AutonomyLevel; hint: string }> = [
  { id: 'manual', hint: 'every action waits for you' },
  { id: 'guided', hint: 'asks before anything consequential' },
  { id: 'medium', hint: 'acts, asks on elevated access' },
  { id: 'high', hint: 'acts autonomously within its declared scope' },
];
const SCOPES: Scope[] = ['personal', 'workspace', 'team', 'organization'];

function TogglePill({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors capitalize ${
        active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}

/** §12.9 review row — chips when declared, the explicit no-access copy when not. */
function ReviewList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((it) => (
            <span key={it} className="px-1.5 py-0.5 rounded text-[11px] bg-muted/50 text-muted-foreground">{it}</span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground/70">None declared — no access</p>
      )}
    </div>
  );
}

const AgentBuilder = ({ busy, initial, workspaces, onCreate, onCancel }: AgentBuilderProps) => {
  const [step, setStep] = useState(0);
  // Step 1 — identity
  const [name, setName] = useState(initial?.name ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [personaId, setPersonaId] = useState(initial?.personaId ?? '');
  const [type, setType] = useState<AgentType>(initial?.type ?? 'personal');
  // Step 2 — capabilities
  const [model, setModel] = useState(initial?.model ?? 'auto');
  const [autonomy, setAutonomy] = useState<AutonomyLevel>(initial?.autonomyLevel ?? 'guided');
  // Step 3 — scope & memory
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(initial?.workspaceIds ?? []);
  const [scopes, setScopes] = useState<Scope[]>(initial?.memoryScopes ?? ['personal']);
  const [skillIds, setSkillIds] = useState<string[]>(initial?.skillIds ?? []);
  const [skillFilter, setSkillFilter] = useState('');
  // Step 4 — permissions
  const [connectorIds, setConnectorIds] = useState<string[]>(initial?.connectorIds ?? []);
  const [mcpIds, setMcpIds] = useState<string[]>(initial?.mcpIds ?? []);
  // Catalogs
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const { providers } = useProviders();
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      adapter.getPersonas(),
      adapter.getSkills(),
      adapter.getConnectors(),
      adapter.getCapabilityStatus(),
    ]).then(([p, s, c, caps]) => {
      if (cancelled) return;
      if (p.status === 'fulfilled') setPersonas(p.value);
      if (s.status === 'fulfilled') setSkills(s.value.map((x) => x.id || x.name));
      if (c.status === 'fulfilled') setConnectors(c.value);
      if (caps.status === 'fulfilled') {
        const cs = caps.value as { mcpServers?: Array<{ name: string }> };
        setMcpServers((cs.mcpServers ?? []).map((m) => m.name));
      }
      if ([p, s, c, caps].some((r) => r.status === 'rejected')) {
        setCatalogNote('Some catalogs failed to load — the affected pickers show no options. You can still create the agent.');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const toggleIn = (list: string[], v: string, set: (next: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const steps: BuilderStep[] = [
    { id: 'identity', label: 'Identity', valid: name.trim().length > 0 && goal.trim().length > 0 },
    { id: 'capabilities', label: 'Capabilities', valid: model.trim().length > 0 },
    { id: 'scope', label: 'Scope & memory', valid: scopes.length > 0 },
    { id: 'permissions', label: 'Permissions', valid: true },
    { id: 'review', label: 'Review & create', valid: true },
  ];

  const buildInput = (): AgentBuilderInput => ({
    name: name.trim(),
    goal: goal.trim(),
    model: model.trim() || 'auto',
    type,
    autonomyLevel: autonomy,
    memoryScopes: scopes,
    ...(description.trim() ? { description: description.trim() } : {}),
    ...(personaId ? { personaId } : {}),
    ...(workspaceIds.length > 0 ? { workspaceIds } : {}),
    ...(skillIds.length > 0 ? { skillIds } : {}),
    ...(connectorIds.length > 0 ? { connectorIds } : {}),
    ...(mcpIds.length > 0 ? { mcpIds } : {}),
  });

  const elevated = connectorIds.length > 0 || mcpIds.length > 0;

  // The review + approval surfaces must speak the same vocabulary the picker
  // does — display names, with the raw id as fallback when the catalog
  // failed to load (same preservation pattern as the persona option).
  const connName = (id: string) => connectors.find((c) => c.id === id)?.name ?? id;

  const finish = () => {
    if (elevated) {
      // §17.3: elevated access (external connectors / MCP servers) is
      // reviewed BEFORE the agent exists.
      setApproval({
        action: `Create agent "${name.trim()}" with elevated access to external systems.`,
        scope: [
          ...connectorIds.map((c) => `Connector: ${connName(c)}`),
          ...mcpIds.map((m) => `MCP server: ${m}`),
        ],
        riskLevel: 'medium',
      });
      return;
    }
    onCreate(buildInput());
  };

  const wsName = (id: string) => workspaces?.find((w) => w.id === id)?.name ?? id;
  const visibleSkills = skills.filter((s) => !skillFilter || s.toLowerCase().includes(skillFilter.toLowerCase()));
  // Single source for the active panel — derived from the same array that
  // drives the stepper pills (a separate STEP_IDS const could silently desync).
  const stepId = steps[step]?.id;

  return (
    <>
      <BuilderStepper
        title="Agent Builder"
        subtitle="Everything this agent can see and do is declared here — nothing is hidden."
        steps={steps}
        current={step}
        onNavigate={setStep}
        onCancel={onCancel}
        onFinish={finish}
        finishLabel="Create agent"
        busy={busy}
        testId="agent-builder"
      >
        {catalogNote && <p role="status" className="text-[11px] text-amber-400">{catalogNote}</p>}

        {stepId === 'identity' && (
          <>
            <div className="space-y-1">
              <FieldLabel htmlFor="ab-name">Name</FieldLabel>
              <Input id="ab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Research scout" className="text-xs h-8" autoFocus />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="ab-goal">Goal</FieldLabel>
              <Input id="ab-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this agent achieve?" className="text-xs h-8" />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="ab-desc">Description (optional)</FieldLabel>
              <Textarea id="ab-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Longer context for teammates and future you" className="min-h-[56px] text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="ab-persona">Persona (optional)</FieldLabel>
                <select id="ab-persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="w-full text-xs h-8 rounded-md border border-border bg-muted/40 px-2">
                  <option value="">None — plain agent</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  {/* A prefilled persona id must stay selectable even when the catalog failed to load. */}
                  {personaId && !personas.some((p) => p.id === personaId) && <option value={personaId}>{personaId}</option>}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ab-type">Type</FieldLabel>
                <select id="ab-type" value={type} onChange={(e) => setType(e.target.value as AgentType)} className="w-full text-xs h-8 rounded-md border border-border bg-muted/40 px-2 capitalize">
                  {AGENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {stepId === 'capabilities' && (
          <>
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Model</legend>
              <TogglePill active={model === 'auto'} label="Automatic — router picks per task" onToggle={() => setModel('auto')} />
              {providers.length > 0 ? (
                <ModelSelector value={model === 'auto' ? '' : model} onChange={setModel} providers={providers} className="mt-1" />
              ) : (
                <Input aria-label="Model id" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id (provider catalog unavailable)" className="text-xs h-8 mt-1" />
              )}
            </fieldset>
            <div className="space-y-1">
              <FieldLabel htmlFor="ab-autonomy">Autonomy level</FieldLabel>
              <select id="ab-autonomy" value={autonomy} onChange={(e) => setAutonomy(e.target.value as AutonomyLevel)} className="w-full text-xs h-8 rounded-md border border-border bg-muted/40 px-2 capitalize">
                {AUTONOMY_LEVELS.map((a) => <option key={a.id} value={a.id}>{a.id} — {a.hint}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tools are not granted per-agent in v1 — they derive from the persona and the skills you attach in the next step.
            </p>
          </>
        )}

        {stepId === 'scope' && (
          <>
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Workspaces (where it may run)</legend>
              <div className="flex flex-wrap gap-1">
                {(workspaces ?? []).map((w) => (
                  <TogglePill key={w.id} active={workspaceIds.includes(w.id)} label={w.name} onToggle={() => toggleIn(workspaceIds, w.id, setWorkspaceIds)} />
                ))}
                {(workspaces ?? []).length === 0 && <p className="text-[11px] text-muted-foreground/70">No workspaces available.</p>}
              </div>
              <p className="text-[10px] text-muted-foreground">None selected = you pick a workspace at run time.</p>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Memory scopes (explicit — nothing else is readable)</legend>
              <div className="flex flex-wrap gap-1">
                {SCOPES.map((s) => (
                  <TogglePill key={s} active={scopes.includes(s)} label={s} onToggle={() => setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))} />
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Skills</legend>
              {skills.length > 8 && (
                <Input aria-label="Filter skills" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} placeholder="Filter skills…" className="text-xs h-7" />
              )}
              <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-md border border-border/40 p-1.5">
                {visibleSkills.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs text-foreground/90 px-1 py-0.5 rounded hover:bg-muted/40">
                    <input type="checkbox" checked={skillIds.includes(s)} onChange={() => toggleIn(skillIds, s, setSkillIds)} className="accent-primary" />
                    {s}
                  </label>
                ))}
                {visibleSkills.length === 0 && <p className="text-[11px] text-muted-foreground/70 px-1 py-0.5">No skills{skillFilter ? ' match' : ' available'}.</p>}
              </div>
            </fieldset>
          </>
        )}

        {stepId === 'permissions' && (
          <>
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Connectors (external systems)</legend>
              <div className="max-h-32 overflow-y-auto space-y-0.5 rounded-md border border-border/40 p-1.5">
                {connectors.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs text-foreground/90 px-1 py-0.5 rounded hover:bg-muted/40">
                    <input type="checkbox" checked={connectorIds.includes(c.id)} onChange={() => toggleIn(connectorIds, c.id, setConnectorIds)} className="accent-primary" />
                    {c.name}
                    <span className="text-[10px] text-muted-foreground">({c.status})</span>
                  </label>
                ))}
                {connectors.length === 0 && <p className="text-[11px] text-muted-foreground/70 px-1 py-0.5">No connectors configured.</p>}
              </div>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">MCP servers</legend>
              <div className="max-h-32 overflow-y-auto space-y-0.5 rounded-md border border-border/40 p-1.5">
                {mcpServers.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-xs text-foreground/90 px-1 py-0.5 rounded hover:bg-muted/40">
                    <input type="checkbox" checked={mcpIds.includes(m)} onChange={() => toggleIn(mcpIds, m, setMcpIds)} className="accent-primary" />
                    {m}
                  </label>
                ))}
                {mcpServers.length === 0 && <p className="text-[11px] text-muted-foreground/70 px-1 py-0.5">No MCP servers configured.</p>}
              </div>
            </fieldset>
            {elevated && (
              <p role="status" className="text-[11px] text-amber-400" data-testid="agent-builder-elevated-warning">
                Elevated access — connectors and MCP servers act on external systems. Creating this agent will ask for your approval.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Permissions stay at the safe default in v1 — elevated actions surface in Approvals at run time.
            </p>
          </>
        )}

        {stepId === 'review' && (
          <div className="space-y-3" data-testid="agent-builder-review">
            <div>
              <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Identity</p>
              <p className="mt-1 text-xs text-foreground/90">
                {name.trim()} — <span className="capitalize">{type}</span> agent
                {personaId ? ` · persona ${personaId}` : ' · no persona'}
              </p>
              <p className="mt-1 text-xs text-foreground/90">{goal.trim()}</p>
              {description.trim() && <p className="mt-1 text-[11px] text-muted-foreground">{description.trim()}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Model:</span> {model.trim() || 'auto'}</div>
              <div><span className="text-muted-foreground">Autonomy:</span> <span className="capitalize">{autonomy}</span></div>
            </div>
            <ReviewList label="Workspaces" items={workspaceIds.map(wsName)} />
            <ReviewList label="Memory scopes" items={scopes} />
            <ReviewList label="Skills" items={skillIds} />
            <ReviewList label="Connectors" items={connectorIds.map(connName)} />
            <ReviewList label="MCP servers" items={mcpIds} />
            <div>
              <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Permissions</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">Default permissions — elevated actions require approval</p>
            </div>
          </div>
        )}
      </BuilderStepper>

      <ApprovalModal
        request={approval}
        approveLabel="Approve & create"
        busy={busy}
        onApprove={() => { setApproval(null); onCreate(buildInput()); }}
        onCancel={() => setApproval(null)}
      />
    </>
  );
};

export default AgentBuilder;
