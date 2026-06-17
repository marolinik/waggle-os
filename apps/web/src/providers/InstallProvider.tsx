/**
 * InstallProvider — the PR4 shared install store ("sync"). The single FE
 * source of truth for what is installed / mid-flight, subscribed to by the
 * Marketplace grid (Variation A), agent-pick, and inline-in-chat (Variation
 * B). Installing in ANY view reflects in ALL, and the count bar reads one
 * place (D1 honest global count).
 *
 * Design notes:
 *  - `installed` is a Set of namespaced catalog ids; the id prefix already
 *    encodes the kind, so no Map value is needed. Only togglable kinds
 *    (package / connector / catalog-mcp) ever enter it → `size` IS the count.
 *  - Confirmed-success flip: an id enters `installed` only after the server
 *    confirms; it stays in `installing` (spinner) during the flight. A
 *    gate-rejected install therefore never appears in the count (PR4 §6).
 *  - The adapter's request() already dispatches waggle:tier-insufficient on a
 *    403 TIER, so this store classifies tier but never re-fires the event.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import { CONNECT_SETTLED_EVENT } from '@/hooks/useRevalidateOnError';
import type { MarketplacePackageRow } from '@/lib/extension-catalog';
import {
  describeError, isTierError, isTogglable, rawId,
  type InstallCredentials, type InstallOutcome, type InstallTarget,
} from '@/lib/install-store';

export interface InstallStore {
  /** Namespaced ids currently installed/connected/enabled (togglable kinds only). */
  installed: ReadonlySet<string>;
  /** Namespaced ids with an install/uninstall in flight. */
  installing: ReadonlySet<string>;
  /** Honest global count of user-added capabilities (D1) = installed.size. */
  installedCount: number;
  hydrating: boolean;
  isInstalled: (id: string) => boolean;
  isInstalling: (id: string) => boolean;
  /** Type-aware install dispatcher. Optimistic-on-success + reconcile + toasts. */
  install: (target: InstallTarget, credentials?: InstallCredentials) => Promise<InstallOutcome>;
  uninstall: (target: InstallTarget) => Promise<InstallOutcome>;
  /** Re-read server truth (initial, on connect-settled, and on nav per D4). */
  hydrate: () => Promise<void>;
}

const InstallContext = createContext<InstallStore | null>(null);

export const useInstallStore = (): InstallStore => {
  const ctx = useContext(InstallContext);
  if (!ctx) throw new Error('useInstallStore must be used within InstallProvider');
  return ctx;
};

/** SecurityGate-block message shared by the install/enable branches. */
function securityMessage(e: { severity?: string; message?: string }): string {
  return `Security scan blocked it (severity: ${e.severity ?? 'unknown'}). ${e.message ?? ''}`.trim();
}

function mcpOptsFrom(c?: InstallCredentials): { settings?: Record<string, string>; force?: boolean; forceInsecure?: boolean } | undefined {
  if (!c) return undefined;
  const opts: { settings?: Record<string, string>; force?: boolean; forceInsecure?: boolean } = {};
  if (c.settings) opts.settings = c.settings;
  if (c.force) opts.force = c.force;
  if (c.forceInsecure) opts.forceInsecure = c.forceInsecure;
  return Object.keys(opts).length > 0 ? opts : undefined;
}

