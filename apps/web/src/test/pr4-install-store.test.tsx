/**
 * PR4 Phase A — the shared install store (InstallProvider / useInstallStore).
 * Verifies hydrate, the type-aware dispatcher, confirmed-success flip,
 * reconcile (roll back / carry-over), the in-flight micro-state, and the
 * honest global count — all over a mocked adapter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    forceReconnect: vi.fn().mockResolvedValue(undefined),
    getConnectors: vi.fn().mockResolvedValue([]),
    getMcps: vi.fn().mockResolvedValue([]),
    getMarketplace: vi.fn().mockResolvedValue({ packages: [] }),
    installMarketplacePackage: vi.fn(),
    uninstallMarketplacePackage: vi.fn().mockResolvedValue(undefined),
    connectConnector: vi.fn().mockResolvedValue(undefined),
    disconnectConnector: vi.fn().mockResolvedValue(undefined),
    installMcp: vi.fn(),
    revokeMcp: vi.fn().mockResolvedValue({ ok: true, stoppedInstance: true, removedConfig: true }),
  },
  toast: vi.fn(),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { ServiceProvider } from '@/providers/ServiceProvider';
import { InstallProvider, useInstallStore } from '@/providers/InstallProvider';
import type { InstallTarget } from '@/lib/install-store';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServiceProvider><InstallProvider>{children}</InstallProvider></ServiceProvider>
);

/** Mount and wait for the connect→settle→initial-hydrate to actually finish.
 *  hydrating starts false, so we first wait for the hydrate to START (a read
 *  fired) and only then for it to settle — otherwise the wait returns at t=0. */
async function mountStore() {
  const view = renderHook(() => useInstallStore(), { wrapper });
  await waitFor(() => expect(mocks.adapter.getMarketplace).toHaveBeenCalled());
  await waitFor(() => expect(view.result.current.hydrating).toBe(false));
  return view;
}

const pkg = (id: number, name = `pkg${id}`): InstallTarget =>
  ({ id: `pkg:${id}`, type: 'skill', kind: 'package', name, packageId: id });
const connector = (id: string, name = id): InstallTarget =>
  ({ id: `connector:${id}`, type: 'connector', kind: 'federated', name });
const catalogMcp = (id: string, name = id): InstallTarget =>
  ({ id: `mcp:${id}`, type: 'mcp', kind: 'federated', name });

/** AdapterHttpError stand-in (the connect path throws on !ok). */
function httpError(status: number, body: unknown): Error {
  const e = new Error('http') as Error & { status: number; body: unknown };
  e.name = 'AdapterHttpError';
  e.status = status;
  e.body = body;
  return e;
}

