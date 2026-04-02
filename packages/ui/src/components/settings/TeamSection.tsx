/**
 * TeamSection — Team connection settings.
 *
 * Allows users to connect to a team server by entering the server URL and auth token.
 * Shows connection status and user identity when connected.
 * Phase 5 basic: manual token entry. Phase 7+ will add full OAuth flow.
 */

import { useState, useEffect, useCallback } from 'react';
import type { TeamConnection } from '../../services/types.js';

export interface TeamSectionProps {
  teamConnection: TeamConnection | null;
  onConnect: (serverUrl: string, token: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export function TeamSection({ teamConnection, onConnect, onDisconnect }: TeamSectionProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamsServerUrl, setTeamsServerUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tier').then(r => r.json())
      .then(d => { if (d.teamsServerUrl) setTeamsServerUrl(d.teamsServerUrl); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (teamConnection) {
      setServerUrl(teamConnection.serverUrl);
    }
  }, [teamConnection]);

  const handleConnect = async () => {
    if (!serverUrl.trim() || !token.trim()) {
      setError('Both server URL and token are required');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      await onConnect(serverUrl.trim(), token.trim());
      setToken(''); // Clear token from form after successful connect
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to team server');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await onDisconnect();
      setServerUrl('');
      setToken('');
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  if (teamConnection) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-foreground">Team Connection</h3>
          <p className="mt-1 text-sm text-muted-foreground">Connected to team server.</p>
        </div>

        <div className="rounded-lg border border-green-800 bg-green-900/20 p-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-green-400" />
            <span className="font-medium text-green-300">Connected</span>
          </div>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p><span className="text-muted-foreground">Server:</span> {teamConnection.serverUrl}</p>
            <p><span className="text-muted-foreground">User:</span> {teamConnection.displayName}</p>
            {teamConnection.teamSlug && (
              <p><span className="text-muted-foreground">Team:</span> {teamConnection.teamSlug}</p>
            )}
          </div>
        </div>

        <CloudSyncToggle serverUrl={teamConnection.serverUrl} />

        <button
          onClick={handleDisconnect}
          className="rounded-md border border-red-700 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground">Team Connection</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect to a team server to share workspaces and collaborate with your team.
        </p>
      </div>

      {teamsServerUrl && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <p className="text-xs font-medium text-green-500">Teams Server Active</p>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{teamsServerUrl}</p>
        </div>
      )}

      <div className="rounded-lg border border-amber-600/30 bg-amber-950/20 p-3 text-sm text-amber-200/80 mb-3">
        <div className="flex items-start gap-2">
          <span className="text-amber-500 shrink-0">{'\u26A0'}</span>
          <div>
            <p className="font-medium text-amber-200">Data sharing notice</p>
            <p className="mt-1 text-xs text-amber-200/60">
              Connecting to a team server will share your workspace activity and memories with the team.
              Personal workspace data stays on your device.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="team-server-url" className="block text-sm font-medium text-muted-foreground">
            Team Server URL
          </label>
          <input
            id="team-server-url"
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://team.waggle.dev"
            className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="team-auth-token" className="block text-sm font-medium text-muted-foreground">
            Auth Token
          </label>
          <input
            id="team-auth-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your team authentication token"
            className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Get your token from the team server admin panel.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={connecting || !serverUrl.trim() || !token.trim()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {connecting ? 'Connecting...' : 'Connect to Team'}
      </button>
    </div>
  );
}

function CloudSyncToggle({ serverUrl: _serverUrl }: { serverUrl: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/cloud-sync');
      if (res.ok) { const d = await res.json(); setEnabled(d.enabled ?? false); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cloud-sync/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) setEnabled(prev => !prev);
    } catch { /* silent */ }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Cloud Memory Sync</p>
        <p className="text-xs text-muted-foreground mt-0.5">Sync workspace memories to team server automatically</p>
      </div>
      <button onClick={handleToggle} disabled={loading} role="switch" aria-checked={enabled}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'} disabled:opacity-50`}>
        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform m-0.5 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
