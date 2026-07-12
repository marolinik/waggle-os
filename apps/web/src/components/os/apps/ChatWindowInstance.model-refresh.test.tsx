import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getModels: vi.fn(),
  getModel: vi.fn(),
  getSettings: vi.fn(),
  getTeamMembers: vi.fn(),
  setModel: vi.fn(),
  patchWorkspace: vi.fn(),
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
  useChat: () => ({
    messages: [],
    isLoading: false,
    historyLoaded: true,
    sendMessage: vi.fn(),
    retryLastFailed: vi.fn(),
    stopStreaming: vi.fn(),
    clearHistory: vi.fn(),
    pendingApproval: null,
    approveAction: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('./ChatApp', () => ({
  default: ({ availableModels }: { availableModels: string[] }) => (
    <div data-testid="models">{availableModels.join(',')}</div>
  ),
}));

import ChatWindowInstance from './ChatWindowInstance';

beforeEach(() => {
  mocks.getModels
    .mockResolvedValueOnce(['openai/existing-model'])
    .mockResolvedValueOnce(['openai/model-released-while-open']);
  mocks.getModel.mockResolvedValue('openai/existing-model');
  mocks.getSettings.mockResolvedValue({});
  mocks.getTeamMembers.mockResolvedValue([]);
  mocks.setModel.mockResolvedValue(undefined);
  mocks.patchWorkspace.mockResolvedValue(undefined);
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
});