// clearAllMocks resets call history but NOT implementations, so re-establish
// the default adapter responses before each test (otherwise a per-test
// mockResolvedValue override leaks into the next test).
beforeEach(() => {
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.forceReconnect.mockResolvedValue(undefined);
  mocks.adapter.getConnectors.mockResolvedValue([]);
  mocks.adapter.getMcps.mockResolvedValue([]);
  mocks.adapter.getMarketplace.mockResolvedValue({ packages: [] });
  mocks.adapter.installMarketplacePackage.mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.adapter.uninstallMarketplacePackage.mockResolvedValue(undefined);
  mocks.adapter.connectConnector.mockResolvedValue(undefined);
  mocks.adapter.disconnectConnector.mockResolvedValue(undefined);
  mocks.adapter.installMcp.mockResolvedValue({ installed: true });
  mocks.adapter.revokeMcp.mockResolvedValue({ ok: true, stoppedInstance: true, removedConfig: true });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('InstallProvider — hydrate', () => {
  it('populates installed from connected connectors + enabled MCPs + installed packages', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([
      { id: 'slack', status: 'connected' }, { id: 'gmail', status: 'disconnected' },
    ]);
    mocks.adapter.getMcps.mockResolvedValue([
      { id: 'postgres', installed: true }, { id: 'redis', installed: false },
    ]);
    mocks.adapter.getMarketplace.mockImplementation((p: { type?: string }) =>
      Promise.resolve({ packages: p?.type === 'skill' ? [{ id: 7, installed: true }, { id: 8, installed: false }] : [] }));

    const { result } = await mountStore();

    expect(result.current.isInstalled('connector:slack')).toBe(true);
    expect(result.current.isInstalled('connector:gmail')).toBe(false);
    expect(result.current.isInstalled('mcp:postgres')).toBe(true);
    expect(result.current.isInstalled('mcp:redis')).toBe(false);
    expect(result.current.isInstalled('pkg:7')).toBe(true);
    expect(result.current.isInstalled('pkg:8')).toBe(false);
    // Honest global count = connected + enabled + installed (D1).
    expect(result.current.installedCount).toBe(3);
  });
});

describe('InstallProvider — install dispatcher', () => {
  it('package install success flips installed + toasts Added', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue(new Response('{}', { status: 200 }));
    const { result } = await mountStore();

    let outcome;
    await act(async () => { outcome = await result.current.install(pkg(9, 'Foo')); });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.isInstalled('pkg:9')).toBe(true);
    expect(result.current.installedCount).toBe(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Added' }));
  });

  it('package install 403 TIER → reason tier, NOT installed, no destructive toast (adapter dispatches the event)', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue(
      new Response(JSON.stringify({ error: 'TIER_INSUFFICIENT', required: 'TEAMS' }), { status: 403 }));
    const { result } = await mountStore();

    let outcome;
    await act(async () => { outcome = await result.current.install(pkg(9)); });
    expect(outcome).toEqual({ ok: false, reason: 'tier' });
    expect(result.current.isInstalled('pkg:9')).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('package install SecurityGate block → reason security + destructive toast, NOT installed', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue(
      new Response(JSON.stringify({ blocked: true, severity: 'high', message: 'bad pkg' }), { status: 403 }));
    const { result } = await mountStore();

    let outcome;
    await act(async () => { outcome = await result.current.install(pkg(9)); });
    expect(outcome).toEqual({ ok: false, reason: 'security' });
    expect(result.current.isInstalled('pkg:9')).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('connector without a token returns needs-credentials and never calls the adapter', async () => {
    const { result } = await mountStore();
    let outcome;
    await act(async () => { outcome = await result.current.install(connector('slack')); });
    expect(outcome).toEqual({ ok: false, reason: 'needs-credentials' });
    expect(mocks.adapter.connectConnector).not.toHaveBeenCalled();
    expect(result.current.isInstalling('connector:slack')).toBe(false);
  });

  it('connector with a token connects via the un-prefixed id and flips installed', async () => {
    const { result } = await mountStore();
    let outcome;
    await act(async () => { outcome = await result.current.install(connector('slack'), { token: 'xoxb' }); });
    expect(outcome).toEqual({ ok: true });
    expect(mocks.adapter.connectConnector).toHaveBeenCalledWith('slack', { token: 'xoxb' });
    expect(result.current.isInstalled('connector:slack')).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Connected' }));
  });

  it('a connector 403 tier rejection is classified as tier (no destructive toast)', async () => {
    mocks.adapter.connectConnector.mockRejectedValue(httpError(403, { error: 'TIER_INSUFFICIENT' }));
    const { result } = await mountStore();
    let outcome;
    await act(async () => { outcome = await result.current.install(connector('slack'), { token: 'xoxb' }); });
    expect(outcome).toEqual({ ok: false, reason: 'tier' });
    expect(result.current.isInstalled('connector:slack')).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled(); // the adapter dispatched the upgrade event
  });

  it('catalog MCP enable success flips installed', async () => {
    mocks.adapter.installMcp.mockResolvedValue({ installed: true, server: 'postgres', status: 'running' });
    const { result } = await mountStore();
    let outcome;
    await act(async () => { outcome = await result.current.install(catalogMcp('postgres')); });
    expect(outcome).toEqual({ ok: true });
    expect(mocks.adapter.installMcp).toHaveBeenCalledWith('postgres', undefined);
    expect(result.current.isInstalled('mcp:postgres')).toBe(true);
  });

  it('catalog MCP requiresApproval → reason security, NOT installed', async () => {
    mocks.adapter.installMcp.mockResolvedValue({ installed: false, requiresApproval: true, severity: 'high' });
    const { result } = await mountStore();
    let outcome;
    await act(async () => { outcome = await result.current.install(catalogMcp('postgres')); });
    expect(outcome).toEqual({ ok: false, reason: 'security' });
    expect(result.current.isInstalled('mcp:postgres')).toBe(false);
  });

  it('a browse-only pack is unsupported and touches no backend', async () => {
    const { result } = await mountStore();
    let outcome;
    await act(async () => {
      outcome = await result.current.install({ id: 'pack:research', type: 'skill', kind: 'pack', name: 'Research' });
    });
    expect(outcome).toEqual({ ok: false, reason: 'unsupported' });
    expect(mocks.adapter.installMarketplacePackage).not.toHaveBeenCalled();
  });

  it('exposes the in-flight micro-state while a package install is pending', async () => {
    let release: (r: Response) => void = () => {};
    mocks.adapter.installMarketplacePackage.mockReturnValue(new Promise<Response>(res => { release = res; }));
    const { result } = await mountStore();

    let done!: Promise<unknown>;
    act(() => { done = result.current.install(pkg(9)); });
    await waitFor(() => expect(result.current.isInstalling('pkg:9')).toBe(true));
    expect(result.current.isInstalled('pkg:9')).toBe(false); // not yet confirmed

    await act(async () => { release(new Response('{}', { status: 200 })); await done; });
    expect(result.current.isInstalling('pkg:9')).toBe(false);
    expect(result.current.isInstalled('pkg:9')).toBe(true);
  });
});

describe('InstallProvider — uninstall + reconcile', () => {
  it('uninstalling a package removes it from the installed set', async () => {
    mocks.adapter.getMarketplace.mockImplementation((p: { type?: string }) =>
      Promise.resolve({ packages: p?.type === 'skill' ? [{ id: 7, installed: true }] : [] }));
    const { result } = await mountStore();
    expect(result.current.isInstalled('pkg:7')).toBe(true);

    let outcome;
    await act(async () => { outcome = await result.current.uninstall(pkg(7)); });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.isInstalled('pkg:7')).toBe(false);
    expect(result.current.installedCount).toBe(0);
  });

  it('a total hydrate failure keeps the previously-known installed set (no wipe)', async () => {
    mocks.adapter.getConnectors.mockResolvedValueOnce([{ id: 'slack', status: 'connected' }]);
    mocks.adapter.getMarketplace.mockImplementation((p: { type?: string }) =>
      Promise.resolve({ packages: p?.type === 'skill' ? [{ id: 7, installed: true }] : [] }));
    const { result } = await mountStore();
    expect(result.current.installedCount).toBe(2);

    // Backend goes down: every read rejects → previous set must survive.
    mocks.adapter.getConnectors.mockRejectedValue(new Error('down'));
    mocks.adapter.getMcps.mockRejectedValue(new Error('down'));
    mocks.adapter.getMarketplace.mockRejectedValue(new Error('down'));
    await act(async () => { await result.current.hydrate(); });

    expect(result.current.isInstalled('connector:slack')).toBe(true);
    expect(result.current.isInstalled('pkg:7')).toBe(true);
    expect(result.current.installedCount).toBe(2);
  });

  it('a confirmed install survives a concurrent in-flight hydrate (HIGH race regression)', async () => {
    const { result } = await mountStore();
    // Arm a hydrate whose marketplace reads are held open (issued BEFORE the install).
    let releaseSkill = () => {};
    let releaseMcp = () => {};
    mocks.adapter.getMarketplace.mockImplementation((p: { type?: string }) =>
      p?.type === 'skill'
        ? new Promise(res => { releaseSkill = () => res({ packages: [] }); })
        : new Promise(res => { releaseMcp = () => res({ packages: [] }); }));

    let hydratePromise!: Promise<void>;
    act(() => { hydratePromise = result.current.hydrate(); }); // in-flight; reads held
    // Confirm an install while the stale hydrate is mid-flight.
    await act(async () => { await result.current.install(pkg(9, 'Foo')); });
    expect(result.current.isInstalled('pkg:9')).toBe(true);

    // Release the stale reads — the hydrate's commit must ABORT (the flip bumped
    // the seq), so it cannot wipe the just-confirmed install.
    await act(async () => { releaseSkill(); releaseMcp(); await hydratePromise; });
    expect(result.current.isInstalled('pkg:9')).toBe(true);
    expect(result.current.installedCount).toBe(1);
  });

  it('an asymmetric package-read failure preserves the failed domain pkg ids (MEDIUM regression)', async () => {
    mocks.adapter.getMarketplace.mockImplementation((p: { type?: string }) =>
      Promise.resolve({ packages: p?.type === 'skill' ? [{ id: 7, installed: true }] : [{ id: 99, installed: true }] }));
    const { result } = await mountStore();
    expect(result.current.installedCount).toBe(2);

    // Re-hydrate: skill read OK, mcp read REJECTS → pkg:99 must NOT be dropped.
    mocks.adapter.getMarketplace.mockImplementation((p: { type?: string }) =>
      p?.type === 'skill' ? Promise.resolve({ packages: [{ id: 7, installed: true }] }) : Promise.reject(new Error('500')));
    await act(async () => { await result.current.hydrate(); });
    expect(result.current.isInstalled('pkg:7')).toBe(true);
    expect(result.current.isInstalled('pkg:99')).toBe(true);
    expect(result.current.installedCount).toBe(2);
  });
});
