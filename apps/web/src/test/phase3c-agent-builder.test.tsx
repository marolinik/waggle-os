/**
 * Phase 3C (S18) — Agent Builder: step gating, the §12.9 review surface, the
 * exact create payload through the Agent Center (+ post-create Run offer),
 * the elevated-access ApprovalModal gate, the persona prefill path, and the
 * house overlay a11y contract (focus trap + Escape).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Agent } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    listAgents: vi.fn(),
    runAgent: vi.fn(),
    pauseAgent: vi.fn(),
    patchAgent: vi.fn(),
    createAgent: vi.fn(),
    getAgentTraces: vi.fn(),
    // AgentBuilder catalogs:
    getPersonas: vi.fn(),
    getSkills: vi.fn(),
    getConnectors: vi.fn(),
    getCapabilityStatus: vi.fn(),
    getProviders: vi.fn(),
    // TemplatesView deps (module mock stays total):
    getAgentGroups: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import AgentsApp, { resetAgentsRouteCache } from '@/components/os/apps/AgentsApp';
import AgentBuilder from '@/components/os/apps/agents/AgentBuilder';
import { ServiceProvider } from '@/providers/ServiceProvider';

function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1', name: 'Scout', goal: 'Research the market', type: 'personal',
    model: 'auto', autonomyLevel: 'guided', memoryScopes: ['personal'],
    status: 'idle', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

const WORKSPACES = [
  { id: 'ws-1', name: 'Acme Research', group: 'work' },
  { id: 'ws-2', name: 'Personal Lab', group: 'personal' },
];

const renderApp = () => render(
  <MemoryRouter>
    <ServiceProvider>
      <TooltipProvider>
        <AgentsApp workspaces={WORKSPACES} />
      </TooltipProvider>
    </ServiceProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  resetAgentsRouteCache(); // Pillar 2.6: reset the module-level route cache between tests
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getAgentTraces.mockResolvedValue([]);
  mocks.adapter.getPersonas.mockResolvedValue([{ id: 'researcher', name: 'Researcher', description: 'Digs deep' }]);
  mocks.adapter.getSkills.mockResolvedValue([
    { id: 'deep-research', name: 'deep-research', installed: true },
    { id: 'weekly-report', name: 'weekly-report', installed: true },
  ]);
  mocks.adapter.getConnectors.mockResolvedValue([{ id: 'github', name: 'GitHub', type: 'github', status: 'connected' }]);
  mocks.adapter.getCapabilityStatus.mockResolvedValue({ mcpServers: [{ name: 'filesystem', tools: 3 }] });
  mocks.adapter.getProviders.mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' });
  mocks.adapter.getAgentGroups.mockResolvedValue([]);
});
afterEach(cleanup);

const openBuilder = async () => {
  fireEvent.click(screen.getByRole('button', { name: /New Agent/ }));
  return screen.findByTestId('agent-builder');
};

describe('AgentBuilder — S18', () => {
  it('gates the Identity step on name + goal', async () => {
    mocks.adapter.listAgents.mockResolvedValue([]);
    renderApp();
    await screen.findByText(/No custom agents yet/);
    await openBuilder();

    const next = screen.getByTestId('agent-builder-next');
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Scout' } });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Research the market' } });
    expect(next).not.toBeDisabled();
  });

  it('a11y: builder fields expose stable form metadata', () => {
    render(<AgentBuilder onCreate={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('Name')).toHaveAttribute('name', 'agentName');
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Goal')).toHaveAttribute('name', 'agentGoal');
    expect(screen.getByLabelText('Goal')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText(/^Description/)).toHaveAttribute('name', 'agentDescription');
    expect(screen.getByLabelText(/^Description/)).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText(/^Persona/)).toHaveAttribute('name', 'agentPersona');
    expect(screen.getByLabelText('Type')).toHaveAttribute('name', 'agentType');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Scout' } });
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Research the market' } });
    fireEvent.click(screen.getByTestId('agent-builder-next'));

    expect(screen.getByLabelText('Model id')).toHaveAttribute('name', 'agentModel');
    expect(screen.getByLabelText('Model id')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Autonomy level')).toHaveAttribute('name', 'agentAutonomyLevel');
  });

  // Headroom for parallel-suite load — this walk renders every wizard step
  // and is the suite's known load-flake (passes in isolation).
  it('happy path declares scope/memory/skills, reviews EVERY field, sends the exact payload and offers Run', { timeout: 20_000 }, async () => {
    mocks.adapter.listAgents.mockResolvedValue([]);
    const created = makeAgent({ id: 'a-new', name: 'Scout', workspaceIds: ['ws-1'], skillIds: ['deep-research'] });
    mocks.adapter.createAgent.mockResolvedValue(created);
    renderApp();
    await screen.findByText(/No custom agents yet/);
    await openBuilder();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Scout' } });
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Research the market' } });
    fireEvent.click(screen.getByTestId('agent-builder-next')); // → Capabilities (model defaults to auto)
    fireEvent.click(screen.getByTestId('agent-builder-next')); // → Scope & memory
    fireEvent.click(await screen.findByRole('button', { name: 'Acme Research' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /deep-research/ }));
    fireEvent.click(screen.getByTestId('agent-builder-next')); // → Permissions (none — stays default)
    fireEvent.click(screen.getByTestId('agent-builder-next')); // → Review

    // §12.9 rule #6: the review surface shows every declared field, and the
    // explicit no-access copy for undeclared ones.
    const review = screen.getByTestId('agent-builder-review');
    expect(review).toHaveTextContent('Scout');
    expect(review).toHaveTextContent('Research the market');
    expect(review).toHaveTextContent('auto');
    expect(review).toHaveTextContent('guided');
    expect(review).toHaveTextContent('Acme Research');
    expect(review).toHaveTextContent('personal');
    expect(review).toHaveTextContent('deep-research');
    expect(review).toHaveTextContent('None declared — no access'); // connectors + MCPs
    expect(review).toHaveTextContent('Default permissions — elevated actions require approval');

    mocks.adapter.listAgents.mockResolvedValue([created]);
    fireEvent.click(screen.getByTestId('agent-builder-finish'));

    await waitFor(() => expect(mocks.adapter.createAgent).toHaveBeenCalledTimes(1));
    expect(mocks.adapter.createAgent).toHaveBeenCalledWith({
      name: 'Scout',
      goal: 'Research the market',
      model: 'auto',
      type: 'personal',
      autonomyLevel: 'guided',
      memoryScopes: ['personal'],
      workspaceIds: ['ws-1'],
      skillIds: ['deep-research'],
    });
    // Post-create: the detail drawer opens on the new agent and offers Run.
    expect(await screen.findByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  it('elevated access (connector selected) warns inline and routes through the ApprovalModal', async () => {
    mocks.adapter.listAgents.mockResolvedValue([]);
    mocks.adapter.createAgent.mockResolvedValue(makeAgent());
    renderApp();
    await screen.findByText(/No custom agents yet/);
    await openBuilder();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Octo' } });
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Triage issues' } });
    fireEvent.click(screen.getByTestId('agent-builder-next'));
    fireEvent.click(screen.getByTestId('agent-builder-next'));
    fireEvent.click(screen.getByTestId('agent-builder-next')); // → Permissions
    fireEvent.click(await screen.findByRole('checkbox', { name: /GitHub/ }));
    expect(screen.getByTestId('agent-builder-elevated-warning')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-builder-next')); // → Review
    fireEvent.click(screen.getByTestId('agent-builder-finish'));

    // No create yet — approval first (§17.3), with the scope readable as text
    // in the same vocabulary the picker used (display name, not raw id).
    expect(mocks.adapter.createAgent).not.toHaveBeenCalled();
    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Connector: GitHub');
    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.createAgent).toHaveBeenCalledTimes(1));
    expect(mocks.adapter.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Octo',
      connectorIds: ['github'],
    }));
  });

  it('prefill path (agent-from-persona): initial seeds the fields and the payload carries personaId', async () => {
    const onCreate = vi.fn();
    render(
      <AgentBuilder
        initial={{ personaId: 'researcher', name: 'Researcher', goal: 'Digs deep' }}
        workspaces={WORKSPACES}
        onCreate={onCreate}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Researcher');
    expect(screen.getByLabelText('Goal')).toHaveValue('Digs deep');
    fireEvent.click(screen.getByTestId('agent-builder-next'));
    fireEvent.click(screen.getByTestId('agent-builder-next'));
    fireEvent.click(screen.getByTestId('agent-builder-next'));
    fireEvent.click(screen.getByTestId('agent-builder-next'));
    expect(screen.getByTestId('agent-builder-review')).toHaveTextContent('persona researcher');
    fireEvent.click(screen.getByTestId('agent-builder-finish'));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Researcher',
      goal: 'Digs deep',
      personaId: 'researcher',
    }));
  });

  it('a11y: mounts as a focus-trapped dialog with aria-current step, Escape cancels', () => {
    const onCancel = vi.fn();
    render(<AgentBuilder onCreate={vi.fn()} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Agent Builder' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByTestId('agent-builder-step-identity')).toHaveAttribute('aria-current', 'step');
    // Forward jumps past the gate are blocked at the step nav too — via
    // aria-disabled (NOT disabled), so the pill stays in the Tab order.
    const reviewPill = screen.getByTestId('agent-builder-step-review');
    expect(reviewPill).toHaveAttribute('aria-disabled', 'true');
    expect(reviewPill).not.toBeDisabled();
    fireEvent.click(reviewPill);
    expect(screen.getByTestId('agent-builder-step-identity')).toHaveAttribute('aria-current', 'step');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus from a field when the parent re-renders with a fresh onCancel (toast-driven re-render)', () => {
    const { rerender } = render(<AgentBuilder onCreate={vi.fn()} onCancel={() => undefined} />);
    const nameInput = screen.getByLabelText('Name');
    nameInput.focus();
    expect(document.activeElement).toBe(nameInput);
    // New inline closure identity — previously tore the focus trap down and
    // refocused the first tabbable (the Close X) mid-typing.
    rerender(<AgentBuilder onCreate={vi.fn()} onCancel={() => undefined} />);
    expect(document.activeElement).toBe(nameInput);
  });
});
