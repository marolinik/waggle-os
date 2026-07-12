/**
 * PR4 Phase D — the inline capability card (Variation B). Each kind routes
 * through the shared install store (so a chat install reflects in the grid +
 * count bar): connector token-paste / OAuth→Hub, mcp enable, marketplace
 * resolve-then-install, starter via installPack.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CapabilityRequest } from '@/components/os/apps/chat-blocks/CapabilityRequestCard';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    forceReconnect: vi.fn().mockResolvedValue(undefined),
    getConnectors: vi.fn().mockResolvedValue([]),
    getMcps: vi.fn().mockResolvedValue([]),
    getMarketplace: vi.fn().mockResolvedValue({ packages: [] }),
    searchMarketplace: vi.fn(),
    installMarketplacePackage: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    uninstallMarketplacePackage: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    connectConnector: vi.fn().mockResolvedValue(undefined),
    disconnectConnector: vi.fn().mockResolvedValue(undefined),
    installMcp: vi.fn().mockResolvedValue({ installed: true }),
    revokeMcp: vi.fn().mockResolvedValue({ ok: true }),
    installPack: vi.fn().mockResolvedValue(undefined),
  },
  toast: vi.fn(),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { ServiceProvider } from '@/providers/ServiceProvider';
import { InstallProvider } from '@/providers/InstallProvider';
import CapabilityRequestCard from '@/components/os/apps/chat-blocks/CapabilityRequestCard';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServiceProvider><InstallProvider>{children}</InstallProvider></ServiceProvider>
);
const renderCard = (request: CapabilityRequest) => render(<CapabilityRequestCard request={request} />, { wrapper });

beforeEach(() => {
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getConnectors.mockResolvedValue([]);
  mocks.adapter.getMcps.mockResolvedValue([]);
  mocks.adapter.getMarketplace.mockResolvedValue({ packages: [] });
  mocks.adapter.searchMarketplace.mockResolvedValue(
    new Response(JSON.stringify({ packages: [{ id: 7, waggle_install_type: 'skill' }] }), { status: 200 }));
  mocks.adapter.installMarketplacePackage.mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.adapter.installMcp.mockResolvedValue({ installed: true });
  mocks.adapter.connectConnector.mockResolvedValue(undefined);
  mocks.adapter.installPack.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CapabilityRequestCard (PR4 Variation B)', () => {
  it('a marketplace request resolves the package id then installs through the store', async () => {
    renderCard({ name: 'web-scraper', source: 'marketplace', kind: 'marketplace' });
    fireEvent.click(screen.getByTestId('capability-request-install'));
    await waitFor(() => expect(mocks.adapter.searchMarketplace).toHaveBeenCalledWith('web-scraper', 1));
    await waitFor(() => expect(mocks.adapter.installMarketplacePackage).toHaveBeenCalledWith(7));
    expect(await screen.findByText(/Done — available/)).toBeInTheDocument();
  });

  it('a token connector reveals an inline paste row and connects FE-direct (not over the approval wire)', async () => {
    renderCard({ name: 'Slack', source: 'connector', kind: 'connector', connectorId: 'slack', authType: 'bearer' });
    // The verb is Connect, not Install.
    expect(screen.getByTestId('capability-request-install')).toHaveTextContent('Connect');
    fireEvent.click(screen.getByTestId('capability-request-install'));

    const input = await screen.findByLabelText(/slack api token/i);
    expect(input).toHaveAttribute('name', 'capabilityConnectorToken');
    expect(input).toHaveAttribute('autocomplete', 'off');
    fireEvent.change(input, { target: { value: 'xoxb-9' } });
    fireEvent.click(screen.getByTestId('capability-connector-token-submit'));
    await waitFor(() => expect(mocks.adapter.connectConnector).toHaveBeenCalledWith('slack', { token: 'xoxb-9' }));
  });

  it('an OAuth connector hands off to the Hub (no inline token)', async () => {
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('waggle:open-app', listener);
    try {
      renderCard({ name: 'Google Calendar', source: 'connector', kind: 'connector', authType: 'oauth2' });
      fireEvent.click(screen.getByTestId('capability-request-install'));
      await waitFor(() => expect(events.some(e => e.detail.appId === 'connectors')).toBe(true));
      expect(screen.queryByTestId('capability-connector-token-input')).not.toBeInTheDocument();
      expect(mocks.adapter.connectConnector).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('waggle:open-app', listener);
    }
  });

  it('an mcp request enables through the store', async () => {
    renderCard({ name: 'postgres', source: 'mcp', kind: 'mcp' });
    expect(screen.getByTestId('capability-request-install')).toHaveTextContent('Enable');
    fireEvent.click(screen.getByTestId('capability-request-install'));
    await waitFor(() => expect(mocks.adapter.installMcp).toHaveBeenCalledWith('postgres', undefined));
    expect(await screen.findByText(/Done — available/)).toBeInTheDocument();
  });

  it('a starter-pack request installs via installPack (bundled, not store-tracked)', async () => {
    renderCard({ name: 'daily-plan', source: 'starter-pack' });
    fireEvent.click(screen.getByTestId('capability-request-install'));
    await waitFor(() => expect(mocks.adapter.installPack).toHaveBeenCalledWith('daily-plan'));
    expect(mocks.adapter.installMarketplacePackage).not.toHaveBeenCalled();
  });

  it('Dismiss declines without installing', async () => {
    renderCard({ name: 'web-scraper', source: 'marketplace', kind: 'marketplace' });
    fireEvent.click(screen.getByTestId('capability-request-decline'));
    expect(await screen.findByText('Dismissed')).toBeInTheDocument();
    expect(mocks.adapter.installMarketplacePackage).not.toHaveBeenCalled();
  });
});
