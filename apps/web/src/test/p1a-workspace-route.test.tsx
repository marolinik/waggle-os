/**
 * P1a review finding — WorkspaceRoute URL→shell sync (§2.1: the URL is the
 * single source of truth). activeWorkspaceId is parallel state only updated
 * through explicit selectWorkspace call sites; two sanctioned navigation
 * paths bypass all of them (typed deep links — W2A: useWorkspaces no longer
 * auto-selects data[0], so this sync also persists the deep link — and browser
 * Back/Forward). WorkspaceRoute must reconcile the
 * routed :workspaceId into shell state so shell-global surfaces (StatusBar,
 * PersonaSwitcher, Ctrl+Shift+N / nav-Chat) act on the on-screen workspace.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  shell: {
    workspaces: [
      { id: 'ws-a', name: 'Alpha' },
      { id: 'ws-b', name: 'Beta' },
    ],
    activeWorkspaceId: null as string | null,
    selectWorkspace: vi.fn(),
  },
}));

vi.mock('@/providers/ShellContext', () => ({
  useShell: () => mocks.shell,
}));
// The route's render target is pinned elsewhere (p1a-chat-state §5.2 tests);
// here only the sync side effect is under test, so the heavy surfaces stub out.
vi.mock('@/components/os/apps/WorkspaceDesktopApp', () => ({
  default: () => <div data-testid="wsd-stub" />,
}));
vi.mock('@/components/os/ChatHost', () => ({
  default: () => null,
  ChatSlot: () => <div data-testid="chat-slot-stub" />,
}));

import WorkspaceRoute from '@/routes/WorkspaceRoute';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="workspaces/:workspaceId/:tab?" element={<WorkspaceRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.shell.activeWorkspaceId = null;
});
afterEach(() => cleanup());

describe('WorkspaceRoute URL→shell sync (review finding)', () => {
  it('syncs the routed workspace into shell state when it differs from activeWorkspaceId', () => {
    mocks.shell.activeWorkspaceId = 'ws-b'; // e.g. Back/Forward landed on A while B is "active"
    renderAt('/workspaces/ws-a/chat');
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('ws-a');
  });

  it('syncs on a typed deep link before the workspace fetch settles (activeWorkspaceId null)', () => {
    mocks.shell.activeWorkspaceId = null; // fresh tab, useWorkspaces not resolved yet
    renderAt('/workspaces/ws-b/chat');
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('ws-b');
  });

  it('does not re-select when the routed workspace is already active', () => {
    mocks.shell.activeWorkspaceId = 'ws-a';
    renderAt('/workspaces/ws-a');
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
  });

  it("never syncs the 'local-default' pre-fetch placeholder", () => {
    mocks.shell.activeWorkspaceId = 'ws-a';
    renderAt('/workspaces/local-default');
    expect(mocks.shell.selectWorkspace).not.toHaveBeenCalled();
  });
});
