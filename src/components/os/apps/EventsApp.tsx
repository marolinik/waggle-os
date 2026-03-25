import { useState } from 'react';
import { Activity, Loader2, CheckCircle2, XCircle, Zap, MessageSquare, ChevronDown, Clock, ChevronRight } from 'lucide-react';
import type { AgentStep } from '@/lib/types';

const stepIcons: Record<string, React.ElementType> = {
  think: Activity,
  tool_call: Zap,
  tool_result: CheckCircle2,
  response: MessageSquare,
  error: XCircle,
  spawn: Activity,
};

const stepColors: Record<string, string> = {
  running: 'text-primary border-primary/30',
  complete: 'text-emerald-400 border-emerald-400/30',
  error: 'text-destructive border-destructive/30',
};

interface EventsAppProps {
  steps: AgentStep[];
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  filter: string | null;
  onFilterChange: (f: string | null) => void;
}

const StepCard = ({ step }: { step: AgentStep }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = stepIcons[step.type] || Activity;
  const color = stepColors[step.status] || 'text-muted-foreground border-border/30';

  return (
    <div className={`rounded-lg border ${color} bg-secondary/20 overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 p-2 text-left"
      >
        <div className="mt-0.5">
          {step.status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Icon className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground">{step.description}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
            <span className="capitalize">{step.type.replace('_', ' ')}</span>
            {step.duration && <span>{step.duration}ms</span>}
            <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
        {step.details && (
          <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {expanded && step.details && (
        <div className="px-3 pb-2 pt-0">
          <pre className="text-[10px] text-muted-foreground bg-background/50 rounded p-2 overflow-x-auto max-h-32">
            {JSON.stringify(step.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

const EventsApp = ({ steps, autoScroll, onToggleAutoScroll, filter, onFilterChange }: EventsAppProps) => {
  const [tab, setTab] = useState<'live' | 'replay'>('live');
  const types = ['think', 'tool_call', 'tool_result', 'response', 'error', 'spawn'];

  // Group steps by session/time for replay
  const stepsByTime = steps.reduce<Record<string, AgentStep[]>>((acc, step) => {
    const timeKey = new Date(step.timestamp).toLocaleDateString();
    if (!acc[timeKey]) acc[timeKey] = [];
    acc[timeKey].push(step);
    return acc;
  }, {});

  return (
    <div className="flex h-full">
      {/* Filters */}
      <div className="w-36 border-r border-border/50 p-2 space-y-1 shrink-0">
        {/* Live/Replay tabs */}
        <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-muted/50">
          <button
            onClick={() => setTab('live')}
            className={`flex-1 text-[10px] py-1 rounded font-display transition-colors ${
              tab === 'live' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >Live</button>
          <button
            onClick={() => setTab('replay')}
            className={`flex-1 text-[10px] py-1 rounded font-display transition-colors ${
              tab === 'replay' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >Replay</button>
        </div>

        <p className="text-[10px] font-display text-muted-foreground uppercase mb-2">Filter by type</p>
        <button
          onClick={() => onFilterChange(null)}
          className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
            !filter ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >All events</button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => onFilterChange(t)}
            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors capitalize ${
              filter === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >{t.replace('_', ' ')}</button>
        ))}
        <div className="pt-2 mt-2 border-t border-border/30">
          <button
            onClick={onToggleAutoScroll}
            className={`w-full text-xs px-2 py-1.5 rounded-lg transition-colors ${
              autoScroll ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
            }`}
          >Auto-scroll {autoScroll ? 'ON' : 'OFF'}</button>
        </div>
        <div className="pt-2 mt-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground">{steps.length} events</p>
        </div>
      </div>

      {/* Step feed */}
      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {steps.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No events yet</p>
            <p className="text-xs text-muted-foreground/60">Events will appear here as the agent executes</p>
          </div>
        )}

        {tab === 'live' ? (
          steps.map(step => <StepCard key={step.id} step={step} />)
        ) : (
          Object.entries(stepsByTime).map(([date, dateSteps]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-display text-muted-foreground">{date}</span>
                <div className="flex-1 h-px bg-border/30" />
              </div>
              {dateSteps.map(step => <StepCard key={step.id} step={step} />)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventsApp;
