import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModels: vi.fn(),
  getModel: vi.fn(),
  probeModel: vi.fn(),
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
  default: ({
    availableModels,
    currentModel,
    modelCatalogStatus,
    modelHealthStatus,
    onModelChange,
    onRetryModels,
  }: {
    availableModels: string[];
    currentModel: string;
    modelCatalogStatus: 'loading' | 'ready' | 'empty' | 'unavailable';
    modelHealthStatus: 'checking' | 'ready' | 'unavailable' | 'unconfigured';
    onModelChange: (model: string) => void;
    onRetryModels: () => void;
  }) => (
    <div>
      <div data-testid="models">{availableModels.join(',')}</div>
      <div data-testid="current-model">{currentModel || 'auto'}</div>
      <div data-testid="model-catalog-status">{modelCatalogStatus}</div>
      <div data-testid="model-health-status">{modelHealthStatus}</div>
      <button type="button" onClick={() => onModelChange('openai/model-b')}>Select B</button>
      <button type="button" onClick={() => onModelChange('openai/model-c')}>Select C</button>
      <button type="button" onClick={onRetryModels}>Retry models</button>
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
  mocks.probeModel.mockResolvedValue({
    model: 'openai/existing-model',
    configured: true,
    verified: true,
  });
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
    render(<ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />);
    await waitFor(() => expect(screen.getByTestId('models'))
      .toHaveTextContent('openai/existing-model'));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getByTestId('models'))
      .toHaveTextContent('openai/model-released-while-open'));
    expect(mocks.getModels).toHaveBeenCalledTimes(2);
  });

  it('does not fan out model refreshes from a kept-alive hidden workspace', async () => {
    const view = render(
      <ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />,
    );
    await waitFor(() => expect(mocks.probeModel).toHaveBeenCalledWith('openai/existing-model'));

    view.rerender(
      <ChatWindowInstance workspaceId="workspace-1" preferredSessionId={undefined} />,
    );
    mocks.getModels.mockClear();
    mocks.probeModel.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(mocks.getModels).not.toHaveBeenCalled();
    expect(mocks.probeModel).not.toHaveBeenCalled();
  });

  it('refreshes model catalog and exact health once when a hidden workspace becomes active again', async () => {
    const view = render(
      <ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />,
    );
    await waitFor(() => expect(mocks.probeModel).toHaveBeenCalledWith('openai/existing-model'));

    view.rerender(
      <ChatWindowInstance workspaceId="workspace-1" preferredSessionId={undefined} />,
    );
    mocks.getModels.mockClear();
    mocks.probeModel.mockClear();

    view.rerender(
      <ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />,
    );

    await waitFor(() => expect(mocks.getModels).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.probeModel)
      .toHaveBeenCalledWith('openai/existing-model'));
    expect(mocks.probeModel).toHaveBeenCalledTimes(1);
  });

  it('exposes a failed catalog refresh and recovers through an explicit retry without losing the saved model', async () => {
    let resolveRetry!: (models: string[]) => void;
    mocks.getModels.mockReset()
      .mockRejectedValueOnce(new Error('provider catalog offline'))
      .mockReturnValueOnce(new Promise<string[]>((resolve) => { resolveRetry = resolve; }));

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/saved-model" />);

    await waitFor(() => expect(screen.getByTestId('model-catalog-status'))
      .toHaveTextContent('unavailable'));
    expect(screen.getByTestId('models')).toBeEmptyDOMElement();
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/saved-model');

    fireEvent.click(screen.getByRole('button', { name: 'Retry models' }));
    expect(screen.getByTestId('model-catalog-status')).toHaveTextContent('loading');
    expect(mocks.getModels).toHaveBeenCalledTimes(2);

    await act(async () => { resolveRetry(['openai/recovered-model']); });
    await waitFor(() => expect(screen.getByTestId('model-catalog-status'))
      .toHaveTextContent('ready'));
    expect(screen.getByTestId('models')).toHaveTextContent('openai/recovered-model');
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/saved-model');
  });

  it('does not treat a non-empty catalog as proof that the exact saved model responds', async () => {
    mocks.getModels.mockReset().mockResolvedValue(['openai/other-model']);
    mocks.probeModel.mockReset().mockResolvedValue({
      model: 'openai/saved-model',
      configured: true,
      verified: false,
      rejected: true,
    });

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/saved-model" />);

    await waitFor(() => expect(screen.getByTestId('model-catalog-status'))
      .toHaveTextContent('ready'));
    await waitFor(() => expect(screen.getByTestId('model-health-status'))
      .toHaveTextContent('unavailable'));
    expect(mocks.probeModel).toHaveBeenCalledWith('openai/saved-model');
  });

  it('re-probes the exact saved model on retry and exposes checking until recovery completes', async () => {
    let resolveRetry!: (result: {
      model: string;
      configured: boolean;
      verified: boolean;
    }) => void;
    mocks.getModels.mockReset().mockResolvedValue(['openai/saved-model']);
    mocks.probeModel.mockReset()
      .mockResolvedValueOnce({
        model: 'openai/saved-model',
        configured: true,
        verified: false,
        rejected: true,
      })
      .mockReturnValueOnce(new Promise((resolve) => { resolveRetry = resolve; }));

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/saved-model" />);

    await waitFor(() => expect(screen.getByTestId('model-health-status'))
      .toHaveTextContent('unavailable'));
    expect(mocks.probeModel).toHaveBeenCalledTimes(1);
    expect(mocks.probeModel).toHaveBeenLastCalledWith('openai/saved-model');

    fireEvent.click(screen.getByRole('button', { name: 'Retry models' }));

    expect(screen.getByTestId('model-health-status')).toHaveTextContent('checking');
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/saved-model');
    expect(mocks.probeModel).toHaveBeenCalledTimes(2);
    expect(mocks.probeModel).toHaveBeenLastCalledWith('openai/saved-model');

    await act(async () => {
      resolveRetry({
        model: 'openai/saved-model',
        configured: true,
        verified: true,
      });
    });

    await waitFor(() => expect(screen.getByTestId('model-health-status'))
      .toHaveTextContent('ready'));
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/saved-model');
  });

  it('distinguishes a successful empty catalog from an unavailable catalog', async () => {
    mocks.getModels.mockReset().mockResolvedValue([]);

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/saved-model" />);

    await waitFor(() => expect(screen.getByTestId('model-catalog-status'))
      .toHaveTextContent('empty'));
    expect(screen.getByTestId('model-catalog-status')).not.toHaveTextContent('unavailable');
    expect(screen.getByTestId('models')).toBeEmptyDOMElement();
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/saved-model');
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
