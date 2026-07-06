/**
 * MarketplaceApp — the Warm-Hive Marketplace surface (PR4 Variation A; screen
 * 09). "Skills + connectors + MCP as one shelf, agent-searchable." The four
 * shelves (D2) — All / Skills / Connectors / MCP — federate AT READ; agents,
 * models and templates keep their dedicated hubs (deep-linked from elsewhere).
 *
 * Installs are one-click + type-aware (D3, §1): the ExtensionCard drives
 * Add / Connect / Enable through the shared install store, so installing in
 * ANY view reflects in ALL (the count bar + inline chat). Security is
 * preserved server-side — a SecurityGate block surfaces as a destructive
 * toast, tier routes to Upgrade — and the destructive Remove direction keeps
 * its ApprovalModal consequence dialog. The Audit tab is the C18 shared feed.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Store, Loader2, Package } from 'lucide-react';
import type { ExtensionType } from '@waggle/shared';
import { classifyInstallRisk, actionRisk, installTrustSource } from '@/lib/risk-display';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useInstallStore } from '@/providers/InstallProvider';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';
import { dedupePacks } from '@/lib/dedupe-packs';
import {
  filterExtensions, sortExtensions, dedupeExtensions,
  fromConnector, fromMarketplacePackage, fromMcpCatalogRow, fromSkillPack,
  type Extension, type MarketplacePackageRow, type McpCatalogRow,
} from '@/lib/extension-catalog';
import ExtensionCard from './extend/ExtensionCard';
import InstallAuditPanel from './extend/InstallAuditPanel';
import AgentSearchBox from './extend/AgentSearchBox';

/** The four shelves (D2) — the design's "one simple shelf" set. */
const SHELVES = ['all', 'skill', 'connector', 'mcp'] as const;
type Facet = (typeof SHELVES)[number];
type Tab = 'browse' | 'audit';

const FACET_LABELS: Record<Facet, string> = {
  all: 'All',
  skill: 'Skills',
  connector: 'Connectors',
  mcp: 'MCPs',
};

/** Honest in-place note for the connectable/enableable shelves (D3). */
const SHELF_NOTES: Partial<Record<Facet, string>> = {
  connector: 'Connect with an API token here — it goes straight to your vault. OAuth connectors open in the Connector Hub.',
  mcp: 'Enable MCP servers here (security-scanned, Pro). Manage running servers in the MCP Hub.',
};

/** Scan/trust → ApprovalModal risk. P7/D15 A7: delegates to the shared
 *  classifyInstallRisk so every install surface maps the same scan/trust signal
 *  to the same risk level (divergence #8). Intentionally retained as the
 *  canonical install-risk mapping, regression-locked by p7-a7-install-risk; it
 *  has NO production render-path caller (install is one-click, §1) — do not
 *  re-wire an install ApprovalModal off this chain without a design decision. */
export function installRiskFor(ext: Extension): ApprovalRequest['riskLevel'] {
  return classifyInstallRisk({ scanStatus: ext.scanStatus, trust: ext.trust });
}

/** Uninstall confirm — destructive actions must not be one-click while the
 *  non-destructive install direction is (§1). */
export function buildRemoveRequest(ext: Extension): ApprovalRequest {
  return {
    action: `Remove "${ext.name}"?`,
    scope: [
      'Uninstalls the package and the skills it provides',
      'Recorded in the install audit trail',
    ],
    riskLevel: actionRisk('install-remove'),
  };
}

/** Curated "Start here" shelf (round-4 merchandising) — a handful of
 *  well-known marks lifted above the All grid so a first visit has an obvious
 *  entry point. Honest by construction: matched against the LOADED list only
 *  (first 3 hits, band hidden under 2 matches) — never fabricated entries. */
const START_HERE_IDS = ['1password', 'github', 'slack', 'notion', 'postgres', 'airtable'] as const;

export function startHerePicks(list: Extension[]): Extension[] {
  const norm = (s: string) => s.toLowerCase().replace(/^(connector|mcp|pkg|pack):/, '').replace(/-mcp$/, '');
  const picks: Extension[] = [];
  for (const key of START_HERE_IDS) {
    const hit = list.find(e => norm(e.id) === key || (e.name ?? '').trim().toLowerCase() === key);
    if (hit && !picks.includes(hit)) picks.push(hit);
    if (picks.length === 3) break;
  }
  return picks.length >= 2 ? picks : [];
}

