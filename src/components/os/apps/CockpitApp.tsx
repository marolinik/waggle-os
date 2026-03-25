import { useState, useEffect } from 'react';
import { Activity, Server, DollarSign, Clock, Database, Shield, Plug, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface CardData {
  health?: { status: string; uptime: number; services: { name: string; status: string }[] };
  cost?: { totalCost: number; totalTokens: number };
  connectors?: { id: string; name: string; status: string }[];
}

const CockpitApp = () => {
  const [data, setData] = useState<CardData>({});
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [health, cost, connectors] = await Promise.allSettled([
        adapter.getSystemHealth(),
        adapter.getAgentCost(),
        adapter.getConnectors(),
      ]);
      setData({
        health: health.status === 'fulfilled' ? health.value : undefined,
        cost: cost.status === 'fulfilled' ? cost.value : undefined,
        connectors: connectors.status === 'fulfilled' ? connectors.value : undefined,
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
        <h2 className="text-lg font-display font-semibold text-foreground">System Cockpit</h2>
        <button onClick={refresh} disabled={loading} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* System Health */}
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

        {/* Cost */}
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

        {/* Connectors */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 col-span-2">
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
            <p className="text-xs text-muted-foreground">No connectors configured</p>
          )}
        </div>

        {/* Services */}
        {data.health?.services && (
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 col-span-2">
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
      </div>
    </div>
  );
};

export default CockpitApp;
