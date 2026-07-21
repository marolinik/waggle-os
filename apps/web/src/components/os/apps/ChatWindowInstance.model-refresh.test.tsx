import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModels: vi.fn(),
  getModel: vi.fn(),
  getSettings: vi.fn(),
  getTeamMembers: vi.fn(),
  patchWorkspace: vi.fn(),
  useChat: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks }));
vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    activeSessionId: 'session-1',
    setActiveSessionId: vi.fn(),
    createSession: vi.fn(),
  }),
}));
vi.mock('@/hooks/useChat', () => ({
  useChat: mocks.useChat,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('./ChatApp', () => ({
  default: ({ availableModels, currentModel, onModelChange }: {
    availableModels: string[];
    currentModel: string;
    onModelChange: (model: string) => void;
  }) => (
    <div>
      <div data-testid="models">{availableModels.join(',')}</div>
      <div data-testid="current-model">{currentModel || 'auto'}</div>
      <button type="button" onClick={() => onModelChange('openai/model-b')}>Select B</button>
      <button type="button" onClick={() => onModelChange('openai/model-c')}>Select C</button>
    </div>
  ),
}));

const chatState = {
    messages: [],
    isLoading: false,
    historyLoaded: true,
    sendMessage: vi.fn(),
    retryLastFailed: vi.fn(),
    stopStreaming: vi.fn(),
    clearHistory: vi.fn(),
    pendingApproval: null,
    approveAction: vi.fn(),
};

import ChatWindowInstance from './ChatWindowInstance';

beforeEach(() => {
  mocks.getModels
    .mockResolvedValueOnce(['openai/existing-model'])
    .mockResolvedValueOnce(['openai/model-released-while-open']);
  mocks.getModel.mockResolvedValue('openai/existing-model');
  mocks.getSettings.mockResolvedValue({});
  mocks.getTeamMembers.mockResolvedValue([]);
  mocks.patchWorkspace.mockResolvedValue(undefined);
  mocks.useChat.mockReturnValue(chatState);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatWindowInstance model catalog refresh', () => {
  it('reloads the provider-backed model list when Waggle regains focus', async () => {
    render(<ChatWindowInstance workspaceId="workspace-1" />);
    await waitFor(() => expect(screen.getByTestId('models'))
      .toHaveTextContent('openai/existing-model'));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getByTestId('models'))
      .toHaveTextContent('openai/model-released-while-open'));
    expect(mocks.getModels).toHaveBeenCalledTimes(2);
  });

  it('passes the workspace model into chat and ignores a stale startup result after a user choice', async () => {
    let resolveStartup!: (model: string) => void;
    mocks.getModel.mockReturnValueOnce(new Promise<string>((resolve) => { resolveStartup = resolve; }));

    render(<ChatWindowInstance workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select B' }));
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/model-b');

    await act(async () => { resolveStartup('openai/stale-startup-model'); });
    await waitFor(() => expect(mocks.patchWorkspace)
      .toHaveBeenCalledWith('workspace-1', { model: 'openai/model-b' }));
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/model-b');
    expect(mocks.useChat.mock.calls.at(-1)?.[0]).toMatchObject({ model: 'openai/model-b' });
  });

  it('reverts a failed latest selection to the last confirmed workspace model', async () => {
    mocks.patchWorkspace.mockRejectedValueOnce(new Error('offline'));

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/model-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select B' }));

    await waitFor(() => expect(screen.getByTestId('current-model')).toHaveTextContent('openai/model-a'));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Model change failed',
      variant: 'destructive',
    }));
    expect(mocks.getModel).not.toHaveBeenCalled();
  });

  it('serializes rapid changes and reverts the latest failure to the last successful choice', async () => {
    let resolveB!: () => void;
    const persistB = new Promise<void>((resolve) => { resolveB = resolve; });
    mocks.patchWorkspace
      .mockReturnValueOnce(persistB)
      .mockRejectedValueOnce(new Error('second write failed'));

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/model-a" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select B' }));
      await Promise.resolve();
    });
    expect(mocks.patchWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select C' }));
      await Promise.resolve();
    });
    expect(mocks.patchWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => { resolveB(); });
    await waitFor(() => expect(mocks.patchWorkspace).toHaveBeenCalledTimes(2));
    expect(mocks.patchWorkspace.mock.calls).toEqual([
      ['workspace-1', { model: 'openai/model-b' }],
      ['workspace-1', { model: 'openai/model-c' }],
    ]);
    await waitFor(() => expect(screen.getByTestId('current-model')).toHaveTextContent('openai/model-b'));
  });
});
