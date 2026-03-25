import { useState, useEffect } from 'react';
import { Play, Pause, Square, Loader2, Radio, Clock, Zap, RefreshCw } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { FleetSession } from '@/lib/types';

const MissionControlApp = () => {
  const [sessions, setSessions] = useState<FleetSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await adapter.getFleet();
      setSessions(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (workspaceId: string, action: 'pause' | 'resume' | 'stop') => {
    await adapter.fleetAction(workspaceId, action);
    refresh();
  };

  const statusColors: Record<string, string> = {
    active: 'text-emerald-400',
    paused: 'text-amber-400',
    idle: 'text-muted-foreground',
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" /> Mission Control
        </h2>
        <button onClick={refresh} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {sessions.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Radio className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No active fleet sessions</p>
        </div>
      )}

      <div className="space-y-2">
        {sessions.map(s => (
          <div key={s.workspaceId} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-emerald-400 animate-pulse' : s.status === 'paused' ? 'bg-amber-400' : 'bg-muted-foreground'}`} />
                <span className="text-sm font-display font-medium text-foreground">{s.workspaceName}</span>
                <span className={`text-[10px] capitalize ${statusColors[s.status]}`}>{s.status}</span>
              </div>
              <div className="flex items-center gap-1">
                {s.status === 'active' && (
                  <button onClick={() => handleAction(s.workspaceId, 'pause')} className="p-1 rounded text-muted-foreground hover:text-amber-400 transition-colors">
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                )}
                {s.status === 'paused' && (
                  <button onClick={() => handleAction(s.workspaceId, 'resume')} className="p-1 rounded text-muted-foreground hover:text-emerald-400 transition-colors">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => handleAction(s.workspaceId, 'stop')} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{Math.round(s.duration / 60)}m</span>
              <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{s.toolCount} tools</span>
              <span>{s.model}</span>
              <span>{s.tokenUsage.toLocaleString()} tokens</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MissionControlApp;
