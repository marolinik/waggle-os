import { StrictMode } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeChatDispatch,
  enqueueChatDispatch,
  MAX_CHAT_DISPATCH_CONTENT_CHARS,
  MAX_CHAT_DISPATCHES_PER_WORKSPACE,
  MAX_CHAT_DISPATCHES_TOTAL,
  peekChatDispatch,
} from '@/hooks/useChatWidgetState';

type SendOptions = { onAccepted?: () => void };

const mocks = vi.hoisted(() => ({
  activeSessionId: 'session-1' as string | null,
  sessionLoading: false,
  sessionCreating: false,
  sessionError: null as string | null,
  historyLoaded: true,
  historyReady: true,
  sendMessage: vi.fn(),
  chatAppProps: [] as Array<Record<string, unknown>>,
  toast: vi.fn(),
  getModels: vi.fn().mockResolvedValue([]),
  getModel: vi.fn().mockResolvedValue(''),
  getSettings: vi.fn().mockResolvedValue({}),
  getTeamMembers: vi.fn().mockResolvedValue([]),
  patchWorkspace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks }));
vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    activeSessionId: mocks.activeSessionId,
    setActiveSessionId: vi.fn(),
    createSession: vi.fn(),
    loading: mocks.sessionLoading,
    creating: mocks.sessionCreating,
    error: mocks.sessionError,
  }),
}));
vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    messages: [],
    isLoading: false,
    historyLoaded: mocks.historyLoaded,
    historyReady: mocks.historyReady,
    sendMessage: mocks.sendMessage,
    retryLastFailed: vi.fn(),
    stopStreaming: vi.fn(),
    clearHistory: vi.fn(),
    pendingApproval: null,
    approveAction: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-toast', () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock('./ChatApp', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.chatAppProps.push(props);
    return <div data-testid="chat-app" />;
  },
}));

import ChatWindowInstance from './ChatWindowInstance';

function drain(workspaceId: string): void {
  let head = peekChatDispatch(workspaceId);
  while (head) {
    acknowledgeChatDispatch(workspaceId, head.id);
    head = peekChatDispatch(workspaceId);
  }
}

beforeEach(() => {
  mocks.activeSessionId = 'session-1';
  mocks.sessionLoading = false;
  mocks.sessionCreating = false;
  mocks.sessionError = null;
  mocks.historyLoaded = true;
  mocks.historyReady = true;
  mocks.chatAppProps.length = 0;
  mocks.sendMessage.mockReset();
  mocks.toast.mockReset();
});

afterEach(() => {
  cleanup();
  for (const id of ['ws-ready', 'ws-transition', 'ws-late', 'ws-failure', 'ws-fifo-a', 'ws-fifo-b', 'ws-bound']) {
    drain(id);
  }
  for (let index = 0; index <= MAX_CHAT_DISPATCHES_TOTAL; index += 1) {
    drain(`ws-global-${index}`);
  }
  vi.clearAllMocks();
});

