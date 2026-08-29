import { useEffect, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeChatDispatch,
  cancelWorkspaceSelectionChatDispatch,
  completeWorkspaceSelectionChatDispatch,
  enqueueChatDispatch,
  peekChatDispatch,
  peekWorkspaceSelectionChatDispatch,
  stageWorkspaceSelectionChatDispatch,
  useWorkspaceSelectionChatDispatch,
} from '@/hooks/useChatWidgetState';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  adapter: {
    getHomeBriefing: vi.fn(),
    getHomeOvernight: vi.fn(),
    quickCapture: vi.fn(),
  },
  shell: {
    activeWorkspaceId: 'ws-active' as string | null,
    workspacesLoading: false,
    workspaces: [
      { id: 'ws-other', name: 'Other workspace' },
      { id: 'ws-active', name: 'Active workspace' },
    ],
    selectWorkspace: vi.fn(),
    overlays: {
      setShowCreateWorkspace: vi.fn(),
      setShowWorkspaceSwitcher: vi.fn(),
    },
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/providers/ServiceProvider', () => ({
  useService: () => ({ connecting: false, connected: true }),
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/briefing-source', () => ({
  takeBriefingData: vi.fn().mockResolvedValue({ highlights: [] }),
}));
vi.mock('@/components/os/model-gate/NoModelBanner', () => ({ NoModelBanner: () => null }));
vi.mock('@/routes/SurfaceBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/os/home/DreamDiaryCard', () => ({ default: () => null }));
vi.mock('@/lib/workspace-counts', () => ({
  workspaceCounts: () => ({ visible: 2, archived: 0, noise: 0 }),
}));

import HomeRoute from '@/routes/HomeRoute';

const WORKSPACE_IDS = ['ws-active', 'ws-other'];

function drainDispatches(workspaceId: string) {
  let head = peekChatDispatch(workspaceId);
  while (head) {
    acknowledgeChatDispatch(workspaceId, head.id);
    head = peekChatDispatch(workspaceId);
  }
}

beforeEach(() => {
  localStorage.clear();
  WORKSPACE_IDS.forEach(drainDispatches);
  vi.clearAllMocks();
  cancelWorkspaceSelectionChatDispatch();
  mocks.shell.activeWorkspaceId = 'ws-active';
  mocks.shell.workspacesLoading = false;
  mocks.shell.workspaces = [
    { id: 'ws-other', name: 'Other workspace' },
    { id: 'ws-active', name: 'Active workspace' },
  ];
  mocks.adapter.getHomeBriefing.mockResolvedValue({
    greeting: 'Good morning, Marko',
    userName: 'Marko',
    date: '2026-08-29T08:00:00.000Z',
    recentWorkspaces: [],
    suggestedActions: [],
    upNext: [],
    isFirstRun: false,
    needsReviewCount: 0,
  });
  mocks.adapter.getHomeOvernight.mockResolvedValue(null);
  mocks.adapter.quickCapture.mockResolvedValue({ frameId: 'frame-note' });
});

afterEach(() => {
  cleanup();
  cancelWorkspaceSelectionChatDispatch();
  WORKSPACE_IDS.forEach(drainDispatches);
});

function ActiveWorkspaceAutoDeliveryHarness() {
  const pending = useWorkspaceSelectionChatDispatch();
  useEffect(() => {
    if (!pending) return;
    completeWorkspaceSelectionChatDispatch('ws-active', pending.id, () => {
      mocks.navigate('/workspaces/ws-active/chat');
    });
  }, [pending]);
  return null;
}

async function renderHome(withAutoDelivery = false) {
  render(
    <>
      {withAutoDelivery && <ActiveWorkspaceAutoDeliveryHarness />}
      <HomeRoute />
    </>,
  );
  await waitFor(() => expect(screen.getByTestId('home-cockpit')).toBeInTheDocument());
  return screen.getByLabelText('Ask Waggle') as HTMLInputElement;
}

