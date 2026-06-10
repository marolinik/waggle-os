import { useState, useEffect } from 'react';
import { Play, Pause, Archive, RotateCcw } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { Agent, AgentTrace, Workspace } from '@/lib/types';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { AGENT_STATE_META, formatSuccessRate, formatRelativeTime } from '@/lib/agent-center-display';

/**
 * Agent detail drawer (UX-Refactor Phase 3B, S09). PRD §12.9 acceptance:
 * "user can explain what an agent can see and do BEFORE enabling it" — so
 * every declared-scope field renders here (goal, autonomy, memory scopes,
 * skills/connectors/MCPs, permissions, workspaces), plus the derived
 * lastRunAt/successRate and recent execution traces (B3).
 */
interface AgentCenterDetailProps {
  agent: Agent | null;
  workspaces?: Workspace[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (agent: Agent) => void;
  onPause: (agent: Agent) => void;
  onArchiveToggle: (agent: Agent) => void;
}

function ScopeList({ label, items }: { label: string; items?: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {items && items.length > 0 ? (
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

const TRACE_OUTCOME_TONE: Record<AgentTrace['outcome'], 'healthy' | 'attention' | 'risk' | 'neutral'> = {
  success: 'healthy',
  verified: 'healthy',
  corrected: 'attention',
  abandoned: 'risk',
  pending: 'neutral',
};

const AgentCenterDetail = ({ agent, workspaces, busy, onOpenChange, onRun, onPause, onArchiveToggle }: AgentCenterDetailProps) => {
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [tracesError, setTracesError] = useState<string | null>(null);

  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    setTracesLoading(true);
    setTracesError(null);
    adapter.getAgentTraces(agent.id, 20)
      .then((rows) => { if (!cancelled) setTraces(rows); })
      .catch(() => { if (!cancelled) { setTraces([]); setTracesError('Failed to load traces'); } })
      .finally(() => { if (!cancelled) setTracesLoading(false); });
    return () => { cancelled = true; };
  }, [agent]);

  const wsName = (id: string) => workspaces?.find((w) => w.id === id)?.name ?? id;
  const meta = agent ? AGENT_STATE_META[agent.status] : null;

  return (
    <DetailDrawer
      open={!!agent}
      onOpenChange={onOpenChange}
      title={agent?.name ?? 'Agent'}
      subtitle={agent ? `${agent.type} agent · ${agent.model}` : undefined}
      headerExtra={agent && meta ? <StatusBadge tone={meta.tone} label={meta.label} /> : undefined}
      footer={agent ? (
        <div className="flex items-center gap-2 w-full">
          {agent.status === 'running' ? (
            <button onClick={() => onPause(agent)} disabled={busy} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              <Pause className="w-3 h-3" /> Pause
            </button>
          ) : (
            <button onClick={() => onRun(agent)} disabled={busy || agent.status === 'archived'} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              <Play className="w-3 h-3" /> Run
            </button>
          )}
          {agent.status === 'archived' ? (
            <button onClick={() => onArchiveToggle(agent)} disabled={busy} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted">
              <RotateCcw className="w-3 h-3" /> Unarchive
            </button>
          ) : (
            <button onClick={() => onArchiveToggle(agent)} disabled={busy} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted">
              <Archive className="w-3 h-3" /> Archive
            </button>
          )}
        </div>
      ) : undefined}
    >
      {agent && (
        <>
          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Goal</p>
            <p className="mt-1 text-xs text-foreground/90">{agent.goal}</p>
            {agent.description && <p className="mt-1 text-[11px] text-muted-foreground">{agent.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div><span className="text-muted-foreground">Autonomy:</span> <span className="capitalize">{agent.autonomyLevel}</span></div>
            <div><span className="text-muted-foreground">Success rate:</span> {formatSuccessRate(agent.successRate)}</div>
            <div><span className="text-muted-foreground">Last run:</span> {formatRelativeTime(agent.lastRunAt)}</div>
            {agent.personaId && <div><span className="text-muted-foreground">Persona:</span> {agent.personaId}</div>}
            {agent.createdBy && <div><span className="text-muted-foreground">Owner:</span> {agent.createdBy}</div>}
          </div>

          {/* §12.9 explicit-scope panel: no hidden tool/memory access. */}
          <ScopeList label="Memory scopes" items={agent.memoryScopes} />
          <ScopeList label="Workspaces" items={agent.workspaceIds?.map(wsName)} />
          <ScopeList label="Skills" items={agent.skillIds} />
          <ScopeList label="Connectors" items={agent.connectorIds} />
          <ScopeList label="MCP servers" items={agent.mcpIds} />
          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Permissions</p>
            {agent.permissions && Object.keys(agent.permissions).length > 0 ? (
              <pre className="mt-1 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-muted/30 rounded-md p-2">
                {JSON.stringify(agent.permissions, null, 2)}
              </pre>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground/70">Default permissions — elevated actions require approval</p>
            )}
          </div>

          {/* Traces (B3: read over execution_traces). */}
          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Recent traces</p>
            {tracesLoading ? (
              <p className="mt-1 text-[11px] text-muted-foreground" role="status">Loading traces…</p>
            ) : tracesError ? (
              <p className="mt-1 text-[11px] text-destructive" role="alert">{tracesError}</p>
            ) : traces.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground/70">No recorded runs yet</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {traces.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1">
                    <StatusBadge tone={TRACE_OUTCOME_TONE[t.outcome]} label={t.outcome} />
                    <span className="flex-1 min-w-0 text-[10px] text-muted-foreground truncate">
                      {new Date(t.ts).toLocaleString()}{t.model ? ` · ${t.model}` : ''}{t.workspaceId ? ` · ${wsName(t.workspaceId)}` : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {(t.durationMs / 1000).toFixed(1)}s · ${t.cost.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Created {new Date(agent.createdAt).toLocaleString()} · updated {new Date(agent.updatedAt).toLocaleString()}
          </p>
        </>
      )}
    </DetailDrawer>
  );
};

export default AgentCenterDetail;
