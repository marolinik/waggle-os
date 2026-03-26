/**
 * VaultSection -- vault secrets & connector credentials management in settings.
 *
 * Two sections:
 * 1. Secrets Management — list, add, reveal, delete vault secrets (GET/POST/DELETE /api/vault)
 * 2. Connectors — existing connector management (GET /api/connectors)
 *
 * Credentials are encrypted with AES-256-GCM in the local vault.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ───────────────────────────────────────────────────────────

interface ConnectorInfo {
  id: string;
  name: string;
  status: string;
  service: string;
  authType: string;
  capabilities: string[];
  substrate: string;
}

interface VaultSecret {
  name: string;
  type: string;
  updatedAt: string;
  isCommon: boolean;
}

interface VaultResponse {
  secrets: VaultSecret[];
  suggestedKeys: string[];
}

export interface VaultSectionProps {
  baseUrl?: string;
}

const SECRET_TYPES = ['api_key', 'bearer', 'oauth2', 'basic'] as const;

// ── Connector Setup Guides ──────────────────────────────────────────

interface ConnectorSetupGuide {
  id: string;
  /** What connecting this service unlocks for the agent */
  unlocks: string;
  /** Human-readable setup steps */
  steps: string[];
  /** URL where user creates the token */
  setupUrl: string;
  /** Label for the setup URL link */
  setupUrlLabel: string;
  /** Required scopes/permissions */
  requiredScopes?: string[];
  /** Token placeholder text */
  tokenPlaceholder: string;
  /** Whether this connector should be displayed as a featured card */
  featured?: boolean;
}

// ── OAuth-capable providers ──────────────────────────────────────────
const OAUTH_PROVIDERS = new Set(['github', 'slack', 'google', 'notion', 'jira']);

const CONNECTOR_GUIDES: Record<string, ConnectorSetupGuide> = {
  github: {
    id: 'github',
    unlocks: 'Your agent can search code, read files, create issues, and submit pull requests in your repos',
    steps: [
      'Go to GitHub Settings > Developer Settings > Personal Access Tokens > Tokens (classic)',
      'Click "Generate new token (classic)"',
      'Select scopes: repo, user, read:org',
      'Copy the generated token and paste below',
    ],
    setupUrl: 'https://github.com/settings/tokens/new',
    setupUrlLabel: 'Generate GitHub Token',
    requiredScopes: ['repo', 'user', 'read:org'],
    tokenPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
  },
  slack: {
    id: 'slack',
    unlocks: 'Your agent can send messages, search channels, and respond to conversations',
    steps: [
      'Go to api.slack.com/apps and create a new app (or select existing)',
      'Under OAuth & Permissions, add Bot Token Scopes: chat:write, channels:read, users:read',
      'Install the app to your workspace',
      'Copy the Bot User OAuth Token',
    ],
    setupUrl: 'https://api.slack.com/apps',
    setupUrlLabel: 'Slack App Dashboard',
    requiredScopes: ['chat:write', 'channels:read', 'users:read'],
    tokenPlaceholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx',
  },
  jira: {
    id: 'jira',
    unlocks: 'Your agent can create issues, search tasks, and update project status',
    steps: [
      'Go to id.atlassian.com/manage/api-tokens',
      'Click "Create API token" and give it a label',
      'Copy the generated token',
    ],
    setupUrl: 'https://id.atlassian.com/manage/api-tokens',
    setupUrlLabel: 'Create Jira API Token',
    tokenPlaceholder: 'Your Jira API token',
  },
  email: {
    id: 'email',
    unlocks: 'Your agent can send emails and manage templates',
    steps: [
      'Go to app.sendgrid.com > Settings > API Keys',
      'Click "Create API Key"',
      'Select "Full Access" or "Restricted Access" with Mail Send permission',
      'Copy the key (it will not be shown again)',
    ],
    setupUrl: 'https://app.sendgrid.com/settings/api_keys',
    setupUrlLabel: 'SendGrid API Keys',
    tokenPlaceholder: 'SG.xxxxxxxxxxxxxxxxxxxx',
  },
  gcal: {
    id: 'gcal',
    unlocks: 'Your agent can check schedules and create events',
    steps: [
      'This connector uses OAuth2 for Google Calendar access',
      'Click Connect below to start the OAuth flow',
      'Grant calendar read/write permissions when prompted',
    ],
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupUrlLabel: 'Google Cloud Console',
    tokenPlaceholder: 'OAuth token (auto-obtained)',
  },
  composio: {
    id: 'composio',
    unlocks: 'Connect 250+ apps \u2014 Gmail, Notion, Linear, Calendar, Salesforce, and more. One API key, hundreds of integrations.',
    featured: true,
    steps: [
      'Go to app.composio.dev and sign up or log in',
      'Navigate to Settings > API Keys',
      'Generate a new API key and copy it',
      'Paste the key below to unlock 250+ integrations',
    ],
    setupUrl: 'https://app.composio.dev/settings',
    setupUrlLabel: 'Get Composio API Key',
    tokenPlaceholder: 'Your Composio API key',
  },
};