export const InstallProvider = ({ children }: { children: ReactNode }) => {
  const { connecting } = useService();
  const { toast } = useToast();
  const [installed, setInstalled] = useState<ReadonlySet<string>>(() => new Set());
  const [installing, setInstalling] = useState<ReadonlySet<string>>(() => new Set());
  const [hydrating, setHydrating] = useState(false);
  // Monotonic guard — only the latest hydrate may commit (rapid nav / reconnect bursts).
  const hydrateSeq = useRef(0);
  // The initial settle fires BOTH the connecting flip and the connect-settled
  // event; this gate keeps the cold-boot hydrate to ONE (the event path only
  // re-hydrates on a genuine RE-connect, once the initial has run).
  const didInitialHydrate = useRef(false);

  const addInstalling = useCallback((id: string) => {
    setInstalling(prev => { const n = new Set(prev); n.add(id); return n; });
  }, []);
  const clearInstalling = useCallback((id: string) => {
    setInstalling(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);
  // A confirmed flip invalidates any in-flight hydrate: bumping the seq makes a
  // hydrate whose reads predate this flip fail its commit guard (line below),
  // so a stale reconcile can never clobber a just-confirmed install/uninstall.
  const markInstalled = useCallback((id: string) => {
    hydrateSeq.current += 1;
    setInstalled(prev => { const n = new Set(prev); n.add(id); return n; });
  }, []);
  const markUninstalled = useCallback((id: string) => {
    hydrateSeq.current += 1;
    setInstalled(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const hydrate = useCallback(async () => {
    const seq = ++hydrateSeq.current;
    setHydrating(true);
    const [conn, mcps, skillPkgs, mcpPkgs] = await Promise.allSettled([
      adapter.getConnectors(),
      adapter.getMcps(),
      adapter.getMarketplace({ type: 'skill', limit: 50 }),
      adapter.getMarketplace({ type: 'mcp', limit: 50 }),
    ]);
    if (seq !== hydrateSeq.current) return; // a newer hydrate owns the state
    // Per-domain reconcile: a rejected domain carries over its previous ids
    // (by prefix) instead of dropping known-installed state on a transient fail.
    setInstalled(prev => {
      const next = new Set<string>();
      if (conn.status === 'fulfilled') {
        for (const c of conn.value ?? []) if (c?.status === 'connected') next.add(`connector:${c.id}`);
      } else {
        for (const id of prev) if (id.startsWith('connector:')) next.add(id);
      }
      if (mcps.status === 'fulfilled') {
        for (const m of mcps.value ?? []) if (m?.installed) next.add(`mcp:${m.id}`);
      } else {
        for (const id of prev) if (id.startsWith('mcp:')) next.add(id);
      }
      // Add every fulfilled package read as authoritative for its type.
      for (const r of [skillPkgs, mcpPkgs]) {
        if (r.status !== 'fulfilled') continue;
        const pkgs = (r.value?.packages ?? []) as MarketplacePackageRow[];
        for (const p of pkgs) if (p?.installed) next.add(`pkg:${p.id}`);
      }
      // The two package reads are disjoint type-filtered sets sharing ONE `pkg:`
      // namespace, so a single failed read leaves the namespace incomplete. If
      // EITHER rejected, carry over prior pkg ids — over-retaining a stale pkg
      // (corrected on the next clean hydrate) is safer than dropping a confirmed
      // install from the count. Mirrors the connector/mcp per-domain carry-over.
      if (skillPkgs.status === 'rejected' || mcpPkgs.status === 'rejected') {
        for (const id of prev) if (id.startsWith('pkg:')) next.add(id);
      }
      return next;
    });
    setHydrating(false);
  }, []);

  const install = useCallback(async (target: InstallTarget, credentials?: InstallCredentials): Promise<InstallOutcome> => {
    if (!isTogglable(target)) return { ok: false, reason: 'unsupported' };
    const { id } = target;

    // CONNECTOR — vault connect (UNGATED). Token-paste supplied by the caller;
    // OAuth-only connectors can't finish inline (caller routes to the Hub).
    if (target.kind === 'federated' && target.type === 'connector') {
      if (!credentials?.token && !credentials?.apiKey) return { ok: false, reason: 'needs-credentials' };
      addInstalling(id);
      try {
        await adapter.connectConnector(rawId(id), {
          ...(credentials.token ? { token: credentials.token } : {}),
          ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
        });
        markInstalled(id);
        toast({ title: 'Connected', description: `${target.name} is connected.` });
        return { ok: true };
      } catch (e) {
        // A 403 tier rejection — the adapter already dispatched the upgrade
        // event; classify as tier and don't toast over it.
        if (isTierError(e)) return { ok: false, reason: 'tier' };
        toast({ title: 'Connection failed', description: describeError(e), variant: 'destructive' });
        return { ok: false, reason: 'error' };
      } finally {
        clearInstalling(id);
      }
    }

    // CATALOG MCP — enable (PRO-gated; SecurityGate). Body envelope is load-bearing.
    if (target.kind === 'federated' && target.type === 'mcp') {
      addInstalling(id);
      try {
        const result = (await adapter.installMcp(rawId(id), mcpOptsFrom(credentials))) as {
          installed: boolean; requiresApproval?: boolean; blocked?: boolean;
          error?: string; severity?: string; message?: string;
        };
        if (result.installed) {
          markInstalled(id);
          toast({ title: 'Enabled', description: `${target.name} is enabled.` });
          return { ok: true };
        }
        if (result.error === 'TIER_INSUFFICIENT') return { ok: false, reason: 'tier' };
        if (result.requiresApproval || result.blocked) {
          toast({ title: 'Enable blocked', description: securityMessage(result), variant: 'destructive' });
          return { ok: false, reason: 'security' };
        }
        toast({ title: 'Enable failed', description: result.message ?? result.error ?? 'Unknown error', variant: 'destructive' });
        return { ok: false, reason: 'error' };
      } catch (e) {
        toast({ title: 'Enable failed', description: describeError(e), variant: 'destructive' });
        return { ok: false, reason: 'error' };
      } finally {
        clearInstalling(id);
      }
    }

    // PACKAGE — marketplace install (PRO-gated; SecurityGate). RAW Response.
    if (target.kind === 'package') {
      if (target.packageId == null) return { ok: false, reason: 'unsupported' };
      addInstalling(id);
      try {
        const res = await adapter.installMarketplacePackage(target.packageId);
        if (res.ok) {
          markInstalled(id);
          toast({ title: 'Added', description: `${target.name} is installed.` });
          return { ok: true };
        }
        const err = (await res.json().catch(() => ({}))) as {
          error?: string; blocked?: boolean; severity?: string; message?: string;
        };
        // Only a real tier rejection is a tier outcome — the adapter already
        // dispatched the upgrade event, so do not re-fire or toast it.
        if (res.status === 403 && err.error === 'TIER_INSUFFICIENT') return { ok: false, reason: 'tier' };
        if (err.blocked) {
          toast({ title: 'Install blocked', description: securityMessage(err), variant: 'destructive' });
          return { ok: false, reason: 'security' };
        }
        toast({ title: 'Install failed', description: err.error ?? err.message ?? 'Unknown error', variant: 'destructive' });
        return { ok: false, reason: 'error' };
      } catch (e) {
        toast({ title: 'Install failed', description: describeError(e), variant: 'destructive' });
        return { ok: false, reason: 'error' };
      } finally {
        clearInstalling(id);
      }
    }

    return { ok: false, reason: 'unsupported' };
  }, [toast, addInstalling, clearInstalling, markInstalled]);

  const uninstall = useCallback(async (target: InstallTarget): Promise<InstallOutcome> => {
    if (!isTogglable(target)) return { ok: false, reason: 'unsupported' };
    const { id } = target;
    addInstalling(id);
    try {
      if (target.kind === 'package' && target.packageId != null) {
        await adapter.uninstallMarketplacePackage(target.packageId); // throws on !ok
        markUninstalled(id);
        toast({ title: 'Removed', description: `${target.name} was uninstalled.` });
        return { ok: true };
      }
      if (target.type === 'connector') {
        await adapter.disconnectConnector(rawId(id)); // throws on !ok
        markUninstalled(id);
        toast({ title: 'Disconnected', description: `${target.name} was disconnected.` });
        return { ok: true };
      }
      if (target.type === 'mcp') {
        const r = await adapter.revokeMcp(rawId(id)); // resolves { ok } as data
        if (r.ok) {
          markUninstalled(id);
          toast({ title: 'Disabled', description: `${target.name} was disabled.` });
          return { ok: true };
        }
        toast({ title: 'Disable failed', variant: 'destructive' });
        return { ok: false, reason: 'error' };
      }
      return { ok: false, reason: 'unsupported' };
    } catch (e) {
      toast({ title: 'Remove failed', description: describeError(e), variant: 'destructive' });
      return { ok: false, reason: 'error' };
    } finally {
      clearInstalling(id);
    }
  }, [toast, addInstalling, clearInstalling, markUninstalled]);

  // Initial hydrate once the connect attempt has settled (gate on `connecting`,
  // not `connected`: a failed connect still hydrates so its rejection surfaces).
  useEffect(() => {
    if (!connecting && !didInitialHydrate.current) {
      didInitialHydrate.current = true;
      void hydrate();
    }
  }, [connecting, hydrate]);

  // Reconnect revalidation — the same bus the other Stage-B surfaces use. Only
  // re-hydrates AFTER the initial run, so the cold-boot settle (which fires this
  // event too) doesn't double-hydrate with the connecting-gated effect above.
  useEffect(() => {
    const onSettled = () => { if (didInitialHydrate.current) void hydrate(); };
    window.addEventListener(CONNECT_SETTLED_EVENT, onSettled);
    return () => window.removeEventListener(CONNECT_SETTLED_EVENT, onSettled);
  }, [hydrate]);

  const value = useMemo<InstallStore>(() => ({
    installed,
    installing,
    installedCount: installed.size,
    hydrating,
    isInstalled: (id: string) => installed.has(id),
    isInstalling: (id: string) => installing.has(id),
    install,
    uninstall,
    hydrate,
  }), [installed, installing, hydrating, install, uninstall, hydrate]);

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
};
