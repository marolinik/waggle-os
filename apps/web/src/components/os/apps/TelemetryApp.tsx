import { useState, useEffect } from 'react';
import { BarChart3, Loader2, Zap, DollarSign, Clock, TrendingUp } from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface CostEntry {
  workspaceId: string;
  workspaceName?: string;
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
}

interface TelemetrySummary {
  totalTokens: number;
  totalCost: number;
  totalToolCalls: number;
  byWorkspace: CostEntry[];
  topTools: Array<{ name: string; count: number }>;
}

const TelemetryApp = () => {
  const [data, setData] = useState<TelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [costRes, statsRes] = await Promise.all([
          adapter.fetch('/api/cost/by-workspace').then(r => r.json()).catch(() => []),
          adapter.fetch('/api/events/stats').then(r => r.json()).catch(() => ({})),
        ]);

        const byWorkspace: CostEntry[] = Array.isArray(costRes) ? costRes : [];
        const totalTokens = byWorkspace.reduce((s, w) => s + (w.tokensUsed || 0), 0);
        const totalCost = byWorkspace.reduce((s, w) => s + (w.costUsd || 0), 0);
        const totalToolCalls = byWorkspace.reduce((s, w) => s + (w.toolCalls || 0), 0);

        const topTools: Array<{ name: string; count: number }> = Array.isArray(statsRes.byType)
          ? statsRes.byType.slice(0, 8)
          : [];

        setData({ totalTokens, totalCost, totalToolCalls, byWorkspace, topTools });
      } catch { /* fallback */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No telemetry data available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-display font-semibold text-foreground">Usage & Telemetry</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase font-display">Tokens</span>
            </div>
            <p className="text-lg font-display font-bold text-foreground">{data.totalTokens.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground uppercase font-display">Cost</span>
            </div>
            <p className="text-lg font-display font-bold text-foreground">${data.totalCost.toFixed(4)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-muted-foreground uppercase font-display">Tool Calls</span>
            </div>
            <p className="text-lg font-display font-bold text-foreground">{data.totalToolCalls.toLocaleString()}</p>
          </div>
        </div>

        {/* Cost by workspace */}
        {data.byWorkspace.length > 0 && (
          <div>
            <h3 className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Cost by Workspace
            </h3>
            <div className="space-y-1.5">
              {data.byWorkspace.map((w, i) => {
                const pct = data.totalCost > 0 ? (w.costUsd / data.totalCost) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-foreground font-display truncate w-32">{w.workspaceName || w.workspaceId}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 w-16 text-right">${w.costUsd.toFixed(4)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top tools */}
        {data.topTools.length > 0 && (
          <div>
            <h3 className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Tool Usage
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {data.topTools.map((t, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/10">
                  <Zap className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-[11px] text-foreground truncate flex-1 font-mono">{t.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{t.count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelemetryApp;
