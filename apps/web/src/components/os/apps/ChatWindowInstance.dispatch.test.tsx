import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  acknowledgeChatDispatch,
  claimNewChatSessionIntent,
  completeNewChatSessionIntent,
  enqueueChatDispatch,
  MAX_CHAT_DISPATCH_CONTENT_CHARS,
  MAX_CHAT_DISPATCHES_PER_WORKSPACE,
  MAX_CHAT_DISPATCHES_TOTAL,
  peekChatDispatch,
  requestNewChatSession,
} from '@/hooks/useChatWidgetState';

type SendOptions = { onAccepted?: () => void };

const mocks = vi.hoisted(() => ({
  activeSessionId: 'session-1' as string | null,
  sessionLoading: false,
  sessionCreating: false,
  sessionError: null as string | null,
  sessionListFailed: false,
  chatIsLoading: false,
  historyLoaded: true,
  historyReady: true,
  historyStatus: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
  historyError: null as string | null,
  retryHistory: vi.fn(),
  sendMessage: vi.fn(),
  createSession: vi.fn(),
  setActiveSessionId: vi.fn(),
  revalidateSessions: vi.fn(),
  retrySessions: vi.fn(),
  getSessions: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  sessions: [] as Array<{
    id: string;
    workspaceId: string;
    title: string;
    messageCount: number;
    lastActive: string;
  }>,
  sessionHookCalls: [] as Array<{ workspaceId: string; preferredSessionId?: string | null }>,
  chatOptions: [] as Array<Record<string, unknown>>,
  chatAppProps: [] as Array<Record<string, unknown>>,
  toast: vi.fn(),
  getModels: vi.fn().mockResolvedValue([]),
  getModel: vi.fn().mockResolvedValue(''),
  getProviders: vi.fn().mockResolvedValue({ providers: [], search: [], activeSearch: '' }),
  getSettings: vi.fn().mockResolvedValue({}),
  getTeamMembers: vi.fn().mockResolvedValue([]),
  patchWorkspace: vi.fn().mockResolvedValue(undefined),
  getHomeBriefing: vi.fn(),
  getHomeOvernight: vi.fn().mockResolvedValue(null),
  shell: {
    activeWorkspaceId: 'ws-a' as string | null,
    workspaces: [
      { id: 'ws-a', name: 'Workspace A', group: 'Personal' },
      { id: 'ws-b', name: 'Workspace B', group: 'Personal' },
    ],
    workspacesLoading: false,
    selectWorkspace: vi.fn(),
    overlays: {
      setShowCreateWorkspace: vi.fn(),
      setShowWorkspaceSwitcher: vi.fn(),
    },
    defaultAutonomy: 'normal',
    setContextRailTarget: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks }));
vi.mock('@/hooks/useSessions', () => ({
  useSessions: (workspaceId: string, preferredSessionId?: string | null) => {
    mocks.sessionHookCalls.push({ workspaceId, preferredSessionId });
    return ({
    sessions: mocks.sessions,
    activeSessionId: mocks.activeSessionId,
    setActiveSessionId: mocks.setActiveSessionId,
    createSession: mocks.createSession,
    revalidateSessions: mocks.revalidateSessions,
    retrySessions: mocks.retrySessions,
    loading: mocks.sessionLoading,
    creating: mocks.sessionCreating,
    error: mocks.sessionError,
    listFailed: mocks.sessionListFailed,
    });
  },
}));
vi.mock('@/hooks/useChat', () => ({
  useChat: (options: Record<string, unknown>) => {
    mocks.chatOptions.push(options);
    return {
    messages: [],
    isLoading: mocks.chatIsLoading,
    historyLoaded: mocks.historyLoaded,
    historyReady: mocks.historyReady,
    historyStatus: mocks.historyStatus,
    historyError: mocks.historyError,
    retryHistory: mocks.retryHistory,
    sendMessage: mocks.sendMessage,
    retryLastFailed: vi.fn(),
    stopStreaming: vi.fn(),
    clearHistory: vi.fn(),
    pendingApproval: null,
    approveAction: vi.fn(),
    };
  },
}));
vi.mock('@/hooks/use-toast', () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));
vi.mock('@/providers/ServiceProvider', () => ({
  useService: () => ({ connecting: false, connected: true }),
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => false }));
vi.mock('./ChatApp', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.chatAppProps.push(props);
    return <div data-testid="chat-app" />;
  },
}));

import ChatWindowInstance from './ChatWindowInstance';
import ChatHost from '../ChatHost';

