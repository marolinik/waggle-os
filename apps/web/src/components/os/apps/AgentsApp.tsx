import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Search, AlertCircle, RefreshCw, LibraryBig, ChevronRight, Network, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import BeeLoader from '@/components/ui/BeeLoader';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import type { Agent, Workspace } from '@/lib/types';
import {
  AGENT_CENTER_TABS,
  type AgentCenterTab,
  filterAgentsByTab,
  agentKpis,
  formatSuccessRate,
  workspaceAmbiguityIds,
  shouldSuggestAgents,
  SUGGESTED_PERSONA_IDS,
} from '@/lib/agent-center-display';
import { getPersonaById, PERSONAS, type PersonaConfig } from '@/lib/personas';
import AgentCenterRow from './agents/AgentCenterRow';
import AgentCenterDetail from './agents/AgentCenterDetail';
import WorkspacePickerDialog from './agents/WorkspacePickerDialog';
import AgentBuilder, { type AgentBuilderInput } from './agents/AgentBuilder';
import SuggestedAgentCards from './agents/SuggestedAgentCards';
import TemplatesView from './agents/TemplatesView';
import type { BackendPersona } from './agents/types';

/**
 * Agent Center (UX-Refactor Phase 3B, S09). Agents as explicit, governed work
 * actors over the B3 agents.json store (/api/agents). C22: category tabs =
 * All / Personal / Workspace / Team / Autonomous / Archive; Templates (the
 * legacy persona catalog + groups) is a SIDE AFFORDANCE, not a tab. C23: Run
 * is a one-shot fleet-spawn — on `workspace_ambiguous` a picker opens and the
 * run retries with the chosen workspace. Acceptance (§12.9): a user can
 * explain what an agent can see and do before enabling it (detail drawer).
 */
interface AgentsAppProps {
  workspaces?: Workspace[];
}

