import { useState, useEffect } from 'react';
import { Activity, Server, DollarSign, Clock, Plug, RefreshCw, Timer, Brain, Shield, Network, FileText, ChevronDown } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { CronJob } from '@/lib/types';

interface CockpitData {
  health?: { status: string; uptime: number; services: { name: string; status: string }[] };
  cost?: { totalCost: number; totalTokens: number };
  connectors?: { id: string; name: string; status: string }[];
  crons?: CronJob[];
  memoryStats?: { total: number };
  vault?: unknown;
  capStatus?: unknown;
  auditTrail?: unknown[];
}

const CockpitApp = () => {
  const [data, setData] = useState<CockpitData>({});
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [health, cost, connectors, crons, vault, capStatus, audit] = await Promise.allSettled([
        adapter.getSystemHealth(),
        adapter.getAgentCost(),
        adapter.getConnectors(),
        adapter.getCronJobs(),
        adapter.getVault(),
        adapter.getCapabilitiesStatus(),
        adapter.getAuditInstalls(),
      ]);
      setData({
        health: health.status === 'fulfilled' ? health.value : undefined,
        cost: cost.status === 'fulfilled' ? cost.value : undefined,
        connectors: connectors.status === 'fulfilled' ? connectors.value : undefined,
        crons: crons.status === 'fulfilled' ? crons.value : undefined,
        vault: vault.status === 'fulfilled' ? vault.value : undefined,
        capStatus: capStatus.status === 'fulfilled' ? capStatus.value : undefined,
        auditTrail: audit.status === 'fulfilled' ? audit.value : undefined,
      });
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
        <h2 className="text-lg font-display font-semibold text-foreground">System Menu</h2>
        <button onClick={refresh} disabled={loading} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

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
        </div>

        {/* 2. Cost Dashboard */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-display font-medium text-foreground">Cost</span>
          </div>
          <div className="text-lg font-display font-bold text-foreground">
            ${data.cost?.totalCost?.toFixed(4) || '0.00'}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {data.cost?.totalTokens?.toLocaleString() || '0'} tokens
          </p>
        </div>

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
              {data.crons.length > 3 && <p className="text-[10px] text-muted-foreground">+{data.crons.length - 3} more</p>}
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
