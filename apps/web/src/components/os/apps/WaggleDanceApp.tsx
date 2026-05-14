import { useMemo, useState } from 'react';
import { Zap, RefreshCw, Check, Send } from 'lucide-react';
import { useWaggleDance } from '@/hooks/useWaggleDance';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { WaggleSignal } from '@/lib/types';
import { sortSignalsForDisplay } from '@/lib/waggle-signals';
import { WAGGLE_TYPE_CONFIG, getTypeConfig } from '@/lib/waggle-signal-types';

const filterTypes: (WaggleSignal['type'] | 'all')[] = ['all', 'discovery', 'handoff', 'insight', 'alert', 'coordination'];

const WaggleDanceApp = () => {
  const { signals, allSignals, loading, filter, setFilter, refresh, acknowledge } = useWaggleDance();
  const [selectedSignal, setSelectedSignal] = useState<WaggleSignal | null>(null);
  // M-41 / P18 — unacknowledged first, severity desc, then recency.
  const orderedSignals = useMemo(() => sortSignalsForDisplay(signals), [signals]);

  const unacknowledgedCount = allSignals.filter(s => !s.acknowledged).length;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-display font-semibold">Waggle Dance</span>
          {unacknowledgedCount > 0 && (
            <Badge variant="destructive" className="text-[11px] px-1.5 py-0 h-4">
              {unacknowledgedCount}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-7 w-7 p-0">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border/30 overflow-x-auto">
        {filterTypes.map(t => {
          const cfg = t === 'all' ? null : WAGGLE_TYPE_CONFIG[t];
          const Icon = cfg?.icon;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap
                ${filter === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
            >
              {Icon && <Icon className={`w-3 h-3 ${cfg!.color}`} />}
              {t === 'all' ? 'All' : cfg!.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Signal list */}
        <ScrollArea className={`${selectedSignal ? 'w-1/2 border-r border-border/30' : 'w-full'}`}>
          <div className="p-2 space-y-1">
            {loading && signals.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">Loading signals…</div>
            )}
            {!loading && signals.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Zap className="w-8 h-8 opacity-30" />
                <p className="text-xs">No waggle dance signals yet</p>
                <p className="text-[11px] opacity-70">Signals appear when agents share findings across workspaces</p>
              </div>
            )}
            {orderedSignals.map(signal => {
              const cfg = getTypeConfig(signal.type);
              const Icon = cfg.icon;
              const isSelected = selectedSignal?.id === signal.id;
              return (
                <button
                  key={signal.id}
                  onClick={() => setSelectedSignal(isSelected ? null : signal)}
                  className={`w-full text-left p-2.5 rounded-lg transition-colors group
                    ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'}
                    ${!signal.acknowledged ? 'border-l-2 border-l-primary/60' : 'border-l-2 border-l-transparent'}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`w-4 h-4 mt-0.5 ${cfg.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate">{signal.title}</span>
                        {signal.priority === 'critical' && (
                          <Badge variant="destructive" className="text-[11px] px-1 py-0 h-3.5">CRITICAL</Badge>
                        )}
                        {signal.priority === 'high' && (
                          <Badge className="text-[11px] px-1 py-0 h-3.5 bg-amber-500/20 text-amber-400 border-amber-500/30">HIGH</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{signal.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-muted-foreground/70">
                          {signal.sourceWorkspaceName || signal.sourceWorkspaceId}
                        </span>
                        {signal.sourceUser && (
                          <span className="text-[11px] text-muted-foreground/70">· {signal.sourceUser}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground/50 ml-auto">
                          {new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Detail pane */}
        {selectedSignal && (
          <div className="w-1/2 flex flex-col">
            <div className="p-3 flex-1 overflow-auto">
              <div className="flex items-center gap-2 mb-2">
                {(() => {
                  const cfg = getTypeConfig(selectedSignal.type);
                  const Icon = cfg.icon;
                  return <Icon className={`w-5 h-5 ${cfg.color}`} />;
                })()}
                <Badge variant="outline" className="text-[11px]">{getTypeConfig(selectedSignal.type).label}</Badge>
                {selectedSignal.priority && selectedSignal.priority !== 'normal' && selectedSignal.priority !== 'low' && (
                  <Badge variant={selectedSignal.priority === 'critical' ? 'destructive' : 'outline'} className="text-[11px]">
                    {selectedSignal.priority.toUpperCase()}
                  </Badge>
                )}
              </div>
              <h3 className="text-sm font-semibold mb-1">{selectedSignal.title}</h3>
              <p className="text-xs text-muted-foreground mb-3">{selectedSignal.content}</p>

              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div><span className="text-foreground/70">Source:</span> {selectedSignal.sourceWorkspaceName || selectedSignal.sourceWorkspaceId}</div>
                {selectedSignal.sourceUser && <div><span className="text-foreground/70">User:</span> {selectedSignal.sourceUser}</div>}
                {selectedSignal.sourceAgentId && <div><span className="text-foreground/70">Agent:</span> {selectedSignal.sourceAgentId}</div>}
                {selectedSignal.targetWorkspaceId && <div><span className="text-foreground/70">Target:</span> {selectedSignal.targetWorkspaceId}</div>}
                <div><span className="text-foreground/70">Time:</span> {new Date(selectedSignal.timestamp).toLocaleString()}</div>
              </div>

              {selectedSignal.metadata && Object.keys(selectedSignal.metadata).length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1">Metadata</p>
                  <pre className="text-[11px] bg-muted/30 rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(selectedSignal.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="p-2 border-t border-border/30 flex gap-2">
              {!selectedSignal.acknowledged && (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => acknowledge(selectedSignal.id)}>
                  <Check className="w-3 h-3 mr-1" /> Acknowledge
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-xs h-7 ml-auto" onClick={() => setSelectedSignal(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WaggleDanceApp;
