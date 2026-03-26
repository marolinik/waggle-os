/**
 * EventsView — Wrapper around EventStream from @waggle/ui.
 * Includes a "Session Replay" tab for browsing tool event timelines.
 */

import { useState, useEffect, useCallback } from 'react';
import type { AgentStep, StepFilter, TimelineEvent } from '@waggle/ui';
import { EventStream, SessionTimeline } from '@waggle/ui';

export interface EventsViewProps {
  steps: AgentStep[];
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  filter: StepFilter;
  onFilterChange: (f: StepFilter) => void;
  workspaceId?: string;
  serverUrl?: string;
}

interface SessionOption {
  id: string;
  title: string;
  lastActive: string;
}

type ViewTab = 'live' | 'replay';

export default function EventsView({
  steps,
  autoScroll,
  onToggleAutoScroll,
  filter,
  onFilterChange,
  workspaceId,
  serverUrl = 'http://localhost:3333',
}: EventsViewProps) {
  const [tab, setTab] = useState<ViewTab>('live');
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Fetch sessions when switching to replay tab
  const fetchSessions = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const res = await fetch(`${serverUrl}/api/workspaces/${workspaceId}/sessions`);
      if (res.ok) {
        const data: SessionOption[] = await res.json();
        setSessions(data);
        if (data.length > 0 && !selectedSessionId) {
          setSelectedSessionId(data[0].id);
        }
      } else {
        setSessionsError(`Unable to load sessions (${res.status})`);
      }
    } catch {
      setSessionsError('Connection lost. Check that Waggle is running and try again.');
    } finally {
      setLoadingSessions(false);
    }
  }, [workspaceId, serverUrl, selectedSessionId]);

  // Fetch timeline when session changes
  const fetchTimeline = useCallback(async () => {
    if (!workspaceId || !selectedSessionId) {
      setTimeline([]);
      return;
    }
    setLoadingTimeline(true);
    setTimelineError(null);
    try {
      const res = await fetch(
        `${serverUrl}/api/workspaces/${workspaceId}/sessions/${selectedSessionId}/timeline`
      );
      if (res.ok) {
        const data: TimelineEvent[] = await res.json();
        setTimeline(data);
      } else {
        setTimeline([]);
        setTimelineError(`Unable to load timeline (${res.status})`);
      }
    } catch {
      setTimeline([]);
      setTimelineError('Connection lost. Check that Waggle is running and try again.');
    } finally {
      setLoadingTimeline(false);
    }
  }, [workspaceId, selectedSessionId, serverUrl]);

  useEffect(() => {
    if (tab === 'replay') {
      fetchSessions();
    }
  }, [tab, fetchSessions]);

  useEffect(() => {
    if (tab === 'replay' && selectedSessionId) {
      fetchTimeline();
    }
  }, [tab, selectedSessionId, fetchTimeline]);

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Tab bar */}
      <div role="tablist" className="flex items-center gap-0.5 px-2 py-1 border-b border-border/30 bg-secondary shrink-0">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          aria-controls="events-tabpanel-live"
          onClick={() => setTab('live')}
          className={`px-3 py-1 rounded text-xs border-none cursor-pointer transition-colors ${
            tab === 'live'
              ? 'font-semibold bg-primary/15 text-primary'
              : 'font-normal bg-transparent text-muted-foreground'
          }`}
        >
          Live Events
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'replay'}
          aria-controls="events-tabpanel-replay"
          onClick={() => setTab('replay')}
          className={`px-3 py-1 rounded text-xs border-none cursor-pointer transition-colors ${
            tab === 'replay'
              ? 'font-semibold bg-primary/15 text-primary'
              : 'font-normal bg-transparent text-muted-foreground'
          }`}
        >
          Session Replay
        </button>
      </div>

      {/* Tab content */}
      {tab === 'live' ? (
        <div id="events-tabpanel-live" role="tabpanel" className="flex-1 overflow-hidden">
          <EventStream
            steps={steps}
            autoScroll={autoScroll}
            onToggleAutoScroll={onToggleAutoScroll}
            filter={filter}
            onFilterChange={onFilterChange}
          />
        </div>
      ) : (
        <div id="events-tabpanel-replay" role="tabpanel" className="flex-1 overflow-hidden flex flex-col">
          {/* Session picker */}
          <div className="px-3 py-2 border-b border-border/30 shrink-0">
            {loadingSessions ? (
              <div className="flex gap-2">
                <div className="animate-pulse h-6 bg-muted rounded w-48" />
                <div className="animate-pulse h-6 bg-muted rounded w-20" />
              </div>
            ) : sessionsError ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-destructive">{sessionsError}</span>
                <button
                  type="button"
                  onClick={fetchSessions}
                  className="text-[11px] px-2 py-0.5 rounded border border-border text-foreground hover:bg-muted"
                >
                  Retry
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <span className="text-[11px] text-muted-foreground/70">
                {workspaceId ? 'No sessions found' : 'Select a workspace first'}
              </span>
            ) : (
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded-md border border-primary/20 bg-muted/50 text-foreground text-xs cursor-pointer"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || s.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-auto px-1 py-2">
            {timelineError ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <p className="text-[11px] text-destructive">{timelineError}</p>
                <button
                  type="button"
                  onClick={fetchTimeline}
                  className="text-[11px] px-2 py-0.5 rounded border border-border text-foreground hover:bg-muted"
                >
                  Retry
                </button>
              </div>
            ) : (
              <SessionTimeline events={timeline} loading={loadingTimeline} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