/** Structured install risk/provenance (regression-locked by p7-issue17). */
export function buildInstallRequest(ext: Extension): ApprovalRequest {
  return {
    action: `Install "${ext.name}" from the marketplace?`,
    scope: [
      `Type: ${ext.type}`,
      `Source: ${ext.source}`,
      ext.scanStatus
        ? `Security scan: ${ext.scanStatus === 'not_scanned' ? 'not scanned' : ext.scanStatus}`
        : undefined,
      'The install is recorded in the audit trail and can be removed afterwards',
    ].filter((s): s is string => s !== undefined),
    riskLevel: installRiskFor(ext),
    trustSource: installTrustSource(ext),
  };
}

const MarketplaceApp = () => {
  const { connecting } = useService();
  // The shared install store owns installed/installing state + the count (D1).
  const { installedCount, hydrate, uninstall } = useInstallStore();
  const [tab, setTab] = useState<Tab>('browse');
  const [facet, setFacet] = useState<Facet>('all');
  const [query, setQuery] = useState('');
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Extension | null>(null);
  const [removing, setRemoving] = useState(false);
  const [shelfNote, setShelfNote] = useState<string | null>(null);
  // Monotonic request token — only the LATEST loadFacet call may commit state.
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
          if (pkgs.status === 'rejected' && packs.status === 'rejected') throw pkgs.reason;
          if (pkgs.status === 'fulfilled') {
            out.push(...((pkgs.value.packages ?? []) as MarketplacePackageRow[]).map(fromMarketplacePackage));
          }
          if (packs.status === 'fulfilled') {
            out.push(...dedupePacks(packs.value).map(fromSkillPack));
          }
          return out;
        })());
      }
      if (want('connector')) {
        jobs.push(adapter.getConnectors().then(cs => cs.map(fromConnector)));
      }
      if (want('mcp')) {
        // Local MCP Hub catalog (enableable in-place via the store, D3)…
        jobs.push(adapter.getMcps().then(rows => (rows as McpCatalogRow[]).map(fromMcpCatalogRow)));
        // …plus registry packages with waggle_install_type='mcp', which install
        // through the real package route.
        jobs.push(
          adapter.getMarketplace({ type: 'mcp', ...(q ? { query: q } : {}), limit: 30 })
            .then(r => ((r.packages ?? []) as MarketplacePackageRow[]).map(fromMarketplacePackage)),
        );
      }

      const settled = await Promise.allSettled(jobs);
      if (seq !== requestSeq.current) return; // stale — a newer request owns the state
      const merged = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []));
      // Collapse the 3 catalog sources (connector / catalog-mcp / package) into
      // ONE entry per integration before sorting, so the grid shows one row +
      // one action instead of the same integration up to 3×.
      setExtensions(sortExtensions(dedupeExtensions(merged)));
      setShelfNote(f !== 'all' ? SHELF_NOTES[f] ?? null : null);
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

  // Fetch once the connect attempt has settled AND on facet change. Re-hydrate
  // the store too (D4) so installs made in the Hubs reconcile into the grid.
  useEffect(() => {
    if (connecting) return;
    void loadFacet(facet, query);
    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query is read live; query EDITS go through the debounced effect below
  }, [connecting, facet, loadFacet, hydrate]);

  // Debounced search — server query for marketplace facets, client filter below.
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (connecting) return;
    if (lastQueryRef.current === query) return;
    lastQueryRef.current = query;
    const t = setTimeout(() => void loadFacet(facet, query), 300);
    return () => clearTimeout(t);
  }, [connecting, facet, query, loadFacet]);

  /** Remove confirmed → uninstall through the store so the count bar + every
   *  other view reflect it. The store toasts + reconciles on failure. */
  const handleUninstall = async (ext: Extension) => {
    setRemoving(true);
    try {
      await uninstall(ext);
    } finally {
      setRemoving(false);
    }
  };

  const handleOpenIn = (appId: string) => {
    window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId } }));
  };

  const visible = filterExtensions(extensions, query);
  // Round-4 merchandising: the band renders on the default All browse only
  // (no active query); banded entries are lifted OUT of the grid below so
  // each integration keeps exactly one row + one action.
  const startHere = facet === 'all' && !query ? startHerePicks(extensions) : [];
  const gridVisible = startHere.length > 0
    ? visible.filter(e => !startHere.some(f => f.id === e.id))
    : visible;
  // Round-5 merchandising: the default All browse groups by type with section
  // headers instead of one alphabetical mixed-type dump. A live query (or a
  // typed facet) keeps the flat relevance list.
  const groupedSections: Array<{ label: string; items: Extension[] }> =
    facet === 'all' && !query
      ? (['skill', 'connector', 'mcp'] as const)
          .map(t => ({ label: FACET_LABELS[t], items: gridVisible.filter(e => e.type === t) }))
          .concat([{ label: 'More', items: gridVisible.filter(e => !['skill', 'connector', 'mcp'].includes(e.type)) }])
          .filter(s => s.items.length > 0)
      : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3 mb-3">
          <Store className="w-5 h-5" style={{ color: 'var(--honey-500)' }} />
          <h2 className="text-sm font-display font-semibold text-foreground">Marketplace</h2>
          {/* D1: honest global count of installed/connected/enabled capabilities. */}
          <span data-testid="install-count" className="text-[11px] text-muted-foreground ml-auto">
            {installedCount} installed
          </span>
        </div>

        <div className="flex gap-1 mb-3" role="tablist" aria-label="Marketplace sections">
          {(['browse', 'audit'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
              className={`px-3 py-1 text-xs font-display rounded-lg transition-colors ${
                tab === t ? 'bg-primary/20 text-honey' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'browse' ? 'Browse' : 'Audit'}
            </button>
          ))}
        </div>

        {tab === 'browse' && (
          <>
            {/* Four-shelf rail (D2) */}
            <div className="flex flex-wrap gap-1.5 mb-3" data-testid="extension-facets">
              {SHELVES.map(f => (
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

          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3 space-y-2" role="tabpanel">
        {tab === 'audit' ? (
          <InstallAuditPanel showFilter limit={30} />
        ) : (
          <>
            {/* ONE smart input (H-round merge): keystrokes filter the grid
                below live; Enter asks the agent-search engine for a capability
                three-up. Replaces the former separate header search field. */}
            <AgentSearchBox onQueryChange={setQuery} />
            <div className="border-t border-border/20 my-1" />

            {startHere.length > 0 && (
              <div data-testid="start-here-band" className="space-y-2">
                <p className="text-[11px] font-display font-semibold text-honey/80 uppercase tracking-wider">
                  Start here
                </p>
                {startHere.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    onRemove={setRemoveTarget}
                    onOpenIn={handleOpenIn}
                  />
                ))}
                <div className="border-t border-border/20" aria-hidden />
              </div>
            )}

            {shelfNote && (
              <p data-testid="federated-note" className="text-[11px] text-muted-foreground bg-muted/40 border border-border/30 rounded-lg px-2.5 py-1.5">
                {shelfNote}
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
                  className="text-xs text-honey hover:underline"
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

            {groupedSections.length > 0
              ? groupedSections.map(section => (
                  <div key={section.label} data-testid={`marketplace-section-${section.label.toLowerCase()}`} className="space-y-2">
                    <p className="pt-2 text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.label} <span className="text-[var(--text-dim)] normal-case tracking-normal">· {section.items.length}</span>
                    </p>
                    {section.items.map(ext => (
                      <ExtensionCard key={ext.id} ext={ext} onRemove={setRemoveTarget} onOpenIn={handleOpenIn} />
                    ))}
                  </div>
                ))
              : gridVisible.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    onRemove={setRemoveTarget}
                    onOpenIn={handleOpenIn}
                  />
                ))}
          </>
        )}
      </div>

      {/* Remove confirm — destructive direction keeps its consequence dialog
          even though install is one-click. */}
      <ApprovalModal
        request={removeTarget ? buildRemoveRequest(removeTarget) : null}
        approveLabel="Remove"
        busy={removing}
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
