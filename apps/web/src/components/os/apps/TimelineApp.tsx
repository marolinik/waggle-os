import { useState, useEffect, useMemo } from 'react';
import { Clock, Loader2, ChevronRight, Filter } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { TimelineEvent } from '@/lib/types';
import {
  iconForEvent,
  colorForEvent,
  describeEvent,
} from '@/lib/timeline-events';

interface TimelineAppProps {
  workspaceId?: string;
  workspaceName?: string;
}

type TimeRange = 'session' | 'day' | 'week' | 'all';

const RANGE_LABELS: Record<TimeRange, string> = {
  session: 'Last session',
  day: 'Last 24h',
  week: 'Last 7 days',
  all: 'All time',
};

function getSinceDate(range: TimeRange): string | undefined {
  const now = new Date();
  switch (range) {
    case 'session': {
      const d = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      return d.toISOString();
    }
    case 'day': {
      const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return d.toISOString();
    }
    case 'week': {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d.toISOString();
    }
    case 'all':
      return undefined;
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(typeof ts === 'number' ? ts : ts);
    return d.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

function groupByDay(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const day = new Date(typeof event.timestamp === 'number' ? event.timestamp : event.timestamp)
      .toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const list = groups.get(day) ?? [];
    list.push(event);
    groups.set(day, list);
  }
  return groups;
}

const TimelineApp = ({ workspaceId, workspaceName }: TimelineAppProps) => {
  const [range, setRange] = useState<TimeRange>('day');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoading(true);
    const since = getSinceDate(range);
    adapter.getTimeline(workspaceId, since, 500).then(result => {
      if (!cancelled) {
        setEvents(result);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspaceId, range]);

  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.eventType));
    return Array.from(types).sort();
  }, [events]);

  const filtered = useMemo(() =>
    typeFilter ? events.filter(e => e.eventType === typeFilter) : events,
  [events, typeFilter]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const totalCost = useMemo(() =>
    events.reduce((sum, e) => sum + (e.cost ?? 0), 0),
  [events]);

  const totalTokens = useMemo(() =>
    events.reduce((sum, e) => sum + (e.tokensUsed ?? 0), 0),
  [events]);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Select a workspace to view its timeline.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-display font-semibold text-foreground">
              {workspaceName ?? 'Workspace'} Timeline
            </h2>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {totalTokens > 0 && <span>{totalTokens.toLocaleString()} tok</span>}
            {totalCost > 0 && <span className="ml-2">${totalCost.toFixed(4)}</span>}
          </div>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2 py-1 rounded-lg text-[11px] font-display transition-colors ${
                range === r
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}>
              {RANGE_LABELS[r]}
            </button>
          ))}

          {eventTypes.length > 1 && (
            <div className="ml-auto flex items-center gap-1">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <select value={typeFilter ?? ''} onChange={e => setTypeFilter(e.target.value || null)}
                className="text-[11px] bg-transparent text-muted-foreground border-none outline-none cursor-pointer">
                <option value="">All types</option>
                {eventTypes.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No activity in this period.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([day, dayEvents]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-1 mb-2">
                  <span className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wide">
                    {day}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 ml-2">
                    {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="relative pl-4 border-l border-border/30 space-y-1">
                  {dayEvents.map(event => {
                    const Icon = iconForEvent(event.eventType);
                    const color = colorForEvent(event.eventType);
                    const isExpanded = expandedId === event.id;

                    return (
                      <button key={event.id} onClick={() => setExpandedId(isExpanded ? null : event.id)}
                        className={`w-full text-left relative flex items-start gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors ${
                          isExpanded ? 'bg-muted/20' : ''
                        }`}>
                        {/* Timeline dot */}
                        <div className={`absolute -left-[21px] top-3 w-2.5 h-2.5 rounded-full border-2 ${color} bg-background`} />

                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color.split(' ')[0]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-foreground">{describeEvent(event)}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                              {formatTime(event.timestamp)}
                            </span>
                          </div>
                          {isExpanded && (
                            <div className="mt-1.5 text-[11px] text-muted-foreground space-y-1">
                              {event.model && <div>Model: {event.model}</div>}
                              {event.tokensUsed != null && event.tokensUsed > 0 && (
                                <div>Tokens: {event.tokensUsed.toLocaleString()}</div>
                              )}
                              {event.cost != null && event.cost > 0 && (
                                <div>Cost: ${event.cost.toFixed(6)}</div>
                              )}
                              {event.output && (
                                <div className="mt-1 p-1.5 rounded bg-muted/30 font-mono text-[10px] max-h-24 overflow-auto whitespace-pre-wrap">
                                  {event.output.slice(0, 500)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <ChevronRight className={`w-3 h-3 text-muted-foreground/40 mt-1 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineApp;
