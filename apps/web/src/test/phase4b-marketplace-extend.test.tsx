/**
 * Phase 4B (S21) — consolidated Marketplace/Extend surface: B7 facet
 * switching with federate-at-read (A5), the honest federated provenance
 * notes, the ApprovalModal install confirm with scan-derived risk, and the
 * C18 shared audit feed with its type filter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    isConnected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    getMarketplace: vi.fn(),
    getMarketplacePacks: vi.fn(),
    getMcps: vi.fn(),
    getPersonas: vi.fn(),
    getConnectors: vi.fn(),
    getModels: vi.fn(),
    getWorkspaceTemplates: vi.fn(),
    installMarketplacePackage: vi.fn(),
    uninstallMarketplacePackage: vi.fn(),
    installMarketplacePack: vi.fn(),
    getExtendAudit: vi.fn(),
    fetch: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import MarketplaceApp from '@/components/os/apps/MarketplaceApp';
import { ServiceProvider } from '@/providers/ServiceProvider';

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><MarketplaceApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.isConnected = true;
  mocks.adapter.connect.mockResolvedValue(undefined);
  // Real search-envelope rows discriminate via waggle_install_type (the
  // packages table has no `type` column) — the type facet is a server-side
  // SQL filter, so the mock branches on the requested type.
  mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
    params?.type === 'mcp'
      ? {
          packages: [
            { id: 9, name: 'pg-mcp-pkg', description: 'Registry MCP server', waggle_install_type: 'mcp', installed: false, scanStatus: 'passed', source: 'registry' },
          ],
          total: 1,
        }
      : {
          packages: [
            { id: 7, name: 'web-scraper', description: 'Scrape pages', waggle_install_type: 'skill', installed: false, scanStatus: 'passed', source: 'registry' },
          ],
          total: 1,
        }
  ));
  // RAW MarketplacePack row shape — the route returns db.listPacks()
  // verbatim: NO name/installed/trust fields (the bug this pins).
  mocks.adapter.getMarketplacePacks.mockResolvedValue([
    { id: 1, slug: 'research-pack', display_name: 'Research Pack', description: 'Research skills', target_roles: '["researcher"]', icon: 'book', priority: 1, connectors_needed: '[]', created_at: '2026-06-01' },
  ]);
  mocks.adapter.getMcps.mockResolvedValue([
    { id: 'postgres', name: 'PostgreSQL', description: 'Query databases', category: 'Database', installed: false },
  ]);
  mocks.adapter.getPersonas.mockResolvedValue([
    { id: 'researcher', name: 'Researcher', description: 'Deep research persona' },
  ]);
  mocks.adapter.getConnectors.mockResolvedValue([
    { id: 'github', name: 'GitHub', description: 'Code hosting', service: 'github', authType: 'bearer', status: 'connected', capabilities: [], substrate: 'waggle', tools: [], category: 'development' },
  ]);
  mocks.adapter.getModels.mockResolvedValue(['claude-fable-5']);
  mocks.adapter.getWorkspaceTemplates.mockResolvedValue({
    templates: [{ id: 'tpl-1', name: 'Research Workspace', description: 'Template', persona: 'researcher', connectors: [], suggestedCommands: [], starterMemory: [], builtIn: true }],
    count: 1,
  });
  mocks.adapter.getExtendAudit.mockResolvedValue([]);
});
afterEach(cleanup);

describe('MarketplaceApp — consolidated Extend surface (S21)', () => {
  it('the All facet federates every domain at read and renders merged entries', async () => {
    renderApp();
    expect(await screen.findByText('web-scraper')).toBeInTheDocument();
    // Raw pack row normalized at the boundary: display_name renders, and the
    // pack is browse-only (no pack-install route exists — A4 honesty).
    expect(screen.getByText('Research Pack')).toBeInTheDocument();
    expect(screen.queryByTestId('extension-install-pack:research-pack')).not.toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    // Registry packages with waggle_install_type='mcp' surface and stay
    // installable through the real package route.
    expect(screen.getByText('pg-mcp-pkg')).toBeInTheDocument();
    expect(screen.getByTestId('extension-install-pkg:9')).toBeInTheDocument();
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('claude-fable-5')).toBeInTheDocument();
    expect(screen.getByText('Research Workspace')).toBeInTheDocument();
    // The marketplace read used the B7 type facets.
    expect(mocks.adapter.getMarketplace).toHaveBeenCalledWith({ type: 'skill', limit: 30 });
    expect(mocks.adapter.getMarketplace).toHaveBeenCalledWith({ type: 'mcp', limit: 30 });
  });

  it('the connector facet shows the honest federated note and an Open-in CTA, never an Install button', async () => {
    renderApp();
    await screen.findByText('web-scraper');
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));

    expect(await screen.findByTestId('federated-note')).toHaveTextContent(/not marketplace-backed/);
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connector Hub/ })).toBeInTheDocument();
    expect(screen.queryByText('web-scraper')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Install$/ })).not.toBeInTheDocument();
  });

  it('an empty federated facet renders the honest empty state, not fake entries', async () => {
    mocks.adapter.getModels.mockResolvedValue([]);
    renderApp();
    await screen.findByText('web-scraper');
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    expect(await screen.findByText(/No extensions available for this facet/)).toBeInTheDocument();
  });

  it('installing a marketplace package confirms via the ApprovalModal with scan-derived risk', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderApp();
    await screen.findByText('web-scraper');
    fireEvent.click(screen.getByTestId('extension-install-pkg:7'));

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Install "web-scraper" from the marketplace?');
    expect(modal).toHaveTextContent('Security scan: passed');
    expect(modal).toHaveTextContent('Type: skill');

    fireEvent.click(screen.getByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.installMarketplacePackage).toHaveBeenCalledWith(7));
  });

  it('a 403 tier package install dispatches the upgrade event instead of a raw failure', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue({
      ok: false, status: 403, json: async () => ({ error: 'TIER_INSUFFICIENT', required: 'PRO', actual: 'FREE' }),
    });
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('waggle:tier-insufficient', listener);
    try {
      renderApp();
      await screen.findByText('web-scraper');
      fireEvent.click(screen.getByTestId('extension-install-pkg:7'));
      fireEvent.click((await screen.findAllByTestId('approval-modal-approve'))[0]);
      await waitFor(() => expect(events.length).toBeGreaterThan(0));
      expect(events[0].detail.required).toBe('PRO');
    } finally {
      window.removeEventListener('waggle:tier-insufficient', listener);
    }
  });

  it('a 403 SecurityGate block surfaces as a security failure — NOT the upgrade modal', async () => {
    mocks.adapter.installMarketplacePackage.mockResolvedValue({
      ok: false, status: 403, json: async () => ({ blocked: true, severity: 'CRITICAL', message: 'Blocked by security gate' }),
    });
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('waggle:tier-insufficient', listener);
    try {
      renderApp();
      await screen.findByText('web-scraper');
      fireEvent.click(screen.getByTestId('extension-install-pkg:7'));
      fireEvent.click((await screen.findAllByTestId('approval-modal-approve'))[0]);
      await waitFor(() => expect(mocks.adapter.installMarketplacePackage).toHaveBeenCalledWith(7));
      // The block body has no TIER_INSUFFICIENT marker — no upsell event.
      expect(events).toHaveLength(0);
    } finally {
      window.removeEventListener('waggle:tier-insufficient', listener);
    }
  });

  it('all backends down renders the error + Retry state, never a healthy-looking empty catalog', async () => {
    const down = new Error('ECONNREFUSED');
    mocks.adapter.getMarketplace.mockRejectedValue(down);
    mocks.adapter.getMarketplacePacks.mockRejectedValue(down);
    mocks.adapter.getMcps.mockRejectedValue(down);
    mocks.adapter.getPersonas.mockRejectedValue(down);
    mocks.adapter.getConnectors.mockRejectedValue(down);
    mocks.adapter.getModels.mockRejectedValue(down);
    mocks.adapter.getWorkspaceTemplates.mockRejectedValue(down);
    renderApp();
    expect(await screen.findByText(/Could not load extensions/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText(/No extensions available/)).not.toBeInTheDocument();
  });

  it('Remove confirms through the ApprovalModal before uninstalling (no one-click destroy)', async () => {
    mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
      params?.type === 'mcp'
        ? { packages: [], total: 0 }
        : { packages: [{ id: 7, name: 'web-scraper', description: 'Scrape pages', waggle_install_type: 'skill', installed: true, scanStatus: 'passed', source: 'registry' }], total: 1 }
    ));
    mocks.adapter.uninstallMarketplacePackage.mockResolvedValue({ ok: true });
    renderApp();
    await screen.findByText('web-scraper');
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Remove "web-scraper"?');
    expect(modal).toHaveTextContent(/audit trail/);
    expect(mocks.adapter.uninstallMarketplacePackage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.uninstallMarketplacePackage).toHaveBeenCalledWith(7));
  });

  it('P1b: a FAILED uninstall shows the failure toast and does NOT flip installed:false', async () => {
    // Pre-P1b the adapter resolved error Responses, so a 500 uninstall toasted
    // "Uninstalled" and desynced UI state; the throwing fetch routes it to the
    // catch. Pinned at the component level (the adapter is mocked here).
    mocks.adapter.getMarketplace.mockImplementation(async (params?: { type?: string }) => (
      params?.type === 'mcp'
        ? { packages: [], total: 0 }
        : { packages: [{ id: 7, name: 'web-scraper', description: 'Scrape pages', waggle_install_type: 'skill', installed: true, scanStatus: 'passed', source: 'registry' }], total: 1 }
    ));
    mocks.adapter.uninstallMarketplacePackage.mockRejectedValue(
      Object.assign(new Error('boom'), { name: 'AdapterHttpError', status: 500 }),
    );
    renderApp();
    await screen.findByText('web-scraper');
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    fireEvent.click(await screen.findByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.uninstallMarketplacePackage).toHaveBeenCalledWith(7));
    // Still installed: the Remove affordance survives the failed uninstall.
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument();
  });

  it('the Audit tab reads the C18 shared feed and the type filter re-queries', async () => {
    mocks.adapter.getExtendAudit.mockResolvedValue([{
      id: 3, timestamp: '2026-06-01T09:00:00.000Z', capabilityName: 'web-scraper',
      capabilityType: 'marketplace', source: 'marketplace', riskLevel: 'medium',
      trustSource: 'third_party_verified', approvalClass: 'standard', action: 'installed',
      initiator: 'user', detail: 'Installed from registry',
    }]);
    renderApp();
    await screen.findByText('web-scraper');
    fireEvent.click(screen.getByRole('tab', { name: 'Audit' }));

    await waitFor(() => expect(mocks.adapter.getExtendAudit).toHaveBeenCalledWith({ limit: 30 }));
    expect(await screen.findByText('Installed from registry')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'mcp' } });
    await waitFor(() => expect(mocks.adapter.getExtendAudit).toHaveBeenCalledWith({ type: 'mcp', limit: 30 }));
  });
});
