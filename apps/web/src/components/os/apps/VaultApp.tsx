import { useState, useEffect, useRef } from 'react';
import {
  Lock, Plus, Trash2, Eye, EyeOff, Loader2, Key, Plug, ExternalLink,
  Shield, ChevronDown, ChevronRight, RefreshCw, CheckCircle2, User, Pencil,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface VaultSecret {
  name: string;
  type?: string;
  updatedAt?: string;
  isCommon?: boolean;
}

interface SuggestedItem {
  name: string;
  type: string;
  label: string;
}

interface SuggestedCategory {
  category: string;
  items: SuggestedItem[];
}

interface ConnectorInfo {
  id: string;
  name: string;
  status: string;
  description?: string;
}

const CONNECTOR_GUIDES: Record<string, { unlocks: string; steps: string[]; setupUrl?: string; tokenPlaceholder?: string }> = {
  github: {
    unlocks: 'Repository access, PR reviews, issue management',
    steps: ['Go to GitHub → Settings → Developer settings → Personal access tokens', 'Generate a token with repo, user, read:org scopes', 'Paste the token below'],
    setupUrl: 'https://github.com/settings/tokens/new',
    tokenPlaceholder: 'ghp_...',
  },
  slack: {
    unlocks: 'Channel messaging, notifications, team updates',
    steps: ['Go to api.slack.com → Your Apps → Create New App', 'Add Bot Token Scopes: chat:write, channels:read, users:read', 'Install to Workspace and copy the Bot User OAuth Token'],
    setupUrl: 'https://api.slack.com/apps',
    tokenPlaceholder: 'xoxb-...',
  },
  jira: {
    unlocks: 'Issue tracking, sprint management, project boards',
    steps: ['Go to Atlassian Account → Security → API Tokens', 'Create a new API token', 'Enter your Atlassian email and the token below'],
    setupUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    tokenPlaceholder: 'ATATT...',
  },
  'google-calendar': {
    unlocks: 'Calendar events, scheduling, meeting context',
    steps: ['Go to Google Cloud Console → APIs & Services', 'Enable Google Calendar API', 'Create OAuth credentials and authorize'],
    setupUrl: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
  },
  composio: {
    unlocks: '250+ app integrations (Notion, Linear, Asana, HubSpot, etc.)',
    steps: ['Sign up at composio.dev', 'Go to Settings → API Keys', 'Copy your API key and paste below'],
    setupUrl: 'https://app.composio.dev/settings',
    tokenPlaceholder: 'cmp_...',
  },
};

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  api_key: { label: 'API Key', color: 'bg-sky-500/20 text-sky-400' },
  bearer: { label: 'Bearer', color: 'bg-emerald-500/20 text-emerald-400' },
  oauth2: { label: 'OAuth2', color: 'bg-violet-500/20 text-violet-400' },
  basic: { label: 'Basic Auth', color: 'bg-amber-500/20 text-amber-400' },
};

