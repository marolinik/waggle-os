import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SpawnAgentResult } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    getModels: vi.fn(),
    getModelPricing: vi.fn(),
    getProviders: vi.fn(),
    getModel: vi.fn(),
    createWorkspace: vi.fn(),
    spawnAgent: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: {} }));
vi.mock('@/lib/personas', () => ({
  PERSONAS: [
    { id: 'general-purpose', name: 'General Purpose', avatar: '' },
    { id: 'researcher', name: 'Researcher', avatar: '' },
  ],
}));

import SpawnAgentDialog from './SpawnAgentDialog';

const workspace: Workspace = {
  id: 'w1',
  name: 'Launch Room',
  group: 'Personal',
  status: 'active',
};

const spawned: SpawnAgentResult = {
  id: 'run-1',
  runId: 'run-1',
  roomId: 'room-1',
  workspaceId: workspace.id,
  sessionId: 'spawn-run-1',
  status: 'queued',
  statusUrl: '/api/agent-runs/run-1',
  resumable: false,
  task: 'Map adoption risks',
  persona: 'researcher',
  model: 'anthropic/claude-3-5-sonnet',
};

function renderDialog({
  onClose = () => {},
  onSpawned,
  workspaces = [workspace],
  activeWorkspaceId = workspace.id,
}: {
  onClose?: () => void;
  onSpawned?: (result: SpawnAgentResult) => void;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
} = {}) {
  return render(
    <TooltipProvider>
      <SpawnAgentDialog
        open
        onClose={onClose}
        onSpawned={onSpawned}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.adapter.getModels.mockResolvedValue(['anthropic/claude-3-5-sonnet']);
  mocks.adapter.getModelPricing.mockResolvedValue([]);
  mocks.adapter.getProviders.mockResolvedValue({
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic',
        hasKey: true,
        models: [{ id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' }],
      },
    ],
    search: [],
    activeSearch: 'duckduckgo',
  });
  mocks.adapter.getModel.mockResolvedValue('anthropic/claude-3-5-sonnet');
  mocks.adapter.spawnAgent.mockResolvedValue(spawned);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SpawnAgentDialog durable launch', () => {
  it('preserves the selected task, persona, model, and workspace and returns canonical Room identity', async () => {
    const onClose = vi.fn();
    const onSpawned = vi.fn();
    renderDialog({ onClose, onSpawned });

    await waitFor(() => expect(screen.queryByTestId('spawn-models-loading')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Persona override' }));
    fireEvent.click(screen.getByRole('button', { name: /Researcher/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
      target: { value: 'Map adoption risks' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review & Launch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm & Launch' }));

    await waitFor(() => expect(mocks.adapter.spawnAgent).toHaveBeenCalledWith({
      task: 'Map adoption risks',
      persona: 'researcher',
      model: 'anthropic/claude-3-5-sonnet',
      parentWorkspaceId: workspace.id,
    }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSpawned).toHaveBeenCalledWith(spawned);
  });

  it('blocks launch and explains how to configure a model when no provider is ready', async () => {
    mocks.adapter.getModels.mockResolvedValue([]);
    mocks.adapter.getModel.mockResolvedValue('anthropic/claude-3-5-sonnet');
    mocks.adapter.getProviders.mockResolvedValue({ providers: [], search: [], activeSearch: '' });
    renderDialog();

    await screen.findByTestId('spawn-no-keys-cta');
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
      target: { value: 'Try to launch' },
    });

    expect(screen.getByText(/Settings → Vault/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review & Launch' })).toBeDisabled();
  });

  it('blocks launch when the selected workspace no longer exists', async () => {
    renderDialog({ workspaces: [], activeWorkspaceId: undefined });

    await waitFor(() => expect(screen.queryByTestId('spawn-models-loading')).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
      target: { value: 'Try to launch' },
    });

    expect(screen.getByText(/No workspaces/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review & Launch' })).toBeDisabled();
  });

  it('keeps a backend readiness failure visible in the dialog', async () => {
    mocks.adapter.spawnAgent.mockRejectedValueOnce(new Error('No executable model is configured'));
    renderDialog();

    await waitFor(() => expect(screen.queryByTestId('spawn-models-loading')).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
      target: { value: 'Map adoption risks' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review & Launch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm & Launch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No executable model is configured');
  });
});
