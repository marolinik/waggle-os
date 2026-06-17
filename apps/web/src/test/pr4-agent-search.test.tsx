/**
 * PR4 Phase C — the AgentSearchBox suggestion box (screen 09). A need produces
 * a connector/skill/tool three-up; the skill installs through the shared store,
 * the connector hands off to the Hub, and example chips run a search.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AgentSearchResponse } from '@/lib/agent-search';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    forceReconnect: vi.fn().mockResolvedValue(undefined),
    getConnectors: vi.fn().mockResolvedValue([]),
    getMcps: vi.fn().mockResolvedValue([]),
    getMarketplace: vi.fn().mockResolvedValue({ packages: [] }),
    installMarketplacePackage: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    connectConnector: vi.fn().mockResolvedValue(undefined),
    installMcp: vi.fn().mockResolvedValue({ installed: true }),
    revokeMcp: vi.fn().mockResolvedValue({ ok: true }),
    uninstallMarketplacePackage: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    disconnectConnector: vi.fn().mockResolvedValue(undefined),
    installPack: vi.fn().mockResolvedValue(undefined),
    agentSearch: vi.fn(),
  },
  toast: vi.fn(),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { ServiceProvider } from '@/providers/ServiceProvider';
import { InstallProvider } from '@/providers/InstallProvider';
import AgentSearchBox from '@/components/os/apps/extend/AgentSearchBox';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ServiceProvider><InstallProvider>{children}</InstallProvider></ServiceProvider>
);

const RESULT: AgentSearchResponse = {
  need: 'send a message to my team',
  gapDetected: true,
  alreadyHandled: false,
  recommendation: null,
  candidates: [],
  picks: {
    connector: { name: 'Slack', type: 'connector', availability: 'installable', description: 'Team chat', matchReason: 'matches: slack, message', matchScore: 0.9, install: { mode: 'store', extensionId: 'connector:slack', type: 'connector', kind: 'federated', authType: 'bearer' } },
    skill: { name: 'team-update', type: 'marketplace', availability: 'installable', description: 'Draft team updates', matchReason: 'matches: team, message', matchScore: 0.7, install: { mode: 'store', extensionId: 'pkg:7', type: 'skill', kind: 'package', packageId: 7 } },
    tool: { name: 'web_search', type: 'native', availability: 'active', description: 'Search the web', matchReason: 'name matches: search', matchScore: 0.6, install: { mode: 'active' } },
  },
};

const ask = (text: string) => {
  const input = screen.getByLabelText('Ask Waggle');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

beforeEach(() => {
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getConnectors.mockResolvedValue([]);
  mocks.adapter.getMcps.mockResolvedValue([]);
  mocks.adapter.getMarketplace.mockResolvedValue({ packages: [] });
  mocks.adapter.installMarketplacePackage.mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.adapter.installPack.mockResolvedValue(undefined);
  mocks.adapter.agentSearch.mockResolvedValue(RESULT);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AgentSearchBox', () => {
  it('renders the connector + skill + tool three-up with each "why"', async () => {
    render(<AgentSearchBox />, { wrapper });
    ask('send a message to my team');
    await waitFor(() => expect(mocks.adapter.agentSearch).toHaveBeenCalledWith('send a message to my team'));

    expect(await screen.findByTestId('agent-search-pick-connector')).toHaveTextContent('Slack');
    expect(screen.getByTestId('agent-search-pick-skill')).toHaveTextContent('team-update');
    expect(screen.getByTestId('agent-search-pick-tool')).toHaveTextContent('web_search');
    // the deterministic "why" surfaces
    expect(screen.getByTestId('agent-search-pick-connector')).toHaveTextContent('matches: slack, message');
    // a native tool you already have reads Available (no install)
    expect(screen.getByTestId('agent-search-pick-tool')).toHaveTextContent('Available');
  });

  it('installs a skill pick through the shared store (one-click)', async () => {
    render(<AgentSearchBox />, { wrapper });
    ask('send a message to my team');
    await screen.findByTestId('agent-search-pick-skill');
    fireEvent.click(screen.getByTestId('agent-search-act-team-update'));
    await waitFor(() => expect(mocks.adapter.installMarketplacePackage).toHaveBeenCalledWith(7));
  });

  it('hands a connector pick off to the Connector Hub (token-paste lives there)', async () => {
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('waggle:open-app', listener);
    try {
      render(<AgentSearchBox />, { wrapper });
      ask('send a message to my team');
      await screen.findByTestId('agent-search-pick-connector');
      fireEvent.click(screen.getByTestId('agent-search-act-Slack'));
      await waitFor(() => expect(events.some(e => e.detail.appId === 'connectors')).toBe(true));
      expect(mocks.adapter.connectConnector).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('waggle:open-app', listener);
    }
  });

  it('an example chip runs a search', async () => {
    render(<AgentSearchBox />, { wrapper });
    fireEvent.click(await screen.findByTestId('agent-search-chip-0'));
    await waitFor(() => expect(mocks.adapter.agentSearch).toHaveBeenCalled());
  });

  it('surfaces a search error without crashing', async () => {
    mocks.adapter.agentSearch.mockRejectedValue(new Error('backend down'));
    render(<AgentSearchBox />, { wrapper });
    ask('anything');
    expect(await screen.findByRole('alert')).toHaveTextContent('backend down');
  });
});
