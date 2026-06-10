/**
 * Phase 3C (S20) — Automation Builder: step gating, the exact create payload
 * through the Center, the edit-mode jobConfig round-trip (stored config read
 * off the cron rows → prompt edit → PATCH merge), the agent_task
 * ApprovalModal gate, and the house overlay a11y contract (focus trap +
 * Escape).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Automation } from '@waggle/shared';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    listAutomations: vi.fn(),
    getAutomationLogs: vi.fn(),
    runAutomation: vi.fn(),
    pauseAutomation: vi.fn(),
    updateAutomation: vi.fn(),
    createAutomation: vi.fn(),
    deleteCronJob: vi.fn(),
    testAutomation: vi.fn(),
    getWorkspaces: vi.fn(),
    getCronJobs: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import AutomationCenterApp from '@/components/os/apps/AutomationCenterApp';
import AutomationBuilder from '@/components/os/apps/automations/AutomationBuilder';
import { ServiceProvider } from '@/providers/ServiceProvider';

function makeAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: '1', name: 'Nightly agent', triggerType: 'schedule', schedule: '0 9 * * *',
    actions: ['agent_task'], workspaceId: '*', status: 'active',
    ...over,
  };
}

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><AutomationCenterApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getAutomationLogs.mockResolvedValue([]);
  mocks.adapter.getWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Research', group: 'work' }]);
  mocks.adapter.getCronJobs.mockResolvedValue([]);
});
afterEach(cleanup);

describe('AutomationBuilder — S20', () => {
  it('gates step advance on required input (name, then agent_task prompt)', async () => {
    render(<AutomationBuilder onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const next = screen.getByTestId('automation-builder-next');

    // Trigger step: empty name blocks Next.
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Automation name'), { target: { value: 'Morning brief' } });
    expect(next).not.toBeDisabled();

    // Action step: agent_task without a prompt blocks Next.
    fireEvent.click(next);
    fireEvent.change(screen.getByTestId('automation-job-type'), { target: { value: 'agent_task' } });
    expect(screen.getByTestId('automation-builder-next')).toBeDisabled();
    fireEvent.change(screen.getByTestId('automation-prompt'), { target: { value: 'Summarise the inbox' } });
    expect(screen.getByTestId('automation-builder-next')).not.toBeDisabled();
  });

  it('create happy path sends the EXACT adapter payload (with workspace scope + telegram channel)', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([]);
    mocks.adapter.createAutomation.mockResolvedValue(makeAutomation());
    renderApp();
    await screen.findByTestId('automation-overview-tiles');

    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    await screen.findByTestId('automation-builder');
    fireEvent.change(screen.getByLabelText('Automation name'), { target: { value: 'Nightly consolidation' } });
    // Workspace picker options load async.
    await screen.findByRole('option', { name: 'Acme Research' });
    fireEvent.change(screen.getByTestId('automation-workspace'), { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Action
    fireEvent.change(screen.getByTestId('automation-output-channel'), { target: { value: 'telegram' } });
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Condition
    fireEvent.change(screen.getByTestId('automation-condition'), { target: { value: 'only on weekdays' } });
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Review
    fireEvent.click(screen.getByTestId('automation-builder-finish'));

    await waitFor(() => expect(mocks.adapter.createAutomation).toHaveBeenCalledTimes(1));
    expect(mocks.adapter.createAutomation).toHaveBeenCalledWith({
      name: 'Nightly consolidation',
      trigger: { type: 'schedule', cron: '0 9 * * *' },
      condition: 'only on weekdays',
      jobType: 'memory_consolidation',
      jobConfig: { outputChannel: 'telegram' },
      workspaceId: 'ws-1',
      enabled: true,
    });
  });

  it('edit round-trip: reads stored jobConfig off the cron row, edits the prompt, gates on approval, PATCHes the merge', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    mocks.adapter.getCronJobs.mockResolvedValue([
      {
        id: '1', name: 'Nightly agent', schedule: '0 9 * * *', workspaceId: '*', enabled: true,
        jobType: 'agent_task', jobConfig: { prompt: 'old prompt', outputChannel: 'telegram' },
      },
    ]);
    mocks.adapter.updateAutomation.mockResolvedValue(makeAutomation());
    renderApp();
    await screen.findByTestId('automation-overview-tiles');

    fireEvent.click(screen.getByRole('tab', { name: 'Scheduled' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Nightly agent' }));
    await screen.findByTestId('automation-builder');

    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Action
    // The stored prompt round-trips into the editable field.
    const promptField = await screen.findByTestId('automation-prompt');
    expect(promptField).toHaveValue('old prompt');
    // The job type itself is read-only in edit mode.
    expect(screen.queryByTestId('automation-job-type')).not.toBeInTheDocument();
    expect(screen.getByText(/can’t be changed after creation/)).toBeInTheDocument();

    fireEvent.change(promptField, { target: { value: 'new prompt' } });
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Condition
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Review
    fireEvent.click(screen.getByTestId('automation-builder-finish'));

    // agent_task is approval-gated: the request renders action/scope/risk as text.
    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Approval required');
    expect(modal).toHaveTextContent('Risk level');
    expect(modal).toHaveTextContent('Agent prompt: new prompt');
    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.updateAutomation).toHaveBeenCalledTimes(1));
    expect(mocks.adapter.updateAutomation).toHaveBeenCalledWith('1', {
      name: 'Nightly agent',
      trigger: { type: 'schedule', cron: '0 9 * * *' },
      condition: '',
      jobConfig: { outputChannel: 'telegram', prompt: 'new prompt' },
    });
  });

  it('edit mode while the cron read is PENDING: shows a loading label (never the default job type) and blocks Save', async () => {
    let resolveCron: (rows: unknown[]) => void = () => undefined;
    mocks.adapter.getCronJobs.mockReturnValue(new Promise((res) => { resolveCron = res; }));
    render(
      <AutomationBuilder
        initial={makeAutomation()} // stored agent_task
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Action (trigger prefilled = valid)
    // While in flight the surface must not claim the default 'Consolidate
    // memory' for a stored agent_task.
    expect(screen.getByText('Loading stored action…')).toBeInTheDocument();
    expect(screen.queryByText('Consolidate memory')).not.toBeInTheDocument();
    // The Action step is invalid while pending — Next (and therefore Finish)
    // waits for loaded-or-unavailable.
    expect(screen.getByTestId('automation-builder-next')).toBeDisabled();

    resolveCron([{
      id: '1', name: 'Nightly agent', schedule: '0 9 * * *', workspaceId: '*', enabled: true,
      jobType: 'agent_task', jobConfig: { prompt: 'stored prompt' },
    }]);
    expect(await screen.findByTestId('automation-prompt')).toHaveValue('stored prompt');
    expect(screen.getByTestId('automation-builder-next')).not.toBeDisabled();
  });

  it('§17.3 never fails open: editing a stored agent_task still gates on approval when the cron read FAILS', async () => {
    mocks.adapter.getCronJobs.mockRejectedValue(new Error('500'));
    const onSubmit = vi.fn();
    render(
      <AutomationBuilder
        initial={makeAutomation()} // actions: ['agent_task'] — the projected job type
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Action
    await screen.findByTestId('automation-builder-config-unavailable');
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Condition
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Review
    fireEvent.click(screen.getByTestId('automation-builder-finish'));

    // The gate derives the job type from initial.actions — no silent save.
    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Approval required');
    expect(modal).toHaveTextContent('saving keeps it unchanged');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('approval-modal-approve'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Degraded path stays config-safe: the draft must not carry jobConfig.
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('jobConfig');
  });

  it('cancelling the approval modal does not submit', async () => {
    const onSubmit = vi.fn();
    render(<AutomationBuilder onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Automation name'), { target: { value: 'Agent run' } });
    fireEvent.click(screen.getByTestId('automation-builder-next'));
    fireEvent.change(screen.getByTestId('automation-job-type'), { target: { value: 'agent_task' } });
    fireEvent.change(screen.getByTestId('automation-prompt'), { target: { value: 'Do the thing' } });
    fireEvent.click(screen.getByTestId('automation-builder-next'));
    fireEvent.click(screen.getByTestId('automation-builder-next'));
    fireEvent.click(screen.getByTestId('automation-builder-finish'));

    const modal = await screen.findByTestId('approval-modal');
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('approval-modal')).not.toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a11y: mounts as a focus-trapped dialog and Escape cancels', () => {
    const onCancel = vi.fn();
    render(<AutomationBuilder onSubmit={vi.fn()} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Automation Builder' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus moved inside on open (house useFocusTrap contract).
    expect(dialog.contains(document.activeElement)).toBe(true);
    // The active step is exposed via aria-current="step".
    expect(screen.getByTestId('automation-builder-step-trigger')).toHaveAttribute('aria-current', 'step');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
