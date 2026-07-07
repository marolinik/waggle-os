/**
 * Pillar 2.6 — route-cache contract for Marketplace + Agents (path-to-9 v3
 * §Pillar 2.6). A judged surface that unmounts on tab-away must, on return
 * WITHIN the session: (a) repaint its last-known content instantly — no cold
 * skeleton; (b) refresh silently in the background; (c) Marketplace also lands
 * on the shelf the user left, not a reset to All. These are the contract, so
 * they are asserted as tests (not left as guidelines).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Agent } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    forceReconnect: vi.fn().mockResolvedValue(undefined),
    // Marketplace + InstallProvider hydrate surface
    getMarketplace: vi.fn(),
    getMarketplacePacks: vi.fn(),
    getMcps: vi.fn(),
    getConnectors: vi.fn(),
    getExtendAudit: vi.fn().mockResolvedValue([]),
    agentSearch: vi.fn().mockResolvedValue({ need: '', gapDetected: false, alreadyHandled: false, recommendation: null, candidates: [], picks: {} }),
    installMarketplacePackage: vi.fn(),
    uninstallMarketplacePackage: vi.fn(),
    connectConnector: vi.fn().mockResolvedValue(undefined),
    disconnectConnector: vi.fn().mockResolvedValue(undefined),
    installMcp: vi.fn(),
    revokeMcp: vi.fn().mockResolvedValue({ ok: true }),
    installPack: vi.fn().mockResolvedValue(undefined),
    // Agents surface
    listAgents: vi.fn(),
    runAgent: vi.fn(),
    pauseAgent: vi.fn(),
    patchAgent: vi.fn(),
    createAgent: vi.fn(),
    getAgentTraces: vi.fn().mockResolvedValue([]),
    getPersonas: vi.fn().mockResolvedValue([]),
    getCapabilityStatus: vi.fn().mockResolvedValue({}),
    getAgentGroups: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import MarketplaceApp, { resetMarketplaceRouteCache } from '@/components/os/apps/MarketplaceApp';
import AgentsApp, { resetAgentsRouteCache } from '@/components/os/apps/AgentsApp';
import { ServiceProvider } from '@/providers/ServiceProvider';
import { InstallProvider } from '@/providers/InstallProvider';

const renderMarketplace = () => render(
  <ServiceProvider><InstallProvider><TooltipProvider><MarketplaceApp /></TooltipProvider></InstallProvider></ServiceProvider>,
);

const WORKSPACES = [{ id: 'ws-1', name: 'Acme Research', group: 'work' }];
const renderAgents = () => render(
  <MemoryRouter><ServiceProvider><TooltipProvider>
    <AgentsApp workspaces={WORKSPACES} />
  </TooltipProvider></ServiceProvider></MemoryRouter>,
);

function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1', name: 'Scout', goal: 'Research the market', type: 'personal',
    model: 'auto', autonomyLevel: 'guided', memoryScopes: ['personal'],
    status: 'idle', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    successRate: 0.8, lastRunAt: '2026-06-09T00:00:00Z', ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMarketplaceRouteCache();
  resetAgentsRouteCache();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.forceReconnect.mockResolvedValue(undefined);
  mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
    params?.type === 'mcp'
      ? { packages: [], total: 0 }
      : { packages: [{ id: 7, name: 'web-scraper', description: 'Scrape pages', waggle_install_type: 'skill', installed: false, scanStatus: 'passed', source: 'registry' }], total: 1 }
  ));
  mocks.adapter.getMarketplacePacks.mockResolvedValue([]);
  mocks.adapter.getMcps.mockResolvedValue([
    { id: 'postgres', name: 'PostgreSQL', description: 'Query databases', category: 'Database', installed: false },
  ]);
  mocks.adapter.getConnectors.mockResolvedValue([
    { id: 'github', name: 'GitHub', description: 'Code hosting', service: 'github', authType: 'bearer', status: 'connected', capabilities: [], substrate: 'waggle', tools: [], category: 'development' },
  ]);
});
afterEach(cleanup);

describe('Pillar 2.6 route-cache — Marketplace', () => {
  it('a return within the session repaints the grid instantly (no cold spinner) and refreshes silently', async () => {
    const first = renderMarketplace();
    expect(await screen.findByText('Web Scraper')).toBeInTheDocument();
    let baseline = 0;
    await waitFor(() => {
      baseline = mocks.adapter.getMarketplace.mock.calls.length;
      expect(baseline).toBeGreaterThan(0);
    });
    first.unmount();

    // Return: the last-loaded grid is on screen SYNCHRONOUSLY on the first paint
    // (seeded from cache), before any fetch resolves — and the cold spinner is
    // never shown.
    renderMarketplace();
    expect(screen.getByText('Web Scraper')).toBeInTheDocument();
    expect(screen.queryByText('Loading extensions...')).not.toBeInTheDocument();
    // …and it still refreshes silently in the background.
    await waitFor(() => expect(mocks.adapter.getMarketplace.mock.calls.length).toBeGreaterThan(baseline));
  });

  it('a return lands on the shelf the user left, not a reset to All', async () => {
    const first = renderMarketplace();
    await screen.findByText('Web Scraper');
    // Switch to the Skills shelf and let its load commit (connectors drop off).
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    await waitFor(() => expect(screen.queryByText('GitHub')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Skills' })).toHaveAttribute('aria-pressed', 'true');
    first.unmount();

    // Return: Skills is the active shelf on the first paint (restored from cache).
    renderMarketplace();
    expect(screen.getByRole('button', { name: 'Skills' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Pillar 2.6 route-cache — Agents', () => {
  it('a return within the session repaints the roster instantly (no BeeLoader) and refreshes silently', async () => {
    mocks.adapter.listAgents.mockResolvedValue([makeAgent({ id: 'a1', name: 'Scout' })]);
    const first = renderAgents();
    expect(await screen.findByText('Scout')).toBeInTheDocument();
    const baseline = mocks.adapter.listAgents.mock.calls.length;
    first.unmount();

    // Return: the roster is on screen synchronously and the cold BeeLoader never
    // shows (agents seeded → the `loading && agents.length===0` guard is false).
    renderAgents();
    expect(screen.getByText('Scout')).toBeInTheDocument();
    expect(screen.queryByTestId('bee-loader')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.adapter.listAgents.mock.calls.length).toBeGreaterThan(baseline));
  });

  it('a return to a genuinely-empty fleet shows the empty-state instantly, not a fresh BeeLoader', async () => {
    mocks.adapter.listAgents.mockResolvedValue([]);
    const first = renderAgents();
    // Cold load: BeeLoader → resolves empty → empty-state.
    expect(await screen.findByText(/No custom agents yet/)).toBeInTheDocument();
    first.unmount();

    // Return: the empty-state is on screen synchronously — a resolved-empty
    // surface must NOT re-skeleton (the shelf-cache `hasResolved` lesson).
    renderAgents();
    expect(screen.getByText(/No custom agents yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('bee-loader')).not.toBeInTheDocument();
  });
});
