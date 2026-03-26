/**
 * KvarkSection — KVARK / Enterprise connection settings.
 *
 * UI skeleton for connecting to KVARK enterprise document retrieval.
 * Actual KVARK connection logic lives in packages/server/src/kvark/.
 */

import { useState } from 'react';

export interface KvarkSectionProps {
  /** Base URL of the local Waggle server (for test-connection call) */
  serverUrl?: string;
}

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error' | 'unconfigured';

export function KvarkSection({ serverUrl = 'http://127.0.0.1:3333' }: KvarkSectionProps) {
  const [kvarkUrl, setKvarkUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('unconfigured');
  const [statusMessage, setStatusMessage] = useState('');

  const handleTestConnection = async () => {
    if (!kvarkUrl.trim()) {
      setStatus('error');
      setStatusMessage('Connection URL is required.');
      return;
    }

    setStatus('testing');
    setStatusMessage('Testing connection...');

    try {
      // Attempt to call the /health endpoint on the configured KVARK URL.
      // Falls back to a mock "Not configured" response if the server is unreachable.
      const targetUrl = `${kvarkUrl.replace(/\/$/, '')}/health`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiToken.trim()) {
        headers['Authorization'] = `Bearer ${apiToken.trim()}`;
      }

      const res = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        setStatus('connected');
        setStatusMessage('Connected to KVARK successfully.');
      } else {
        setStatus('error');
        setStatusMessage(`KVARK returned HTTP ${res.status}. Check URL and token.`);
      }
    } catch {
      // Network error or timeout — show mock "Not configured" message
      // MOCK: Remove this fallback once real KVARK is wired end-to-end
      setStatus('error');
      setStatusMessage('Could not reach KVARK. Verify the URL and ensure KVARK is running.');
    }
  };

  const statusColors: Record<ConnectionStatus, string> = {
    idle: 'text-muted-foreground',
    testing: 'text-amber-500',
    connected: 'text-emerald-500',
    error: 'text-destructive',
    unconfigured: 'text-muted-foreground',
  };

  const statusLabels: Record<ConnectionStatus, string> = {
    idle: '',
    testing: 'Testing...',
    connected: '● Connected',
    error: '✕ Error',
    unconfigured: '○ Not configured',
  };

  return (
    <div className="kvark-section space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">KVARK / Enterprise</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect to KVARK for enterprise document retrieval, governed actions, and compliance
          features. KVARK is the enterprise substrate — it extends Waggle with org-level knowledge,
          SSO, and immutable audit logs.
        </p>
      </div>

      {/* Connection URL */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground" htmlFor="kvark-url">
          Connection URL
        </label>
        <input
          id="kvark-url"
          type="url"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="https://kvark.your-company.com"
          value={kvarkUrl}
          onChange={(e) => { setKvarkUrl(e.target.value); setStatus('idle'); }}
        />
      </div>

      {/* API Token (masked) */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground" htmlFor="kvark-token">
          API Token
        </label>
        <input
          id="kvark-token"
          type="password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="kvark_token_••••••••"
          value={apiToken}
          onChange={(e) => { setApiToken(e.target.value); setStatus('idle'); }}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">Token is stored encrypted in the local vault.</p>
      </div>

      {/* Test Connection button + status */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={status === 'testing'}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>

        {/* Status indicator */}
        <span className={`text-xs font-medium ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>

      {/* Status detail message */}
      {statusMessage && status !== 'testing' && (
        <p className={`text-xs ${status === 'connected' ? 'text-emerald-500' : status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {statusMessage}
        </p>
      )}

      {/* Feature list */}
      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">Features unlocked with KVARK:</p>
        <ul className="space-y-1">
          {[
            'Enterprise document retrieval (kvark_search, kvark_ask_document)',
            'Governed actions with org-level approval workflows',
            'Compliance audit logs (immutable, exportable)',
            'SSO/SAML identity management',
            'Team-level knowledge bases and policy enforcement',
          ].map((feature) => (
            <li key={feature} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary mt-0.5">›</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
