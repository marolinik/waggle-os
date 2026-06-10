/**
 * ConnectorsApp — the Connector Hub (UX-Refactor Phase 4B, S07; PRD §12.7
 * "users see exactly what tools are connected and whether data is flowing").
 *
 * Phase-4B rework:
 *  - The embedded "MCP Servers" tab departed to the standalone MCP Hub (S08).
 *  - Rows render via the ConnectorCard DS piece (§14.7 states + lastSyncAt).
 *  - §8a consumption switch: shared ConnectorDefinition replaces the local
 *    thin Connector duplicate; categories come from the shared `category`
 *    field, not a hardcoded id map.
 *  - New actions: Sync now (C16 health probe + stamp — honest copy, not a data
 *    re-pull), Revoke (C17 strong path w/ scope-and-consequence confirm incl.
 *    the shared-Google-token-pair warning) distinct from the lighter
 *    Disconnect, and a per-connector audit history drawer (C18).
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Zap } from 'lucide-react';
import type { ConnectorDefinition } from '@waggle/shared';
import { recommendConnectors } from '@waggle/shared';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';
import ConnectorCard, { type ConnectorSetupHint } from './connectors/ConnectorCard';
import InstallAuditPanel from './extend/InstallAuditPanel';
import { formatPersonaName } from '@/lib/persona-display';

type ConnTab = 'all' | 'connected' | 'available' | 'recommended' | 'activity';

const TAB_LABELS: Record<ConnTab, string> = {
  all: 'All',
  connected: 'Connected',
  available: 'Available',
  recommended: 'Recommended',
  activity: 'Activity',
};

interface ConnectorsAppProps {
  /** Active workspace's persona id — drives the Recommended tab. */
  personaId?: string;
}

/** Display labels for the shared ConnectorDefinition.category values. */
const CATEGORY_LABELS: Record<string, string> = {
  development: 'Code & DevOps',
  communication: 'Communication',
  productivity: 'Productivity',
  crm: 'CRM & Sales',
  storage: 'Cloud Storage',
  data: 'Database & Data',
  integration: 'Platform',
};

/** Google-family connector ids that share ONE OAuth token pair on the server
 *  (mirrors the route-side OAUTH_PROVIDER map) — revoking any of them purges
 *  the pair, so the confirm dialog must surface the blast radius. */
const GOOGLE_FAMILY = new Set(['gcal', 'gdrive', 'gdocs', 'gmail', 'gsheets']);

const SETUP_HINTS: Record<string, ConnectorSetupHint> = {
  github: { url: 'https://github.com/settings/tokens/new', placeholder: 'ghp_...', steps: ['Settings → Developer settings → Personal access tokens', 'Generate with repo, user scopes'] },
  slack: { url: 'https://api.slack.com/apps', placeholder: 'xoxb-...', steps: ['Create App → Bot Token Scopes → Install to Workspace'] },
  notion: { url: 'https://www.notion.so/my-integrations', placeholder: 'ntn_...', steps: ['Create integration → Copy Internal Integration Token'] },
  jira: { url: 'https://id.atlassian.com/manage-profile/security/api-tokens', placeholder: 'ATATT...', steps: ['Account → Security → API Tokens → Create'] },
  linear: { url: 'https://linear.app/settings/api', placeholder: 'lin_api_...', steps: ['Settings → API → Create Personal API Key'] },
  composio: { url: 'https://app.composio.dev/settings', placeholder: 'cmp_...', steps: ['Settings → API Keys → Copy key (unlocks 250+ services)'] },
  discord: { url: 'https://discord.com/developers/applications', placeholder: 'Bot token...', steps: ['Create Application → Bot → Copy Token'] },
};

/**
 * The token/email inputs are a single shared state reused across every
 * connector row. They must be cleared whenever the expanded connector
 * changes (but NOT when re-collapsing the same one) so a credential typed
 * for connector A can never be submitted to connector B. Pure so it can be
 * regression-tested without rendering React (see phase5b-connectors.test).
 */
export function shouldResetCredentialInputs(prev: string | null, next: string | null): boolean {
  return prev !== next;
}

