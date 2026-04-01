import { useState, useEffect } from 'react';
import { Activity, Server, DollarSign, Clock, Plug, RefreshCw, Timer, Brain, Shield, Network, FileText, ChevronDown, AlertTriangle } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { CronJob } from '@/lib/types';

interface CockpitData {
  health?: { status: string; uptime: number; services: { name: string; status: string }[] };
  cost?: { totalCost: number; totalTokens: number };
  costSummary?: { totalTokens: number; estimatedCost: number; budgetLimit?: number };
  connectors?: { id: string; name: string; status: string }[];
  crons?: CronJob[];
  memoryStats?: { total: number };
  vault?: unknown;
  capStatus?: unknown;
  auditTrail?: unknown[];
  weaver?: { lastConsolidation?: string; status: string };
  eventStats?: { byType: Record<string, number>; total: number };
}

const CockpitApp = () => {
  const [data, setData] = useState<CockpitData>({});
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [offline, setOffline] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [health, cost, connectors, crons, vault, capStatus, audit, costSum, weaver, evStats] = await Promise.allSettled([
        adapter.getSystemHealth(),
        adapter.getAgentCost(),
        adapter.getConnectors(),
        adapter.getCronJobs(),
        adapter.getVault(),
        adapter.getCapabilitiesStatus(),
        adapter.getAuditInstalls(),
        adapter.getCostSummary(),
        adapter.getWeaverStatus(),
        adapter.getEventStats(),
      ]);
      setData({
        health: health.status === 'fulfilled' ? health.value : undefined,
        cost: cost.status === 'fulfilled' ? cost.value : undefined,
        costSummary: costSum.status === 'fulfilled' ? costSum.value : undefined,
        connectors: connectors.status === 'fulfilled' ? connectors.value : undefined,
        crons: crons.status === 'fulfilled' ? crons.value : undefined,
        vault: vault.status === 'fulfilled' ? vault.value : undefined,
        capStatus: capStatus.status === 'fulfilled' ? capStatus.value : undefined,
        auditTrail: audit.status === 'fulfilled' ? audit.value : undefined,
        weaver: weaver.status === 'fulfilled' ? weaver.value : undefined,
        eventStats: evStats.status === 'fulfilled' ? evStats.value : undefined,
      });
      const allFailed = [health, cost, connectors, crons, vault, capStatus, audit].every(r => r.status === 'rejected');
      setOffline(allFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  const healthColor = data.health?.status === 'healthy' ? 'text-emerald-400' : data.health?.status === 'degraded' ? 'text-amber-400' : 'text-destructive';

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Cockpit</h2>
        <button onClick={refresh} disabled={loading} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {offline && (
        <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <div>
            <p className="text-xs font-medium text-foreground">Server unreachable</p>
            <p className="text-[10px] text-muted-foreground">Could not connect to the backend — check Settings</p>
          </div>
          <button onClick={refresh} className="ml-auto px-2.5 py-1 text-[10px] font-medium rounded-lg bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* 1. System Health */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-display font-medium text-foreground">System Health</span>
          </div>
          <div className={`text-lg font-display font-bold capitalize ${healthColor}`}>
            {data.health?.status || 'Unknown'}
          </div>
          {data.health?.uptime && (
            <p className="text-[10px] text-muted-foreground mt-1">Uptime: {Math.round(data.health.uptime / 3600)}h</p>
          )}
          {data.health?.status === 'degraded' && data.health.services && data.health.services.filter(s => s.status !== 'healthy').length > 0 && (
            <div className="mt-2 space-y-0.5">
              {data.health.services.filter(s => s.status !== 'healthy').map(s => (
                <p key={s.name} className="text-[10px] text-amber-400/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {s.name}: {s.status}
                </p>
              ))}
            </div>
          )}
          {data.health?.status === 'degraded' && (!data.health.services || data.health.services.filter(s => s.status !== 'healthy').length === 0) && (
            <p className="text-[10px] text-muted-foreground mt-1">Some services are running at reduced capacity</p>
          )}
        </div>

        {/* 2. Cost Dashboard */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-display font-medium text-foreground">Cost</span>
          </div>
          <div className="text-lg font-display font-bold text-foreground">
            ${(data.costSummary?.estimatedCost ?? data.cost?.totalCost ?? 0).toFixed(4)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {(data.costSummary?.totalTokens ?? data.cost?.totalTokens ?? 0).toLocaleString()} tokens
            {data.costSummary?.budgetLimit != null
              ? <span className="ml-1">· Budget: ${data.costSummary.budgetLimit}/day</span>
              : <span className="ml-1">· Set budget in Settings</span>
            }
          </p>
        </div>

        {/* 2b. Memory Weaver */}
        {data.weaver && (
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-display font-medium text-foreground">Memory Weaver</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Status: <span className={data.weaver.status === 'active' ? 'text-green-400' : 'text-muted-foreground'}>{data.weaver.status}</span>
            </p>
            {data.weaver.lastConsolidation && (
              <p className="text-[10px] text-muted-foreground">
                Last consolidation: {new Date(data.weaver.lastConsolidation).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* 2c. Event Activity */}
        {data.eventStats && data.eventStats.total > 0 && (
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-display font-medium text-foreground">Activity</span>
            </div>
            <div className="text-lg font-display font-bold text-foreground">
              {data.eventStats.total.toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">total events</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(data.eventStats.byType).slice(0, 5).map(([type, count]) => (
                <span key={type} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 3. Cron Schedules */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-display font-medium text-foreground">Scheduled Routines</span>
          </div>
          {data.crons && data.crons.length > 0 ? (
            <div className="space-y-1">
              {data.crons.slice(0, 3).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate">{c.name}</span>
                  <span className={c.enabled ? 'text-emerald-400' : 'text-muted-foreground'}>{c.schedule}</span>
                </div>
              ))}
              {data.crons.length > 3 && (
                <button onClick={() => setShowAdvanced(true)} className="text-[10px] text-primary hover:text-primary/80 transition-colors">
                  +{data.crons.length - 3} more — view all
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No routines</p>
          )}
        </div>

        {/* 4. Connectors */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <Plug className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-display font-medium text-foreground">Connectors</span>
          </div>
          {data.connectors && data.connectors.length > 0 ? (
            <div className="space-y-1">
              {data.connectors.map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{c.name}</span>
                  <span className={c.status === 'connected' ? 'text-emerald-400' : 'text-muted-foreground'}>{c.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No connectors</p>
          )}
        </div>

        {/* 5. Memory Stats */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-display font-medium text-foreground">Memory</span>
          </div>
          <p className="text-xs text-muted-foreground">Frame storage active</p>
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 mt-4 mb-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-0' : '-rotate-90'}`} />
        <span className="font-display">Advanced</span>
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3">
          {/* 6. Services */}
          {data.health?.services && (
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-display font-medium text-foreground">Services</span>
              </div>
              <div className="space-y-1">
                {data.health.services.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{s.name}</span>
                    <span className={s.status === 'running' ? 'text-emerald-400' : 'text-destructive'}>{s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. Vault Summary */}
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-display font-medium text-foreground">Vault</span>
            </div>
            <p className="text-xs text-muted-foreground">{data.vault ? 'Active' : 'Not configured'}</p>
          </div>

          {/* 8. Capabilities Overview */}
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-display font-medium text-foreground">Capabilities</span>
            </div>
            <p className="text-xs text-muted-foreground">{data.capStatus ? 'Loaded' : 'No data'}</p>
          </div>

          {/* 9. Agent Topology */}
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Network className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-display font-medium text-foreground">Agent Topology</span>
            </div>
            <p className="text-xs text-muted-foreground">Swarm view</p>
          </div>

          {/* 10. Audit Trail */}
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-display font-medium text-foreground">Audit Trail</span>
            </div>
            {data.auditTrail && Array.isArray(data.auditTrail) && data.auditTrail.length > 0 ? (
              <div className="space-y-1">
                {data.auditTrail.slice(0, 5).map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground truncate">{JSON.stringify(item)}</p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No audit entries</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CockpitApp;
