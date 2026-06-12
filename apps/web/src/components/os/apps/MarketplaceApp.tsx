/**
 * MarketplaceApp — the consolidated Marketplace / Extend surface (UX-Refactor
 * Phase 4B, S21; PRD §12.13 "power users can extend Waggle without hunting
 * through settings").
 *
 * Phase-4B rework: the old two-tab package browser became the SINGLE faceted
 * Extend surface — the B7 six-domain facets (skill · agent · connector · mcp ·
 * model · template) federate AT READ (A5): marketplace-backed facets hit the
 * registry; the rest pull from their dedicated local routes and say so
 * honestly (no fake remote entries). CapabilitiesApp's duplicate marketplace
 * tab now points here. Installs confirm through the shared ApprovalModal with
 * the scan-derived risk; the Audit tab is the C18 shared install-audit feed.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Store, Search, Loader2, Package } from 'lucide-react';
import type { ExtensionType } from '@waggle/shared';
import { EXTENSION_TYPES } from '@waggle/shared';
import { Input } from '@/components/ui/input';
import { classifyInstallRisk } from '@/lib/risk-display';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';
import { dedupePacks } from '@/lib/dedupe-packs';
import {
  filterExtensions, sortExtensions,
  fromConnector, fromMarketplacePackage, fromMcpCatalogRow, fromModel,
  fromPersona, fromSkillPack, fromTemplate,
  type Extension, type MarketplacePackageRow, type McpCatalogRow,
} from '@/lib/extension-catalog';
import ExtensionCard from './extend/ExtensionCard';
import InstallAuditPanel from './extend/InstallAuditPanel';

type Facet = 'all' | ExtensionType;
type Tab = 'browse' | 'audit';

const FACET_LABELS: Record<Facet, string> = {
  all: 'All',
  skill: 'Skills',
  agent: 'Agents',
  connector: 'Connectors',
  mcp: 'MCPs',
  model: 'Models',
  template: 'Templates',
};

/** A5 honesty: where each non-marketplace facet actually lives. */
const FEDERATED_NOTES: Partial<Record<ExtensionType, string>> = {
  agent: 'Agents are not marketplace-backed — these are your local personas, managed in the Agent Center.',
  connector: 'Connectors are not marketplace-backed — this is your local connector registry, managed in the Connector Hub.',
  mcp: 'Catalog MCP servers install through the MCP Hub (security scan + scope + approval flow); registry-listed MCP packages install right here.',
  model: 'Models come from your configured providers via the LLM router — manage them in Settings.',
  template: 'Workspace templates are local — manage them when creating a workspace.',
};

/** Scan/trust → ApprovalModal risk. P7/D15 A7: delegates to the shared
 *  classifyInstallRisk so every install surface maps the same scan/trust signal
 *  to the same risk level (divergence #8). */
export function installRiskFor(ext: Extension): ApprovalRequest['riskLevel'] {
  return classifyInstallRisk({ scanStatus: ext.scanStatus, trust: ext.trust });
}

/** Uninstall confirm — destructive actions must not be one-click while the
 *  non-destructive install direction gets a full consequence dialog. */
export function buildRemoveRequest(ext: Extension): ApprovalRequest {
  return {
    action: `Remove "${ext.name}"?`,
    scope: [
      'Uninstalls the package and the skills it provides',
      'Recorded in the install audit trail',
    ],
    riskLevel: 'medium',
  };
}

export function buildInstallRequest(ext: Extension): ApprovalRequest {
  return {
    action: `Install "${ext.name}" from the marketplace?`,
    scope: [
      `Type: ${ext.type}`,
      `Source: ${ext.source}`,
      ext.scanStatus
        ? `Security scan: ${ext.scanStatus === 'not_scanned' ? 'not scanned' : ext.scanStatus}`
        : ext.trust
          ? `Trust: ${ext.trust}`
          : 'Trust: unknown',
      'The install is recorded in the audit trail and can be removed afterwards',
    ],
    riskLevel: installRiskFor(ext),
  };
}

