/**
 * PR4 Variation A (screen 09) — the Warm-Hive Marketplace surface. Supersedes
 * the Phase-4B contract: four shelves (D2: All/Skills/Connectors/MCP),
 * type-aware ONE-CLICK install via the shared store (D3 — Add/Connect/Enable,
 * no pre-emptive ApprovalModal), the in-place connector token-paste (OAuth →
 * Hub), the store-derived install count (D1), and the destructive Remove that
 * KEEPS its consequence dialog. Security regressions (tier vs SecurityGate) are
 * pinned in pr4-install-store; this file pins the surface wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    forceReconnect: vi.fn().mockResolvedValue(undefined),
    getMarketplace: vi.fn(),
    getMarketplacePacks: vi.fn(),
    getMcps: vi.fn(),
    getConnectors: vi.fn(),
    installMarketplacePackage: vi.fn(),
    uninstallMarketplacePackage: vi.fn(),
    connectConnector: vi.fn().mockResolvedValue(undefined),
    disconnectConnector: vi.fn().mockResolvedValue(undefined),
    installMcp: vi.fn(),
    revokeMcp: vi.fn().mockResolvedValue({ ok: true }),
    getExtendAudit: vi.fn(),
    agentSearch: vi.fn(),
    installPack: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import type { AgentSearchResponse } from '@/lib/agent-search';
import MarketplaceApp from '@/components/os/apps/MarketplaceApp';
import { ServiceProvider } from '@/providers/ServiceProvider';
import { InstallProvider } from '@/providers/InstallProvider';

const renderApp = () => render(
  <ServiceProvider><InstallProvider><TooltipProvider><MarketplaceApp /></TooltipProvider></InstallProvider></ServiceProvider>,
);

const skillRows = (installed = false) => ([
  { id: 7, name: 'web-scraper', description: 'Scrape pages', waggle_install_type: 'skill', installed, scanStatus: 'passed', source: 'registry' },
]);

// Semantic-match fixtures for the NL auto-run (Wave U Lane C). MATCH resolves a
// skill pick; NO_MATCH resolves empty picks so the catalog fallback shows.
const MATCH: AgentSearchResponse = {
  need: 'send a slide deck to my whole team', gapDetected: true, alreadyHandled: false,
  recommendation: null, candidates: [],
  picks: {
    skill: { name: 'deck-builder', type: 'marketplace', availability: 'installable', description: 'Turn work into slides', matchReason: 'matches: slide, deck', matchScore: 0.8, install: { mode: 'store', extensionId: 'pkg:42', type: 'skill', kind: 'package', packageId: 42 } },
  },
};
const NO_MATCH: AgentSearchResponse = {
  need: 'send a slide deck to my whole team', gapDetected: true, alreadyHandled: false,
  recommendation: null, candidates: [], picks: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.forceReconnect.mockResolvedValue(undefined);
  mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
    params?.type === 'mcp'
      ? { packages: [{ id: 9, name: 'pg-mcp-pkg', description: 'Registry MCP server', waggle_install_type: 'mcp', installed: false, scanStatus: 'passed', source: 'registry' }], total: 1 }
      : { packages: skillRows(), total: 1 }
  ));
  mocks.adapter.getMarketplacePacks.mockResolvedValue([
    { id: 1, slug: 'research-pack', display_name: 'Research Pack', description: 'Research skills', target_roles: '["researcher"]', icon: 'book', priority: 1, connectors_needed: '[]', created_at: '2026-06-01' },
  ]);
  mocks.adapter.getMcps.mockResolvedValue([
    { id: 'postgres', name: 'PostgreSQL', description: 'Query databases', category: 'Database', installed: false },
  ]);
  mocks.adapter.getConnectors.mockResolvedValue([
    { id: 'github', name: 'GitHub', description: 'Code hosting', service: 'github', authType: 'bearer', status: 'connected', capabilities: [], substrate: 'waggle', tools: [], category: 'development' },
  ]);
  mocks.adapter.installMarketplacePackage.mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.adapter.uninstallMarketplacePackage.mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.adapter.installMcp.mockResolvedValue({ installed: true });
  mocks.adapter.getExtendAudit.mockResolvedValue([]);
  mocks.adapter.agentSearch.mockResolvedValue(MATCH);
});
afterEach(cleanup);

describe('MarketplaceApp — Warm-Hive Marketplace (PR4 Variation A)', () => {
  it('the All shelf federates skills + connectors + MCP (and only those three)', async () => {
    renderApp();
    expect(await screen.findByText('Web Scraper')).toBeInTheDocument();
    // Browse-only pack: display_name renders, no install affordance (A4).
    expect(screen.getByText('Research Pack')).toBeInTheDocument();
    expect(screen.queryByTestId('extension-install-pack:research-pack')).not.toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Pg Mcp Pkg')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    // Agents/models/templates are NOT in the marketplace shelf (D2).
    expect(screen.queryByText('Researcher')).not.toBeInTheDocument();
    expect(mocks.adapter.getMarketplace).toHaveBeenCalledWith({ type: 'skill', limit: 30 });
    expect(mocks.adapter.getMarketplace).toHaveBeenCalledWith({ type: 'mcp', limit: 30 });
  });

  it('exposes exactly the four shelves (D2)', async () => {
    renderApp();
    await screen.findByText('Web Scraper');
    const rail = screen.getByTestId('extension-facets');
    expect(rail).toHaveTextContent('All');
    expect(rail).toHaveTextContent('Skills');
    expect(rail).toHaveTextContent('Connectors');
    expect(rail).toHaveTextContent('MCPs');
    expect(rail).not.toHaveTextContent('Agents');
    expect(rail).not.toHaveTextContent('Models');
    expect(rail).not.toHaveTextContent('Templates');
  });

  it('the install count bar reflects the store (a connected connector counts) (D1)', async () => {
    renderApp();
    // GitHub is connected in the mock → the store hydrates it → count = 1.
    await waitFor(() => expect(screen.getByTestId('install-count')).toHaveTextContent('1 installed'));
  });

  it('Add installs a package one-click through the store — no ApprovalModal', async () => {
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(screen.getByTestId('extension-install-pkg:7'));
    await waitFor(() => expect(mocks.adapter.installMarketplacePackage).toHaveBeenCalledWith(7));
    // One-click: the pre-emptive consequence dialog is gone for installs.
    expect(screen.queryByTestId('approval-modal')).not.toBeInTheDocument();
    // Reflected: the count bar ticks up (GitHub + web-scraper).
    await waitFor(() => expect(screen.getByTestId('install-count')).toHaveTextContent('2 installed'));
  });

  it('a blocked install (SecurityGate 403) leaves the item installable — not silently added', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue(
      new Response(JSON.stringify({ blocked: true, severity: 'CRITICAL', message: 'Blocked' }), { status: 403 }));
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(screen.getByTestId('extension-install-pkg:7'));
    await waitFor(() => expect(mocks.adapter.installMarketplacePackage).toHaveBeenCalledWith(7));
    // Still offers Add — a gate-rejected item never enters the installed count.
    expect(await screen.findByTestId('extension-install-pkg:7')).toBeInTheDocument();
    expect(screen.getByTestId('install-count')).toHaveTextContent('1 installed');
  });

  it('a disconnected connector offers Connect → token-paste → connectConnector (D3 in-place)', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([
      { id: 'slack', name: 'Slack', description: 'Chat', service: 'slack', authType: 'bearer', status: 'disconnected', capabilities: [], substrate: 'waggle', tools: [], category: 'comms' },
    ]);
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));

    fireEvent.click(await screen.findByTestId('extension-install-connector:slack'));
    const input = await screen.findByTestId('connector-token-input');
    fireEvent.change(input, { target: { value: 'xoxb-123' } });
    fireEvent.click(screen.getByTestId('connector-token-submit'));
    await waitFor(() => expect(mocks.adapter.connectConnector).toHaveBeenCalledWith('slack', { token: 'xoxb-123' }));
  });

  it('an OAuth connector routes Connect to the Hub (no inline token field)', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([
      { id: 'gcal', name: 'Google Calendar', description: 'Cal', service: 'google', authType: 'oauth2', status: 'disconnected', capabilities: [], substrate: 'waggle', tools: [], category: 'productivity' },
    ]);
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('waggle:open-app', listener);
    try {
      renderApp();
      await screen.findByText('Web Scraper');
      fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
      fireEvent.click(await screen.findByTestId('extension-install-connector:gcal'));
      await waitFor(() => expect(events.some(e => e.detail.appId === 'connectors')).toBe(true));
      expect(screen.queryByTestId('connector-token-input')).not.toBeInTheDocument();
      expect(mocks.adapter.connectConnector).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('waggle:open-app', listener);
    }
  });

  it('the connector shelf shows the honest in-place note', async () => {
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(await screen.findByTestId('federated-note')).toHaveTextContent(/vault/i);
  });

  it('all backends down renders the error + Retry state, never a healthy-looking empty catalog', async () => {
    const down = new Error('ECONNREFUSED');
    mocks.adapter.getMarketplace.mockRejectedValue(down);
    mocks.adapter.getMarketplacePacks.mockRejectedValue(down);
    mocks.adapter.getMcps.mockRejectedValue(down);
    mocks.adapter.getConnectors.mockRejectedValue(down);
    renderApp();
    expect(await screen.findByText(/Could not load extensions/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText(/No extensions available/)).not.toBeInTheDocument();
  });

  it('Remove confirms through the ApprovalModal before uninstalling (no one-click destroy)', async () => {
    mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
      params?.type === 'mcp' ? { packages: [], total: 0 } : { packages: skillRows(true), total: 1 }
    ));
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(await screen.findByRole('button', { name: /Remove/ }));

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Remove "web-scraper"?');
    expect(modal).toHaveTextContent(/audit trail/);
    expect(mocks.adapter.uninstallMarketplacePackage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.uninstallMarketplacePackage).toHaveBeenCalledWith(7));
  });

  it('a FAILED uninstall keeps the item installed (the store does not flip on error)', async () => {
    mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
      params?.type === 'mcp' ? { packages: [], total: 0 } : { packages: skillRows(true), total: 1 }
    ));
    mocks.adapter.uninstallMarketplacePackage.mockRejectedValue(
      Object.assign(new Error('boom'), { name: 'AdapterHttpError', status: 500 }),
    );
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(await screen.findByRole('button', { name: /Remove/ }));
    fireEvent.click(await screen.findByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.uninstallMarketplacePackage).toHaveBeenCalledWith(7));
    // Still installed: the Remove affordance survives the failed uninstall.
    expect(await screen.findByRole('button', { name: /Remove/ })).toBeInTheDocument();
  });

  it('the Start-here band surfaces curated matches on the All shelf only — no duplicate rows', async () => {
    renderApp();
    await screen.findByText('Web Scraper');
    // GitHub (connector) + PostgreSQL (mcp) match the curated list → band shows.
    const band = screen.getByTestId('start-here-band');
    expect(within(band).getByText('GitHub')).toBeInTheDocument();
    expect(within(band).getByText('PostgreSQL')).toBeInTheDocument();
    // Banded entries are lifted OUT of the grid — exactly one row each.
    expect(screen.getAllByText('GitHub')).toHaveLength(1);
    expect(screen.getAllByText('PostgreSQL')).toHaveLength(1);
    // Uncurated entries stay in the grid, not the band.
    expect(within(band).queryByText('Web Scraper')).not.toBeInTheDocument();
    // Off the All facet the band disappears.
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    await waitFor(() => expect(screen.queryByTestId('start-here-band')).not.toBeInTheDocument());
  });

  it('the Start-here band stays hidden under 2 curated matches (never fabricated)', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([]); // drop GitHub → only PostgreSQL matches
    renderApp();
    await screen.findByText('Web Scraper');
    expect(screen.queryByTestId('start-here-band')).not.toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument(); // still in the grid
  });

  it('an NL query with no keyword match AUTO-RUNS the semantic match — no dead-end (Wave U Lane C §1)', async () => {
    renderApp();
    await screen.findByText('Web Scraper');
    // ≥3-word described need that no loaded row matches by name/description.
    fireEvent.change(screen.getByLabelText('Ask Waggle'), {
      target: { value: 'send a slide deck to my whole team' },
    });
    // The bridge runs itself — no "press Enter" hint — and renders the ranked
    // result under the "Matched to your request" label.
    await waitFor(
      () => expect(mocks.adapter.agentSearch).toHaveBeenCalledWith('send a slide deck to my whole team'),
      { timeout: 3000 },
    );
    expect(await screen.findByTestId('nl-matched-label')).toBeInTheDocument();
    expect(screen.getByTestId('agent-search-pick-skill')).toHaveTextContent('deck-builder');
    // The old "press Enter" dead-end hint is gone.
    expect(screen.queryByTestId('nl-search-bridge')).not.toBeInTheDocument();
  });

  it('when the semantic match ALSO finds nothing, shows closest catalog entries + a real escape (Lane C §2)', async () => {
    mocks.adapter.agentSearch.mockResolvedValue(NO_MATCH);
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.change(screen.getByLabelText('Ask Waggle'), {
      target: { value: 'reconcile invoices against the ledger nightly' },
    });
    const fallback = await screen.findByTestId('nl-no-match-fallback', {}, { timeout: 3000 });
    // A real escape button (not a text link), and no gray "no match by name" lead.
    expect(within(fallback).getByTestId('nl-ask-agent').tagName).toBe('BUTTON');
    expect(screen.queryByTestId('nl-search-bridge')).not.toBeInTheDocument();
    expect(screen.queryByText(/by name/i)).not.toBeInTheDocument();
  });

  it('a 1-2 word miss keeps the plain "No results" copy and never auto-runs (Lane C §3)', async () => {
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.change(screen.getByLabelText('Ask Waggle'), { target: { value: 'zzzznope' } });
    expect(await screen.findByText('No results for "zzzznope"')).toBeInTheDocument();
    expect(screen.queryByTestId('nl-no-match-fallback')).not.toBeInTheDocument();
    // Below the NL threshold — the semantic engine is never invoked.
    await waitFor(() => expect(mocks.adapter.agentSearch).not.toHaveBeenCalled(), { timeout: 1200 });
  });

  it('the Audit tab reads the C18 shared feed and the type filter re-queries', async () => {
    mocks.adapter.getExtendAudit.mockResolvedValue([{
      id: 3, timestamp: '2026-06-01T09:00:00.000Z', capabilityName: 'web-scraper',
      capabilityType: 'marketplace', source: 'marketplace', riskLevel: 'medium',
      trustSource: 'third_party_verified', approvalClass: 'standard', action: 'installed',
      initiator: 'user', detail: 'Installed from registry',
    }]);
    renderApp();
    await screen.findByText('Web Scraper');
    fireEvent.click(screen.getByRole('tab', { name: 'Audit' }));

    await waitFor(() => expect(mocks.adapter.getExtendAudit).toHaveBeenCalledWith({ limit: 30 }));
    expect(await screen.findByText('Installed from registry')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'mcp' } });
    await waitFor(() => expect(mocks.adapter.getExtendAudit).toHaveBeenCalledWith({ type: 'mcp', limit: 30 }));
  });
});