const AgentsApp = ({ workspaces }: AgentsAppProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Cold-load race guard (same fix as HomeCockpit): wait for the adapter's
  // initial connect() to settle so a restored window doesn't 401 into a
  // spurious "listAgents failed: 401" panel before the session token exists.
  const { connecting } = useService();
  const [view, setView] = useState<'center' | 'templates'>('center');
  const [tab, setTab] = useState<AgentCenterTab>('all');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Agent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ agent: Agent; workspaceIds: string[] } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<Partial<AgentBuilderInput> | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adapter.listAgents();
      setAgents(rows);
      // Keep an open detail drawer pointing at the FRESH record (a run/pause
      // reload would otherwise leave it showing the stale pre-action status).
      setSelected(prev => (prev ? rows.find(a => a.id === prev.id) ?? null : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  // Defer until the adapter's initial connect attempt has settled (gates on
  // `connecting`, not `connected`, so a failed connect still reaches the
  // error/Retry UI instead of a permanent skeleton).
  useEffect(() => {
    if (connecting) return;
    void load();
  }, [load, connecting]);

  /** busyId is shared by run/pause/archive — clear it only if this action
   *  still owns it, so overlapping actions on two agents can't re-enable a
   *  row whose own call is still in flight (double-spawn risk). */
  const releaseBusy = (id: string) => setBusyId(prev => (prev === id ? null : prev));

  const run = async (agent: Agent, workspaceId?: string) => {
    setBusyId(agent.id);
    try {
      const res = await adapter.runAgent(agent.id, workspaceId ? { workspaceId } : {});
      const wsName = workspaces?.find((w) => w.id === res.workspaceId)?.name ?? res.workspaceId;
      toast({ title: 'Run started', description: `${agent.name} → ${wsName}` });
      await load();
    } catch (err) {
      // C23: ambiguity → open the workspace picker, then retry with a choice.
      const ids = workspaceAmbiguityIds(err);
      if (ids && ids.length > 0) {
        // Close the detail drawer first: it is a portaled MODAL sheet (z-50 +
        // pointer-events lock) that would paint over and inert-ify the picker.
        setSelected(null);
        setPicker({ agent, workspaceIds: ids });
      } else {
        toast({ title: 'Run failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      }
    } finally {
      releaseBusy(agent.id);
    }
  };

  const pause = async (agent: Agent) => {
    setBusyId(agent.id);
    try {
      await adapter.pauseAgent(agent.id);
      toast({ title: 'Paused', description: `${agent.name} — the in-flight run was stopped` });
      await load();
    } catch (err) {
      toast({ title: 'Pause failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      releaseBusy(agent.id);
    }
  };

  const archiveToggle = async (agent: Agent) => {
    setBusyId(agent.id);
    try {
      await adapter.patchAgent(agent.id, { status: agent.status === 'archived' ? 'idle' : 'archived' });
      setSelected(null);
      await load();
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      releaseBusy(agent.id);
    }
  };

  const create = async (input: AgentBuilderInput) => {
    setCreating(true);
    try {
      const created = await adapter.createAgent(input);
      setCreateOpen(false);
      setCreateInitial(undefined);
      toast({ title: 'Agent created', description: input.name });
      await load();
      // Open the §12.9 detail surface for the new agent — it carries the Run
      // affordance, so "create → review → run" is one continuous flow.
      setSelected(created);
    } catch (err) {
      toast({ title: 'Create failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  // Single create seam shared by the Templates side affordance and the F-W5C
  // sparse suggestion cards, so the two entry points can't drift.
  const startFromPersona = useCallback((p: { id: string; name: string; description: string }) => {
    setView('center');
    setCreateInitial({ personaId: p.id, name: p.name, goal: p.description });
    setCreateOpen(true);
  }, []);
  const useTemplate = (persona: BackendPersona) => startFromPersona(persona);

  // F-W5C: curated personas offered when the fleet is near-empty (resolved once).
  const suggestedPersonas = useMemo(
    () => SUGGESTED_PERSONA_IDS
      .map(getPersonaById)
      .filter((p): p is PersonaConfig => !!p),
    [],
  );

  const q = search.trim().toLowerCase();
  const visible = filterAgentsByTab(agents, tab).filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.goal.toLowerCase().includes(q),
  );
  const kpis = agentKpis(agents);
  // F-W5C: show the suggestion block only on the unfiltered 'all' tab with a
  // near-empty fleet — never while searching/filtering or once it grows.
  const sparse = shouldSuggestAgents({ loading, error: !!error, tab, query: search, agentCount: agents.length });

  return (
    <div className="flex flex-col h-full">
      {/* Header: title + Templates side affordance + create */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-honey shrink-0" />
          <h2 className="text-sm font-display font-bold text-foreground">Agents</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {/* KPI strip (C27: success-rate yes, hours-saved no). Round-7 fix 3b:
              lives in the page header as page-level stats — the search row
              below breathes. Center view only (Templates isn't the fleet). */}
          {view === 'center' && (
            <div className="hidden sm:flex items-center gap-3 mr-2 text-[11px] text-muted-foreground shrink-0" data-testid="agent-center-kpis">
              <span><span className="text-foreground font-medium tabular-nums">{kpis.total}</span> {kpis.total === 1 ? 'agent' : 'agents'}</span>
              <span><span className="text-foreground font-medium tabular-nums">{kpis.running}</span> running</span>
              {/* H2: no runs yet → hide the segment rather than showing a dash. */}
              {kpis.avgSuccessRate !== null && (
                <span>avg success <span className="text-foreground font-medium tabular-nums">{formatSuccessRate(kpis.avgSuccessRate)}</span></span>
              )}
            </div>
          )}
          <button
            onClick={() => setView(view === 'templates' ? 'center' : 'templates')}
            aria-pressed={view === 'templates'}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
              view === 'templates' ? 'bg-primary/20 text-honey' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
            }`}
          >
            <LibraryBig className="w-3 h-3" /> Templates
          </button>
          <button
            onClick={() => { setCreateInitial(undefined); setCreateOpen(true); }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Agent
          </button>
        </div>
      </div>

      {view === 'templates' ? (
        <div className="flex-1 min-h-0">
          <TemplatesView onUseTemplate={useTemplate} />
        </div>
      ) : (
        <>
          {/* C22 tab strip + search. All tabs stay in the Tab order
              (FilesAppTabs pattern) — a roving tabIndex without arrow-key
              handling makes every inactive tab keyboard-unreachable. */}
          <div className="px-4 pt-2.5 space-y-2">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Agent categories">
              {AGENT_CENTER_TABS.map((t) => (
                <button
                  key={t.id}
                  id={`agent-center-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls="agent-center-tab-panel"
                  className={`px-2 py-0.5 rounded-full text-[11px] transition-colors border ${
                    tab === t.id ? 'border-primary/40 bg-primary/15 text-honey' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Search row — KPIs moved to the page header (round-7 fix 3b),
                so the field gets the full row to itself. Wave T Lane F item 4:
                a visible `--line` border + honey focus ring (focus-within, since
                the inner Input suppresses its own ring) so the field holds its
                edge on dark — consistent with the marketplace search bar. */}
            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg border border-[var(--line)] px-2 py-1 transition-colors focus-within:border-[var(--honey-line)] focus-within:shadow-[var(--shadow-honey)]">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                className="flex-1 bg-transparent text-xs h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Promoted swarm CTA (PR6b §16 / D19) — the waggle-dance entry,
              surfaced as a prominent honey banner instead of a buried link.
              Navigates to the existing /waggle-dance route. */}
          <div className="px-4 pt-2.5">
            <button
              onClick={() => navigate('/waggle-dance')}
              className="group w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors"
              style={{ background: 'var(--honey-wash)', borderColor: 'var(--honey-line)' }}
            >
              <span
                className="grid place-items-center w-8 h-8 rounded-lg shrink-0"
                style={{ background: 'var(--honey)', color: '#1a1407' }}
              >
                <Network className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-display font-semibold text-foreground">Run a team of agents</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  waggle-dance · let several specialists coordinate on one goal
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-display font-semibold shrink-0"
                style={{ color: 'var(--honey-text)' }}
              >
                Start a swarm <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          </div>

          {/* List */}
          <div id="agent-center-tab-panel" className="flex-1 overflow-auto p-2.5" role="tabpanel" aria-labelledby={`agent-center-tab-${tab}`}>
            {/* A post-action reload failure must be visible even when a stale
                list is still on screen. */}
            {error && agents.length > 0 && (
              <div role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5">
                <span className="text-[11px] text-destructive">Refresh failed — this list may be stale. {error}</span>
                <button onClick={() => void load()} className="inline-flex items-center gap-1 text-[11px] text-honey hover:underline shrink-0">
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}
            {loading && agents.length === 0 ? (
              // Wave T Lane F item 3: the signature waggle-dance loader replaces
              // the generic arc spinner. BeeLoader owns the status role + SR
              // label; the visible caption is aria-hidden to avoid a double read.
              <div className="flex flex-col items-center py-12">
                <BeeLoader label="Loading agents…" />
                <p className="mt-2.5 text-xs text-muted-foreground" aria-hidden>Loading agents…</p>
              </div>
            ) : error && agents.length === 0 ? (
              <div role="alert" className="text-center py-12">
                <AlertCircle className="w-6 h-6 text-destructive/60 mx-auto mb-2" />
                <p className="text-xs text-destructive mb-2">{error}</p>
                <button onClick={() => load()} className="inline-flex items-center gap-1 text-xs text-honey hover:underline">
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div role="status" aria-live="polite" className="py-12 px-4">
                {q || tab !== 'all' ? (
                  <p className="text-xs text-muted-foreground text-center">No agents match this view.</p>
                ) : (
                  <div className="max-w-md mx-auto space-y-4">
                    {/* The contradiction fix: every workspace already runs a
                        built-in assistant — an empty custom-agent list must
                        not read as "nothing is working for you". */}
                    {workspaces && workspaces.length > 0 && (
                      <div>
                        <p className="text-[11px] font-display font-semibold text-honey/80 uppercase tracking-wider mb-1.5">
                          Already working for you
                        </p>
                        <ul className="space-y-1">
                          {workspaces.slice(0, 5).map((ws) => (
                            <li key={ws.id}>
                              <button
                                onClick={() => navigate(`/workspaces/${ws.id}/chat`)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 hover:border-primary/30 transition-colors text-left"
                              >
                                <span className="text-xs text-foreground truncate">
                                  {ws.name}
                                  <span className="text-muted-foreground"> — built-in {ws.persona || 'general'} assistant</span>
                                </span>
                                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="text-center">
                      <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">
                        No custom agents yet — create one to automate something specific.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ul className="space-y-1">
                {visible.map((a) => (
                  <AgentCenterRow
                    key={a.id}
                    agent={a}
                    busy={busyId === a.id}
                    onOpen={setSelected}
                    onRun={(agent) => void run(agent)}
                    onPause={(agent) => void pause(agent)}
                  />
                ))}
              </ul>
            )}
            {sparse && (
              <SuggestedAgentCards
                personas={suggestedPersonas}
                onPick={startFromPersona}
                allPersonas={PERSONAS}
                onBrowseAll={() => setView('templates')}
              />
            )}
          </div>
        </>
      )}

      {/* Detail drawer (§12.9 explicit scope + traces). */}
      <AgentCenterDetail
        agent={selected}
        workspaces={workspaces}
        busy={!!selected && busyId === selected.id}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        onRun={(agent) => void run(agent)}
        onPause={(agent) => void pause(agent)}
        onArchiveToggle={(agent) => void archiveToggle(agent)}
      />

      {/* C23 ambiguity picker. */}
      {picker && (
        <WorkspacePickerDialog
          agentName={picker.agent.name}
          workspaceIds={picker.workspaceIds}
          workspaces={workspaces}
          onPick={(wsId) => { const target = picker.agent; setPicker(null); void run(target, wsId); }}
          onCancel={() => setPicker(null)}
        />
      )}

      {/* S18 Agent Builder (Phase 3C) — full §12.9 declaration stepper. */}
      {createOpen && (
        <AgentBuilder
          busy={creating}
          initial={createInitial}
          workspaces={workspaces}
          onCreate={(input) => void create(input)}
          onCancel={() => { setCreateOpen(false); setCreateInitial(undefined); }}
        />
      )}
    </div>
  );
};

export default AgentsApp;
