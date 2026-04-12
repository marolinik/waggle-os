import { useState, useEffect } from 'react';
import { RefreshCw, Activity, Clock, Zap, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface WeaverStatus {
  personalMind: { lastConsolidation: string | null; lastDecay: string | null; timerActive: boolean };
  workspaces: Array<{ id: string; lastConsolidation: string | null; timerActive: boolean }>;
  checkedAt: string;
}

interface TriggerResult {
  ok: boolean;
  results: Array<{ target: string; framesConsolidated: number; framesDecayed: number; framesStrengthened: number }>;
  triggeredAt: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function WeaverPanel() {
  const [status, setStatus] = useState<WeaverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastResult, setLastResult] = useState<TriggerResult | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await adapter.getWeaverStatus();
      setStatus(data as unknown as WeaverStatus);
    } catch { /* offline */ }
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  const triggerConsolidation = async () => {
    setTriggering(true);
    try {
      const res = await fetch(`${adapter.getServerUrl()}/api/weaver/trigger`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      setLastResult(data);
      fetchStatus();
    } catch { /* offline */ }
    setTriggering(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading weaver status...
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Weaver unavailable — connect to backend
      </div>
    );
  }

  const activeWorkspaces = status.workspaces.filter(w => w.timerActive).length;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Memory Weaver
        </h3>
        <button
          onClick={triggerConsolidation}
          disabled={triggering}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {triggering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {triggering ? 'Running...' : 'Run Now'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/30 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wide">Last Consolidation</span>
          </div>
          <p className="text-sm font-medium text-foreground">{timeAgo(status.personalMind.lastConsolidation)}</p>
        </div>
        <div className="rounded-xl border border-border/30 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <TrendingDown className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wide">Last Decay</span>
          </div>
          <p className="text-sm font-medium text-foreground">{timeAgo(status.personalMind.lastDecay)}</p>
        </div>
        <div className="rounded-xl border border-border/30 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <RefreshCw className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wide">Active Timers</span>
          </div>
          <p className="text-sm font-medium text-foreground">
            {status.personalMind.timerActive ? 1 : 0} personal + {activeWorkspaces} workspace{activeWorkspaces !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {status.workspaces.length > 0 && (
        <div>
          <h4 className="text-xs font-display font-medium text-muted-foreground mb-2 uppercase tracking-wide">Workspace Health</h4>
          <div className="space-y-1.5">
            {status.workspaces.map(ws => (
              <div key={ws.id} className="flex items-center justify-between rounded-lg border border-border/20 px-3 py-2">
                <span className="text-xs text-foreground truncate max-w-[60%]">{ws.id}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(ws.lastConsolidation)}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${ws.timerActive ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastResult && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <h4 className="text-xs font-display font-medium text-primary mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Last Run Results
          </h4>
          {lastResult.results.map(r => (
            <div key={r.target} className="flex items-center gap-3 text-xs text-foreground">
              <span className="text-muted-foreground truncate">{r.target}</span>
              <span className="text-emerald-400">+{r.framesConsolidated} consolidated</span>
              <span className="text-amber-400">{r.framesDecayed} decayed</span>
              <span className="text-primary">{r.framesStrengthened} strengthened</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