function drain(workspaceId: string): void {
  let head = peekChatDispatch(workspaceId);
  while (head) {
    acknowledgeChatDispatch(workspaceId, head.id);
    head = peekChatDispatch(workspaceId);
  }
}

function clearNewChatSessionIntent(workspaceId: string): void {
  const intent = requestNewChatSession(workspaceId);
  claimNewChatSessionIntent(workspaceId, intent.id);
  completeNewChatSessionIntent(workspaceId, intent.id);
}

beforeEach(() => {
  mocks.activeSessionId = 'session-1';
  mocks.sessionLoading = false;
  mocks.sessionCreating = false;
  mocks.sessionError = null;
  mocks.sessionListFailed = false;
  mocks.chatIsLoading = false;
  mocks.historyLoaded = true;
  mocks.historyReady = true;
  mocks.historyStatus = 'ready';
  mocks.historyError = null;
  mocks.chatOptions.length = 0;
  mocks.chatAppProps.length = 0;
  mocks.sessionHookCalls.length = 0;
  mocks.sessions.length = 0;
  mocks.setActiveSessionId.mockReset();
  mocks.retryHistory.mockReset();
  mocks.sendMessage.mockReset();
  mocks.createSession.mockReset().mockResolvedValue({ id: 'session-created' });
  mocks.revalidateSessions.mockReset().mockResolvedValue(true);
  mocks.retrySessions.mockReset().mockResolvedValue(true);
  mocks.getSessions.mockReset();
  mocks.renameSession.mockReset();
  mocks.deleteSession.mockReset();
  mocks.toast.mockReset();
  mocks.getHomeBriefing.mockReset();
  mocks.getHomeOvernight.mockReset().mockResolvedValue(null);
  mocks.getProviders.mockReset().mockResolvedValue({ providers: [], search: [], activeSearch: '' });
  mocks.shell.selectWorkspace.mockReset();
});

afterEach(() => {
  cleanup();
  for (const id of ['ws-ready', 'ws-transition', 'ws-late', 'ws-failure', 'ws-fifo-a', 'ws-fifo-b', 'ws-bound', 'ws-memory-resume']) {
    drain(id);
  }
  for (const id of ['ws-a', 'ws-new-session', 'ws-new-session-other', 'ws-new-session-locked', 'ws-new-session-failure', 'ws-memory-resume']) {
    clearNewChatSessionIntent(id);
  }
  for (let index = 0; index <= MAX_CHAT_DISPATCHES_TOTAL; index += 1) {
    drain(`ws-global-${index}`);
  }
  vi.clearAllMocks();
});