const VaultApp = () => {
  const [tab, setTab] = useState<'secrets' | 'connectors'>('secrets');
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [suggestedSecrets, setSuggestedSecrets] = useState<SuggestedCategory[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Add secret form
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newType, setNewType] = useState('api_key');
  const [adding, setAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Reveal state
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState('');
  const revealTimer = useRef<ReturnType<typeof setTimeout>>();

  // Connector setup
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [connectorToken, setConnectorToken] = useState('');
  const [connectorEmail, setConnectorEmail] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vaultData, connData] = await Promise.allSettled([
        adapter.getVault(),
        adapter.getConnectors(),
      ]);
      if (vaultData.status === 'fulfilled') {
        const v = vaultData.value as any;
        setSecrets(v.secrets ?? []);
        setSuggestedSecrets(v.suggestedSecrets ?? []);
      }
      if (connData.status === 'fulfilled') {
        setConnectors(connData.value as ConnectorInfo[]);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleAddSecret = async () => {
    if (!newName.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      // For basic auth, store username:password
      const value = newType === 'basic' && newUsername ? `${newUsername}:${newValue}` : newValue;
      await adapter.addVaultSecret({ key: newName, value, type: newType });
      setSecrets(prev => [...prev, { name: newName, type: newType, updatedAt: new Date().toISOString() }]);
      // Remove from suggestions
      setSuggestedSecrets(prev => prev.map(cat => ({
        ...cat,
        items: cat.items.filter(i => i.name !== newName),
      })).filter(cat => cat.items.length > 0));
      setNewName('');
      setNewValue('');
      setNewUsername('');
      setShowSuggestions(false);
    } catch { /* ignore */ }
    finally { setAdding(false); }
  };

  const handleSelectSuggestion = (item: SuggestedItem) => {
    setNewName(item.name);
    setNewType(item.type);
    setShowSuggestions(false);
  };

  const handleDeleteSecret = async (name: string) => {
    try {
      await adapter.deleteVaultSecret(name);
      setSecrets(prev => prev.filter(s => s.name !== name));
    } catch { /* ignore */ }
  };

  const handleReveal = async (name: string) => {
    if (revealedSecret === name) {
      setRevealedSecret(null);
      setRevealedValue('');
      clearTimeout(revealTimer.current);
      return;
    }
    try {
      const res = await fetch(`${adapter.getServerUrl()}/api/vault/${encodeURIComponent(name)}/reveal`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setRevealedValue(data.value ?? '');
        setRevealedSecret(name);
        clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => {
          setRevealedSecret(null);
          setRevealedValue('');
        }, 10000);
      }
    } catch { /* ignore */ }
  };

  const handleConnectorConnect = async (connectorId: string) => {
    if (!connectorToken.trim()) return;
    setConnecting(true);
    try {
      // Store the credential
      if (connectorEmail) {
        await adapter.addVaultSecret({ key: `connector:${connectorId}:email`, value: connectorEmail });
      }
      await adapter.addVaultSecret({ key: `connector:${connectorId}`, value: connectorToken, type: connectorEmail ? 'basic' : 'bearer' });
      await adapter.connectConnector(connectorId);
      setConnectorToken('');
      setConnectorEmail('');
      setExpandedConnector(null);
      await loadData();
    } catch { /* ignore */ }
    finally { setConnecting(false); }
  };

  const handleConnectorDisconnect = async (connectorId: string) => {
    try {
      await adapter.disconnectConnector(connectorId);
      await loadData();
    } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>;
  }

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0">
        <button onClick={() => setTab('secrets')}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
            tab === 'secrets' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}>
          <Key className="w-3.5 h-3.5" /> Secrets
          <span className="ml-auto text-[9px] text-muted-foreground">{secrets.length}</span>
        </button>
        <div className="mt-3 pt-3 border-t border-border/30 px-2">
          <p className="text-[9px] text-muted-foreground">Service connections moved to the <strong>Connectors</strong> app on the dock.</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">

        {/* ═══ SECRETS ═══ */}
        {tab === 'secrets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-semibold text-foreground">
                <Shield className="w-4 h-4 inline mr-1.5 text-primary" />Encrypted Vault
              </h3>
              <button onClick={loadData} className="p-1 rounded hover:bg-muted/50 transition-colors">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">AES-256-GCM encrypted. Values never sent to UI unless explicitly revealed (auto-hides after 10s).</p>

            {/* Secrets list */}
            <div className="space-y-1">
              {secrets.map(s => {
                const badge = TYPE_BADGES[s.type ?? 'api_key'] ?? TYPE_BADGES.api_key;
                return (
                  <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/30 group">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-foreground truncate">{s.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0 rounded text-[8px] font-medium ${badge.color}`}>{badge.label}</span>
                          {s.updatedAt && <span className="text-[9px] text-muted-foreground">{new Date(s.updatedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {revealedSecret === s.name && (
                        <span className="text-[10px] text-foreground font-mono mr-2 max-w-[180px] truncate">{revealedValue}</span>
                      )}
                      <button onClick={() => { setNewName(s.name); setNewType(s.type ?? 'api_key'); setNewValue(''); }} className="p-1 rounded hover:bg-muted/50" title="Update value">
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleReveal(s.name)} className="p-1 rounded hover:bg-muted/50" title={revealedSecret === s.name ? 'Hide' : 'Reveal (10s)'}>
                        {revealedSecret === s.name ? <EyeOff className="w-3 h-3 text-muted-foreground" /> : <Eye className="w-3 h-3 text-muted-foreground" />}
                      </button>
                      <button onClick={() => handleDeleteSecret(s.name)} className="p-1 rounded hover:bg-destructive/20" title="Delete">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {secrets.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No secrets stored yet</p>}
            </div>

            {/* Add secret form */}
            <div className="pt-3 border-t border-border/30 space-y-2">
              <p className="text-xs font-display font-medium text-foreground">Add Secret</p>

              {/* Name field with suggestion dropdown */}
              <div className="relative">
                <div className="flex gap-2">
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Select or type secret name"
                    className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50" />
                  <button onClick={() => setShowSuggestions(!showSuggestions)}
                    className="px-2 py-1.5 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted transition-colors">
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>

                {/* Dropdown suggestions */}
                {showSuggestions && suggestedSecrets.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-auto">
                    {suggestedSecrets.map(cat => (
                      <div key={cat.category}>
                        <p className="px-3 py-1.5 text-[9px] font-display font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">{cat.category}</p>
                        {cat.items.map(item => (
                          <button key={item.name} onClick={() => handleSelectSuggestion(item)}
                            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 transition-colors flex items-center justify-between">
                            <span>{item.label}</span>
                            <span className={`px-1.5 rounded text-[8px] ${(TYPE_BADGES[item.type] ?? TYPE_BADGES.api_key).color}`}>
                              {(TYPE_BADGES[item.type] ?? TYPE_BADGES.api_key).label}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Type selector */}
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none">
                <option value="api_key">API Key</option>
                <option value="bearer">Bearer Token</option>
                <option value="oauth2">OAuth2 Token</option>
                <option value="basic">Basic Auth (username + password)</option>
              </select>

              {/* Basic auth: username field */}
              {newType === 'basic' && (
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username or email"
                    className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none" />
                </div>
              )}

              {/* Value / password field */}
              <input type="password" value={newValue} onChange={e => setNewValue(e.target.value)}
                placeholder={newType === 'basic' ? 'Password or API token' : 'Secret value'}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none" />

              <button onClick={handleAddSecret} disabled={!newName.trim() || !newValue.trim() || adding}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {secrets.some(s => s.name === newName) ? 'Update in Vault' : 'Add to Vault'}
              </button>
            </div>
          </div>
        )}

        {/* Connectors moved to dedicated Connectors app */}
      </div>
    </div>
  );
};

export default VaultApp;
