/**
 * ConnectorsApp — Dedicated dock app for managing service connections.
 * Shows all 29 connectors with status, setup guides, available actions.
 * Also manages MCP servers.
 */

import { useState, useEffect } from 'react';
import {
  Plug, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock,
  Loader2, ExternalLink, Trash2, RefreshCw, Server, Plus, Zap,
  AlertTriangle,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';

type ConnTab = 'services' | 'mcp';

interface Connector {
  id: string;
  name: string;
  description?: string;
  status: string;
  authType?: string;
  capabilities?: string[];
}

// Category grouping for better UX
const CATEGORIES: Record<string, string[]> = {
  'Code & DevOps': ['github', 'gitlab', 'bitbucket'],
  'Communication': ['slack', 'discord', 'ms-teams', 'email', 'gmail', 'outlook'],
  'Productivity': ['notion', 'jira', 'linear', 'asana', 'monday', 'trello', 'confluence', 'obsidian'],
  'Google Suite': ['gcal', 'gdocs', 'gdrive', 'gsheets'],
  'CRM & Sales': ['salesforce', 'hubspot', 'pipedrive', 'airtable'],
  'Cloud Storage': ['dropbox', 'onedrive'],
  'Database': ['postgres'],
  'Platform': ['composio'],
};

const SETUP_HINTS: Record<string, { url?: string; placeholder?: string; steps?: string[] }> = {
  github: { url: 'https://github.com/settings/tokens/new', placeholder: 'ghp_...', steps: ['Settings → Developer settings → Personal access tokens', 'Generate with repo, user scopes'] },
  slack: { url: 'https://api.slack.com/apps', placeholder: 'xoxb-...', steps: ['Create App → Bot Token Scopes → Install to Workspace'] },
  notion: { url: 'https://www.notion.so/my-integrations', placeholder: 'ntn_...', steps: ['Create integration → Copy Internal Integration Token'] },
  jira: { url: 'https://id.atlassian.com/manage-profile/security/api-tokens', placeholder: 'ATATT...', steps: ['Account → Security → API Tokens → Create'] },
  linear: { url: 'https://linear.app/settings/api', placeholder: 'lin_api_...', steps: ['Settings → API → Create Personal API Key'] },
  composio: { url: 'https://app.composio.dev/settings', placeholder: 'cmp_...', steps: ['Settings → API Keys → Copy key (unlocks 250+ services)'] },
  discord: { url: 'https://discord.com/developers/applications', placeholder: 'Bot token...', steps: ['Create Application → Bot → Copy Token'] },
};

const ConnectorsApp = () => {
  const [tab, setTab] = useState<ConnTab>('services');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadConnectors(); }, []);

  const loadConnectors = async () => {
    setLoading(true);
    try {
      const data = await adapter.getConnectors();
      setConnectors(data);
    } catch { setConnectors([]); }
    finally { setLoading(false); }
  };

  const handleConnect = async (id: string) => {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    try {
      if (emailInput) {
        await adapter.addVaultSecret({ key: `connector:${id}:email`, value: emailInput });
      }
      await adapter.addVaultSecret({ key: `connector:${id}`, value: tokenInput, type: 'bearer' });
      await adapter.connectConnector(id);
      setTokenInput('');
      setEmailInput('');
      setExpanded(null);
      await loadConnectors();
    } catch { /* ignore */ }
    finally { setConnecting(false); }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await adapter.disconnectConnector(id);
      await loadConnectors();
    } catch { /* ignore */ }
  };

  // Group connectors by category
  const categorized = Object.entries(CATEGORIES).map(([cat, ids]) => ({
    category: cat,
    items: connectors.filter(c => ids.includes(c.id)),
  })).filter(g => g.items.length > 0);

  // Uncategorized
  const categorizedIds = new Set(Object.values(CATEGORIES).flat());
  const uncategorized = connectors.filter(c => !categorizedIds.has(c.id));
  if (uncategorized.length > 0) {
    categorized.push({ category: 'Other', items: uncategorized });
  }

  const connectedCount = connectors.filter(c => c.status === 'connected').length;

  // Filter
  const filteredCategories = filter === 'connected'
    ? categorized.map(g => ({ ...g, items: g.items.filter(c => c.status === 'connected') })).filter(g => g.items.length > 0)
    : filter === 'available'
    ? categorized.map(g => ({ ...g, items: g.items.filter(c => c.status !== 'connected') })).filter(g => g.items.length > 0)
    : categorized;

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0">
        <button onClick={() => setTab('services')}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
            tab === 'services' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}>
          <Plug className="w-3.5 h-3.5" /> Services
          <span className="ml-auto text-[9px] text-emerald-400">{connectedCount}</span>
        </button>
        <button onClick={() => setTab('mcp')}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
            tab === 'mcp' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}>
          <Server className="w-3.5 h-3.5" /> MCP Servers
        </button>

        <div className="pt-3 mt-3 border-t border-border/30">
          <p className="text-[9px] text-muted-foreground px-2 mb-1.5">Filter</p>
          {['all', 'connected', 'available'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`w-full text-left px-2 py-1 text-[10px] rounded transition-colors capitalize ${
                filter === f ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
              }`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">

        {/* ═══ SERVICES ═══ */}
        {tab === 'services' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-display font-semibold text-foreground">Service Connectors</h3>
                <p className="text-[10px] text-muted-foreground">{connectedCount} of {connectors.length} connected — the agent can use connected services as tools</p>
              </div>
              <button onClick={loadConnectors} className="p-1 rounded hover:bg-muted/50"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
            </div>

            {filteredCategories.map(group => (
              <div key={group.category}>
                <p className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.category}</p>
                <div className="space-y-1.5">
                  {group.items.map(conn => {
                    const isExpanded = expanded === conn.id;
                    const isConnected = conn.status === 'connected';
                    const hint = SETUP_HINTS[conn.id];
                    const needsEmail = conn.id === 'jira';

                    return (
                      <div key={conn.id} className="rounded-xl border border-border/30 overflow-hidden">
                        <button onClick={() => setExpanded(isExpanded ? null : conn.id)}
                          className="w-full flex items-center justify-between p-2.5 hover:bg-secondary/20 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                            <div className="text-left">
                              <span className="text-xs font-display font-medium text-foreground">{conn.name}</span>
                              {conn.description && <p className="text-[9px] text-muted-foreground line-clamp-1">{conn.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isConnected && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                            {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-border/20 pt-2 space-y-2">
                            {/* What this connector unlocks */}
                            {conn.capabilities && conn.capabilities.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {conn.capabilities.map(cap => (
                                  <span key={cap} className="px-1.5 py-0.5 text-[8px] rounded bg-primary/10 text-primary">{cap}</span>
                                ))}
                              </div>
                            )}

                            {/* Setup guide */}
                            {hint && !isConnected && (
                              <div className="space-y-1">
                                {hint.steps?.map((step, i) => (
                                  <p key={i} className="text-[10px] text-muted-foreground"><span className="text-primary font-medium">{i + 1}.</span> {step}</p>
                                ))}
                                {hint.url && (
                                  <a href={hint.url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80">
                                    <ExternalLink className="w-3 h-3" /> Open {conn.name}
                                  </a>
                                )}
                              </div>
                            )}

                            {isConnected ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Connected — agent can use {conn.name} tools</span>
                                <button onClick={() => handleDisconnect(conn.id)}
                                  className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                                  <Trash2 className="w-3 h-3" /> Disconnect
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {needsEmail && (
                                  <input value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="Your Atlassian email"
                                    className="w-full bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground outline-none" />
                                )}
                                <div className="flex gap-2">
                                  <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                                    placeholder={hint?.placeholder ?? 'Paste token or API key'}
                                    className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground outline-none font-mono" />
                                  <button onClick={() => handleConnect(conn.id)} disabled={!tokenInput.trim() || connecting}
                                    className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                                    {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />} Connect
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ MCP SERVERS ═══ */}
        {tab === 'mcp' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">MCP Servers</h3>
            <p className="text-[10px] text-muted-foreground">
              Model Context Protocol servers extend the agent with external tools.
              Install from the marketplace or configure custom servers.
            </p>

            <div className="p-4 rounded-xl bg-secondary/30 border border-border/30 text-center">
              <Server className="w-8 h-8 text-primary/30 mx-auto mb-2" />
              <p className="text-xs text-foreground mb-1">No MCP servers configured</p>
              <p className="text-[10px] text-muted-foreground mb-3">
                MCP servers provide specialized tools like database access, file systems, and API integrations.
              </p>
              <p className="text-[10px] text-muted-foreground">
                Browse available servers in the <strong>Skills</strong> app → Marketplace tab.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectorsApp;
