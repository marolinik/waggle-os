/**
 * Phase 3B (S11) — Automation Center component behaviour over a mocked
 * adapter: render-from-data, success-rate tile math (C27), the C26
 * validation-only Test preview framing, pause flow, empty + error states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Automation } from '@waggle/shared';
import type { AutomationLog } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    // ServiceProvider's mount connect() — resolves so `connecting` settles
    // and the app's connect-gated refresh() fires.
    connect: vi.fn().mockResolvedValue(undefined),
    listAutomations: vi.fn(),
    getAutomationLogs: vi.fn(),
    runAutomation: vi.fn(),
    pauseAutomation: vi.fn(),
    updateAutomation: vi.fn(),
    createAutomation: vi.fn(),
    deleteCronJob: vi.fn(),
    testAutomation: vi.fn(),
    // AutomationBuilder (3C) deps: workspace scope picker + edit-mode
    // jobType/jobConfig read off the cron rows.
    getWorkspaces: vi.fn(),
    getCronJobs: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import AutomationCenterApp from '@/components/os/apps/AutomationCenterApp';
import { ServiceProvider } from '@/providers/ServiceProvider';
import { stashDeepLink } from '@/lib/app-deeplink';

function makeAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: '1', name: 'Nightly consolidation', triggerType: 'schedule', schedule: '0 9 * * *',
    actions: ['memory_consolidation'], workspaceId: '*', status: 'active',
    ...over,
  };
}

function log(id: number, success: boolean): AutomationLog {
  return { id, executedAt: `2026-06-0${(id % 9) + 1}T01:00:00Z`, durationMs: 900, success, resultSummary: success ? 'ok' : null, error: success ? null : 'exploded' };
}

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><AutomationCenterApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getAutomationLogs.mockResolvedValue([]);
  mocks.adapter.getWorkspaces.mockResolvedValue([]);
  mocks.adapter.getCronJobs.mockResolvedValue([]);
});
afterEach(cleanup);

describe('AutomationCenterApp', () => {
  it('renders overview tiles with the C27 success rate derived from logs', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    mocks.adapter.getAutomationLogs.mockResolvedValue([log(1, true), log(2, true), log(3, false), log(4, true)]);
    renderApp();

    expect(await screen.findByTestId('automation-overview-tiles')).toBeInTheDocument();
    expect(screen.getByTestId('automation-success-rate')).toHaveTextContent('75%');
    expect(screen.getByText('Active schedules')).toBeInTheDocument();
    // No "hours saved" tile anywhere (C27).
    expect(screen.queryByText(/hours saved/i)).not.toBeInTheDocument();
  });

  it('surfaces a failed latest run in the attention list and as a Failed badge', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    mocks.adapter.getAutomationLogs.mockResolvedValue([log(1, false)]);
    renderApp();

    const attention = await screen.findByTestId('automation-attention');
    expect(attention).toHaveTextContent('Nightly consolidation — exploded');

    fireEvent.click(screen.getByRole('tab', { name: 'Scheduled' }));
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });

  it('lists rows on the Scheduled tab and pauses via adapter.pauseAutomation', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    mocks.adapter.pauseAutomation.mockResolvedValue(undefined);
    renderApp();
    await screen.findByTestId('automation-overview-tiles');

    fireEvent.click(screen.getByRole('tab', { name: 'Scheduled' }));
    expect(await screen.findByText('Nightly consolidation')).toBeInTheDocument();
    expect(screen.getByText('Every day at 9:00 AM')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause Nightly consolidation' }));
    expect(mocks.adapter.pauseAutomation).toHaveBeenCalledWith('1');
  });

  it('C26: the Builder review-step Check renders issues + the nothing-executed framing', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([]);
    mocks.adapter.testAutomation.mockResolvedValue({
      previewResult: {
        ok: false,
        jobType: 'memory_consolidation',
        triggerType: 'schedule',
        issues: ['invalid cron expression "nope": expected 5 fields'],
        executed: false,
        wouldRun: 'Would run job "memory_consolidation" on schedule "0 9 * * *"',
      },
    });
    renderApp();
    await screen.findByTestId('automation-overview-tiles');

    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    await screen.findByTestId('automation-builder');
    fireEvent.change(screen.getByLabelText('Automation name'), { target: { value: 'Draft check' } });
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Action
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Condition
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Review
    fireEvent.click(screen.getByTestId('automation-builder-check'));

    const preview = await screen.findByTestId('automation-test-preview');
    expect(preview).toHaveTextContent('1 issue found');
    expect(preview).toHaveTextContent('invalid cron expression');
    expect(preview).toHaveTextContent('Validation only — nothing was executed or saved.');
    expect(mocks.adapter.testAutomation).toHaveBeenCalledTimes(1);
    // What the FE SENDS is part of the C26 contract — a drifted draft shape
    // (wrong trigger, missing jobType) must fail here, not only in the render.
    expect(mocks.adapter.testAutomation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Draft check',
      jobType: 'memory_consolidation',
      trigger: expect.objectContaining({ type: 'schedule' }),
    }));
    // The check must never trigger a real run.
    expect(mocks.adapter.runAutomation).not.toHaveBeenCalled();
  });

  it('C26 (edit mode): the Check draft carries the stored row id + actions, not a bare agent_task fallback', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    // 3C: the Builder reads the stored jobType/jobConfig off the cron rows.
    mocks.adapter.getCronJobs.mockResolvedValue([
      { id: '1', name: 'Nightly consolidation', schedule: '0 9 * * *', workspaceId: '*', enabled: true, jobType: 'memory_consolidation', jobConfig: {} },
    ]);
    mocks.adapter.testAutomation.mockResolvedValue({
      previewResult: {
        ok: true, jobType: 'memory_consolidation', triggerType: 'schedule',
        issues: [], executed: false,
        wouldRun: 'Would run job "memory_consolidation" on schedule "0 9 * * *"',
      },
    });
    renderApp();
    await screen.findByTestId('automation-overview-tiles');

    fireEvent.click(screen.getByRole('tab', { name: 'Scheduled' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Nightly consolidation' }));
    await screen.findByTestId('automation-builder');
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Action
    // Output-channel select rendering = the stored config finished loading.
    await screen.findByLabelText('Where the result goes');
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Condition
    fireEvent.click(screen.getByTestId('automation-builder-next')); // → Review
    fireEvent.click(screen.getByTestId('automation-builder-check'));

    await screen.findByTestId('automation-test-preview');
    expect(mocks.adapter.testAutomation).toHaveBeenCalledWith(expect.objectContaining({
      id: '1',
      actions: ['memory_consolidation'],
      name: 'Nightly consolidation',
    }));
    // Edit mode never sends jobType (not patchable — the server resolves it
    // from the stored row via the id). jobConfig IS sent in 3C: the Builder
    // now edits prompt/output channel, merged server-side over the blob.
    const sent = mocks.adapter.testAutomation.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.jobType).toBeUndefined();
    expect(sent.jobConfig).toEqual({ outputChannel: 'log' });
  });

  it('Journey 16 (cold open): a stashed deep-link lands on Logs with the failing automation preselected', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    mocks.adapter.getAutomationLogs.mockResolvedValue([log(1, false)]);
    // Desktop stashes the intent when the dispatch happens before this app
    // mounts (the live listener doesn't exist yet) — consumed once on mount.
    stashDeepLink({ appId: 'scheduled-jobs', tab: 'logs', automationId: '1' });
    renderApp();

    expect(await screen.findByRole('tab', { name: 'Logs', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Retry / run now')).toBeInTheDocument();
  });

  it('Journey 16 (already mounted): the live event switches to Logs and preselects the automation', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([makeAutomation()]);
    renderApp();
    await screen.findByTestId('automation-overview-tiles');

    fireEvent(window, new CustomEvent('waggle:open-app', {
      detail: { appId: 'scheduled-jobs', tab: 'logs', automationId: '1' },
    }));

    expect(await screen.findByRole('tab', { name: 'Logs', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Retry / run now')).toBeInTheDocument();
  });

  it('shows the empty state when no automations exist', async () => {
    mocks.adapter.listAutomations.mockResolvedValue([]);
    renderApp();
    expect(await screen.findByText(/No automations yet/)).toBeInTheDocument();
  });

  it('shows the error state with Retry', async () => {
    mocks.adapter.listAutomations.mockRejectedValueOnce(new Error('listAutomations failed: 500'));
    renderApp();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('listAutomations failed: 500');

    mocks.adapter.listAutomations.mockResolvedValueOnce([makeAutomation({ name: 'Recovered job' })]);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByTestId('automation-overview-tiles')).toBeInTheDocument();
  });
});