describe('repeatable per-workspace chat dispatch', () => {
  it('forwards loading, creating, and settled readiness to the chat surface', async () => {
    mocks.sessionLoading = true;
    const { rerender } = render(<ChatWindowInstance workspaceId="ws-ready" />);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.chatAppProps.at(-1)).toMatchObject({
      sessionLoading: true,
      sessionCreating: false,
      sessionReady: false,
    });

    mocks.sessionLoading = false;
    mocks.sessionCreating = true;
    mocks.activeSessionId = 'session-old';
    await act(async () => {
      rerender(<ChatWindowInstance workspaceId="ws-ready" />);
      await Promise.resolve();
    });
    expect(mocks.chatAppProps.at(-1)).toMatchObject({
      sessionLoading: false,
      sessionCreating: true,
      sessionReady: false,
    });

    mocks.sessionCreating = false;
    mocks.activeSessionId = 'session-new';
    await act(async () => {
      rerender(<ChatWindowInstance workspaceId="ws-ready" />);
      await Promise.resolve();
    });
    expect(mocks.chatAppProps.at(-1)).toMatchObject({
      sessionLoading: false,
      sessionCreating: false,
      sessionReady: true,
    });
  });

  it('holds a pending Home dispatch while a new session replaces the stale active session', async () => {
    mocks.sessionCreating = true;
    mocks.activeSessionId = 'session-old';
    mocks.sendMessage.mockImplementation((_content: string, opts?: SendOptions) => {
      opts?.onAccepted?.();
      return Promise.resolve(true);
    });
    enqueueChatDispatch('ws-transition', 'Keep this for the new session');

    const { rerender } = render(<ChatWindowInstance workspaceId="ws-transition" />);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(peekChatDispatch('ws-transition')?.content).toBe('Keep this for the new session');

    mocks.sessionCreating = false;
    mocks.activeSessionId = 'session-new';
    mocks.historyReady = false;
    await act(async () => {
      rerender(<ChatWindowInstance workspaceId="ws-transition" />);
      await Promise.resolve();
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(peekChatDispatch('ws-transition')?.content).toBe('Keep this for the new session');

    mocks.historyReady = true;
    await act(async () => {
      rerender(<ChatWindowInstance workspaceId="ws-transition" />);
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'Keep this for the new session',
      expect.any(Object),
    );
    expect(peekChatDispatch('ws-transition')).toBeNull();
  });

  it('keeps same-text requests distinct and enforces exact FIFO/workspace acknowledgement', () => {
    const first = enqueueChatDispatch('ws-fifo-a', 'Repeat prompt');
    const second = enqueueChatDispatch('ws-fifo-a', 'Repeat prompt');
    const isolated = enqueueChatDispatch('ws-fifo-b', 'Other workspace');

    expect(first.id).not.toBe(second.id);
    expect(peekChatDispatch('ws-fifo-a')).toEqual(first);
    expect(peekChatDispatch('ws-fifo-b')).toEqual(isolated);
    expect(acknowledgeChatDispatch('ws-fifo-a', second.id)).toBe(false);
    expect(acknowledgeChatDispatch('ws-fifo-b', first.id)).toBe(false);
    expect(acknowledgeChatDispatch('ws-fifo-a', first.id)).toBe(true);
    expect(peekChatDispatch('ws-fifo-a')).toEqual(second);
  });

  it('bounds prompt size plus per-workspace and global queue depth', () => {
    expect(() => enqueueChatDispatch('ws-bound', 'x'.repeat(MAX_CHAT_DISPATCH_CONTENT_CHARS + 1)))
      .toThrow(/exceeds/i);
    for (let index = 0; index < MAX_CHAT_DISPATCHES_PER_WORKSPACE; index += 1) {
      enqueueChatDispatch('ws-bound', `bounded-${index}`);
    }
    expect(() => enqueueChatDispatch('ws-bound', 'overflow')).toThrow(/workspace.*full/i);
    drain('ws-bound');

    for (let index = 0; index < MAX_CHAT_DISPATCHES_TOTAL; index += 1) {
      enqueueChatDispatch(`ws-global-${index}`, `global-${index}`);
    }
    expect(() => enqueueChatDispatch(`ws-global-${MAX_CHAT_DISPATCHES_TOTAL}`, 'overflow'))
      .toThrow(/queue is full/i);
  });

  it('waits for session and history readiness then accepts once under StrictMode', async () => {
    mocks.activeSessionId = null;
    mocks.historyLoaded = false;
    mocks.sendMessage.mockImplementation((_content: string, opts?: SendOptions) => {
      opts?.onAccepted?.();
      return Promise.resolve(true);
    });
    enqueueChatDispatch('ws-ready', 'Draft the board update');

    const { rerender } = render(
      <StrictMode><ChatWindowInstance workspaceId="ws-ready" /></StrictMode>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    mocks.activeSessionId = 'session-1';
    mocks.historyLoaded = true;
    rerender(<StrictMode><ChatWindowInstance workspaceId="ws-ready" /></StrictMode>);

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0][0]).toBe('Draft the board update');
    expect(peekChatDispatch('ws-ready')).toBeNull();
  });

  it('holds FIFO head until late acceptance then delivers the next identical prompt once', async () => {
    let acceptFirst!: () => void;
    mocks.sendMessage
      .mockImplementationOnce((_content: string, opts?: SendOptions) => {
        acceptFirst = () => opts?.onAccepted?.();
        return new Promise<boolean>(() => undefined);
      })
      .mockImplementationOnce((_content: string, opts?: SendOptions) => {
        opts?.onAccepted?.();
        return Promise.resolve(true);
      });
    const first = enqueueChatDispatch('ws-late', 'Same prompt');
    const second = enqueueChatDispatch('ws-late', 'Same prompt');

    render(<StrictMode><ChatWindowInstance workspaceId="ws-late" /></StrictMode>);
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(peekChatDispatch('ws-late')).toEqual(first);

    act(() => acceptFirst());
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.sendMessage.mock.calls.map(call => call[0])).toEqual(['Same prompt', 'Same prompt']);
    expect(peekChatDispatch('ws-late')).toBeNull();
    expect(first.id).not.toBe(second.id);
  });

  it('dequeues false/rejected attempts visibly and permits an explicit new-id retry without replay', async () => {
    mocks.sendMessage
      .mockResolvedValueOnce(false)
      .mockImplementationOnce((_content: string, opts?: SendOptions) => {
        opts?.onAccepted?.();
        return Promise.resolve(true);
      })
      .mockRejectedValueOnce(new Error('transport down'))
      .mockImplementationOnce((_content: string, opts?: SendOptions) => {
        opts?.onAccepted?.();
        return Promise.resolve(true);
    });

    render(<StrictMode><ChatWindowInstance workspaceId="ws-failure" /></StrictMode>);
    act(() => { enqueueChatDispatch('ws-failure', 'Retry false'); });
    await waitFor(() => expect(peekChatDispatch('ws-failure')).toBeNull());
    expect(mocks.toast).toHaveBeenCalledTimes(1);

    act(() => { enqueueChatDispatch('ws-failure', 'Retry false'); });
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(peekChatDispatch('ws-failure')).toBeNull();

    act(() => { enqueueChatDispatch('ws-failure', 'Retry rejection'); });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(2));
    expect(peekChatDispatch('ws-failure')).toBeNull();

    act(() => { enqueueChatDispatch('ws-failure', 'Retry rejection'); });
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(4));
    expect(peekChatDispatch('ws-failure')).toBeNull();
    expect(mocks.sendMessage.mock.calls.map(call => call[0])).toEqual([
      'Retry false',
      'Retry false',
      'Retry rejection',
      'Retry rejection',
    ]);
  });
});
