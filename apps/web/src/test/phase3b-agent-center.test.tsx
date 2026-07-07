/**
 * Phase 3B (S09) — Agent Center component behaviour over a mocked adapter:
 * render-from-data, C22 tab filtering, the C23 workspace-ambiguity picker
 * branch (pick → retry with workspaceId), pause flow, empty + error states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Agent } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    // ServiceProvider's mount connect() — resolves so `connecting` settles
    // and the app's connect-gated load() fires.
    connect: vi.fn().mockResolvedValue(undefined),
    listAgents: vi.fn(),
    runAgent: vi.fn(),
    pauseAgent: vi.fn(),
    patchAgent: vi.fn(),
    createAgent: vi.fn(),
    getAgentTraces: vi.fn(),
    // TemplatesView deps (not exercised here, but the module mock is total):
    getPersonas: vi.fn().mockResolvedValue([]),
    getCapabilityStatus: vi.fn().mockResolvedValue({}),
    getAgentGroups: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import AgentsApp from '@/components/os/apps/AgentsApp';
import { ServiceProvider } from '@/providers/ServiceProvider';

function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1', name: 'Scout', goal: 'Research the market', type: 'personal',
    model: 'auto', autonomyLevel: 'guided', memoryScopes: ['personal'],
    status: 'idle', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    successRate: 0.8, lastRunAt: '2026-06-09T00:00:00Z',
    ...over,
  };
}

const renderApp = () => render(
  <MemoryRouter>
    <ServiceProvider>
      <TooltipProvider>
        <AgentsApp workspaces={[
          { id: 'ws-1', name: 'Acme Research', group: 'work' },
          { id: 'ws-2', name: 'Personal Lab', group: 'personal' },
        ]} />
      </TooltipProvider>
    </ServiceProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getAgentTraces.mockResolvedValue([]);
});
afterEach(cleanup);

describe('AgentsApp — Agent Center', () => {
  it('renders agent rows from the adapter with §14.5 status badges', async () => {
    mocks.adapter.listAgents.mockResolvedValue([
      makeAgent({ id: 'a1', name: 'Scout', status: 'idle' }),
      makeAgent({ id: 'a2', name: 'Drafter', status: 'running', type: 'workspace' }),
    ]);
    renderApp();

    expect(await screen.findByText('Scout')).toBeInTheDocument();
    expect(screen.getByText('Drafter')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('filters by C22 category tab (Personal hides the workspace agent)', async () => {
    mocks.adapter.listAgents.mockResolvedValue([
      makeAgent({ id: 'a1', name: 'Scout', type: 'personal' }),
      makeAgent({ id: 'a2', name: 'Drafter', type: 'workspace' }),
    ]);
    renderApp();
    await screen.findByText('Scout');

    fireEvent.click(screen.getByRole('tab', { name: 'Personal' }));
    expect(screen.getByText('Scout')).toBeInTheDocument();
    expect(screen.queryByText('Drafter')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Archive' }));
    expect(screen.queryByText('Scout')).not.toBeInTheDocument();
  });

  it('C23: opens the workspace picker on workspace_ambiguous and retries with the chosen id', async () => {
    mocks.adapter.listAgents.mockResolvedValue([makeAgent({ id: 'a1', name: 'Scout', workspaceIds: ['ws-1', 'ws-2'] })]);
    mocks.adapter.runAgent
      .mockRejectedValueOnce(Object.assign(new Error('runAgent failed (400): workspace_ambiguous'), {
        status: 400,
        body: { error: 'workspace_ambiguous', workspaceIds: ['ws-1', 'ws-2'] },
      }))
      .mockResolvedValueOnce({ sessionId: 's1', workspaceId: 'ws-1', status: 'spawned', task: 'Research the market' });
    renderApp();
    await screen.findByText('Scout');

    fireEvent.click(screen.getByRole('button', { name: 'Run Scout' }));

    const picker = await screen.findByTestId('agent-workspace-picker');
    // Ids resolve to workspace names through the workspaces prop.
    fireEvent.click(within(picker).getByRole('button', { name: 'Acme Research' }));

    await waitFor(() => expect(mocks.adapter.runAgent).toHaveBeenCalledTimes(2));
    expect(mocks.adapter.runAgent).toHaveBeenNthCalledWith(1, 'a1', {});
    expect(mocks.adapter.runAgent).toHaveBeenNthCalledWith(2, 'a1', { workspaceId: 'ws-1' });
  });

  it('C23 (drawer path): ambiguity closes the modal detail drawer before opening the picker', async () => {
    mocks.adapter.listAgents.mockResolvedValue([makeAgent({ id: 'a1', name: 'Scout', workspaceIds: ['ws-1', 'ws-2'] })]);
    mocks.adapter.runAgent.mockRejectedValueOnce(Object.assign(new Error('runAgent failed (400): workspace_ambiguous'), {
      status: 400,
      body: { error: 'workspace_ambiguous', workspaceIds: ['ws-1', 'ws-2'] },
    }));
    renderApp();
    await screen.findByText('Scout');

    // Open the detail drawer, then Run from its footer (accessible name is
    // exactly 'Run' — distinct from the list row's 'Run Scout').
    fireEvent.click(screen.getByRole('button', { name: 'Open agent Scout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));

    expect(await screen.findByTestId('agent-workspace-picker')).toBeInTheDocument();
    // The drawer is a portaled MODAL sheet (z-50 + pointer-events lock): if it
    // stayed open the picker would be painted over and inert. It must be gone.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument());
  });

  it('pauses a running agent through adapter.pauseAgent', async () => {
    mocks.adapter.listAgents.mockResolvedValue([makeAgent({ id: 'a2', name: 'Drafter', status: 'running' })]);
    mocks.adapter.pauseAgent.mockResolvedValue({ ok: true, paused: 1 });
    renderApp();
    await screen.findByText('Drafter');

    fireEvent.click(screen.getByRole('button', { name: 'Pause Drafter' }));

    await waitFor(() => expect(mocks.adapter.pauseAgent).toHaveBeenCalledWith('a2'));
    // The list reloads after the pause completes.
    await waitFor(() => expect(mocks.adapter.listAgents).toHaveBeenCalledTimes(2));
  });

  it('shows the empty state when no agents exist', async () => {
    mocks.adapter.listAgents.mockResolvedValue([]);
    renderApp();
    expect(await screen.findByText(/No custom agents yet/)).toBeInTheDocument();
    // Empty custom-agent list must still show the built-in workspace
    // assistants — "No agents" while agents demonstrably work was a
    // judge-flagged contradiction.
    expect(screen.getByText(/Already working for you/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Research/)).toBeInTheDocument();
  });

  it('sparse fleet shows the browse-all-specialists card that opens the Templates view', async () => {
    mocks.adapter.listAgents.mockResolvedValue([]);
    renderApp();
    await screen.findByText(/No custom agents yet/);

    // Round-6 fix 4b: ONE affordance (avatar sample + count), not 22
    // indistinguishable per-persona thumbnails.
    const roster = screen.getByTestId('persona-roster');
    expect(roster).toHaveTextContent('Browse all 22 specialists');
    expect(within(roster).getAllByRole('button')).toHaveLength(1);

    fireEvent.click(within(roster).getByRole('button', { name: /browse all 22 specialists/i }));
    expect(screen.getByRole('button', { name: /Templates/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the error state with a Retry that reloads', async () => {
    mocks.adapter.listAgents.mockRejectedValueOnce(new Error('listAgents failed: 500'));
    renderApp();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('listAgents failed: 500');

    mocks.adapter.listAgents.mockResolvedValueOnce([makeAgent({ name: 'Recovered' })]);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });
});
