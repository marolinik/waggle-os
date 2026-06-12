/**
 * MCPHubApp — standalone MCP Hub (UX-Refactor Phase 4B, S08; PRD §12.8 "MCPs
 * are powerful but always visible, scoped, auditable, and reversible").
 *
 * Tabs: Installed · Catalog · Custom · Remote Registry · Activity.
 *  - Installed: live instances from GET /api/mcps (state badges, start/stop,
 *    C21 test with the live/static mode label, C19 scope editor, revoke with
 *    a scope-and-consequence confirm). Logs = honest coming-soon (no route).
 *  - Catalog: the static registry grid (McpCatalog) wired to the real
 *    installer — PRO+ (B5; 403 routes through the UpgradeModal) and the
 *    SecurityGate "risk approval required" path renders the ApprovalModal
 *    (HIGH findings can be force-overridden; CRITICAL never).
 *  - Custom: register an arbitrary stdio server (PRO+ server-side).
 *  - Remote Registry: C20 deferred — static catalog pointers only, the
 *    runtime is stdio-only in v1.
 *
 * Note on the PRD §12.8 five-tab vocabulary: the "Marketplace" tab is
 * deliberately NOT duplicated here — Phase 4A deferred the marketplace
 * consolidation to the single S21 surface (MarketplaceApp), which the dock's
 * Extend zone exposes next to this hub.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Server } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';
import { actionRisk } from '@/lib/risk-display';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import McpCatalog from './connectors/McpCatalog';
import InstalledMcpList from './mcp/InstalledMcpList';
import AddCustomMcpForm from './mcp/AddCustomMcpForm';
import McpScopeDialog from './mcp/McpScopeDialog';
import InstallAuditPanel from './extend/InstallAuditPanel';
import type { McpListItem } from './mcp/mcp-hub-types';

type HubTab = 'installed' | 'catalog' | 'custom' | 'remote' | 'activity';

const TAB_LABELS: Record<HubTab, string> = {
  installed: 'Installed',
  catalog: 'Catalog',
  custom: 'Custom',
  remote: 'Remote Registry',
  activity: 'Activity',
};

const TAB_HINTS: Record<HubTab, string> = {
  installed: 'Servers registered on this machine — running state, scope, test, revoke',
  catalog: 'Curated MCP catalog — install routes through the security-scanned marketplace installer (Pro)',
  custom: 'Register your own local stdio MCP server (Pro)',
  remote: 'Remote registries are reference links in v1 — the runtime is stdio-only',
  activity: 'MCP install / revoke history from the shared audit trail',
};

interface PendingRiskApproval {
  id: string;
  severity?: string;
  message?: string;
}

interface MCPHubAppProps {
  /** Active workspace's persona id — drives the catalog recommendation tile. */
  personaId?: string;
}

