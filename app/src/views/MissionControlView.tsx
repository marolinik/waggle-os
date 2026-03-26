/**
 * MissionControlView — Agent fleet command center.
 *
 * Shows active workspace sessions with status, controls (pause/resume/stop),
 * and resource usage. Complements Cockpit (system health) with agent-focused ops.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { getServerBaseUrl } from '@/lib/ipc';

const BASE_URL = getServerBaseUrl();
const REFRESH_INTERVAL = 3_000; // 3s for live agent status

interface FleetSession {
  workspaceId: string;
  personaId: string | null;
  status: 'active' | 'paused' | 'error';
  lastActivity: number;
  durationMs: number;
  toolCount: number;
}

interface FleetData {
  sessions: FleetSession[];
  count: number;
  maxSessions: number;
}

// ── Persona display helpers ──────────────────────────────────────────

const PERSONA_ICONS: Record<string, string> = {
  researcher: '🔬',
  writer: '✍️',
  analyst: '📊',
  coder: '💻',
  'project-manager': '📋',
  'executive-assistant': '📧',
  'sales-rep': '🎯',
  marketer: '📢',
};

const STATUS_DOT_CLASS: Record<string, string> = {
  active: 'bg-primary',
  paused: 'bg-muted-foreground',
  error: 'bg-destructive',
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ── Agent Fleet Card ─────────────────────────────────────────────────

function AgentFleetCard({
  session,
  onPause,
  onResume,
  onKill,
}: {
  session: FleetSession;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onKill: (id: string) => void;
}) {
  const icon = session.personaId ? PERSONA_ICONS[session.personaId] ?? '🤖' : '🤖';
  const borderClass = session.status === 'active'
    ? 'border-l-primary'
    : session.status === 'error'
      ? 'border-l-destructive'
      : 'border-l-muted-foreground';

  return (
    <Card className={`rounded-lg border border-border bg-card transition-colors hover:border-primary/30 border-l-[3px] ${borderClass}`}>
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <div>
              <div className="text-[13px] font-semibold">
                {session.workspaceId.slice(0, 12)}
                {session.personaId && (
                  <span className="ml-1.5 text-[11px] font-normal opacity-70">
                    {session.personaId}
                  </span>
                )}
              </div>
              <div className="text-[11px] opacity-60">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${STATUS_DOT_CLASS[session.status] ?? 'bg-muted-foreground'} ${session.status === 'active' ? 'animate-pulse' : ''}`}
                />
                {session.status} · {formatDuration(session.durationMs)} · {session.toolCount} tools
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            {session.status === 'active' && (
              <button
                onClick={() => onPause(session.workspaceId)}
                aria-label={`Pause agent session ${session.workspaceId.slice(0, 12)}`}
                className="px-2 py-1 text-[11px] rounded border border-border bg-transparent cursor-pointer text-foreground hover:bg-muted transition-colors"
              >
                Pause
              </button>
            )}
            {session.status === 'paused' && (
              <button
                onClick={() => onResume(session.workspaceId)}
                aria-label={`Resume agent session ${session.workspaceId.slice(0, 12)}`}
                className="px-2 py-1 text-[11px] rounded border border-primary bg-transparent cursor-pointer text-primary hover:bg-primary/10 transition-colors"
              >
                Resume
              </button>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                aria-label={`Stop agent session ${session.workspaceId.slice(0, 12)}`}
                className="px-2 py-1 text-[11px] rounded border border-destructive bg-transparent cursor-pointer text-destructive hover:bg-destructive/10 transition-colors"
              >
                Stop
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Stop agent session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will terminate session {session.workspaceId.slice(0, 12)}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onKill(session.workspaceId)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Stop Session
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main View ────────────────────────────────────────────────────────

export default function MissionControlView() {
  const [fleet, setFleet] = useState<FleetData>({ sessions: [], count: 0, maxSessions: 3 });
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchFleet = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/fleet`);
      if (res.ok) {
        setFleet(await res.json());
        setError(null);
      }
    } catch {
      setError('Connection lost. Check that Waggle is running and try again.');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
    const timer = setInterval(fetchFleet, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchFleet]);

  const handleAction = async (workspaceId: string, action: 'pause' | 'resume' | 'kill') => {
    try {
      await fetch(`${BASE_URL}/api/fleet/${workspaceId}/${action}`, { method: 'POST' });
      await fetchFleet();
    } catch { /* silent */ }
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto h-full overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1">
          Mission Control
        </h1>
        <p className="text-[13px] opacity-60">
          Active agents · {fleet.count}/{fleet.maxSessions} sessions active
        </p>
      </div>

      {/* Error state with retry */}
      {error && !initialLoading && (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-8">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={fetchFleet}
            className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {initialLoading && !error && (
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-muted-foreground animate-pulse">Loading agent data...</p>
        </div>
      )}

      {/* Agent Fleet — shown after initial load */}
      {!initialLoading && !error && (<>
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3 opacity-80">
          Active Agents
        </h2>
        {fleet.sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-12">
            <div className="text-4xl">🐝</div>
            <h3 className="text-base font-medium text-foreground">No active agents yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Run multiple agents in parallel. Use <code className="text-xs bg-secondary px-1 rounded">/spawn</code> in chat to create specialist agents for research, analysis, and drafting.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {fleet.sessions.map((session) => (
              <AgentFleetCard
                key={session.workspaceId}
                session={session}
                onPause={(id) => handleAction(id, 'pause')}
                onResume={(id) => handleAction(id, 'resume')}
                onKill={(id) => handleAction(id, 'kill')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Resource Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="rounded-lg border border-border bg-card">
          <CardContent className="px-4 py-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {fleet.count}
            </div>
            <div className="text-[11px] opacity-60">Active Sessions</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg border border-border bg-card">
          <CardContent className="px-4 py-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {fleet.maxSessions}
            </div>
            <div className="text-[11px] opacity-60">Max Concurrent</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg border border-border bg-card">
          <CardContent className="px-4 py-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {fleet.sessions.reduce((sum, s) => sum + s.toolCount, 0)}
            </div>
            <div className="text-[11px] opacity-60">Total Tools</div>
          </CardContent>
        </Card>
      </div>
      </>)}
    </div>
  );
}