/** Revoke confirm content (C17) — scope-and-consequence, incl. Google pair. */
export function buildRevokeRequest(conn: Pick<ConnectorDefinition, 'id' | 'name'>): ApprovalRequest {
  return {
    action: `Revoke all access for ${conn.name}? This is the strong path — Disconnect is the lighter option.`,
    scope: [
      'Deletes every stored credential for this connector',
      GOOGLE_FAMILY.has(conn.id)
        ? 'Purges the SHARED Google OAuth token pair — Gmail, Calendar, Drive, Docs and Sheets will all need to reconnect'
        : 'Purges this provider’s OAuth tokens',
      'Writes a revoke entry to the install audit trail',
    ],
    riskLevel: 'medium',
  };
}

const ConnectorsApp = ({ personaId }: ConnectorsAppProps = {}) => {
  // Cold-load race guard (the HomeCockpit lesson): wait for the adapter's
  // initial connect() to settle before firing authed calls — an unguarded
  // mount fetch races the session-token bootstrap and 401s into a
  // healthy-looking "0 of 0 connected" hub. (`serviceConnecting` ≠ the local
  // `connecting` connect-button busy flag below.)
  const { connecting: serviceConnecting } = useService();
  const [tab, setTab] = useState<ConnTab>('all');
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ConnectorDefinition | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);
  const { toast } = useToast();

  // Expand a connector (or collapse when re-clicking the open one). Resets the
  // token/email inputs whenever the target connector changes (R4-007).
  const selectConnector = (id: string | null) => {
    setExpanded(prev => {
      if (shouldResetCredentialInputs(prev, id)) {
        setTokenInput('');
        setEmailInput('');
      }
      return id;
    });
  };

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getConnectors();
      setConnectors(data);
      setError(null);
    } catch (err) {
      console.error('[ConnectorsApp] load failed:', err);
      setConnectors([]);
      setError(err instanceof Error ? err.message : 'Server unreachable');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (serviceConnecting) return;
    void loadConnectors();
  }, [serviceConnecting, loadConnectors]);

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
    } catch (err) {
      console.error('[ConnectorsApp] connect failed:', err);
      toast({
        title: 'Connection failed',
        description: err instanceof Error ? err.message : 'Could not connect — check the token and server',
        variant: 'destructive',
      });
    }
    finally { setConnecting(false); }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await adapter.disconnectConnector(id);
      await loadConnectors();
    } catch (err) { console.error('[ConnectorsApp] disconnect failed:', err); }
  };

  /** C17 strong path — runs after the ApprovalModal confirm. */
  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevoking(true);
    try {
      const res = await adapter.revokeConnector(target.id);
      if (res.ok) {
        setRevokeNotice(
          `Access revoked for ${target.name} — ${res.cleanedKeys ?? 0} credential key(s) removed, `
          + `${res.oauthPurged ?? 0} OAuth token(s) purged.`,
        );
      } else {
        // 404 (nothing stored) / 503 (vault down) bodies parse as data —
        // never render them as a success claim (error-body-as-data trap).
        setRevokeNotice(res.error ?? `Revoke of ${target.name} failed`);
      }
      await loadConnectors();
    } catch (err) {
      toast({
        title: 'Revoke failed',
        description: err instanceof Error ? err.message : 'Server unreachable',
        variant: 'destructive',
      });
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  // Group by the shared category field (§8a — no hardcoded id map).
  const groupConnectors = (list: ConnectorDefinition[]) => {
    const groups = new Map<string, ConnectorDefinition[]>();
    for (const c of list) {
      const label = (c.category && CATEGORY_LABELS[c.category]) || (c.category ?? 'Other');
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(c);
    }
    return Array.from(groups, ([category, items]) => ({ category, items }));
  };

  const connectedCount = connectors.filter(c => c.status === 'connected').length;

  const visible = tab === 'connected'
    ? connectors.filter(c => c.status === 'connected' || c.status === 'expired')
    : tab === 'available'
      ? connectors.filter(c => c.status !== 'connected')
      : connectors;

  // Recommended tab: persona-aware ids resolved against the live registry.
  const recommendedIds = personaId ? recommendConnectors(personaId) : null;
  const recommended = recommendedIds
    ? [...recommendedIds.primary, ...recommendedIds.secondary]
        .map(id => connectors.find(c => c.id === id))
        .filter((c): c is ConnectorDefinition => c != null)
    : [];

  // Full-screen loader only on the INITIAL load — background refreshes
  // (sync/connect/revoke) keep the rows mounted so card-local state (the C16
  // sync notice, lazy health detail) survives instead of being unmounted
  // before it ever paints.
  if (loading && connectors.length === 0) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  if (error && connectors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-sm font-display font-medium text-foreground">Server unreachable</p>
        <p className="text-xs text-muted-foreground max-w-xs">Could not connect to the backend — check Settings</p>
        <button onClick={loadConnectors} className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  const renderCard = (conn: ConnectorDefinition, categoryLabel: string) => (
    <ConnectorCard
      key={conn.id}
      conn={conn}
      categoryLabel={categoryLabel}
      hint={SETUP_HINTS[conn.id]}
      expanded={expanded === conn.id}
      onToggle={() => selectConnector(expanded === conn.id ? null : conn.id)}
      tokenInput={tokenInput}
      emailInput={emailInput}
      onTokenChange={setTokenInput}
      onEmailChange={setEmailInput}
      connecting={connecting}
      onConnect={() => void handleConnect(conn.id)}
      onDisconnect={() => void handleDisconnect(conn.id)}
      onRevoke={() => setRevokeTarget(conn)}
      onSynced={() => void loadConnectors()}
    />
  );

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar tabs. All tabs stay in the Tab order (FilesAppTabs pattern) —
          a roving tabIndex without arrow-key handling makes every inactive
          tab keyboard-unreachable (WCAG 2.1.1). */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0" role="tablist" aria-label="Connector Hub sections">
        {(Object.keys(TAB_LABELS) as ConnTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            role="tab"
            aria-selected={tab === t}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
              tab === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}>
            {TAB_LABELS[t]}
            {t === 'connected' && <span className="ml-auto text-[11px] text-emerald-400">{connectedCount}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto" role="tabpanel">
        {/* Revoke result (C17 consequence summary) — hoisted ABOVE the tab
            branches so a revoke confirmed from ANY tab (incl. Recommended)
            renders its outcome. */}
        {revokeNotice && (
          <p role="status" data-testid="revoke-notice" className="mb-3 text-[11px] text-foreground bg-muted/40 border border-border/30 rounded-lg px-2.5 py-1.5">
            {revokeNotice}
          </p>
        )}
        {tab === 'activity' ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground">Recent Activity</h3>
              <p className="text-[11px] text-muted-foreground">Connector installs, syncs and revocations from the shared install-audit trail.</p>
            </div>
            <InstallAuditPanel type="connector" limit={25} />
          </div>
        ) : tab === 'recommended' ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground">
                {personaId ? `Recommended for ${formatPersonaName(personaId)}` : 'Recommended'}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {personaId
                  ? 'Connectors most relevant to this workspace’s persona.'
                  : 'Open a workspace with a persona to see role-aware recommendations.'}
              </p>
            </div>
            {recommended.length > 0 ? (
              <div className="space-y-1.5">
                {recommended.map(conn => renderCard(conn, (conn.category && CATEGORY_LABELS[conn.category]) || 'Other'))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">No recommendations available.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-display font-semibold text-foreground">Service Connectors</h3>
                <p className="text-[11px] text-muted-foreground">{connectedCount} of {connectors.length} connected — the agent can use connected services as tools</p>
              </div>
              <button onClick={loadConnectors} aria-label="Refresh connectors" className="p-1 rounded hover:bg-muted/50"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
            </div>

            {/* Composio gateway banner */}
            {!connectors.find(c => c.id === 'composio' && c.status === 'connected') && (
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-violet-400" />
                  <p className="text-xs font-display font-semibold text-violet-400">Composio Gateway</p>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Connect Composio with a single API key to unlock <strong>250+ services</strong> instantly — Google Workspace, Slack, Notion, Jira, Salesforce, HubSpot, and more. No individual setup needed.
                </p>
                <button
                  onClick={() => selectConnector('composio')}
                  className="px-2.5 py-1 rounded-lg bg-violet-500/20 text-violet-400 text-[11px] font-display hover:bg-violet-500/30 transition-colors"
                >
                  Set up Composio
                </button>
              </div>
            )}

            {groupConnectors(visible).map(group => (
              <div key={group.category}>
                <p className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.category}</p>
                <div className="space-y-1.5">
                  {group.items.map(conn => renderCard(conn, group.category))}
                </div>
              </div>
            ))}

            {visible.length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {tab === 'connected' ? 'No connectors connected yet — browse Available to set one up.' : 'No connectors to show.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* C17 revoke confirm — scope-and-consequence (incl. Google-pair warning) */}
      <ApprovalModal
        request={revokeTarget ? buildRevokeRequest(revokeTarget) : null}
        approveLabel="Revoke access"
        busy={revoking}
        onApprove={() => void handleRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
};

export default ConnectorsApp;