const MCPHubApp = ({ personaId }: MCPHubAppProps = {}) => {
  // Cold-load race guard (the HomeCockpit lesson): wait for the adapter's
  // initial connect() to settle before firing authed calls.
  const { connecting } = useService();
  const { toast } = useToast();
  const [tab, setTab] = useState<HubTab>('installed');
  const [items, setItems] = useState<McpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingRiskApproval | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<McpListItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);
  const [scopeTarget, setScopeTarget] = useState<McpListItem | null>(null);
  const [scoping, setScoping] = useState(false);
  // A4 honest install affordance: POST /api/mcps/install resolves the catalog
  // id against marketplace package NAMES (waggle_install_type='mcp') — only
  // ~9 of the 148 catalog ids resolve today, the rest 404. Fetch the
  // resolvable set once and render Install only where the path exists; the
  // copy-command strip stays as the path for everything else.
  const [resolvableMcpNames, setResolvableMcpNames] = useState<ReadonlySet<string>>(new Set());
  const [resolvableErrored, setResolvableErrored] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mcps = await adapter.getMcps();
      setItems(mcps as McpListItem[]);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Server unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connecting) return;
    void load();
  }, [connecting, load]);

  // Review fix: connect settlement fires both the [connecting] effect and the
  // revalidation listener — single-flight the fetch.
  const resolvableInFlight = useRef(false);
  const loadResolvableNames = useCallback(() => {
    if (resolvableInFlight.current) return;
    resolvableInFlight.current = true;
    adapter.getMarketplace({ type: 'mcp', limit: 200 })
      .then(r => {
        setResolvableMcpNames(
          new Set(((r.packages ?? []) as Array<{ name?: string }>).map(p => p.name ?? '')),
        );
        setResolvableErrored(false);
      })
      // Unknown registry (server down) → no Install buttons; the copy-command
      // fallback still works and installs would 404/fail anyway. P1b D3
      // plus-clause: flagged errored so the empty Set is no longer cached as
      // valid for the session — revalidates on focus/online/connect-settled.
      .catch(() => { setResolvableMcpNames(new Set()); setResolvableErrored(true); })
      .finally(() => { resolvableInFlight.current = false; });
  }, []);

  useEffect(() => {
    if (connecting) return;
    loadResolvableNames();
  }, [connecting, loadResolvableNames]);
  useRevalidateOnError(resolvableErrored, loadResolvableNames);

  const installed = items.filter(i => i.installed);
  const installedIds = new Set(installed.map(i => i.id));
  // Full-screen spinner only on the INITIAL load — background refreshes
  // (start/stop/test/install/scope) keep the current tab mounted so per-row
  // state (C21 test results, catalog search/category) survives the reload
  // instead of being wiped by an unmount.
  const initialLoading = loading && items.length === 0;

  /** B5 PRO+ install via the marketplace installer; `force` = approved HIGH
   *  override. The block that actually fires lives INSIDE installer.install()
   *  and is only overridable via `forceInsecure` (the audited override path);
   *  `force` alone just means "reinstall" — retrying with it loops the
   *  ApprovalModal forever. */
  const handleInstall = async (id: string, force = false) => {
    setInstallingId(id);
    setInstallNotice(null);
    try {
      const res = await adapter.installMcp(id, force ? { force: true, forceInsecure: true } : undefined) as {
        installed?: boolean; server?: string; status?: string; startError?: string;
        requiresApproval?: boolean; error?: string; message?: string;
        required?: string; actual?: string;
        // Installer-level 422 blocks nest the scan; route-level 403 blocks
        // are top-level { blocked, severity, message } with NO scanResult.
        blocked?: boolean; severity?: string;
        scanResult?: { overall_severity?: string; blocked?: boolean };
      };
      if (res.installed) {
        toast({
          title: 'MCP server installed',
          description: res.startError
            ? `${res.server ?? id} installed but failed to start: ${res.startError}`
            : `${res.server ?? id} — status: ${res.status ?? 'registered'}`,
          ...(res.startError ? { variant: 'destructive' as const } : {}),
        });
        await load();
        return;
      }
      if (res.error === 'TIER_INSUFFICIENT') {
        // The adapter's global 403 handler routes this through the
        // UpgradeModal; the explicit dispatch keeps the house pattern (and
        // the unit-testable contract) — the event is idempotent.
        window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
          detail: {
            required: res.required ?? 'PRO',
            actual: res.actual ?? 'FREE',
            message: `Installing MCP servers needs a Pro plan or active trial.`,
          },
        }));
        return;
      }
      if (res.requiresApproval) {
        // Cover BOTH block envelopes: installer-level (scanResult.overall_severity)
        // and route-level (top-level severity) — a route-level CRITICAL must
        // never fall into the overridable-HIGH modal.
        const severity = res.scanResult?.overall_severity ?? res.severity;
        if (severity === 'CRITICAL') {
          // CRITICAL is always blocked server-side — no override path exists;
          // offering an Approve button would be a lie.
          setInstallNotice(`Install blocked: the security scan found CRITICAL issues in "${id}". CRITICAL blocks cannot be overridden.`);
        } else {
          setPendingApproval({ id, severity, message: res.message });
        }
        return;
      }
      setInstallNotice(res.message ?? res.error ?? `Install of "${id}" failed`);
    } catch (err) {
      setInstallNotice(err instanceof Error ? err.message : 'Install failed — server unreachable');
    } finally {
      setInstallingId(null);
    }
  };

  const approvalRequest: ApprovalRequest | null = pendingApproval ? {
    action: `Install "${pendingApproval.id}" despite security-scan findings?`,
    scope: [
      `Security scan severity: ${pendingApproval.severity ?? 'HIGH'}`,
      ...(pendingApproval.message ? [pendingApproval.message] : []),
      'The override is recorded in the install audit trail',
    ],
    riskLevel: actionRisk('mcp-install-override'),
  } : null;

  const revokeRequest: ApprovalRequest | null = revokeTarget ? {
    action: `Revoke MCP server "${revokeTarget.name}"?`,
    scope: [
      'Stops the running process (if any)',
      'Removes the server from the persisted config — it will not restart with Waggle',
      'Writes a revoke entry to the install audit trail',
    ],
    riskLevel: actionRisk('mcp-revoke'),
  } : null;

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevoking(true);
    try {
      const res = await adapter.revokeMcp(target.id) as {
        ok?: boolean; stoppedInstance?: boolean; removedConfig?: boolean; error?: string;
      };
      if (res.ok) {
        setRevokeNotice(
          `Revoked ${target.name} — process ${res.stoppedInstance ? 'stopped' : 'was not running'}, `
          + `persisted config ${res.removedConfig ? 'removed' : 'not found'}.`,
        );
      } else {
        setRevokeNotice(res.error ?? `Revoke of "${target.name}" failed`);
      }
      await load();
    } catch (err) {
      toast({ title: 'Revoke failed', description: err instanceof Error ? err.message : 'Server unreachable', variant: 'destructive' });
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  const handleScope = async (payload: { scope: 'personal' } | { workspaceId: string }) => {
    if (!scopeTarget) return;
    setScoping(true);
    try {
      const res = await adapter.updateMcpPermissions(scopeTarget.id, payload);
      if (!res.ok) {
        // 400/404 error bodies parse as data (adapter.fetch never throws on
        // HTTP errors) — keep the dialog open and surface the rejection
        // instead of closing as if the save succeeded.
        toast({ title: 'Scope update failed', description: res.error ?? 'The server rejected the scope change', variant: 'destructive' });
        return;
      }
      await load();
      setScopeTarget(null);
    } catch (err) {
      toast({ title: 'Scope update failed', description: err instanceof Error ? err.message : 'Server unreachable', variant: 'destructive' });
    } finally {
      setScoping(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <Server className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-display font-semibold text-foreground">MCP Hub</h2>
        <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1.5">
          {loading && items.length > 0 && (
            <Loader2 className="w-3 h-3 animate-spin" aria-label="Refreshing" />
          )}
          {installed.length} installed · {items.length} in catalog
        </span>
      </div>

      {/* All tabs stay in the Tab order (FilesAppTabs pattern) — a roving
          tabIndex without arrow-key handling makes every inactive tab
          keyboard-unreachable (WCAG 2.1.1). */}
      <div className="flex gap-1 mb-4 p-0.5 rounded-lg bg-muted/50 w-fit flex-wrap" role="tablist" aria-label="MCP Hub sections">
        {(Object.keys(TAB_LABELS) as HubTab[]).map(t => (
          <HintTooltip key={t} content={TAB_HINTS[t]}>
            <button
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
              className={`px-3 py-1.5 text-xs rounded-md font-display transition-colors ${
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {TAB_LABELS[t]}
              {t === 'installed' && installed.length > 0 && <span className="ml-1 text-[10px] opacity-80">({installed.length})</span>}
            </button>
          </HintTooltip>
        ))}
      </div>

      {installNotice && (
        <p role="alert" data-testid="mcp-install-notice" className="mb-3 text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-2.5 py-1.5">
          {installNotice}
        </p>
      )}
      {revokeNotice && (
        <p role="status" data-testid="mcp-revoke-notice" className="mb-3 text-[11px] text-foreground bg-muted/40 border border-border/30 rounded-lg px-2.5 py-1.5">
          {revokeNotice}
        </p>
      )}

      {initialLoading && (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {!initialLoading && error && (
        <div role="alert" className="text-center py-8">
          <p className="text-xs text-destructive mb-2">{error}</p>
          <button onClick={() => void load()} className="text-xs text-primary hover:underline">Retry</button>
        </div>
      )}

      {!initialLoading && !error && tab === 'installed' && (
        <InstalledMcpList
          items={installed}
          onRevoke={setRevokeTarget}
          onScope={setScopeTarget}
          onChanged={() => void load()}
        />
      )}

      {!initialLoading && !error && tab === 'catalog' && (
        <McpCatalog
          personaId={personaId}
          installedIds={installedIds}
          installableIds={resolvableMcpNames}
          installingId={installingId}
          onInstall={(id) => void handleInstall(id)}
        />
      )}

      {!initialLoading && !error && tab === 'custom' && (
        <AddCustomMcpForm onAdded={(id) => {
          toast({ title: 'Custom MCP server added', description: `${id} registered` });
          void load();
        }} />
      )}

      {tab === 'remote' && (
        <div className="max-w-lg space-y-3" data-testid="mcp-remote-registry">
          <h3 className="text-sm font-display font-semibold text-foreground">Remote registries</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Waggle&rsquo;s MCP runtime is <strong>stdio-only</strong> in this release — remote/hosted MCP
            transports are not supported yet, so there is nothing to install from a remote registry
            honestly. Browse these registries for servers, then install the local (stdio) variant from
            the Catalog tab or add it as a Custom server.
          </p>
          <ul className="space-y-1.5 text-xs">
            {[
              { name: 'Official MCP reference servers', url: 'https://github.com/modelcontextprotocol/servers' },
              { name: 'awesome-mcp-servers', url: 'https://github.com/punkpeye/awesome-mcp-servers' },
              { name: 'Composio MCP registry', url: 'https://mcp.composio.dev' },
            ].map(link => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
                  <ExternalLink className="w-3 h-3" /> {link.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'activity' && (
        <InstallAuditPanel type="mcp" limit={25} />
      )}

      {/* SecurityGate "risk approval required" → explicit approve/deny (HIGH only) */}
      <ApprovalModal
        request={approvalRequest}
        approveLabel="Install anyway"
        busy={installingId !== null}
        onApprove={() => {
          const id = pendingApproval?.id;
          setPendingApproval(null);
          if (id) void handleInstall(id, true);
        }}
        onCancel={() => setPendingApproval(null)}
      />

      {/* Revoke confirm — reversibility with consequences (PRD §12.8) */}
      <ApprovalModal
        request={revokeRequest}
        approveLabel="Revoke server"
        busy={revoking}
        onApprove={() => void handleRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />

      {/* C19 scope editor */}
      <McpScopeDialog
        serverId={scopeTarget?.id ?? null}
        currentWorkspaceId={scopeTarget?.connectedTo?.[0]}
        busy={scoping}
        onSubmit={(payload) => void handleScope(payload)}
        onClose={() => setScopeTarget(null)}
      />
    </div>
  );
};

export default MCPHubApp;