const MarketplaceApp = () => {
  const { toast } = useToast();
  // Connect-settled gating (BUG #7 / HomeCockpit lesson): wait for the initial
  // connect attempt to SETTLE before firing authed calls. Gating on
  // `connecting` (not `connected`) means a FAILED connect still runs the
  // fetches, whose rejections surface as the error+Retry state below instead
  // of a permanent healthy-looking empty catalog.
  const { connecting } = useService();
  const [tab, setTab] = useState<Tab>('browse');
  const [facet, setFacet] = useState<Facet>('all');
  const [query, setQuery] = useState('');
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Extension | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Extension | null>(null);
  const [federatedNote, setFederatedNote] = useState<string | null>(null);
  // Monotonic request token — only the LATEST loadFacet call may commit state
  // (rapid facet clicks / debounced queries can settle out of order).
  const requestSeq = useRef(0);

  const loadFacet = useCallback(async (f: Facet, q: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const jobs: Array<Promise<Extension[]>> = [];
      const want = (t: ExtensionType) => f === 'all' || f === t;

      if (want('skill')) {
        jobs.push((async () => {
          const out: Extension[] = [];
          const [pkgs, packs] = await Promise.allSettled([
            adapter.getMarketplace({ type: 'skill', ...(q ? { query: q } : {}), limit: 30 }),
            adapter.getMarketplacePacks(),
          ]);
          if (pkgs.status === 'rejected' && packs.status === 'rejected') {
            // Both skill sources down — propagate so the all-rejected
            // detection below can render error+Retry instead of a
            // healthy-looking empty facet.
            throw pkgs.reason;
          }
          if (pkgs.status === 'fulfilled') {
            out.push(...((pkgs.value.packages ?? []) as MarketplacePackageRow[]).map(fromMarketplacePackage));
          }
          if (packs.status === 'fulfilled') {
            out.push(...dedupePacks(packs.value).map(fromSkillPack));
          }
          return out;
        })());
      }
      if (want('mcp')) {
        // Local MCP Hub catalog (federated — installs run through S08)…
        jobs.push(adapter.getMcps().then(rows => (rows as McpCatalogRow[]).map(fromMcpCatalogRow)));
        // …plus registry packages with waggle_install_type='mcp', which DO
        // install here through the real package route. ('plugin'-typed
        // registry packages have no B7 facet and are deliberately not
        // surfaced pending a ratified home — see the B7 delta doc.)
        jobs.push(
          adapter.getMarketplace({ type: 'mcp', ...(q ? { query: q } : {}), limit: 30 })
            .then(r => ((r.packages ?? []) as MarketplacePackageRow[]).map(fromMarketplacePackage)),
        );
      }
      if (want('agent')) {
        jobs.push(adapter.getPersonas().then(ps => ps.map(fromPersona)));
      }
      if (want('connector')) {
        jobs.push(adapter.getConnectors().then(cs => cs.map(fromConnector)));
      }
      if (want('model')) {
        jobs.push(adapter.getModels().then(ms => ms.map(fromModel)));
      }
      if (want('template')) {
        jobs.push(adapter.getWorkspaceTemplates().then(t => (t.templates ?? []).map(fromTemplate)));
      }

      const settled = await Promise.allSettled(jobs);
      if (seq !== requestSeq.current) return; // stale — a newer request owns the state
      const merged = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []));
      setExtensions(sortExtensions(merged));
      setFederatedNote(f !== 'all' && f !== 'skill' ? FEDERATED_NOTES[f] ?? null : null);
      // All-rejected = the backend is down/unreachable — say so honestly
      // instead of rendering a healthy-looking empty catalog.
      setLoadError(settled.length > 0 && settled.every(s => s.status === 'rejected')
        ? 'Could not load extensions — the server may be unreachable.'
        : null);
    } catch (err) {
      if (seq === requestSeq.current) {
        setExtensions([]);
        setLoadError(err instanceof Error ? err.message : 'Failed to load extensions');
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Fetch once the connect attempt has settled AND on facet change.
  useEffect(() => {
    if (connecting) return;
    void loadFacet(facet, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query is read live; query EDITS go through the debounced effect below
  }, [connecting, facet, loadFacet]);

  // Debounced search — server query for marketplace facets, client filter
  // below. Runs ONLY when the query actually changed (skipping mount and
  // facet clicks avoids double-fetching the effect above); the cleanup clears
  // any pending timer when the facet flips mid-debounce, so a stale timer can
  // never load the OLD facet over the new one.
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (connecting) return;
    if (lastQueryRef.current === query) return;
    lastQueryRef.current = query;
    const t = setTimeout(() => void loadFacet(facet, query), 300);
    return () => clearTimeout(t);
  }, [connecting, facet, query, loadFacet]);

  const dispatchTierEvent = (detail: { required?: string; actual?: string }, name: string) => {
    window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
      detail: {
        required: detail.required ?? 'PRO',
        actual: detail.actual ?? 'FREE',
        message: `Installing "${name}" needs a Pro plan or active trial.`,
      },
    }));
  };

  /** Runs AFTER the ApprovalModal confirm. Only kind 'package' is installable
   *  here — packs render browse-only (no pack-install route exists; see
   *  fromSkillPack) and federated kinds deep-link to their owning app. */
  const handleInstall = async (ext: Extension) => {
    if (ext.kind !== 'package' || ext.packageId == null) return;
    setInstalling(ext.id);
    try {
      const res = await adapter.installMarketplacePackage(ext.packageId);
      if (res.ok) {
        toast({ title: 'Installed', description: `${ext.name} installed successfully` });
        setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, installed: true, lifecycle: 'installed' } : e));
        return;
      }
      const err = await res.json().catch(() => ({ error: 'Install failed' }));
      // Only a REAL tier rejection routes to the UpgradeModal — a 403 can
      // also be a route-level SecurityGate block ({blocked, severity, message}),
      // which must surface as a security failure, not an upsell.
      if (res.status === 403 && err.error === 'TIER_INSUFFICIENT') {
        dispatchTierEvent(err as { required?: string; actual?: string }, ext.name);
        return;
      }
      const blockedMsg = err.blocked
        ? `Security scan blocked install (severity: ${err.severity}). ${err.message ?? ''}`
        : (err.error ?? err.message ?? 'Unknown error');
      toast({ title: 'Install failed', description: blockedMsg, variant: 'destructive' });
    } catch {
      toast({ title: 'Install failed', description: 'Server unreachable', variant: 'destructive' });
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (ext: Extension) => {
    if (ext.kind !== 'package' || ext.packageId == null) return;
    try {
      await adapter.uninstallMarketplacePackage(ext.packageId);
      toast({ title: 'Uninstalled', description: `${ext.name} removed` });
      setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, installed: false, lifecycle: 'available' } : e));
    } catch {
      toast({ title: 'Uninstall failed', variant: 'destructive' });
    }
  };

  const handleOpenIn = (appId: string) => {
    window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId } }));
  };

  const visible = filterExtensions(extensions, query);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3 mb-3">
          <Store className="w-5 h-5" style={{ color: 'var(--honey-500)' }} />
          <h2 className="text-sm font-display font-semibold text-foreground">Marketplace</h2>
          <span className="text-[11px] text-muted-foreground ml-auto">{visible.length} extensions</span>
        </div>

        {/* All tabs stay in the Tab order (FilesAppTabs pattern) — a roving
            tabIndex without arrow-key handling makes every inactive tab
            keyboard-unreachable (WCAG 2.1.1). */}
        <div className="flex gap-1 mb-3" role="tablist" aria-label="Marketplace sections">
          {(['browse', 'audit'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
              className={`px-3 py-1 text-xs font-display rounded-lg transition-colors ${
                tab === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'browse' ? 'Browse' : 'Audit'}
            </button>
          ))}
        </div>

        {tab === 'browse' && (
          <>
            {/* B7 facet rail */}
            <div className="flex flex-wrap gap-1.5 mb-3" data-testid="extension-facets">
              {(['all', ...EXTENSION_TYPES] as Facet[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFacet(f)}
                  aria-pressed={facet === f}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                    facet === f
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                      : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                  }`}
                >
                  {FACET_LABELS[f]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search skills, agents, connectors, MCPs, models, templates..."
                className="flex-1 bg-transparent text-sm border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3 space-y-2" role="tabpanel">
        {tab === 'audit' ? (
          <InstallAuditPanel showFilter limit={30} />
        ) : (
          <>
            {federatedNote && (
              <p data-testid="federated-note" className="text-[11px] text-muted-foreground bg-muted/40 border border-border/30 rounded-lg px-2.5 py-1.5">
                {federatedNote}
              </p>
            )}

            {loading && visible.length === 0 && (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
                <p className="text-xs text-muted-foreground">Loading extensions...</p>
              </div>
            )}

            {!loading && loadError && (
              <div role="alert" className="text-center py-8">
                <p className="text-xs text-destructive mb-2">{loadError}</p>
                <button
                  onClick={() => void loadFacet(facet, query)}
                  className="text-xs text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !loadError && visible.length === 0 && (
              <div className="text-center py-8">
                <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {query ? `No results for "${query}"` : 'No extensions available for this facet'}
                </p>
              </div>
            )}

            {visible.map(ext => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                installing={installing === ext.id}
                onInstall={setConfirmTarget}
                onUninstall={setRemoveTarget}
                onOpenIn={handleOpenIn}
              />
            ))}
          </>
        )}
      </div>

      {/* Install confirm — shared ApprovalModal with scan-derived risk */}
      <ApprovalModal
        request={confirmTarget ? buildInstallRequest(confirmTarget) : null}
        approveLabel="Install"
        busy={installing !== null}
        onApprove={() => {
          const target = confirmTarget;
          setConfirmTarget(null);
          if (target) void handleInstall(target);
        }}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Remove confirm — destructive direction gets the same consequence
          dialog the install direction does */}
      <ApprovalModal
        request={removeTarget ? buildRemoveRequest(removeTarget) : null}
        approveLabel="Remove"
        busy={installing !== null}
        onApprove={() => {
          const target = removeTarget;
          setRemoveTarget(null);
          if (target) void handleUninstall(target);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
};

export default MarketplaceApp;