describe('repeatable per-workspace chat dispatch', () => {
  it('forwards an unbound Start Here memory suggestion into a fresh-session intent', async () => {
    window.localStorage.clear();
    mocks.getHomeBriefing.mockResolvedValue({
      greeting: 'Welcome back',
      date: '2026-09-02T08:00:00.000Z',
      recentWorkspaces: [{
        id: 'ws-a',
        name: 'Workspace A',
        group: 'Personal',
        lastActive: '2026-09-02T07:00:00.000Z',
        pendingCount: 1,
      }],
      suggestedActions: [{
        label: 'Review the remembered launch decision',
        workspaceId: 'ws-a',
        kind: 'next-action',
      }],
      upNext: [],
      isFirstRun: false,
      needsReviewCount: 0,
    });
    const { default: HomeRoute } = await import('@/routes/HomeRoute');
    const router = createMemoryRouter(
      [
        { path: '/home', element: <HomeRoute /> },
        { path: '/workspaces/:workspaceId/chat', element: <div>chat</div> },
      ],
      { initialEntries: ['/home'] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByTestId('home-cockpit-start-primary'));

    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('ws-a');
    expect(router.state.location.pathname).toBe('/workspaces/ws-a/chat');
    expect(requestNewChatSession('ws-a')).toMatchObject({
      initialMessage: 'Review the remembered launch decision',
    });
  });

  it('restores URL-selected sessions, records sidebar navigation, and isolates hidden workspaces', async () => {
    mocks.activeSessionId = 'session-return-a';
    mocks.sessions.push(
      { id: 'session-return-a', workspaceId: 'ws-a', title: 'Return A', messageCount: 4, lastActive: '2026-08-29T12:00:00.000Z' },
      { id: 'session-newer-b', workspaceId: 'ws-a', title: 'Newer B', messageCount: 2, lastActive: '2026-08-30T12:00:00.000Z' },
      { id: 'session-created-c', workspaceId: 'ws-a', title: 'Created C', messageCount: 0, lastActive: '2026-08-30T12:01:00.000Z' },
      { id: 'session-b-only', workspaceId: 'ws-b', title: 'B only', messageCount: 1, lastActive: '2026-08-30T12:02:00.000Z' },
    );
    const router = createMemoryRouter(
      [{ path: '*', element: <ChatHost /> }],
      { initialEntries: ['/workspaces/ws-a/chat?session=session-return-a'] },
    );
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(mocks.sessionHookCalls).toContainEqual({
      workspaceId: 'ws-a',
      preferredSessionId: 'session-return-a',
    }));
    expect(mocks.chatOptions.find(options => options.workspaceId === 'ws-a'))
      .toMatchObject({ workspaceId: 'ws-a', sessionId: 'session-return-a' });

    const workspaceAProps = [...mocks.chatAppProps]
      .reverse()
      .find(props => props.workspaceId === 'ws-a');
    act(() => {
      (workspaceAProps?.onSelectSession as ((id: string) => void))('session-newer-b');
    });
    await waitFor(() => expect(router.state.location.search).toBe('?session=session-newer-b'));
    expect(mocks.setActiveSessionId).toHaveBeenCalledWith('session-newer-b');

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(router.state.location.search).toBe('?session=session-return-a'));
    await waitFor(() => expect(mocks.sessionHookCalls.at(-1)).toEqual({
      workspaceId: 'ws-a',
      preferredSessionId: 'session-return-a',
    }));

    mocks.createSession.mockResolvedValueOnce({ id: 'session-created-c' });
    const latestWorkspaceAProps = [...mocks.chatAppProps]
      .reverse()
      .find(props => props.workspaceId === 'ws-a');
    await act(async () => {
      await (latestWorkspaceAProps?.onNewSession as (() => Promise<unknown>))();
    });
    await waitFor(() => expect(router.state.location.search).toBe('?session=session-created-c'));

    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(router.state.location.search).toBe('?session=session-return-a'));

    await act(async () => {
      await router.navigate('/workspaces/ws-b/chat?session=session-b-only');
    });
    await waitFor(() => expect(mocks.sessionHookCalls).toContainEqual({
      workspaceId: 'ws-b',
      preferredSessionId: 'session-b-only',
    }));
    expect(mocks.sessionHookCalls.filter(call => call.workspaceId === 'ws-a').at(-1))
      .toEqual({ workspaceId: 'ws-a', preferredSessionId: undefined });
  });

  it('does not let a pending create in a hidden workspace navigate away from the current one', async () => {
    mocks.activeSessionId = 'session-return-a';
    mocks.sessions.push(
      { id: 'session-return-a', workspaceId: 'ws-a', title: 'Return A', messageCount: 4, lastActive: '2026-08-29T12:00:00.000Z' },
      { id: 'session-b-only', workspaceId: 'ws-b', title: 'B only', messageCount: 1, lastActive: '2026-08-30T12:02:00.000Z' },
    );
    let resolveCreate!: (value: { id: string }) => void;
    const pendingCreate = new Promise<{ id: string }>(resolve => { resolveCreate = resolve; });
    mocks.createSession.mockReturnValueOnce(pendingCreate);
    const router = createMemoryRouter(
      [{ path: '*', element: <ChatHost /> }],
      { initialEntries: ['/workspaces/ws-a/chat?session=session-return-a'] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(mocks.chatAppProps.some(props => props.workspaceId === 'ws-a')).toBe(true));

    const workspaceAProps = [...mocks.chatAppProps]
      .reverse()
      .find(props => props.workspaceId === 'ws-a');
    let createResult!: Promise<unknown>;
    act(() => {
      createResult = (workspaceAProps?.onNewSession as (() => Promise<unknown>))();
    });
    await act(async () => {
      await router.navigate('/workspaces/ws-b/chat?session=session-b-only');
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/workspaces/ws-b/chat'));

    await act(async () => {
      resolveCreate({ id: 'session-created-a' });
      await createResult;
    });

    expect(`${router.state.location.pathname}${router.state.location.search}`)
      .toBe('/workspaces/ws-b/chat?session=session-b-only');
  });

  it('replaces an invalid session query with the safe workspace fallback', async () => {
    mocks.activeSessionId = 'session-newer-b';
    mocks.sessions.push({
      id: 'session-newer-b',
      workspaceId: 'ws-a',
      title: 'Newer B',
      messageCount: 2,
      lastActive: '2026-08-30T12:00:00.000Z',
    });
    const router = createMemoryRouter(
      [{ path: '*', element: <ChatHost /> }],
      {
        initialEntries: ['/home', '/workspaces/ws-a/chat?session=foreign-session'],
        initialIndex: 1,
      },
    );
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.search).toBe('?session=session-newer-b'));
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/home');
  });

  it('claims one new-session intent under StrictMode and coalesces repeats while in flight', async () => {
    let resolveCreate!: (value: { id: string }) => void;
    const createPending = new Promise<{ id: string }>(resolve => { resolveCreate = resolve; });
    mocks.createSession.mockReturnValue(createPending);
    const first = requestNewChatSession('ws-new-session');
    expect(requestNewChatSession('ws-new-session')).toEqual(first);

    const { rerender, unmount } = render(
      <StrictMode><ChatWindowInstance workspaceId="ws-new-session" /></StrictMode>,
    );
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    expect(requestNewChatSession('ws-new-session')).toEqual(first);

    rerender(<StrictMode><ChatWindowInstance workspaceId="ws-new-session" /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.createSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ id: 'session-created' });
      await createPending;
    });
    unmount();
    const next = requestNewChatSession('ws-new-session');
    expect(next.id).not.toBe(first.id);
  });

  it('keeps a new-session intent isolated from another workspace', async () => {
    requestNewChatSession('ws-new-session-other');
    render(<StrictMode><ChatWindowInstance workspaceId="ws-new-session" /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('holds a new-session intent through every session lock then creates exactly once', async () => {
    mocks.chatIsLoading = true;
    mocks.sessionLoading = true;
    mocks.sessionCreating = true;
    requestNewChatSession('ws-new-session-locked');
    const { rerender } = render(
      <StrictMode><ChatWindowInstance workspaceId="ws-new-session-locked" /></StrictMode>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(mocks.createSession).not.toHaveBeenCalled();

    mocks.sessionLoading = false;
    rerender(<StrictMode><ChatWindowInstance workspaceId="ws-new-session-locked" /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.createSession).not.toHaveBeenCalled();

    mocks.sessionCreating = false;
    rerender(<StrictMode><ChatWindowInstance workspaceId="ws-new-session-locked" /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.createSession).not.toHaveBeenCalled();

    mocks.chatIsLoading = false;
    rerender(<StrictMode><ChatWindowInstance workspaceId="ws-new-session-locked" /></StrictMode>);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
  });

  it('releases a failed new-session intent for one explicit retry without looping', async () => {
    mocks.createSession.mockRejectedValue(new Error('offline'));
    const first = requestNewChatSession('ws-new-session-failure');
    render(<StrictMode><ChatWindowInstance workspaceId="ws-new-session-failure" /></StrictMode>);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.createSession).toHaveBeenCalledTimes(1);

    let retry!: ReturnType<typeof requestNewChatSession>;
    act(() => { retry = requestNewChatSession('ws-new-session-failure'); });
    expect(retry.id).not.toBe(first.id);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });
  });

  it('creates a fresh session before dispatching a remembered suggested action', async () => {
    let resolveCreate!: (value: { id: string }) => void;
    const pendingCreate = new Promise<{ id: string }>(resolve => { resolveCreate = resolve; });
    mocks.activeSessionId = 'session-unrelated-old';
    mocks.createSession.mockReturnValue(pendingCreate);
    mocks.sendMessage.mockImplementation(async (_content: string, options?: SendOptions) => {
      options?.onAccepted?.();
      return true;
    });

    requestNewChatSession('ws-memory-resume', 'Review the remembered launch decision');

    const view = render(
      <StrictMode><ChatWindowInstance workspaceId="ws-memory-resume" /></StrictMode>,
    );
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    mocks.activeSessionId = 'session-memory-new';
    mocks.historyReady = false;
    await act(async () => {
      resolveCreate({ id: 'session-memory-new' });
      await pendingCreate;
    });
    view.rerender(
      <StrictMode><ChatWindowInstance workspaceId="ws-memory-resume" /></StrictMode>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    mocks.historyReady = true;
    view.rerender(
      <StrictMode><ChatWindowInstance workspaceId="ws-memory-resume" /></StrictMode>,
    );

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(mocks.sendMessage.mock.calls[0]?.[0]).toBe('Review the remembered launch decision');
    expect(mocks.chatOptions.at(-1)).toMatchObject({
      workspaceId: 'ws-memory-resume',
      sessionId: 'session-memory-new',
    });
  });

  it('never dispatches a remembered suggested action when fresh session creation fails', async () => {
    mocks.activeSessionId = 'session-unrelated-old';
    mocks.createSession.mockResolvedValueOnce(undefined);
    requestNewChatSession('ws-memory-resume', 'Review the remembered launch decision');

    const view = render(
      <StrictMode><ChatWindowInstance workspaceId="ws-memory-resume" /></StrictMode>,
    );
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    mocks.activeSessionId = 'session-other-later';
    view.rerender(
      <StrictMode><ChatWindowInstance workspaceId="ws-memory-resume" /></StrictMode>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

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

  it('revalidates session metadata for the exact terminal-turn workspace', async () => {
    render(<StrictMode><ChatWindowInstance workspaceId="ws-ready" /></StrictMode>);
    await act(async () => { await Promise.resolve(); });

    const onTurnSettled = mocks.chatOptions.at(-1)?.onTurnSettled as
      | ((owner: { workspaceId: string; sessionId: string }) => void)
      | undefined;
    expect(onTurnSettled).toBeTypeOf('function');

    act(() => {
      onTurnSettled?.({ workspaceId: 'ws-ready', sessionId: 'session-1' });
    });

    expect(mocks.revalidateSessions).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateSessions).toHaveBeenCalledWith('ws-ready', 'session-1');
  });

  it('forwards the exact history status, safe error, and retry callback to ChatApp', async () => {
    mocks.historyStatus = 'error';
    mocks.historyError = "We couldn't load this conversation. Check your connection and try again.";

    render(<ChatWindowInstance workspaceId="ws-ready" />);
    await act(async () => { await Promise.resolve(); });

    const props = mocks.chatAppProps.at(-1);
    expect(props).toMatchObject({
      historyStatus: 'error',
      historyError: mocks.historyError,
      onRetryHistory: mocks.retryHistory,
    });
    (props?.onRetryHistory as (() => void))();
    expect(mocks.retryHistory).toHaveBeenCalledTimes(1);
  });

  it('forwards session-list recovery to the chat surface', async () => {
    mocks.sessionError = 'Could not load sessions';
    mocks.sessionListFailed = true;

    render(<ChatWindowInstance workspaceId="ws-ready" />);
    await act(async () => { await Promise.resolve(); });

    const props = mocks.chatAppProps.at(-1);
    expect(props).toMatchObject({
      sessionError: mocks.sessionError,
      sessionListFailed: true,
      onRetrySessions: mocks.retrySessions,
    });
    await (props?.onRetrySessions as (() => Promise<boolean>))();
    expect(mocks.retrySessions).toHaveBeenCalledOnce();
  });

  it('clears stale list retry ownership when a later session mutation fails', async () => {
    const { useSessions } = await vi.importActual<typeof import('@/hooks/useSessions')>('@/hooks/useSessions');
    const current = {
      id: 'session-current',
      workspaceId: 'ws-ready',
      title: 'Current',
      messageCount: 2,
      lastActive: '2026-08-30T12:00:00.000Z',
    };
    mocks.getSessions.mockReset()
      .mockResolvedValueOnce([current])
      .mockRejectedValueOnce(new Error('temporary list failure'))
      .mockRejectedValueOnce(new Error('temporary list failure'))
      .mockRejectedValueOnce(new Error('temporary list failure'));
    mocks.createSession.mockReset().mockRejectedValueOnce(new Error('create failed'));
    mocks.renameSession.mockRejectedValueOnce(new Error('rename failed'));
    mocks.deleteSession.mockRejectedValueOnce(new Error('delete failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('ws-ready'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-current'));

    await act(async () => {
      expect(await result.current.retrySessions()).toBe(false);
    });
    expect(result.current.listFailed).toBe(true);

    await act(async () => {
      expect(await result.current.createSession()).toBeUndefined();
    });
    expect(result.current.error).toBe('create failed');
    expect(result.current.listFailed).toBe(false);

    await act(async () => {
      expect(await result.current.retrySessions()).toBe(false);
    });
    expect(result.current.listFailed).toBe(true);
    await act(async () => {
      await result.current.renameSession('session-current', 'Renamed');
    });
    expect(result.current.error).toBe('rename failed');
    expect(result.current.listFailed).toBe(false);

    await act(async () => {
      expect(await result.current.retrySessions()).toBe(false);
    });
    expect(result.current.listFailed).toBe(true);
    await act(async () => {
      await result.current.deleteSession('session-current');
    });
    expect(result.current.error).toBe('delete failed');
    expect(result.current.listFailed).toBe(false);
    consoleSpy.mockRestore();
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
