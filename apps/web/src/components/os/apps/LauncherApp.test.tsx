/**
 * Warm-Hive PR6b (B1) — LauncherApp A/B segmented toggle.
 *
 * Variation A · Launch = the existing live detect/launch UI (preserved).
 * Variation B · How memory is shared = a pure-UI explainer (flow diagram +
 * three cards + an explicitly-labelled provenance example, no live data).
 *
 * These tests assert the toggle wiring and that Variation B carries the
 * static explainer content WITHOUT fabricating a live recall.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    detectTools: vi.fn(),
    getToolProcesses: vi.fn(),
    launchTool: vi.fn(),
    manageHooks: vi.fn(),
    killTool: vi.fn(),
    runExternalToolTask: vi.fn(),
    streamToolOutput: vi.fn(() => () => {}),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import LauncherApp from './LauncherApp';

const detectionResp = {
  platform: 'darwin',
  detectedAt: '2026-06-18T00:00:00.000Z',
  tools: [
    {
      id: 'claude-code',
      displayName: 'Claude Code',
      installed: true,
      installedPath: '/opt/homebrew/bin/claude',
      version: '2.4.0',
      hooksInstalled: true,
      hookPointerPath: '/home/.claude/hooks',
    },
  ],
};

beforeEach(() => {
  mocks.adapter.detectTools.mockResolvedValue(detectionResp);
  mocks.adapter.getToolProcesses.mockResolvedValue({ processes: [] });
  mocks.adapter.launchTool.mockResolvedValue({ ok: true, pid: 123 });
  mocks.adapter.manageHooks.mockResolvedValue({ ok: true });
  mocks.adapter.killTool.mockResolvedValue({ ok: true, pid: 123, reason: 'SIGTERM' });
  mocks.adapter.runExternalToolTask.mockResolvedValue({
    roomId: 'room-1',
    runs: [{ runId: 'run-1', workspaceId: 'ws-1', status: 'queued', statusUrl: '/api/agent-runs/run-1' }],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LauncherApp · A/B toggle', () => {
  it('defaults to Variation A and renders the live launch UI', async () => {
    render(<LauncherApp />);
    // The detected tool from the live adapter appears (Variation A).
    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText(/optional prompt/i)).toBeInTheDocument();
    // Toggle exists with both tabs, A selected.
    const launchTab = screen.getByRole('tab', { name: /^launch$/i });
    const memTab = screen.getByRole('tab', { name: /how memory is shared/i });
    expect(launchTab).toHaveAttribute('aria-selected', 'true');
    expect(memTab).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to Variation B and renders the explainer (flow + cards), hiding the live UI', async () => {
    render(<LauncherApp />);
    await screen.findByText('Claude Code');
    fireEvent.click(screen.getByRole('tab', { name: /how memory is shared/i }));

    expect(screen.getByRole('tab', { name: /how memory is shared/i })).toHaveAttribute('aria-selected', 'true');
    // Explainer heading + flow nodes.
    expect(screen.getByText(/how a launched agent shares the hive/i)).toBeInTheDocument();
    expect(screen.getByText('The hive')).toBeInTheDocument();
    expect(screen.getByText('hive-mind')).toBeInTheDocument();
    // Three explainer cards.
    expect(screen.getByText(/it recalls on start/i)).toBeInTheDocument();
    expect(screen.getByText(/it commits as it works/i)).toBeInTheDocument();
    expect(screen.getByText(/reversible & local/i)).toBeInTheDocument();
    // The live launch UI (prompt box) is no longer mounted.
    expect(screen.queryByText(/optional prompt/i)).not.toBeInTheDocument();
  });

  it('labels the provenance example as an example (no fabricated live recall)', async () => {
    render(<LauncherApp />);
    await screen.findByText('Claude Code');
    fireEvent.click(screen.getByRole('tab', { name: /how memory is shared/i }));
    const prov = screen.getByText(/remembered from Claude Code/i);
    expect(prov).toHaveTextContent(/^example ·/i);
  });

  it('toggles back to Variation A and restores the live UI', async () => {
    render(<LauncherApp />);
    await screen.findByText('Claude Code');
    fireEvent.click(screen.getByRole('tab', { name: /how memory is shared/i }));
    expect(screen.queryByText(/optional prompt/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^launch$/i }));
    expect(screen.getByRole('tab', { name: /^launch$/i })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByText(/optional prompt/i)).toBeInTheDocument());
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
  });
});

describe('LauncherApp · live output (#4)', () => {
  it('reveals the output pane when a running observed tool badge is clicked', async () => {
    mocks.adapter.getToolProcesses.mockResolvedValue({
      processes: [
        { pid: 4242, toolId: 'claude-code', startedAt: '2026-06-30T00:00:00Z', observed: true },
      ],
    });
    render(<LauncherApp activeWorkspaceId="ws1" />);
    const badge = await screen.findByRole('button', { name: /running/i });
    fireEvent.click(badge);
    expect(await screen.findByText(/Waiting for output/i)).toBeInTheDocument();
    expect(mocks.adapter.streamToolOutput).toHaveBeenCalledWith(4242, expect.any(Object));
  });
});

describe('LauncherApp · captured tasks', () => {
  it('fans Codex and Hermes into two workspaces and opens their shared Room', async () => {
    const onOpenRoom = vi.fn();
    mocks.adapter.detectTools.mockResolvedValue({
      platform: 'darwin',
      detectedAt: '2026-07-11T00:00:00.000Z',
      tools: [
        {
          id: 'codex',
          displayName: 'Codex CLI',
          installed: true,
          installedPath: '/usr/local/bin/codex',
          version: '0.144.1',
          hooksInstalled: true,
          hookPointerPath: '/home/.codex/hooks',
          capabilities: {
            interactiveLaunch: true,
            headlessTask: true,
            structuredProgress: true,
            resumable: true,
            liveWaggleDance: false,
          },
          permissionModes: ['read-only', 'workspace-write', 'native'],
        },
        {
          id: 'hermes',
          displayName: 'Hermes',
          installed: true,
          installedPath: '/usr/local/bin/hermes',
          version: '1.0.0',
          hooksInstalled: true,
          hookPointerPath: '/home/.hermes/hooks',
          capabilities: {
            interactiveLaunch: true,
            headlessTask: true,
            structuredProgress: true,
            resumable: true,
            liveWaggleDance: true,
          },
          permissionModes: ['native'],
        },
        {
          id: 'cursor',
          displayName: 'Cursor',
          installed: true,
          installedPath: '/Applications/Cursor.app',
          version: '1.0.0',
          hooksInstalled: true,
          hookPointerPath: '/home/.cursor/hooks',
          capabilities: {
            interactiveLaunch: true,
            headlessTask: false,
            structuredProgress: false,
            resumable: false,
            liveWaggleDance: false,
          },
          permissionModes: [],
        },
        {
          id: 'openclaw',
          displayName: 'OpenClaw',
          installed: false,
          installedPath: null,
          version: null,
          hooksInstalled: false,
          hookPointerPath: null,
          capabilities: {
            interactiveLaunch: true,
            headlessTask: true,
            structuredProgress: true,
            resumable: true,
            liveWaggleDance: true,
          },
          permissionModes: ['native'],
        },
      ],
    });
    mocks.adapter.runExternalToolTask.mockResolvedValue({
      roomId: 'room-multi',
      runs: [
        { runId: 'codex-a', toolId: 'codex', workspaceId: 'ws-a', status: 'queued', statusUrl: '/api/agent-runs/codex-a' },
        { runId: 'codex-b', toolId: 'codex', workspaceId: 'ws-b', status: 'queued', statusUrl: '/api/agent-runs/codex-b' },
        { runId: 'hermes-a', toolId: 'hermes', workspaceId: 'ws-a', status: 'queued', statusUrl: '/api/agent-runs/hermes-a' },
        { runId: 'hermes-b', toolId: 'hermes', workspaceId: 'ws-b', status: 'queued', statusUrl: '/api/agent-runs/hermes-b' },
        { runId: 'synthesis', toolId: 'hermes', workspaceId: 'ws-b', status: 'queued', statusUrl: '/api/agent-runs/synthesis' },
      ],
    });

    render(
      <LauncherApp
        activeWorkspaceId="ws-a"
        workspaces={[
          { id: 'ws-a', name: 'Alpha' },
          { id: 'ws-b', name: 'Beta' },
        ]}
        onOpenRoom={onOpenRoom}
      />,
    );

    const codexCard = await screen.findByTestId('launcher-tool-codex');
    fireEvent.click(within(codexCard).getByRole('button', { name: /run task/i }));
    expect(screen.getByRole('checkbox', { name: 'Codex CLI' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hermes' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Cursor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'OpenClaw' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hermes' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Access for Codex CLI' }), {
      target: { value: 'workspace-write' },
    });
    expect(screen.getByRole('combobox', { name: 'Access for Hermes' })).toHaveValue('native');
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    fireEvent.change(screen.getByLabelText('Task for Codex CLI'), {
      target: { value: '  Compare both implementations  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start in room/i }));

    await waitFor(() => expect(mocks.adapter.runExternalToolTask).toHaveBeenCalledWith({
      participants: [
        { toolId: 'codex', access: 'workspace-write' },
        { toolId: 'hermes', access: 'native' },
      ],
      workspaceIds: ['ws-a', 'ws-b'],
      prompt: 'Compare both implementations',
    }));
    expect(screen.getByText('Started 2 agents across 2 workspaces (5 worker runs) — opening Room.')).toBeInTheDocument();
    expect(onOpenRoom).toHaveBeenCalledWith('room-multi');
  });

  it('does not offer a captured task for a GUI-only tool', async () => {
    mocks.adapter.detectTools.mockResolvedValue({
      platform: 'darwin',
      detectedAt: '2026-07-11T00:00:00.000Z',
      tools: [{
        id: 'cursor',
        displayName: 'Cursor',
        installed: true,
        installedPath: '/Applications/Cursor.app',
        version: '1.0.0',
        hooksInstalled: true,
        hookPointerPath: '/home/.cursor/hooks',
        capabilities: {
          interactiveLaunch: true,
          headlessTask: false,
          structuredProgress: false,
          resumable: false,
          liveWaggleDance: false,
        },
        permissionModes: [],
      }],
    });

    render(<LauncherApp workspaces={[{ id: 'ws-a', name: 'Alpha' }]} />);

    expect(await screen.findByText('Cursor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^launch$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run task/i })).not.toBeInTheDocument();
  });
});

describe('LauncherApp · hook cohort (#3)', () => {
  it('offers hook actions for every real-hook tool (e.g. codex), not just claude-code', async () => {
    // The 6 real-hook tools (claude-code, codex, codex-desktop, cursor,
    // hermes, openclaw) all ship a bin — the dock must expose hook
    // install for each, mirroring the backend HOOKS_COHORT.
    mocks.adapter.detectTools.mockResolvedValue({
      platform: 'darwin',
      detectedAt: '2026-06-29T00:00:00.000Z',
      tools: [
        {
          id: 'codex',
          displayName: 'Codex',
          installed: true,
          installedPath: '/usr/local/bin/codex',
          version: '1.0.0',
          hooksInstalled: false,
          hookPointerPath: null,
        },
      ],
    });
    render(<LauncherApp />);
    expect(await screen.findByText('Codex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install hooks/i })).toBeInTheDocument();
  });
});
