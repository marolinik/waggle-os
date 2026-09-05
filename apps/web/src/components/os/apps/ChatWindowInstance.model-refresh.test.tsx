import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModels: vi.fn(),
  getModel: vi.fn(),
  getAgentStatus: vi.fn(),
  probeModel: vi.fn(),
  getSettings: vi.fn(),
  getTeamMembers: vi.fn(),
  patchWorkspace: vi.fn(),
  useChat: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({
  adapter: mocks,
  MODEL_SETTINGS_CHANGED_EVENT: 'waggle:model-settings-changed',
}));
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
import { useAgentStatus } from '@/hooks/useAgentStatus';

beforeEach(() => {
  mocks.getModels
    .mockReset()
    .mockResolvedValueOnce(['openai/existing-model'])
    .mockResolvedValueOnce(['openai/model-released-while-open']);
  mocks.getModel.mockReset().mockResolvedValue('openai/existing-model');
  mocks.probeModel.mockReset().mockResolvedValue({
    model: 'openai/existing-model',
    configured: true,
    verified: true,
  });
  mocks.getSettings.mockReset().mockResolvedValue({});
  mocks.getTeamMembers.mockReset().mockResolvedValue([]);
  mocks.patchWorkspace.mockReset().mockResolvedValue(undefined);
  mocks.useChat.mockReset().mockReturnValue(chatState);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ChatWindowInstance model catalog refresh', () => {
  it('keeps slow model, current-model, and team polls single-flight', async () => {
    vi.useFakeTimers();
    let resolveModels!: (models: string[]) => void;
    let resolveModel!: (model: string) => void;
    let resolveMembers!: (members: []) => void;
    mocks.getModels.mockReset().mockReturnValue(
      new Promise<string[]>((resolve) => { resolveModels = resolve; }),
    );
    mocks.getModel.mockReset().mockReturnValue(
      new Promise<string>((resolve) => { resolveModel = resolve; }),
    );
    mocks.getTeamMembers.mockReset().mockReturnValue(
      new Promise<[]>((resolve) => { resolveMembers = resolve; }),
    );

    render(
      <ChatWindowInstance
        workspaceId="workspace-1"
        preferredSessionId={null}
        storageType="team"
      />,
    );
    expect(mocks.getModels).toHaveBeenCalledTimes(1);
    expect(mocks.getModel).toHaveBeenCalledTimes(1);
    expect(mocks.getTeamMembers).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });

    expect(mocks.getModels).toHaveBeenCalledTimes(1);
    expect(mocks.getModel).toHaveBeenCalledTimes(1);
    expect(mocks.getTeamMembers).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveModels(['openai/saved-model']);
      resolveModel('openai/saved-model');
      resolveMembers([]);
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(mocks.getModels).toHaveBeenCalledTimes(2);
    expect(mocks.getModel).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.getTeamMembers).toHaveBeenCalledTimes(2);
  });

  it('treats an empty model catalog as a completed successful fetch', async () => {
    vi.useFakeTimers();
    mocks.getModels.mockReset().mockResolvedValue([]);

    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/saved-model" />);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(mocks.getModels).toHaveBeenCalledTimes(1);
  });

  it('does not poll team presence for a Solo workspace', async () => {
    vi.useFakeTimers();

    render(
      <ChatWindowInstance
        workspaceId="workspace-1"
        initialModel="openai/saved-model"
        storageType="local"
      />,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });

    expect(mocks.getTeamMembers).not.toHaveBeenCalled();
  });

  it('retries after a superseding current-model refresh fails and the startup request lands late', async () => {
    vi.useFakeTimers();
    let resolveStartup!: (model: string) => void;
    mocks.getModel.mockReset()
      .mockReturnValueOnce(new Promise<string>((resolve) => { resolveStartup = resolve; }))
      .mockRejectedValueOnce(new Error('temporary current-model outage'))
      .mockResolvedValueOnce('openai/recovered-model');

    render(<ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />);
    expect(mocks.getModel).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('waggle:model-settings-changed'));
      await Promise.resolve();
    });
    expect(mocks.getModel).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveStartup('openai/stale-model');
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(mocks.getModel).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/recovered-model');
  });

  it('retries team presence after a failed poll settles', async () => {
    vi.useFakeTimers();
    mocks.getTeamMembers.mockReset()
      .mockRejectedValueOnce(new Error('temporary team outage'))
      .mockResolvedValueOnce([]);

    render(
      <ChatWindowInstance
        workspaceId="workspace-1"
        initialModel="openai/saved-model"
        storageType="team"
      />,
    );
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getTeamMembers).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.getTeamMembers).toHaveBeenCalledTimes(2);
  });

  it('reloads the provider-backed model list when Waggle regains focus', async () => {
    mocks.getModel
      .mockResolvedValueOnce('openai/existing-model')
      .mockResolvedValueOnce('openai/default-after-focus');
    render(<ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />);
    await waitFor(() => expect(screen.getByTestId('models'))
      .toHaveTextContent('openai/existing-model'));
    await waitFor(() => expect(screen.getByTestId('current-model'))
      .toHaveTextContent('openai/existing-model'));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getByTestId('models'))
      .toHaveTextContent('openai/model-released-while-open'));
    await waitFor(() => expect(screen.getByTestId('current-model'))
      .toHaveTextContent('openai/default-after-focus'));
    expect(mocks.getModels).toHaveBeenCalledTimes(2);
    expect(mocks.useChat.mock.calls.at(-1)?.[0])
      .toMatchObject({ model: 'openai/default-after-focus' });
  });

  it('keeps a refreshed inherited model when the stale startup request resolves last', async () => {
    let resolveStartup!: (model: string) => void;
    mocks.getModel.mockReset()
      .mockReturnValueOnce(new Promise<string>((resolve) => { resolveStartup = resolve; }))
      .mockResolvedValueOnce('openai/new-default');
    render(<ChatWindowInstance workspaceId="workspace-1" preferredSessionId={null} />);
    await waitFor(() => expect(mocks.getModel).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('waggle:model-settings-changed', {
        detail: { model: 'openai/new-default' },
      }));
    });

    await waitFor(() => expect(screen.getByTestId('current-model'))
      .toHaveTextContent('openai/new-default'));
    expect(mocks.useChat.mock.calls.at(-1)?.[0])
      .toMatchObject({ model: 'openai/new-default' });

    await act(async () => { resolveStartup('anthropic/claude-sonnet-4-6'); });
    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/new-default');
    expect(mocks.useChat.mock.calls.at(-1)?.[0])
      .toMatchObject({ model: 'openai/new-default' });
  });

  it('preserves an explicit workspace model across global default changes', async () => {
    render(<ChatWindowInstance workspaceId="workspace-1" initialModel="openai/workspace-model" />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('waggle:model-settings-changed', {
        detail: { model: 'openai/new-default' },
      }));
      await Promise.resolve();
    });

    expect(screen.getByTestId('current-model')).toHaveTextContent('openai/workspace-model');
    expect(mocks.useChat.mock.calls.at(-1)?.[0])
      .toMatchObject({ model: 'openai/workspace-model' });
    expect(mocks.getModel).not.toHaveBeenCalled();
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

describe('shared model status refresh', () => {
  it('keeps the newest model when a stale startup poll finishes after the save event', async () => {
    let resolveStartup!: (value: {
      model: string;
      tokensUsed: number;
      costUsd: number;
      isActive: boolean;
    }) => void;
    mocks.getAgentStatus.mockReset()
      .mockReturnValueOnce(new Promise((resolve) => { resolveStartup = resolve; }))
      .mockResolvedValueOnce({
        model: 'openai-compatible/qwen3.8-flash-next',
        tokensUsed: 0,
        costUsd: 0,
        isActive: false,
      });

    const hook = renderHook(() => useAgentStatus());
    await waitFor(() => expect(mocks.getAgentStatus).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('waggle:model-settings-changed', {
        detail: { model: 'openai-compatible/qwen3.8-flash-next' },
      }));
    });
    await waitFor(() => expect(hook.result.current.model)
      .toBe('openai-compatible/qwen3.8-flash-next'));

    await act(async () => {
      resolveStartup({
        model: 'anthropic/claude-sonnet-4-6',
        tokensUsed: 0,
        costUsd: 0,
        isActive: false,
      });
    });
    expect(hook.result.current.model).toBe('openai-compatible/qwen3.8-flash-next');
  });
});