describe('Home Ask to workspace chat dispatch', () => {
  it('queues the prompt only to the explicit active workspace, selects it, and navigates to its chat', async () => {
    const input = await renderHome();
    fireEvent.change(input, { target: { value: '  Prepare the exact board update  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(input.value).toBe(''));

    expect(peekChatDispatch('ws-active')).toEqual(expect.objectContaining({
      content: 'Prepare the exact board update',
    }));
    expect(peekChatDispatch('ws-other')).toBeNull();
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('ws-active');
    expect(mocks.navigate).toHaveBeenCalledWith('/workspaces/ws-active/chat');
    expect(mocks.adapter.quickCapture).not.toHaveBeenCalled();
    expect(peekWorkspaceSelectionChatDispatch()).toBeNull();
  });

  it('does not silently choose a workspace when none is active; it opens the explicit chooser path and preserves the draft', async () => {
    mocks.shell.activeWorkspaceId = null;
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Choose where this should run' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeEnabled());

    expect(mocks.shell.overlays.setShowWorkspaceSwitcher).toHaveBeenCalledWith(true);
    expect(mocks.shell.overlays.setShowCreateWorkspace).not.toHaveBeenCalled();
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(peekChatDispatch('ws-active')).toBeNull();
    expect(peekChatDispatch('ws-other')).toBeNull();
    expect(mocks.adapter.quickCapture).not.toHaveBeenCalled();
    expect(peekWorkspaceSelectionChatDispatch()).toEqual(expect.objectContaining({
      content: 'Choose where this should run',
    }));
    expect(input.value).toBe('Choose where this should run');
  });

  it('does not auto-retry a failed direct transition behind the preserved draft', async () => {
    mocks.navigate.mockImplementationOnce(() => { throw new Error('router unavailable'); });
    const input = await renderHome(true);
    fireEvent.change(input, { target: { value: 'Retry only after navigation works' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeEnabled());

    expect(peekChatDispatch('ws-active')).toBeNull();
    expect(peekWorkspaceSelectionChatDispatch()).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
    expect(input.value).toBe('Retry only after navigation works');
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('does not leave a failed Home prompt behind an older queued dispatch', async () => {
    const older = enqueueChatDispatch('ws-active', 'Already queued');
    mocks.navigate.mockImplementationOnce(() => { throw new Error('router unavailable'); });
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Do not replay this later' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());

    expect(peekChatDispatch('ws-active')).toEqual(older);
    acknowledgeChatDispatch('ws-active', older.id);
    expect(peekChatDispatch('ws-active')).toBeNull();
    expect(input.value).toBe('Do not replay this later');
  });

  it('replaces a staged loading intent before a direct retry can dispatch', async () => {
    stageWorkspaceSelectionChatDispatch('Old loading attempt');
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Current explicit retry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(input.value).toBe(''));

    expect(peekWorkspaceSelectionChatDispatch()).toBeNull();
    expect(peekChatDispatch('ws-active')).toEqual(expect.objectContaining({
      content: 'Current explicit retry',
    }));
  });

  it('rejects a stale active workspace id instead of dispatching into an unknown workspace', async () => {
    mocks.shell.activeWorkspaceId = 'ws-stale';
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Keep this out of the wrong workspace' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeEnabled());

    expect(mocks.shell.overlays.setShowWorkspaceSwitcher).toHaveBeenCalledWith(true);
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(peekChatDispatch('ws-active')).toBeNull();
    expect(peekChatDispatch('ws-other')).toBeNull();
    expect(peekWorkspaceSelectionChatDispatch()).toEqual(expect.objectContaining({
      content: 'Keep this out of the wrong workspace',
    }));
    expect(input.value).toBe('Keep this out of the wrong workspace');
  });

  it('opens workspace creation when there is no workspace to choose and preserves the draft', async () => {
    mocks.shell.activeWorkspaceId = null;
    mocks.shell.workspaces = [];
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Start after workspace setup' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeEnabled());

    expect(mocks.shell.overlays.setShowCreateWorkspace).toHaveBeenCalledWith(true);
    expect(mocks.shell.overlays.setShowWorkspaceSwitcher).not.toHaveBeenCalled();
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(peekWorkspaceSelectionChatDispatch()).toBeNull();
    expect(input.value).toBe('Start after workspace setup');
  });

  it('stages the intent without opening create or chooser while workspaces are still loading', async () => {
    mocks.shell.activeWorkspaceId = 'ws-active';
    mocks.shell.workspaces = [];
    mocks.shell.workspacesLoading = true;
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Wait for workspace inventory' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    await waitFor(() => expect(send).toBeEnabled());

    expect(mocks.shell.overlays.setShowCreateWorkspace).not.toHaveBeenCalled();
    expect(mocks.shell.overlays.setShowWorkspaceSwitcher).not.toHaveBeenCalled();
    expect(peekWorkspaceSelectionChatDispatch()).toEqual(expect.objectContaining({
      content: 'Wait for workspace inventory',
    }));
    expect(input.value).toBe('Wait for workspace inventory');
  });

  it('moves a staged chooser intent atomically into the workspace selected next', () => {
    const staged = stageWorkspaceSelectionChatDispatch('Continue after selection');
    const navigate = vi.fn();
    const selectWorkspace = vi.fn();
    const closeChooser = vi.fn();

    expect(completeWorkspaceSelectionChatDispatch(
      'ws-other',
      staged.id,
      () => {
        navigate('/workspaces/ws-other/chat');
        selectWorkspace('ws-other');
        closeChooser();
      },
    )).toEqual(staged);
    expect(navigate).toHaveBeenCalledWith('/workspaces/ws-other/chat');
    expect(selectWorkspace).toHaveBeenCalledWith('ws-other');
    expect(closeChooser).toHaveBeenCalledOnce();
    expect(peekWorkspaceSelectionChatDispatch()).toBeNull();
    expect(peekChatDispatch('ws-other')).toEqual(staged);
    expect(peekChatDispatch('ws-active')).toBeNull();
  });

  it('keeps the staged chooser intent when the chat route transition throws', () => {
    const staged = stageWorkspaceSelectionChatDispatch('Retry the chooser handoff');

    expect(() => completeWorkspaceSelectionChatDispatch(
      'ws-other',
      staged.id,
      () => { throw new Error('router unavailable'); },
    )).toThrow('router unavailable');
    expect(peekWorkspaceSelectionChatDispatch()).toEqual(staged);
    expect(peekChatDispatch('ws-other')).toBeNull();
  });

  it('replaces staged content without leaking global queue capacity', () => {
    const capacityWorkspaces = Array.from({ length: 5 }, (_, index) => `ws-capacity-${index}`);
    try {
      const first = stageWorkspaceSelectionChatDispatch('First staged intent');
      const replacement = stageWorkspaceSelectionChatDispatch('Replacement staged intent');
      expect(replacement.id).not.toBe(first.id);
      expect(peekWorkspaceSelectionChatDispatch()).toEqual(replacement);

      for (let index = 0; index < 99; index += 1) {
        enqueueChatDispatch(capacityWorkspaces[Math.floor(index / 20)], `queued-${index}`);
      }
      expect(() => enqueueChatDispatch(capacityWorkspaces[4], 'over global capacity')).toThrow(
        'Chat dispatch queue is full',
      );

      expect(cancelWorkspaceSelectionChatDispatch(replacement.id)).toBe(true);
      expect(() => enqueueChatDispatch(capacityWorkspaces[4], 'capacity reclaimed')).not.toThrow();
    } finally {
      capacityWorkspaces.forEach(drainDispatches);
      cancelWorkspaceSelectionChatDispatch();
    }
  });

  it('keeps the Home plus action as a note quick-capture and never dispatches it to chat', async () => {
    const input = await renderHome();
    fireEvent.change(input, { target: { value: 'Remember this privately' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quick capture' }));

    expect(mocks.adapter.quickCapture).toHaveBeenCalledWith({
      kind: 'note',
      content: 'Remember this privately',
    });
    expect(peekChatDispatch('ws-active')).toBeNull();
    expect(peekWorkspaceSelectionChatDispatch()).toBeNull();
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