// ── OAuth Connect Button ────────────────────────────────────────────

interface OAuthButtonProps {
  provider: string;
  baseUrl: string;
}

function OAuthButton({ provider, baseUrl }: OAuthButtonProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'no-creds'>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/oauth/providers`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { providers: Array<{ provider: string; hasCredentials: boolean; hasToken: boolean }> };
        const prov = data.providers?.find(p => p.provider === provider);
        if (cancelled) return;
        if (prov?.hasToken) setStatus('ready');
        else if (prov?.hasCredentials) setStatus('ready');
        else setStatus('no-creds');
      } catch {
        if (!cancelled) setStatus('no-creds');
      }
    })();
    return () => { cancelled = true; };
  }, [baseUrl, provider]);

  if (status === 'checking') return null;

  if (status === 'no-creds') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mt-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>OAuth available — store OAuth client credentials in Vault to enable</span>
      </div>
    );
  }

  return (
    <a
      href={`${baseUrl}/api/oauth/${provider}/authorize`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors mt-2"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      <span>Connect with OAuth</span>
    </a>
  );
}

// ── Connector Guide Panel ───────────────────────────────────────────

interface ConnectorGuidePanelProps {
  guide: ConnectorSetupGuide;
}

function ConnectorGuidePanel({ guide }: ConnectorGuidePanelProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-md border bg-muted/30 ${guide.featured ? 'border-primary/40' : 'border-border'}`}>
      {/* "What this unlocks" description */}
      {guide.unlocks && (
        <div className={`px-3 py-2 text-[11px] leading-relaxed ${guide.featured ? 'text-primary' : 'text-muted-foreground'}`}>
          {guide.featured && (
            <span className="inline-block text-[9px] font-semibold uppercase tracking-widest bg-primary/15 text-primary px-1.5 py-0.5 rounded mr-1.5 mb-0.5">Featured</span>
          )}
          {guide.unlocks}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Setup Instructions</span>
        <span className="text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Numbered steps */}
          <ol className="list-none space-y-1.5 text-xs text-muted-foreground">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          {/* Setup URL link */}
          <a
            href={guide.setupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>{guide.setupUrlLabel}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
              <path d="M3.5 2H10V8.5M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          {/* Required scopes */}
          {guide.requiredScopes && guide.requiredScopes.length > 0 && (
            <div className="space-y-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Required scopes
              </span>
              <div className="flex flex-wrap gap-1.5">
                {guide.requiredScopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function statusDotClass(status: string): string {
  switch (status) {
    case 'connected': return 'bg-green-500';
    case 'disconnected': return 'bg-muted-foreground';
    case 'expired': return 'bg-yellow-500';
    case 'error': return 'bg-destructive';
    default: return 'bg-muted-foreground';
  }
}

function statusTextClass(status: string): string {
  switch (status) {
    case 'connected': return 'text-green-500';
    case 'disconnected': return 'text-muted-foreground';
    case 'expired': return 'text-yellow-500';
    case 'error': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return 'unknown';
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'api_key': return 'bg-primary/15 text-primary';
    case 'bearer': return 'bg-green-500/15 text-green-500';
    case 'oauth2': return 'bg-yellow-500/15 text-yellow-500';
    case 'basic': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
}

// ── Secrets Section ─────────────────────────────────────────────────

interface SecretsSectionProps {
  baseUrl: string;
}

function SecretsSection({ baseUrl }: SecretsSectionProps) {
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [suggestedKeys, setSuggestedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<string>('api_key');
  const [adding, setAdding] = useState(false);

  // Reveal state: maps secret name to the revealed value (or null)
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [revealingName, setRevealingName] = useState<string | null>(null);
  const revealTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Delete confirmation state
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const fetchSecrets = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/vault`);
      if (res.ok) {
        const data: VaultResponse = await res.json();
        setSecrets(data.secrets ?? []);
        setSuggestedKeys(data.suggestedKeys ?? []);
        setError(null);
      } else {
        setError(`Unable to load secrets (${res.status})`);
      }
    } catch {
      setError('Unable to load secrets');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  // Clean up reveal timers on unmount
  useEffect(() => {
    const timers = revealTimers.current;
    return () => {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newName.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${baseUrl}/api/vault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), value: newValue, type: newType }),
      });
      if (res.ok) {
        setNewName('');
        setNewValue('');
        setNewType('api_key');
        setShowAddForm(false);
        await fetchSecrets();
      } else {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Failed to add secret: ${body.error}`);
      }
    } catch {
      setError('Failed to add secret');
    } finally {
      setAdding(false);
    }
  }, [baseUrl, newName, newValue, newType, fetchSecrets]);

  const handleReveal = useCallback(async (name: string) => {
    // If already revealed, hide it
    if (revealedValues[name]) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      if (revealTimers.current[name]) {
        clearTimeout(revealTimers.current[name]);
        delete revealTimers.current[name];
      }
      return;
    }

    setRevealingName(name);
    try {
      const res = await fetch(`${baseUrl}/api/vault/${encodeURIComponent(name)}/reveal`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedValues((prev) => ({ ...prev, [name]: data.value }));

        // Auto-hide after 10 seconds
        revealTimers.current[name] = setTimeout(() => {
          setRevealedValues((prev) => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
          delete revealTimers.current[name];
        }, 10_000);
      } else {
        setError(`Failed to reveal secret "${name}"`);
      }
    } catch {
      setError(`Failed to reveal secret "${name}"`);
    } finally {
      setRevealingName(null);
    }
  }, [baseUrl, revealedValues]);

  const handleDelete = useCallback(async (name: string) => {
    setDeletingName(name);
    try {
      const res = await fetch(`${baseUrl}/api/vault/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfirmingDelete(null);
        // Clear revealed value if it was showing
        setRevealedValues((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
        if (revealTimers.current[name]) {
          clearTimeout(revealTimers.current[name]);
          delete revealTimers.current[name];
        }
        await fetchSecrets();
      } else {
        setError(`Failed to delete secret "${name}"`);
      }
    } catch {
      setError(`Failed to delete secret "${name}"`);
    } finally {
      setDeletingName(null);
      setConfirmingDelete(null);
    }
  }, [baseUrl, fetchSecrets]);

  const handleSuggestionClick = useCallback((key: string) => {
    setNewName(key);
    setShowAddForm(true);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">Secrets</h3>
        <p className="text-sm text-muted-foreground">Loading secrets...</p>
      </div>
    );
  }

  if (error && secrets.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">Secrets</h3>
        <div className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Secrets</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {secrets.length} secret{secrets.length !== 1 ? 's' : ''} stored
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((prev) => !prev)}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {showAddForm ? 'Cancel' : '+ Add Secret'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/80 bg-destructive/20 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      {/* Add secret form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-2">
            <label htmlFor="vault-secret-name" className="block text-xs font-medium text-muted-foreground">Name</label>
            <input
              id="vault-secret-name"
              type="text"
              placeholder="e.g., ANTHROPIC_API_KEY"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
              className="w-full rounded bg-input px-3 py-2 text-sm text-foreground border border-border focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="vault-secret-value" className="block text-xs font-medium text-muted-foreground">Value</label>
            <input
              id="vault-secret-value"
              type="password"
              placeholder="Enter secret value..."
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              autoComplete="off"
              className="w-full rounded bg-input px-3 py-2 text-sm text-foreground border border-border focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="vault-secret-type" className="block text-xs font-medium text-muted-foreground">Type</label>
            <select
              id="vault-secret-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded bg-input px-3 py-2 text-sm text-foreground border border-border focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SECRET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newValue.trim() || adding}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? 'Adding...' : 'Add Secret'}
          </button>
        </div>
      )}

      {/* Suggested keys */}
      {suggestedKeys.length > 0 && (
        <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-2">
            Missing common keys — click to add:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedKeys.map((key) => (
              <button
                key={key}
                onClick={() => handleSuggestionClick(key)}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted hover:border-ring transition-colors"
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Secret list */}
      {secrets.length === 0 ? (
        <div className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
          No secrets stored yet. Add your first API key or credential above.
        </div>
      ) : (
        <div className="space-y-2">
          {secrets.map((secret) => {
            const isRevealed = !!revealedValues[secret.name];
            const isRevealing = revealingName === secret.name;
            const isConfirmingDelete = confirmingDelete === secret.name;
            const isDeleting = deletingName === secret.name;

            return (
              <div
                key={secret.name}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-mono font-medium text-foreground truncate">
                      {secret.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${typeBadgeClass(secret.type)}`}
                    >
                      {secret.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleReveal(secret.name)}
                      disabled={isRevealing}
                      className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={isRevealed ? 'Hide value' : 'Reveal value (auto-hides in 10s)'}
                      aria-label={isRevealed ? `Hide ${secret.name} value` : `Reveal ${secret.name} value`}
                    >
                      {isRevealing ? '...' : isRevealed ? 'Hide' : 'Show'}
                    </button>

                    {isConfirmingDelete ? (
                      <span className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Sure?</span>
                        <button
                          onClick={() => handleDelete(secret.name)}
                          disabled={isDeleting}
                          className="rounded border border-destructive/70 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Confirm delete ${secret.name}`}
                        >
                          {isDeleting ? '...' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmingDelete(null)}
                          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="Cancel delete"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingDelete(secret.name)}
                        className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-destructive/70 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Delete secret"
                        aria-label={`Delete ${secret.name}`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Value row */}
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="font-mono text-muted-foreground">
                    {isRevealed ? revealedValues[secret.name] : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                  </span>
                  {isRevealed && (
                    <span className="text-yellow-500/80 text-[10px]">auto-hides in 10s</span>
                  )}
                </div>

                {/* Metadata row */}
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Updated {formatRelativeTime(secret.updatedAt)}
                  {secret.isCommon && (
                    <span className="ml-2 text-primary/70">common key</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function VaultSection({ baseUrl = 'http://127.0.0.1:3333' }: VaultSectionProps) {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/connectors`);
      if (res.ok) {
        const data = await res.json();
        setConnectors(data.connectors ?? []);
        setError(null);
      } else {
        setError(`Unable to load connectors (${res.status})`);
      }
    } catch {
      setError('Unable to connect. Please check your settings.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  const handleConnect = useCallback(async (id: string) => {
    const token = tokenInputs[id];
    if (!token) return;

    setConnectingId(id);
    try {
      const res = await fetch(`${baseUrl}/api/connectors/${id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setTokenInputs((prev) => ({ ...prev, [id]: '' }));
        await fetchConnectors();
      } else {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(`Failed to connect: ${body.error}`);
      }
    } catch {
      setError(`Failed to connect connector "${id}"`);
    } finally {
      setConnectingId(null);
    }
  }, [baseUrl, tokenInputs, fetchConnectors]);

  const handleDisconnect = useCallback(async (id: string) => {
    setConnectingId(id);
    try {
      await fetch(`${baseUrl}/api/connectors/${id}/disconnect`, { method: 'POST' });
      await fetchConnectors();
    } catch {
      setError(`Failed to disconnect connector "${id}"`);
    } finally {
      setConnectingId(null);
    }
  }, [baseUrl, fetchConnectors]);

  const connectedCount = connectors.filter((c) => c.status === 'connected').length;

  return (
    <div className="vault-section space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Vault & Credentials<span className="text-[10px] text-green-500/60 ml-2">🔒 AES-256-GCM encrypted</span></h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage secrets and external service connections. All credentials are encrypted with AES-256-GCM in the local vault.
        </p>
      </div>

      {/* ── Section 1: Secrets Management ── */}
      <SecretsSection baseUrl={baseUrl} />

      {/* ── Separator ── */}
      <div className="border-t border-border" />

      {/* ── Section 2: Connectors (existing) ── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Connectors</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            External service integrations
          </p>
        </div>

        {/* Summary header */}
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total connectors: </span>
              <span className="text-foreground font-medium">{connectors.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Connected: </span>
              <span className="text-green-500 font-medium">{connectedCount}</span>
            </div>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Loading connectors...</p>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/80 bg-destructive/20 px-4 py-2 text-sm text-destructive">
            {error}
            <button
              onClick={() => setError(null)}
              className="float-right text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label="Dismiss error"
            >
              x
            </button>
          </div>
        )}

        {/* Composio featured card — always shown at top of connectors */}
        {(() => {
          const composioGuide = CONNECTOR_GUIDES['composio'];
          const composioConnector = connectors.find(c => c.id === 'composio');
          const isComposioConnected = composioConnector?.status === 'connected';
          if (!isComposioConnected) {
            return (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-widest bg-primary/15 text-primary px-1.5 py-0.5 rounded">Featured</span>
                  <span className="text-sm font-semibold text-foreground">Composio</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {composioGuide.unlocks}
                </p>
                <ConnectorGuidePanel guide={composioGuide} />
                {/* Token input + connect button for Composio */}
                <div className="flex gap-2 items-center">
                  <input
                    type="password"
                    placeholder={composioGuide.tokenPlaceholder}
                    value={tokenInputs['composio'] ?? ''}
                    onChange={(e) =>
                      setTokenInputs((prev) => ({ ...prev, composio: e.target.value }))
                    }
                    autoComplete="off"
                    aria-label="Composio API key"
                    className="flex-1 rounded bg-input px-3 py-2 text-sm text-foreground border border-border focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    onClick={() => handleConnect('composio')}
                    disabled={!tokenInputs['composio'] || connectingId === 'composio'}
                    className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connectingId === 'composio' ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Connector list */}
        {!loading && connectors.length === 0 ? (
          <div className="rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
            No connectors configured. Connectors can be added via capability packs or plugins.
          </div>
        ) : (
          <div className="space-y-3">
            {connectors.map((c) => {
              const guide = CONNECTOR_GUIDES[c.id];
              return (
              <div key={c.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(c.status)}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                    <span
                      className={`text-xs font-semibold uppercase ${statusTextClass(c.status)}`}
                    >
                      {c.status}
                    </span>
                  </div>

                  {(c.status === 'connected' || c.status === 'error') && (
                    <button
                      onClick={() => handleDisconnect(c.id)}
                      disabled={connectingId === c.id}
                      className="rounded border border-destructive/70 px-3 py-1 text-xs text-destructive hover:bg-destructive/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Disconnect ${c.name}`}
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                {/* What this unlocks */}
                {guide?.unlocks && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    {guide.unlocks}
                  </p>
                )}

                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>service: {c.service}</span>
                  <span>auth: {c.authType}</span>
                  <span>substrate: {c.substrate}</span>
                </div>

                {/* Connect form for disconnected connectors */}
                {c.status === 'disconnected' && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {/* Setup guide (if available for this connector) */}
                    {guide && (
                      <ConnectorGuidePanel guide={guide} />
                    )}

                    {/* Token input + connect button */}
                    <div className="flex gap-2 items-center">
                      <input
                        type="password"
                        placeholder={
                          guide?.tokenPlaceholder
                            ?? (c.authType === 'bearer' ? 'Paste personal access token...' : 'Enter API key...')
                        }
                        value={tokenInputs[c.id] ?? ''}
                        onChange={(e) =>
                          setTokenInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        autoComplete="off"
                        aria-label={`${c.name} access token`}
                        className="flex-1 rounded bg-input px-3 py-2 text-sm text-foreground border border-border focus:border-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        onClick={() => handleConnect(c.id)}
                        disabled={!tokenInputs[c.id] || connectingId === c.id}
                        className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {connectingId === c.id ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>

                    {/* OAuth button for supported providers */}
                    {OAUTH_PROVIDERS.has(c.id) && (
                      <OAuthButton provider={c.id} baseUrl={baseUrl} />
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
