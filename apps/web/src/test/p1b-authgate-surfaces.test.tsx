/**
 * P1b D3 — Stage B boot-path surface contracts over a mocked adapter:
 *
 *  - ShellContext tier: a failed getTier touches NEITHER billingTier NOR
 *    trialInfo (the severity-critical silent-FREE class), tierResolved stays
 *    false, and the tier revalidates on connect-settled.
 *  - useBilling: failure keeps tierResolved=false (Billing tab renders the
 *    unresolved state, never 'FREE' as fact).
 *  - useWorkspaces: failure sets the (previously dead) error channel, keeps
 *    a previously-good list, and recovers on connect-settled.
 *  - useChat: a thrown AdapterHttpError-shaped failure renders a status-true
 *    error block ('Backend is offline' reserved for network errors); the
 *    tier-403 copy defers to the UpgradeModal; empty-messages race guarded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { CONNECT_SETTLED_EVENT } from '@/hooks/useRevalidateOnError';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getTier: vi.fn(),
    getWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    patchWorkspace: vi.fn(),
    getPermissions: vi.fn().mockResolvedValue({ defaultAutonomy: 'normal', externalGates: {} }),
    savePermissions: vi.fn(),
    getAgentStatus: vi.fn().mockResolvedValue({ active: 0, agents: [] }),
    getNotificationHistory: vi.fn().mockResolvedValue([]),
    subscribeNotifications: vi.fn().mockReturnValue(() => {}),
    getSystemHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
    getHistory: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    abortAgent: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    getIdentity: vi.fn(),
    searchMemory: vi.fn(),
    getMemoryStats: vi.fn(),
    fetchRaw: vi.fn(),
    getSettings: vi.fn(),
    getTelemetryStatus: vi.fn(),
    getTeamStatus: vi.fn(),
    getServerUrl: vi.fn(),
    // PR5: Settings opens on the Models tab → ModelGate fetches these on mount.
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
    // MODEL-GATE: the mount probe calls these too — absent, the probe's async
    // closure throws (TypeError: not a function) as an UNHANDLED rejection that
    // poisons unrelated tests in the full-suite run. configured:false = the
    // probe's honest "nothing to check" idle path.
    probeModel: vi.fn().mockResolvedValue({ configured: false }),
    probeProvider: vi.fn().mockResolvedValue({ configured: false, valid: false, verified: false }),
  },
}));
vi.mock('@/lib/adapter', () => ({
  adapter: mocks.adapter,
  default: vi.fn(),
  MODEL_SETTINGS_CHANGED_EVENT: 'waggle:model-settings-changed',
}));
vi.mock('@/hooks/use-toast', () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast, toasts: [], dismiss: vi.fn() }),
}));
vi.mock('@/components/os/apps/ChatWindowInstance', () => ({
  default: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid={`chat-instance-${workspaceId}`} />
  ),
}));

/** AdapterHttpError stand-in — the real class is mocked away with the module,
 *  so consumers must duck-type on error.name (that is part of the contract). */
function httpError(status: number, body: unknown, message: string) {
  const e = new Error(message) as Error & { status: number; body: unknown };
  e.name = 'AdapterHttpError';
  e.status = status;
  e.body = body;
  return e;
}

const settleConnect = () =>
  act(() => { window.dispatchEvent(new CustomEvent(CONNECT_SETTLED_EVENT, { detail: { connected: true } })); });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── useWorkspaces ──────────────────────────────────────────────────────────

describe('useWorkspaces (P1b)', () => {
  it('failure sets the error channel and keeps the previous list; connect-settled recovers', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([{ id: 'w1', name: 'Alpha' }]);
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

    mocks.adapter.getWorkspaces.mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBe('Network unavailable');
    expect(result.current.workspaces).toHaveLength(1); // previous list preserved

    mocks.adapter.getWorkspaces.mockResolvedValueOnce([{ id: 'w1', name: 'Alpha' }, { id: 'w2', name: 'Beta' }]);
    settleConnect();
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    expect(result.current.error).toBeNull();
  });

  it('adopts an initial deep-link selection after hydration proves membership', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveInitial!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces.mockReturnValueOnce(new Promise(resolve => { resolveInitial = resolve; }));
    const { result } = renderHook(() => useWorkspaces('profile-a'));

    act(() => result.current.selectWorkspace('deep-link'));
    expect(result.current.activeWorkspaceId).toBeNull();
    await act(async () => {
      resolveInitial([{ id: 'deep-link', name: 'Deep link', group: 'Personal' }]);
      await Promise.resolve();
    });

    expect(result.current.activeWorkspaceId).toBe('deep-link');
    expect(readPersistedWorkspaceId('profile-a')).toBe('deep-link');
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('adopts an externally created workspace only after the authoritative list confirms it', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'existing', name: 'Existing', group: 'Personal' }])
      .mockResolvedValueOnce([
        { id: 'existing', name: 'Existing', group: 'Personal' },
        { id: 'spawned', name: 'Spawned workspace', group: 'Personal' },
      ]);
    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

    act(() => result.current.selectWorkspace('spawned'));

    expect(result.current.activeWorkspaceId).toBeNull();
    expect(readPersistedWorkspaceId('profile-a')).toBeNull();
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('spawned'));
    expect(readPersistedWorkspaceId('profile-a')).toBe('spawned');
  });

  it('retries external-candidate verification after a transient failure', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'existing', name: 'Existing', group: 'Personal' }])
      .mockRejectedValueOnce(new Error('Temporary network failure'))
      .mockResolvedValueOnce([
        { id: 'existing', name: 'Existing', group: 'Personal' },
        { id: 'spawned', name: 'Spawned workspace', group: 'Personal' },
      ]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWorkspaces('profile-a'));

    try {
      await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
      act(() => result.current.selectWorkspace('spawned'));
      await waitFor(() => expect(result.current.error).toBe('Temporary network failure'));
      expect(result.current.activeWorkspaceId).toBeNull();

      act(() => result.current.selectWorkspace('spawned'));
      await waitFor(() => expect(result.current.activeWorkspaceId).toBe('spawned'));
      expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(3);
      expect(readPersistedWorkspaceId('profile-a')).toBe('spawned');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('keeps the latest verified selection when an older external-candidate refresh finishes', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveRefresh!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'existing', name: 'Existing', group: 'Personal' }])
      .mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));
    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

    act(() => result.current.selectWorkspace('spawned'));
    act(() => result.current.selectWorkspace('existing'));
    await act(async () => {
      resolveRefresh([
        { id: 'existing', name: 'Existing', group: 'Personal' },
        { id: 'spawned', name: 'Spawned workspace', group: 'Personal' },
      ]);
      await Promise.resolve();
    });

    expect(result.current.activeWorkspaceId).toBe('existing');
    expect(readPersistedWorkspaceId('profile-a')).toBe('existing');
  });

  it('bounds revalidation for a retained route whose workspace does not exist', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'existing', name: 'Existing', group: 'Personal' }])
      .mockResolvedValueOnce([{ id: 'existing', name: 'Existing', group: 'Personal' }]);
    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

    act(() => result.current.selectWorkspace('missing-route'));
    await waitFor(() => expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.selectWorkspace('missing-route'));

    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2);
    expect(result.current.activeWorkspaceId).toBeNull();
  });

  it('drops a pending profile-A selection across an A-to-B-to-A round trip', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveOldProfileA!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'existing-a', name: 'Existing A', group: 'Personal' }])
      .mockReturnValueOnce(new Promise(resolve => { resolveOldProfileA = resolve; }))
      .mockResolvedValueOnce([{ id: 'workspace-b', name: 'Workspace B', group: 'Personal' }])
      .mockResolvedValueOnce([
        { id: 'existing-a', name: 'Existing A', group: 'Personal' },
        { id: 'spawned-a', name: 'Spawned A', group: 'Personal' },
      ]);
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('existing-a'));
    act(() => result.current.selectWorkspace('spawned-a'));

    rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('workspace-b'));
    rerender({ profileId: 'profile-a' });
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));

    expect(result.current.activeWorkspaceId).toBeNull();
    await act(async () => {
      resolveOldProfileA([
        { id: 'existing-a', name: 'Existing A', group: 'Personal' },
        { id: 'spawned-a', name: 'Spawned A', group: 'Personal' },
      ]);
      await Promise.resolve();
    });
    expect(result.current.activeWorkspaceId).toBeNull();
  });

  it('never exposes the prior profile while the next profile request is pending', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveProfileB!: (workspaces: Array<{ id: string; name: string }>) => void;
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'profile-a-private', name: 'Profile A private' }])
      .mockReturnValueOnce(new Promise(resolve => {
        resolveProfileB = resolve;
      }))
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-a-private'));
    const staleProfileASelect = result.current.selectWorkspace;
    act(() => result.current.selectWorkspace('profile-a-private'));

    rerender({ profileId: 'profile-b' });
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(result.current.loading).toBe(true);
    act(() => staleProfileASelect('profile-a-unverified'));
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(readPersistedWorkspaceId('profile-b')).toBeNull();
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveProfileB([{ id: 'profile-b', name: 'Profile B' }]);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-b'));
  });

  it('ignores a captured profile-A refresh without invalidating profile-B hydration', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveProfileB!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'profile-a', name: 'Profile A', group: 'Personal' }])
      .mockReturnValueOnce(new Promise(resolve => { resolveProfileB = resolve; }))
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-a'));
    const staleProfileARefresh = result.current.refresh;

    rerender({ profileId: 'profile-b' });
    act(() => { void staleProfileARefresh(); });
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveProfileB([{ id: 'profile-b', name: 'Profile B', group: 'Personal' }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-b'));
    expect(result.current.loading).toBe(false);
  });

  it.each(['create', 'delete', 'patch'] as const)(
    'does not invoke the adapter from a captured profile-A %s callback after switching to B',
    async (operation) => {
      const { useWorkspaces } = await import('@/hooks/useWorkspaces');
      mocks.adapter.getWorkspaces.mockReset();
      mocks.adapter.getWorkspaces
        .mockResolvedValueOnce([{ id: 'shared-id', name: 'Profile A', group: 'Personal' }])
        .mockResolvedValueOnce([{ id: 'shared-id', name: 'Profile B', group: 'Personal' }]);
      mocks.adapter.createWorkspace.mockResolvedValue({ id: 'created-a', name: 'Created A', group: 'Personal' });
      mocks.adapter.deleteWorkspace.mockResolvedValue(undefined);
      mocks.adapter.patchWorkspace.mockResolvedValue(undefined);
      const { result, rerender } = renderHook(
        ({ profileId }) => useWorkspaces(profileId),
        { initialProps: { profileId: 'profile-a' } },
      );
      await waitFor(() => expect(result.current.workspaces[0]?.name).toBe('Profile A'));
      const staleCreate = result.current.createWorkspace;
      const staleDelete = result.current.deleteWorkspace;
      const stalePatch = result.current.patchWorkspace;

      rerender({ profileId: 'profile-b' });
      await waitFor(() => expect(result.current.workspaces[0]?.name).toBe('Profile B'));
      mocks.adapter.createWorkspace.mockClear();
      mocks.adapter.deleteWorkspace.mockClear();
      mocks.adapter.patchWorkspace.mockClear();

      await act(async () => {
        if (operation === 'create') await staleCreate({ name: 'Wrong owner', group: 'Personal' });
        else if (operation === 'delete') await staleDelete('shared-id');
        else await stalePatch('shared-id', { name: 'Wrong owner' });
      });

      const adapterMutation = operation === 'create'
        ? mocks.adapter.createWorkspace
        : operation === 'delete'
          ? mocks.adapter.deleteWorkspace
          : mocks.adapter.patchWorkspace;
      expect(adapterMutation).not.toHaveBeenCalled();
      expect(result.current.workspaces[0]?.name).toBe('Profile B');
    },
  );

  it('ignores an in-flight profile-A create after an A-to-B-to-A round trip', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveOldCreate!: (workspace: { id: string; name: string; group: string }) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'current-a', name: 'Current A', group: 'Personal' }])
      .mockResolvedValueOnce([{ id: 'current-b', name: 'Current B', group: 'Personal' }])
      .mockResolvedValueOnce([{ id: 'new-a', name: 'New A state', group: 'Personal' }]);
    mocks.adapter.createWorkspace.mockReturnValueOnce(new Promise(resolve => { resolveOldCreate = resolve; }));
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('current-a'));
    let oldCreate!: Promise<unknown>;
    act(() => { oldCreate = result.current.createWorkspace({ name: 'Old A create', group: 'Personal' }); });

    rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('current-b'));
    rerender({ profileId: 'profile-a' });
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('new-a'));

    await act(async () => {
      resolveOldCreate({ id: 'stale-created-a', name: 'Stale created A', group: 'Personal' });
      await oldCreate;
    });
    expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['new-a']);
    expect(result.current.activeWorkspaceId).toBeNull();
  });

  it('does not carry a same-id workspace selection into another profile', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'default-workspace', name: 'Profile A default', group: 'Personal' }])
      .mockResolvedValueOnce([{ id: 'default-workspace', name: 'Profile B default', group: 'Personal' }]);

    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.workspaces[0]?.name).toBe('Profile A default'));
    act(() => result.current.selectWorkspace('default-workspace'));
    expect(result.current.activeWorkspace?.name).toBe('Profile A default');
    expect(readPersistedWorkspaceId('profile-a')).toBe('default-workspace');
    expect(readPersistedWorkspaceId('profile-b')).toBeNull();

    rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(result.current.workspaces[0]?.name).toBe('Profile B default'));

    expect(result.current.activeWorkspaceId).toBeNull();
    expect(result.current.activeWorkspace).toBeNull();
    expect(readPersistedWorkspaceId('profile-a')).toBe('default-workspace');
  });

  it('does not carry an offline local workspace selection into another profile', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { persistWorkspaceId } = await import('@/lib/workspace-selection');
    persistWorkspaceId('local-profile-a', 'profile-a');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeWorkspaceId).toBe('local-profile-a');

    rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeWorkspaceId).toBeNull();
  });

  it('migrates a valid legacy selection only after the resolved profile list proves ownership', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'legacy-workspace');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([
      { id: 'legacy-workspace', name: 'Legacy Workspace', group: 'Personal' },
    ]);

    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('legacy-workspace'));

    expect(readPersistedWorkspaceId('profile-a')).toBe('legacy-workspace');
    expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();
  });

  it('retires an unverified legacy local selection instead of assigning it to a profile', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'local-unknown-owner');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([
      { id: 'profile-a-workspace', name: 'Profile A Workspace', group: 'Personal' },
    ]);

    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeWorkspaceId).toBeNull();
    expect(readPersistedWorkspaceId('profile-a')).toBeNull();
    expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();
  });

  it('preserves legacy migration across an unresolved null-to-profile bootstrap', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'legacy-workspace');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveUnbound!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockReturnValueOnce(new Promise(resolve => { resolveUnbound = resolve; }))
      .mockResolvedValueOnce([{ id: 'legacy-workspace', name: 'Legacy Workspace', group: 'Personal' }]);

    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: null as string | null } },
    );
    rerender({ profileId: 'profile-a' });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('legacy-workspace'));
    expect(readPersistedWorkspaceId('profile-a')).toBe('legacy-workspace');

    await act(async () => {
      resolveUnbound([]);
      await Promise.resolve();
    });
    expect(result.current.activeWorkspaceId).toBe('legacy-workspace');
    expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();
  });

  it('migrates the legacy key exactly once under React StrictMode', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'legacy-workspace');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces.mockResolvedValue([
      { id: 'legacy-workspace', name: 'Legacy Workspace', group: 'Personal' },
    ]);

    const { result } = renderHook(() => useWorkspaces('profile-a'), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('legacy-workspace'));

    expect(readPersistedWorkspaceId('profile-a')).toBe('legacy-workspace');
    expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();
  });

  it('restores each profile selection and a profile-B denial does not erase profile A', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'workspace-a', name: 'Workspace A', group: 'Personal' }])
      .mockResolvedValueOnce([{ id: 'workspace-b', name: 'Workspace B', group: 'Personal' }])
      .mockRejectedValueOnce(httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'))
      .mockResolvedValueOnce([{ id: 'workspace-a', name: 'Workspace A', group: 'Personal' }]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );

    try {
      await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('workspace-a'));
      act(() => result.current.selectWorkspace('workspace-a'));
      rerender({ profileId: 'profile-b' });
      await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('workspace-b'));
      act(() => result.current.selectWorkspace('workspace-b'));
      await act(async () => { await result.current.refresh(); });
      expect(result.current.accessDenied).toBe(true);
      expect(readPersistedWorkspaceId('profile-b')).toBeNull();
      expect(readPersistedWorkspaceId('profile-a')).toBe('workspace-a');

      rerender({ profileId: 'profile-a' });
      await waitFor(() => expect(result.current.activeWorkspaceId).toBe('workspace-a'));
      expect(result.current.activeWorkspace?.name).toBe('Workspace A');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it.each([
    [401, 'Session expired'],
    [403, 'Forbidden'],
  ] as const)('authorization denial (%s) clears retained workspaces and selection', async (status, message) => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([
      { id: 'private-a', name: 'Private A', group: 'Personal' },
    ]);
    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
    act(() => result.current.selectWorkspace('private-a'));
    const preDenialSelect = result.current.selectWorkspace;

    mocks.adapter.getWorkspaces.mockRejectedValueOnce(
      httpError(status, { code: 'AUTH_DENIED' }, message),
    );
    await act(async () => { await result.current.refresh(); });

    expect(result.current.workspaces).toEqual([]);
    expect(result.current.activeWorkspace).toBeNull();
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(readPersistedWorkspaceId('profile-a')).toBeNull();
    expect(result.current.error).toBe(message);
    expect(result.current.accessDenied).toBe(true);
    act(() => {
      preDenialSelect('private-a');
      result.current.selectWorkspace('private-a');
      result.current.selectWorkspace('local-private-a');
    });
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(readPersistedWorkspaceId('profile-a')).toBeNull();
  });

  it('retires an unknown-owner legacy selection when a resolved profile is denied', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'same-id');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockRejectedValueOnce(httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'))
      .mockResolvedValueOnce([{ id: 'same-id', name: 'Profile B same id', group: 'Personal' }]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );

    try {
      await waitFor(() => expect(result.current.accessDenied).toBe(true));
      expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();

      rerender({ profileId: 'profile-b' });
      await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('same-id'));
      expect(result.current.activeWorkspaceId).toBeNull();
      expect(readPersistedWorkspaceId('profile-b')).toBeNull();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('retires unknown-owner legacy selection when a mutation denies access before hydration', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'same-id');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveProfileA!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockReturnValueOnce(new Promise(resolve => { resolveProfileA = resolve; }))
      .mockResolvedValueOnce([{ id: 'same-id', name: 'Profile B same id', group: 'Personal' }]);
    mocks.adapter.createWorkspace.mockRejectedValueOnce(
      httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'),
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );

    try {
      await act(async () => {
        await result.current.createWorkspace({ name: 'Denied', group: 'Personal' });
      });
      expect(result.current.accessDenied).toBe(true);
      expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();

      rerender({ profileId: 'profile-b' });
      await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('same-id'));
      expect(result.current.activeWorkspaceId).toBeNull();
      expect(readPersistedWorkspaceId('profile-b')).toBeNull();

      await act(async () => {
        resolveProfileA([{ id: 'same-id', name: 'Profile A same id', group: 'Personal' }]);
        await Promise.resolve();
      });
      expect(result.current.activeWorkspaceId).toBeNull();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('keeps access revoked when a later create failure is not an authorization decision', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'private-a', name: 'Private A', group: 'Personal' }])
      .mockRejectedValueOnce(httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'));
    mocks.adapter.createWorkspace.mockRejectedValueOnce(
      httpError(500, { code: 'UPSTREAM_FAILURE' }, 'Storage temporarily unavailable'),
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWorkspaces('profile-a'));

    try {
      await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
      await act(async () => { await result.current.refresh(); });
      expect(result.current.accessDenied).toBe(true);

      await act(async () => {
        await result.current.createWorkspace({ name: 'Still denied', group: 'Personal' });
      });

      expect(result.current.accessDenied).toBe(true);
      expect(result.current.workspaces).toEqual([]);
      expect(result.current.activeWorkspaceId).toBeNull();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('keeps access revoked when revalidation later fails transiently', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'private-a', name: 'Private A', group: 'Personal' }])
      .mockRejectedValueOnce(httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'))
      .mockRejectedValueOnce(new Error('Network unavailable'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWorkspaces('profile-a'));

    try {
      await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
      await act(async () => { await result.current.refresh(); });
      expect(result.current.accessDenied).toBe(true);

      await act(async () => { await result.current.refresh(); });
      expect(result.current.accessDenied).toBe(true);
      expect(result.current.error).toBe('Network unavailable');
      expect(result.current.workspaces).toEqual([]);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('does not expose a profile A error while profile B is hydrating', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveProfileB!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockRejectedValueOnce(new Error('Profile A offline'))
      .mockReturnValueOnce(new Promise(resolve => {
        resolveProfileB = resolve;
      }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );

    try {
      await waitFor(() => expect(result.current.error).toBe('Profile A offline'));
      rerender({ profileId: 'profile-b' });

      expect(result.current.error).toBeNull();
      expect(result.current.workspaces).toEqual([]);
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveProfileB([{ id: 'profile-b', name: 'Profile B', group: 'Personal' }]);
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-b'));
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it.each(['create', 'delete', 'patch'] as const)(
    'authorization denial during %s revokes retained workspaces and selection',
    async (operation) => {
      window.localStorage.clear();
      const { useWorkspaces } = await import('@/hooks/useWorkspaces');
      const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
      mocks.adapter.getWorkspaces.mockReset();
      mocks.adapter.getWorkspaces.mockResolvedValueOnce([
        { id: 'private-a', name: 'Private A', group: 'Personal' },
      ]);
      const denial = httpError(401, { code: 'AUTH_DENIED' }, 'Session expired');
      if (operation === 'create') mocks.adapter.createWorkspace.mockRejectedValueOnce(denial);
      if (operation === 'delete') mocks.adapter.deleteWorkspace.mockRejectedValueOnce(denial);
      if (operation === 'patch') mocks.adapter.patchWorkspace.mockRejectedValueOnce(denial);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useWorkspaces('profile-a'));

      try {
        await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
        act(() => result.current.selectWorkspace('private-a'));

        await act(async () => {
          if (operation === 'create') {
            await result.current.createWorkspace({ name: 'Denied', group: 'Personal' });
          } else if (operation === 'delete') {
            await result.current.deleteWorkspace('private-a');
          } else {
            await result.current.patchWorkspace('private-a', { name: 'Denied' });
          }
        });

        expect(result.current.workspaces).toEqual([]);
        expect(result.current.activeWorkspaceId).toBeNull();
        expect(readPersistedWorkspaceId('profile-a')).toBeNull();
        expect(result.current.error).toBe('Session expired');
        expect(result.current.accessDenied).toBe(true);
      } finally {
        consoleSpy.mockRestore();
      }
    },
  );

  it.each([
    ['create', httpError(403, { tier: 'FREE', limit: 3, current: 3 }, 'Workspace limit reached')],
    ['patch', httpError(403, { code: 'VIEWER_READ_ONLY' }, 'Viewers cannot modify team workspaces')],
    ['create', httpError(500, { code: 'UPSTREAM_FAILURE' }, 'Permission denied by storage provider')],
  ] as const)('non-revoking failure during %s preserves readable workspaces', async (operation, denial) => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([
      { id: 'readable', name: 'Readable', group: 'Personal' },
    ]);
    if (operation === 'create') mocks.adapter.createWorkspace.mockRejectedValueOnce(denial);
    else mocks.adapter.patchWorkspace.mockRejectedValueOnce(denial);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWorkspaces('profile-a'));

    try {
      await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
      await act(async () => {
        if (operation === 'create') {
          await result.current.createWorkspace({ name: 'Denied', group: 'Personal' });
        } else {
          await result.current.patchWorkspace('readable', { name: 'Denied' });
        }
      });
      expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['readable']);
      expect(result.current.accessDenied).toBe(false);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it.each(['create', 'delete', 'patch'] as const)(
    'does not let a profile A %s invalidate profile B hydration',
    async (operation) => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveMutation!: () => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'profile-a', name: 'Profile A', group: 'Personal' }])
      .mockResolvedValueOnce([{ id: 'profile-b', name: 'Profile B', group: 'Personal' }]);
    if (operation === 'create') {
      mocks.adapter.createWorkspace.mockReturnValueOnce(new Promise(resolve => {
        resolveMutation = () => resolve({ id: 'created-a', name: 'Created A', group: 'Personal' });
      }));
    } else {
      mocks.adapter[operation === 'delete' ? 'deleteWorkspace' : 'patchWorkspace']
        .mockReturnValueOnce(new Promise<void>(resolve => {
          resolveMutation = () => resolve();
        }));
    }
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-a'));

    let pendingMutation!: Promise<unknown>;
    act(() => {
      pendingMutation = operation === 'create'
        ? result.current.createWorkspace({ name: 'Created A', group: 'Personal' })
        : operation === 'delete'
          ? result.current.deleteWorkspace('profile-a')
          : result.current.patchWorkspace('profile-a', { name: 'Profile A updated' });
    });
    rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-b'));
    act(() => result.current.selectWorkspace('profile-b'));

    await act(async () => {
      resolveMutation();
      expect(await pendingMutation).toBe(operation === 'create' ? null : false);
    });

    expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['profile-b']);
    expect(result.current.activeWorkspaceId).toBe('profile-b');
    expect(readPersistedWorkspaceId('profile-b')).toBe('profile-b');
    expect(result.current.loading).toBe(false);
    },
  );

  it.each(['create', 'delete', 'patch'] as const)(
    'never relabels profile A data when profile B %s settles before hydration',
    async (operation) => {
      const { useWorkspaces } = await import('@/hooks/useWorkspaces');
      let resolveOldProfileB!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
      mocks.adapter.getWorkspaces.mockReset();
      mocks.adapter.getWorkspaces
        .mockResolvedValueOnce([{ id: 'profile-a-private', name: 'Profile A private', group: 'Personal' }])
        .mockReturnValueOnce(new Promise(resolve => {
          resolveOldProfileB = resolve;
        }));
      if (operation === 'create') {
        mocks.adapter.createWorkspace.mockResolvedValueOnce({ id: 'created-b', name: 'Created B', group: 'Personal' });
        mocks.adapter.getWorkspaces.mockResolvedValueOnce([
          { id: 'existing-b', name: 'Existing B', group: 'Personal' },
          { id: 'created-b', name: 'Created B', group: 'Personal' },
        ]);
      } else if (operation === 'delete') {
        mocks.adapter.deleteWorkspace.mockResolvedValueOnce(undefined);
        mocks.adapter.getWorkspaces.mockResolvedValueOnce([]);
      } else {
        mocks.adapter.patchWorkspace.mockResolvedValueOnce(undefined);
        mocks.adapter.getWorkspaces.mockResolvedValueOnce([
          { id: 'profile-b', name: 'Profile B updated', group: 'Personal' },
        ]);
      }
      const { result, rerender } = renderHook(
        ({ profileId }) => useWorkspaces(profileId),
        { initialProps: { profileId: 'profile-a' } },
      );
      await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('profile-a-private'));

      rerender({ profileId: 'profile-b' });
      expect(result.current.workspaces).toEqual([]);
      await act(async () => {
        if (operation === 'create') {
          await result.current.createWorkspace({ name: 'Created B', group: 'Personal' });
        } else if (operation === 'delete') {
          await result.current.deleteWorkspace('profile-b');
        } else {
          await result.current.patchWorkspace('profile-b', { name: 'Profile B updated' });
        }
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.workspaces.map(workspace => workspace.id)).not.toContain('profile-a-private');
      expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(
        operation === 'create' ? ['existing-b', 'created-b'] : operation === 'patch' ? ['profile-b'] : [],
      );

      await act(async () => {
        resolveOldProfileB([{ id: 'stale-b', name: 'Stale B', group: 'Personal' }]);
        await Promise.resolve();
      });
      expect(result.current.workspaces.map(workspace => workspace.id)).not.toContain('profile-a-private');
    },
  );

  it('does not let a pending list undo authorization denial from a mutation', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveRefresh!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'private-a', name: 'Private A', group: 'Personal' }])
      .mockReturnValueOnce(new Promise(resolve => {
        resolveRefresh = resolve;
      }));
    mocks.adapter.createWorkspace.mockRejectedValueOnce(
      httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'),
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWorkspaces('profile-a'));

    try {
      await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
      act(() => result.current.selectWorkspace('private-a'));
      let pendingRefresh!: Promise<void>;
      act(() => { pendingRefresh = result.current.refresh(); });
      await act(async () => {
        await result.current.createWorkspace({ name: 'Denied', group: 'Personal' });
      });
      expect(result.current.workspaces).toEqual([]);
      expect(result.current.accessDenied).toBe(true);

      await act(async () => {
        resolveRefresh([{ id: 'private-a', name: 'Private A', group: 'Personal' }]);
        await pendingRefresh;
      });
      expect(result.current.workspaces).toEqual([]);
      expect(result.current.accessDenied).toBe(true);
      expect(result.current.loading).toBe(false);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it.each(['create', 'delete', 'patch'] as const)(
    'does not let a pre-denial %s success restore revoked workspace access',
    async (operation) => {
      const { useWorkspaces } = await import('@/hooks/useWorkspaces');
      let resolveMutation!: () => void;
      mocks.adapter.getWorkspaces.mockReset();
      mocks.adapter.getWorkspaces
        .mockResolvedValueOnce([{ id: 'private-a', name: 'Private A', group: 'Personal' }])
        .mockRejectedValueOnce(httpError(401, { code: 'AUTH_DENIED' }, 'Session expired'));
      if (operation === 'create') {
        mocks.adapter.createWorkspace.mockReturnValueOnce(new Promise(resolve => {
          resolveMutation = () => resolve({ id: 'created-a', name: 'Created A', group: 'Personal' });
        }));
      } else {
        mocks.adapter[operation === 'delete' ? 'deleteWorkspace' : 'patchWorkspace']
          .mockReturnValueOnce(new Promise<void>(resolve => {
            resolveMutation = () => resolve();
          }));
      }
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useWorkspaces('profile-a'));

      try {
        await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
        let pendingMutation!: Promise<unknown>;
        act(() => {
          pendingMutation = operation === 'create'
            ? result.current.createWorkspace({ name: 'Created A', group: 'Personal' })
            : operation === 'delete'
              ? result.current.deleteWorkspace('private-a')
              : result.current.patchWorkspace('private-a', { name: 'Updated A' });
        });
        await act(async () => { await result.current.refresh(); });
        expect(result.current.accessDenied).toBe(true);

        await act(async () => {
          resolveMutation();
          expect(await pendingMutation).toBe(operation === 'create' ? null : false);
        });
        expect(result.current.workspaces).toEqual([]);
        expect(result.current.accessDenied).toBe(true);
      } finally {
        consoleSpy.mockRestore();
      }
    },
  );

  it('failed create does not invent or activate a phantom workspace', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockResolvedValue([{ id: 'w1', name: 'Alpha', group: 'Personal' }]);
    mocks.adapter.createWorkspace.mockRejectedValue(new Error('Local storage path is invalid'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useWorkspaces());

    try {
      await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
      act(() => result.current.selectWorkspace('w1'));
      expect(readPersistedWorkspaceId()).toBe('w1');

      let created: Awaited<ReturnType<typeof result.current.createWorkspace>> | undefined;
      await act(async () => {
        created = await result.current.createWorkspace({
          name: 'Broken Linked Workspace',
          group: 'Personal',
          storageType: 'local',
          storagePath: 'Z:\\missing-workspace',
        });
      });

      expect(created).toBeNull();
      expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['w1']);
      expect(result.current.activeWorkspaceId).toBe('w1');
      expect(readPersistedWorkspaceId()).toBe('w1');
      expect(result.current.error).toBe('Local storage path is invalid');
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Couldn't create workspace",
        description: 'Local storage path is invalid',
        variant: 'destructive',
      });
    } finally {
      consoleSpy.mockRestore();
    }
  });
  it('refetches the authoritative list when create outruns initial hydration', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveInitialList!: (workspaces: Array<{ id: string; name: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockReturnValueOnce(new Promise(resolve => {
        resolveInitialList = resolve;
      }))
      .mockResolvedValueOnce([
        { id: 'w-old', name: 'Existing workspace' },
        { id: 'w-new', name: 'New workspace' },
      ]);
    mocks.adapter.createWorkspace.mockResolvedValueOnce({ id: 'w-new', name: 'New workspace' });
    const { result } = renderHook(() => useWorkspaces());

    await act(async () => {
      await result.current.createWorkspace({ name: 'New workspace', group: 'Personal' });
    });
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));

    await act(async () => {
      resolveInitialList([{ id: 'w-old', name: 'Older snapshot' }]);
      await Promise.resolve();
    });

    expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['w-old', 'w-new']);
    expect(result.current.activeWorkspaceId).toBe('w-new');
    expect(readPersistedWorkspaceId()).toBe('w-new');
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2);
  });

  it('retires the legacy selection when create succeeds before initial hydration', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('waggle:active-workspace-v1', 'same-id');
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce([{ id: 'same-id', name: 'Profile B same id', group: 'Personal' }]);
    mocks.adapter.createWorkspace.mockResolvedValueOnce({ id: 'created-a', name: 'Created A', group: 'Personal' });
    const { result, rerender } = renderHook(
      ({ profileId }) => useWorkspaces(profileId),
      { initialProps: { profileId: 'profile-a' } },
    );

    await act(async () => {
      await result.current.createWorkspace({ name: 'Created A', group: 'Personal' });
    });
    expect(window.localStorage.getItem('waggle:active-workspace-v1')).toBeNull();

    rerender({ profileId: 'profile-b' });
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('same-id'));
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(readPersistedWorkspaceId('profile-b')).toBeNull();
  });

  it('keeps a successful workspace patch when an older list resolves late', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([
      { id: 'w1', name: 'Before', group: 'Personal' },
    ]);
    mocks.adapter.patchWorkspace.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => expect(result.current.workspaces[0]?.name).toBe('Before'));

    let resolveRefresh!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReturnValueOnce(new Promise(resolve => {
      resolveRefresh = resolve;
    }));

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      expect(await result.current.patchWorkspace('w1', { name: 'After' })).toBe(true);
    });
    expect(result.current.workspaces[0]?.name).toBe('After');

    await act(async () => {
      resolveRefresh([{ id: 'w1', name: 'Before', group: 'Personal' }]);
      await refreshPromise;
    });

    expect(result.current.workspaces[0]?.name).toBe('After');
    expect(result.current.loading).toBe(false);
  });

  it('retries pending external verification after a successful patch invalidates its fetch', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveOldVerification!: (workspaces: Array<{ id: string; name: string; group: string }>) => void;
    mocks.adapter.getWorkspaces.mockReset();
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'existing', name: 'Existing', group: 'Personal' }])
      .mockReturnValueOnce(new Promise(resolve => { resolveOldVerification = resolve; }))
      .mockResolvedValueOnce([
        { id: 'existing', name: 'Renamed', group: 'Personal' },
        { id: 'spawned', name: 'Spawned workspace', group: 'Personal' },
      ]);
    mocks.adapter.patchWorkspace.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useWorkspaces('profile-a'));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
    act(() => result.current.selectWorkspace('spawned'));

    await act(async () => {
      await result.current.patchWorkspace('existing', { name: 'Renamed' });
    });
    act(() => result.current.selectWorkspace('spawned'));
    await waitFor(() => expect(result.current.activeWorkspaceId).toBe('spawned'));
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveOldVerification([
        { id: 'existing', name: 'Existing', group: 'Personal' },
        { id: 'spawned', name: 'Spawned workspace', group: 'Personal' },
      ]);
      await Promise.resolve();
    });
    expect(result.current.activeWorkspaceId).toBe('spawned');
  });

  it('deduplicates a workspace observed by the list before its create response settles', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    let resolveList!: (workspaces: Array<{ id: string; name: string }>) => void;
    let resolveCreate!: (workspace: { id: string; name: string }) => void;
    mocks.adapter.getWorkspaces.mockReturnValueOnce(new Promise(resolve => {
      resolveList = resolve;
    }));
    mocks.adapter.createWorkspace.mockReturnValueOnce(new Promise(resolve => {
      resolveCreate = resolve;
    }));
    const { result } = renderHook(() => useWorkspaces());

    let pendingCreate!: Promise<unknown>;
    act(() => {
      pendingCreate = result.current.createWorkspace({ name: 'New workspace', group: 'Personal' });
    });
    await act(async () => {
      resolveList([{ id: 'w-new', name: 'New workspace' }]);
      await Promise.resolve();
    });
    expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['w-new']);

    await act(async () => {
      resolveCreate({ id: 'w-new', name: 'New workspace' });
      await pendingCreate;
    });

    expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['w-new']);
    expect(result.current.activeWorkspaceId).toBe('w-new');
  });

  it('does not clear a newer workspace selection when an older delete resolves late', async () => {
    window.localStorage.clear();
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    const { readPersistedWorkspaceId } = await import('@/lib/workspace-selection');
    let resolveDelete!: () => void;
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([
      { id: 'w-a', name: 'Workspace A' },
      { id: 'w-b', name: 'Workspace B' },
    ]);
    mocks.adapter.deleteWorkspace.mockReturnValueOnce(new Promise<void>(resolve => {
      resolveDelete = resolve;
    }));
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    act(() => { result.current.selectWorkspace('w-a'); });

    let pendingDelete!: Promise<boolean>;
    act(() => { pendingDelete = result.current.deleteWorkspace('w-a'); });
    act(() => { result.current.selectWorkspace('w-b'); });
    await act(async () => {
      resolveDelete();
      await pendingDelete;
    });

    expect(result.current.workspaces.map(workspace => workspace.id)).toEqual(['w-b']);
    expect(result.current.activeWorkspaceId).toBe('w-b');
    expect(readPersistedWorkspaceId()).toBe('w-b');
  });
});

// ── useSessions ────────────────────────────────────────────────────────────

describe('useSessions (P1b)', () => {
  it('selects an exact older preferred session without flashing the newer first item', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([
      {
        id: 'session-newer-b', title: 'Newer B', messageCount: 2,
        lastActive: '2026-08-30T12:00:00.000Z',
      },
      {
        id: 'session-return-a', title: 'Return A', messageCount: 4,
        lastActive: '2026-08-29T12:00:00.000Z',
      },
    ]);
    const observedActiveIds: Array<string | null> = [];
    const { result, rerender } = renderHook(
      ({ preferredSessionId }: { preferredSessionId: string | null }) => {
        const sessions = useSessions('w1', preferredSessionId);
        observedActiveIds.push(sessions.activeSessionId);
        return sessions;
      },
      { initialProps: { preferredSessionId: 'session-return-a' } },
    );

    await waitFor(() => expect(result.current.activeSessionId).toBe('session-return-a'));
    expect(observedActiveIds).not.toContain('session-newer-b');

    observedActiveIds.length = 0;
    rerender({ preferredSessionId: 'session-newer-b' });
    expect(result.current.activeSessionId).toBe('session-newer-b');
    expect(observedActiveIds).not.toContain('session-return-a');

    rerender({ preferredSessionId: 'session-return-a' });
    expect(result.current.activeSessionId).toBe('session-return-a');
    observedActiveIds.length = 0;
    rerender({ preferredSessionId: 'session-from-another-workspace' });
    expect(result.current.activeSessionId).toBe('session-newer-b');
    expect(observedActiveIds).not.toContain('session-return-a');
    expect(result.current.sessions.every(session => session.workspaceId === 'w1')).toBe(true);
  });

  it('preserves the local session selection while its kept-alive workspace is hidden', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([
      { id: 'session-newer-b', title: 'Newer B', messageCount: 2, lastActive: '2026-08-30T12:00:00.000Z' },
      { id: 'session-return-a', title: 'Return A', messageCount: 4, lastActive: '2026-08-29T12:00:00.000Z' },
    ]);
    const { result, rerender } = renderHook(
      ({ preferredSessionId }: { preferredSessionId?: string | null }) => useSessions('w1', preferredSessionId),
      { initialProps: { preferredSessionId: 'session-return-a' as string | null | undefined } },
    );
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-return-a'));

    act(() => result.current.setActiveSessionId('session-newer-b'));
    rerender({ preferredSessionId: undefined });

    expect(result.current.activeSessionId).toBe('session-newer-b');
  });

  it('does not let an unchanged route preference undo a newly created session', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([
      { id: 'session-return-a', title: 'Return A', messageCount: 2, lastActive: '2026-08-29T12:00:00.000Z' },
    ]);
    mocks.adapter.createSession.mockResolvedValueOnce({
      id: 'session-created-c', title: null, messageCount: 0, lastActive: '2026-08-30T12:00:00.000Z',
    });
    const { result } = renderHook(() => useSessions('w1', 'session-return-a'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-return-a'));

    await act(async () => { await result.current.createSession(); });

    expect(result.current.activeSessionId).toBe('session-created-c');
  });

  it('normalizes exact server-wire sessions to the current workspace and preserves the old session after create', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([{
      id: 'session-old',
      title: 'Existing server session',
      summary: null,
      created: '2026-08-28T10:55:00.000Z',
      messageCount: 2,
      lastActive: '2026-08-28T11:00:00.000Z',
    }]);
    mocks.adapter.createSession.mockResolvedValueOnce({
      id: 'session-new',
      title: 'New server session',
      summary: null,
      created: '2026-08-28T11:02:00.000Z',
      messageCount: 0,
      lastActive: '2026-08-28T11:02:00.000Z',
    });
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-old'));

    await act(async () => {
      await result.current.createSession();
    });

    expect(result.current.sessions.map(({ id, workspaceId }) => ({ id, workspaceId }))).toEqual([
      { id: 'session-new', workspaceId: 'w1' },
      { id: 'session-old', workspaceId: 'w1' },
    ]);
  });

  it('replaces the synthetic empty-workspace placeholder with the first real session', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([]);
    mocks.adapter.createSession.mockResolvedValueOnce({
      id: 'session-real',
      title: null,
      summary: null,
      created: '2026-08-29T20:00:00.000Z',
      messageCount: 0,
      lastActive: '2026-08-29T20:00:00.000Z',
    });
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    await act(async () => {
      await result.current.createSession();
    });

    expect(result.current.sessions.map(session => session.id)).toEqual(['session-real']);
    expect(result.current.activeSessionId).toBe('session-real');
  });

  it('coalesces two same-tick create requests into one adapter call and one resolved session', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const createdSession = {
      id: 'session-created-once',
      title: 'Created once',
      messageCount: 0,
      lastActive: '2026-08-28T11:03:00.000Z',
    };
    let resolveCreate!: (session: typeof createdSession) => void;
    const pendingAdapterCreate = new Promise<typeof createdSession>(resolve => {
      resolveCreate = resolve;
    });
    mocks.adapter.getSessions.mockResolvedValueOnce([]);
    mocks.adapter.createSession.mockReturnValue(pendingAdapterCreate);
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    let firstCreate!: Promise<unknown>;
    let secondCreate!: Promise<unknown>;
    act(() => {
      firstCreate = result.current.createSession();
      secondCreate = result.current.createSession();
    });
    expect(firstCreate).toBe(secondCreate);

    let resolvedSessions!: unknown[];
    await act(async () => {
      resolveCreate(createdSession);
      resolvedSessions = await Promise.all([firstCreate, secondCreate]);
    });

    expect({
      adapterCalls: mocks.adapter.createSession.mock.calls.length,
      sameResolvedSession: resolvedSessions[0] === resolvedSessions[1],
      resolvedIds: resolvedSessions.map(session => (session as { id?: string } | undefined)?.id),
    }).toEqual({
      adapterCalls: 1,
      sameResolvedSession: true,
      resolvedIds: ['session-created-once', 'session-created-once'],
    });
  });

  it('exposes a synchronous creating state for the shared in-flight create and clears it after settlement', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const createdSession = {
      id: 'session-created-with-status',
      title: 'Created with status',
      messageCount: 0,
      lastActive: '2026-08-28T11:04:00.000Z',
    };
    let resolveCreate!: (session: typeof createdSession) => void;
    mocks.adapter.getSessions.mockResolvedValueOnce([]);
    mocks.adapter.createSession.mockReturnValueOnce(new Promise(resolve => {
      resolveCreate = resolve;
    }));
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    let firstCreate!: Promise<unknown>;
    let secondCreate!: Promise<unknown>;
    act(() => {
      firstCreate = result.current.createSession();
      secondCreate = result.current.createSession();
    });
    const creatingWhilePending = (result.current as typeof result.current & { creating?: boolean }).creating;

    await act(async () => {
      resolveCreate(createdSession);
      await Promise.all([firstCreate, secondCreate]);
    });

    expect({
      adapterCalls: mocks.adapter.createSession.mock.calls.length,
      sharedRequest: firstCreate === secondCreate,
      creatingWhilePending,
      creatingAfterSettle: (result.current as typeof result.current & { creating?: boolean }).creating,
    }).toEqual({
      adapterCalls: 1,
      sharedRequest: true,
      creatingWhilePending: true,
      creatingAfterSettle: false,
    });
  });

  it('releases a coalesced create lock after rejection so a retry can succeed', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.adapter.getSessions.mockResolvedValueOnce([]);
    mocks.adapter.createSession
      .mockRejectedValueOnce(new Error('temporary create failure'))
      .mockResolvedValueOnce({
        id: 'session-retry',
        title: 'Retry succeeded',
        summary: null,
        created: '2026-08-28T11:05:00.000Z',
        messageCount: 0,
        lastActive: '2026-08-28T11:05:00.000Z',
      });
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    let firstCreate!: Promise<unknown>;
    let secondCreate!: Promise<unknown>;
    act(() => {
      firstCreate = result.current.createSession();
      secondCreate = result.current.createSession();
    });
    expect(firstCreate).toBe(secondCreate);
    await act(async () => {
      await Promise.all([firstCreate, secondCreate]);
    });
    expect(mocks.adapter.createSession).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('temporary create failure');
    expect(result.current.creating).toBe(false);

    let retryResult: unknown;
    await act(async () => {
      retryResult = await result.current.createSession();
    });

    expect(mocks.adapter.createSession).toHaveBeenCalledTimes(2);
    expect((retryResult as { id?: string } | undefined)?.id).toBe('session-retry');
    expect(result.current.activeSessionId).toBe('session-retry');
    expect(result.current.error).toBeNull();
    consoleSpy.mockRestore();
  });

  it('keeps a successfully created session when the initial list resolves late', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    let resolveInitialList!: (sessions: never[]) => void;
    mocks.adapter.getSessions.mockReturnValueOnce(new Promise(resolve => {
      resolveInitialList = resolve;
    }));
    mocks.adapter.createSession.mockResolvedValueOnce({
      id: 'session-real',
      workspaceId: 'w1',
      title: 'New session',
      messageCount: 0,
      lastActive: '2026-08-28T11:02:00.000Z',
    });
    const { result } = renderHook(() => useSessions('w1'));

    await act(async () => {
      await result.current.createSession();
    });
    expect(result.current.activeSessionId).toBe('session-real');
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-real']);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveInitialList([]);
      await Promise.resolve();
    });

    expect(result.current.activeSessionId).toBe('session-real');
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-real']);
  });

  it('ignores a late create failure after switching workspaces', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    let rejectCreate!: (error: Error) => void;
    mocks.adapter.getSessions.mockResolvedValue([]);
    mocks.adapter.createSession.mockReturnValueOnce(new Promise((_, reject) => {
      rejectCreate = reject;
    }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ workspaceId }) => useSessions(workspaceId),
      { initialProps: { workspaceId: 'w1' } },
    );
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    let pendingCreate!: Promise<unknown>;
    act(() => {
      pendingCreate = result.current.createSession();
    });
    rerender({ workspaceId: 'w2' });
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w2'));

    await act(async () => {
      rejectCreate(new Error('create failed late'));
      await pendingCreate;
    });

    expect(result.current.activeSessionId).toBe('local-session-w2');
    expect(result.current.sessions.every(session => session.workspaceId === 'w2')).toBe(true);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('ignores a late create success after switching workspaces', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    let resolveCreate!: (session: {
      id: string; workspaceId: string; title: string; messageCount: number; lastActive: string;
    }) => void;
    mocks.adapter.getSessions.mockResolvedValue([]);
    mocks.adapter.createSession.mockReturnValueOnce(new Promise(resolve => {
      resolveCreate = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ workspaceId }) => useSessions(workspaceId),
      { initialProps: { workspaceId: 'w1' } },
    );
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    let pendingCreate!: Promise<unknown>;
    act(() => {
      pendingCreate = result.current.createSession();
    });
    rerender({ workspaceId: 'w2' });
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w2'));
    await act(async () => {
      resolveCreate({
        id: 'session-w1-late', workspaceId: 'w1', title: 'Late', messageCount: 0,
        lastActive: '2026-08-28T11:02:00.000Z',
      });
      await pendingCreate;
    });

    expect(result.current.activeSessionId).toBe('local-session-w2');
    expect(result.current.sessions.every(session => session.workspaceId === 'w2')).toBe(true);
  });

  it('never mixes prior-workspace sessions into a fast create on the next workspace', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    let resolveW2List!: (sessions: never[]) => void;
    mocks.adapter.getSessions
      .mockResolvedValueOnce([{
        id: 'session-w1', workspaceId: 'w1', title: 'W1', messageCount: 1,
        lastActive: '2026-08-28T11:00:00.000Z',
      }])
      .mockReturnValueOnce(new Promise(resolve => { resolveW2List = resolve; }));
    mocks.adapter.createSession.mockResolvedValueOnce({
      id: 'session-w2-created', workspaceId: 'w2', title: 'New session', messageCount: 0,
      lastActive: '2026-08-28T11:03:00.000Z',
    });
    const { result, rerender } = renderHook(
      ({ workspaceId }) => useSessions(workspaceId),
      { initialProps: { workspaceId: 'w1' } },
    );
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-w1'));

    rerender({ workspaceId: 'w2' });
    await act(async () => {
      await result.current.createSession();
    });

    expect(result.current.activeSessionId).toBe('session-w2-created');
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-w2-created']);
    await act(async () => {
      resolveW2List([]);
      await Promise.resolve();
    });
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-w2-created']);
  });

  it('keeps a pending workspace create locked across an A to B to A re-entry', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    let resolveCreate!: (session: {
      id: string; workspaceId: string; title: string; messageCount: number; lastActive: string;
    }) => void;
    mocks.adapter.getSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(new Promise(() => {}));
    mocks.adapter.createSession.mockReturnValueOnce(new Promise(resolve => {
      resolveCreate = resolve;
    }));
    const { result, rerender } = renderHook(
      ({ workspaceId }) => useSessions(workspaceId),
      { initialProps: { workspaceId: 'w1' } },
    );
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));

    let firstCreate!: Promise<unknown>;
    act(() => { firstCreate = result.current.createSession(); });
    rerender({ workspaceId: 'w2' });
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w2'));
    rerender({ workspaceId: 'w1' });

    expect(result.current.creating).toBe(true);
    let repeatedCreate!: Promise<unknown>;
    act(() => { repeatedCreate = result.current.createSession(); });
    expect(repeatedCreate).toBe(firstCreate);
    expect(mocks.adapter.createSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({
        id: 'session-w1-created', workspaceId: 'w1', title: 'Created in A', messageCount: 0,
        lastActive: '2026-08-29T20:01:00.000Z',
      });
      await Promise.all([firstCreate, repeatedCreate]);
    });

    expect(result.current.creating).toBe(false);
    expect(result.current.activeSessionId).toBe('session-w1-created');
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-w1-created']);
  });

  it('does not fabricate a successful session when create fails', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([]);
    mocks.adapter.createSession.mockRejectedValueOnce(new Error('create failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('local-session-w1'));
    const initialIds = result.current.sessions.map(session => session.id);

    let created: unknown;
    await act(async () => {
      created = await result.current.createSession();
    });

    expect(created).toBeUndefined();
    expect(result.current.sessions.map(session => session.id)).toEqual(initialIds);
    expect(result.current.activeSessionId).toBe('local-session-w1');
    expect(result.current.error).toBe('create failed');
    consoleSpy.mockRestore();
  });

  it('does not fabricate a session when the server list fails', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockRejectedValueOnce(new Error('list failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
    expect(result.current.error).toBe('list failed');
    consoleSpy.mockRestore();
  });

  it('recovers a cold session-list failure only after an explicit retry succeeds', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions
      .mockRejectedValueOnce(new Error('temporary list failure'))
      .mockResolvedValueOnce([{
        id: 'session-current', title: 'Current', messageCount: 2,
        lastActive: '2026-08-30T12:00:00.000Z',
      }]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));

    await waitFor(() => expect(result.current.error).toBe('temporary list failure'));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();

    let recovered = false;
    await act(async () => {
      recovered = await result.current.retrySessions();
    });

    expect(recovered).toBe(true);
    expect(mocks.adapter.getSessions).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.activeSessionId).toBe('session-current');
    consoleSpy.mockRestore();
  });

  it('preserves the loaded session list and selection when retry fails', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const current = {
      id: 'session-current', title: 'Current', messageCount: 2,
      lastActive: '2026-08-30T12:00:00.000Z',
    };
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions
      .mockResolvedValueOnce([current])
      .mockRejectedValueOnce(new Error('temporary list failure'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-current'));

    let recovered = true;
    await act(async () => {
      recovered = await result.current.retrySessions();
    });

    expect(recovered).toBe(false);
    expect(result.current.sessions).toEqual([expect.objectContaining({ id: 'session-current' })]);
    expect(result.current.activeSessionId).toBe('session-current');
    expect(result.current.error).toBe('temporary list failure');
    expect(result.current.loading).toBe(false);
    consoleSpy.mockRestore();
  });

  it('keeps a user-selected session active after a successful list retry', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const first = { id: 'session-first', title: 'First', messageCount: 2, lastActive: '2026-08-30T12:00:00.000Z' };
    const selected = { id: 'session-selected', title: 'Selected', messageCount: 1, lastActive: '2026-08-29T12:00:00.000Z' };
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions
      .mockResolvedValueOnce([first, selected])
      .mockResolvedValueOnce([{ ...selected, messageCount: 3 }, first]);
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-first'));
    act(() => { result.current.setActiveSessionId('session-selected'); });

    await act(async () => {
      expect(await result.current.retrySessions()).toBe(true);
    });

    expect(result.current.activeSessionId).toBe('session-selected');
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-selected', 'session-first']);
  });

  it('keeps the latest user selection when it changes during a list retry', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const first = { id: 'session-first', title: 'First', messageCount: 2, lastActive: '2026-08-30T12:00:00.000Z' };
    const selected = { id: 'session-selected', title: 'Selected', messageCount: 1, lastActive: '2026-08-29T12:00:00.000Z' };
    let resolveRetry!: (sessions: Array<typeof first>) => void;
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions
      .mockResolvedValueOnce([first, selected])
      .mockReturnValueOnce(new Promise(resolve => { resolveRetry = resolve; }));
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-first'));

    let retry!: Promise<boolean>;
    act(() => { retry = result.current.retrySessions(); });
    act(() => { result.current.setActiveSessionId('session-selected'); });
    await act(async () => {
      resolveRetry([{ ...first, messageCount: 3 }, selected]);
      expect(await retry).toBe(true);
    });

    expect(result.current.activeSessionId).toBe('session-selected');
  });

  it('suppresses a duplicate retry while the first retry is pending', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const current = { id: 'session-current', title: 'Current', messageCount: 2, lastActive: '2026-08-30T12:00:00.000Z' };
    let resolveRetry!: (sessions: Array<typeof current>) => void;
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions
      .mockResolvedValueOnce([current])
      .mockReturnValueOnce(new Promise(resolve => { resolveRetry = resolve; }));
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-current'));

    let firstRetry!: Promise<boolean>;
    let duplicateRetry!: Promise<boolean>;
    act(() => {
      firstRetry = result.current.retrySessions();
      duplicateRetry = result.current.retrySessions();
    });

    await expect(duplicateRetry).resolves.toBe(false);
    expect(mocks.adapter.getSessions).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveRetry([{ ...current, messageCount: 3 }]);
      expect(await firstRetry).toBe(true);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.activeSessionId).toBe('session-current');
    expect(result.current.sessions).toEqual([expect.objectContaining({ id: 'session-current', messageCount: 3 })]);
  });

  it('recovers a failed session list when the desktop connection settles', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions
      .mockRejectedValueOnce(new Error('temporary list failure'))
      .mockResolvedValueOnce([{
        id: 'session-recovered', workspaceId: 'w1', title: 'Recovered', messageCount: 3,
        lastActive: '2026-08-29T20:02:00.000Z',
      }]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));

    await waitFor(() => expect(result.current.error).toBe('temporary list failure'));
    settleConnect();
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-recovered'));

    expect(mocks.adapter.getSessions).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-recovered']);
    consoleSpy.mockRestore();
  });

  it('does not reload or switch chats when reconnect follows a session mutation failure', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValue([
      { id: 'session-first', workspaceId: 'w1', title: 'First', messageCount: 1, lastActive: '2026-08-29T20:00:00.000Z' },
      { id: 'session-active', workspaceId: 'w1', title: 'Active', messageCount: 2, lastActive: '2026-08-29T19:00:00.000Z' },
    ]);
    mocks.adapter.renameSession.mockRejectedValueOnce(new Error('rename failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-first'));
    act(() => { result.current.setActiveSessionId('session-active'); });

    await act(async () => {
      await result.current.renameSession('session-active', 'Renamed');
    });
    expect(result.current.error).toBe('rename failed');
    settleConnect();
    await act(async () => { await Promise.resolve(); });

    expect(mocks.adapter.getSessions).toHaveBeenCalledTimes(1);
    expect(result.current.activeSessionId).toBe('session-active');
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-first', 'session-active']);
    consoleSpy.mockRestore();
  });

  it('keeps session state unchanged when rename or delete fails', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockResolvedValueOnce([{
      id: 'session-existing', workspaceId: 'w1', title: 'Original', messageCount: 2,
      lastActive: '2026-08-28T11:00:00.000Z',
    }]);
    mocks.adapter.renameSession.mockRejectedValueOnce(new Error('rename failed'));
    mocks.adapter.deleteSession.mockRejectedValueOnce(new Error('delete failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-existing'));

    await act(async () => { await result.current.renameSession('session-existing', 'Changed'); });
    expect(result.current.sessions[0].title).toBe('Original');
    expect(result.current.error).toBe('rename failed');
    await act(async () => { await result.current.deleteSession('session-existing'); });
    expect(result.current.sessions.map(session => session.id)).toEqual(['session-existing']);
    expect(result.current.activeSessionId).toBe('session-existing');
    expect(result.current.error).toBe('delete failed');
    consoleSpy.mockRestore();
  });

  it('does not let a slow delete replace a newer active session', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    let resolveDelete!: () => void;
    mocks.adapter.getSessions.mockResolvedValueOnce([
      { id: 'session-s1', workspaceId: 'w1', title: 'S1', messageCount: 1, lastActive: '2026-08-28T11:00:00.000Z' },
      { id: 'session-s2', workspaceId: 'w1', title: 'S2', messageCount: 1, lastActive: '2026-08-28T10:00:00.000Z' },
    ]);
    mocks.adapter.deleteSession.mockReturnValueOnce(new Promise<void>(resolve => { resolveDelete = resolve; }));
    mocks.adapter.createSession.mockResolvedValueOnce({
      id: 'session-s3', workspaceId: 'w1', title: 'S3', messageCount: 0,
      lastActive: '2026-08-28T11:04:00.000Z',
    });
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-s1'));

    let pendingDelete!: Promise<void>;
    act(() => { pendingDelete = result.current.deleteSession('session-s1'); });
    await act(async () => { await result.current.createSession(); });
    expect(result.current.activeSessionId).toBe('session-s3');
    await act(async () => {
      resolveDelete();
      await pendingDelete;
    });

    expect(result.current.sessions.map(session => session.id)).toEqual(['session-s3', 'session-s2']);
    expect(result.current.activeSessionId).toBe('session-s3');
  });

  it('clears loading when the workspace is cleared during a pending list', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string | null }) => useSessions(workspaceId),
      { initialProps: { workspaceId: 'w1' as string | null } },
    );
    await waitFor(() => expect(result.current.loading).toBe(true));

    rerender({ workspaceId: null });

    expect(result.current.loading).toBe(false);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });

  it('silently refreshes session metadata without blanking or switching the active session', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions.mockResolvedValueOnce([
      { id: 'session-first', workspaceId: 'w1', title: 'First', messageCount: 1, lastActive: '2026-08-30T01:00:00.000Z' },
      { id: 'session-active', workspaceId: 'w1', title: 'Before', messageCount: 0, lastActive: '2026-08-30T00:59:00.000Z' },
    ]);
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-first'));
    act(() => { result.current.setActiveSessionId('session-active'); });

    let resolveMetadata!: (sessions: Array<{
      id: string;
      workspaceId: string;
      title: string;
      messageCount: number;
      lastActive: string;
    }>) => void;
    mocks.adapter.getSessions.mockReturnValueOnce(new Promise(resolve => {
      resolveMetadata = resolve;
    }));

    let pending!: Promise<boolean>;
    act(() => { pending = result.current.revalidateSessions('w1'); });
    expect(result.current.loading).toBe(false);
    expect(result.current.activeSessionId).toBe('session-active');
    expect(result.current.sessions.find(session => session.id === 'session-active')?.title).toBe('Before');

    await act(async () => {
      resolveMetadata([
        { id: 'session-active', workspaceId: 'w1', title: 'After', messageCount: 2, lastActive: '2026-08-30T01:01:00.000Z' },
        { id: 'session-first', workspaceId: 'w1', title: 'First', messageCount: 1, lastActive: '2026-08-30T01:00:00.000Z' },
      ]);
      expect(await pending).toBe(true);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.activeSessionId).toBe('session-active');
    expect(result.current.sessions[0]).toMatchObject({
      id: 'session-active',
      title: 'After',
      messageCount: 2,
    });
  });

  it('preserves session metadata and selection when a silent refresh fails', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions.mockResolvedValueOnce([
      { id: 'session-active', workspaceId: 'w1', title: 'Stable', messageCount: 4, lastActive: '2026-08-30T01:00:00.000Z' },
    ]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-active'));
    mocks.adapter.getSessions.mockRejectedValueOnce(new Error('metadata offline'));

    await act(async () => {
      expect(await result.current.revalidateSessions('w1')).toBe(false);
    });

    expect(result.current.sessions).toEqual([
      expect.objectContaining({ id: 'session-active', title: 'Stable', messageCount: 4 }),
    ]);
    expect(result.current.activeSessionId).toBe('session-active');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('ignores a late silent refresh after switching workspaces', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    mocks.adapter.getSessions.mockReset();
    mocks.adapter.getSessions
      .mockResolvedValueOnce([
        { id: 'session-a', workspaceId: 'w1', title: 'A', messageCount: 1, lastActive: '2026-08-30T01:00:00.000Z' },
      ]);
    const { result, rerender } = renderHook(
      ({ workspaceId }) => useSessions(workspaceId),
      { initialProps: { workspaceId: 'w1' } },
    );
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-a'));

    let resolveStale!: (sessions: Array<{
      id: string;
      workspaceId: string;
      title: string;
      messageCount: number;
      lastActive: string;
    }>) => void;
    mocks.adapter.getSessions.mockReturnValueOnce(new Promise(resolve => {
      resolveStale = resolve;
    }));
    let stale!: Promise<boolean>;
    act(() => { stale = result.current.revalidateSessions('w1'); });

    mocks.adapter.getSessions.mockResolvedValueOnce([
      { id: 'session-b', workspaceId: 'w2', title: 'B', messageCount: 3, lastActive: '2026-08-30T01:02:00.000Z' },
    ]);
    rerender({ workspaceId: 'w2' });
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-b'));

    await act(async () => {
      resolveStale([
        { id: 'session-a', workspaceId: 'w1', title: 'Stale A', messageCount: 9, lastActive: '2026-08-30T01:03:00.000Z' },
      ]);
      expect(await stale).toBe(false);
    });

    expect(result.current.sessions).toEqual([
      expect.objectContaining({ id: 'session-b', title: 'B', messageCount: 3 }),
    ]);
    expect(result.current.activeSessionId).toBe('session-b');
  });

  it('keeps the newest same-workspace metadata when an older refresh resolves late', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const initialSession = {
      id: 'session-active',
      workspaceId: 'w1',
      title: 'Initial',
      messageCount: 1,
      lastActive: '2026-08-30T01:00:00.000Z',
    };
    mocks.adapter.getSessions.mockReset().mockResolvedValueOnce([initialSession]);
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-active'));

    let resolveOlder!: (sessions: typeof initialSession[]) => void;
    let resolveNewer!: (sessions: typeof initialSession[]) => void;
    mocks.adapter.getSessions
      .mockReturnValueOnce(new Promise(resolve => { resolveOlder = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveNewer = resolve; }));

    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => {
      older = result.current.revalidateSessions('w1', 'session-active');
      newer = result.current.revalidateSessions('w1', 'session-active');
    });

    await act(async () => {
      resolveNewer([{ ...initialSession, title: 'Newest', messageCount: 3 }]);
      expect(await newer).toBe(true);
    });
    expect(result.current.sessions[0]).toMatchObject({ title: 'Newest', messageCount: 3 });

    await act(async () => {
      resolveOlder([{ ...initialSession, title: 'Older', messageCount: 2 }]);
      expect(await older).toBe(false);
    });
    expect(result.current.sessions[0]).toMatchObject({ title: 'Newest', messageCount: 3 });
  });

  it('does not let stale metadata undo a successful rename or delete', async () => {
    const { useSessions } = await import('@/hooks/useSessions');
    const staleSession = {
      id: 'session-active',
      workspaceId: 'w1',
      title: 'Original',
      messageCount: 2,
      lastActive: '2026-08-30T01:00:00.000Z',
    };
    mocks.adapter.getSessions.mockReset().mockResolvedValueOnce([staleSession]);
    mocks.adapter.renameSession.mockResolvedValueOnce(undefined);
    mocks.adapter.deleteSession.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSessions('w1'));
    await waitFor(() => expect(result.current.activeSessionId).toBe('session-active'));

    let resolveRenameStale!: (sessions: typeof staleSession[]) => void;
    mocks.adapter.getSessions.mockReturnValueOnce(new Promise(resolve => {
      resolveRenameStale = resolve;
    }));
    let staleRename!: Promise<boolean>;
    act(() => { staleRename = result.current.revalidateSessions('w1', 'session-active'); });
    await act(async () => { await result.current.renameSession('session-active', 'Renamed'); });
    await act(async () => {
      resolveRenameStale([staleSession]);
      expect(await staleRename).toBe(false);
    });
    expect(result.current.sessions[0]?.title).toBe('Renamed');

    let resolveDeleteStale!: (sessions: typeof staleSession[]) => void;
    mocks.adapter.getSessions.mockReturnValueOnce(new Promise(resolve => {
      resolveDeleteStale = resolve;
    }));
    let staleDelete!: Promise<boolean>;
    act(() => { staleDelete = result.current.revalidateSessions('w1', 'session-active'); });
    await act(async () => { await result.current.deleteSession('session-active'); });
    await act(async () => {
      resolveDeleteStale([staleSession]);
      expect(await staleDelete).toBe(false);
    });
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });
});

// ── useBilling ─────────────────────────────────────────────────────────────

describe('useBilling (P1b D3-4)', () => {
  it('failure keeps tierResolved=false and surfaces the error — FREE default is never presented as fact', async () => {
    const { useBilling } = await import('@/hooks/useBilling');
    mocks.adapter.getTier.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tierResolved).toBe(false);
    expect(result.current.error).toBe('Unauthorized');
  });

  it('connect-settled revalidates an unresolved tier to the real plan', async () => {
    const { useBilling } = await import('@/hooks/useBilling');
    mocks.adapter.getTier.mockRejectedValueOnce(httpError(401, {}, 'Unauthorized'));
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tierResolved).toBe(false);

    mocks.adapter.getTier.mockResolvedValue({ tier: 'TEAMS', capabilities: {}, usage: {} });
    settleConnect();
    await waitFor(() => expect(result.current.tierResolved).toBe(true));
    expect(result.current.tier).toBe('TEAMS');
  });
});

// ── ShellContext tier (the severity-critical silent-FREE class) ────────────

describe('ShellContext tier (P1b D3-4)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  async function renderShell() {
    const { ShellProvider, useShell } = await import('@/providers/ShellContext');
    const wrapper = ({ children }: { children: React.ReactNode }) => <ShellProvider>{children}</ShellProvider>;
    return renderHook(() => useShell(), { wrapper });
  }

  async function renderShellWithInheritedAutonomy() {
    const { ShellProvider, useShell } = await import('@/providers/ShellContext');
    const { useInheritedDefaultAutonomy } = await import('@/components/os/ChatHost');
    const wrapper = ({ children }: { children: React.ReactNode }) => <ShellProvider>{children}</ShellProvider>;
    return renderHook(() => {
      const shell = useShell();
      const inheritedAutonomy = useInheritedDefaultAutonomy(
        shell.defaultAutonomy,
        shell.defaultAutonomySource,
      );
      return { ...shell, inheritedAutonomy };
    }, { wrapper });
  }

  /** Seed a completed-wizard onboarding blob so the trial gate's
   *  onboardingCompleted precondition is met. `completedAt` past the 10-min
   *  quiet window by default. */
  function seedOnboardingCompleted(completedAt = Date.now() - 11 * 60_000) {
    window.localStorage.setItem(
      'waggle:onboarding',
      JSON.stringify({ completed: true, step: 7, tier: 'power', completedAt }),
    );
    // Wave-3 modal coordination: the paywall defers while the login briefing
    // is eligible to show. These tests exercise the paywall itself, so arrange
    // a dismissed briefing (as a returning user who closed it would have).
    window.localStorage.setItem('waggle:login-briefing-dismissed', 'true');
  }

  it('updates the inherited autonomy after a successful Settings change without reloading', async () => {
    const { publishSavedDefaultAutonomy } = await import('@/providers/ShellContext');
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockResolvedValueOnce({
      defaultAutonomy: 'yolo',
      externalGates: [],
      workspaceOverrides: {},
    });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.defaultAutonomy).toBe('yolo'));

    act(() => {
      expect(publishSavedDefaultAutonomy('invalid')).toBe(false);
    });
    expect(result.current.defaultAutonomy).toBe('yolo');

    act(() => {
      expect(publishSavedDefaultAutonomy('normal')).toBe(true);
    });
    expect(result.current.defaultAutonomy).toBe('normal');

    act(() => {
      publishSavedDefaultAutonomy('trusted');
      publishSavedDefaultAutonomy('yolo');
    });
    expect(result.current.defaultAutonomy).toBe('yolo');
  });

  it('keeps the saved-default channel private from forged DOM events and supports cleanup', async () => {
    const {
      publishSavedDefaultAutonomy,
      subscribeSavedDefaultAutonomy,
    } = await import('@/providers/ShellContext');
    const listener = vi.fn();
    const unsubscribe = subscribeSavedDefaultAutonomy(listener);

    window.dispatchEvent(new CustomEvent('waggle:permissions-changed', {
      detail: { defaultAutonomy: 'yolo' },
    }));
    expect(listener).not.toHaveBeenCalled();

    publishSavedDefaultAutonomy('trusted');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith('trusted');

    unsubscribe();
    publishSavedDefaultAutonomy('yolo');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does not let an older mount read overwrite a newer Settings change', async () => {
    const { publishSavedDefaultAutonomy } = await import('@/providers/ShellContext');
    let resolvePermissions!: (value: {
      defaultAutonomy: 'yolo';
      externalGates: string[];
      workspaceOverrides: Record<string, string[]>;
    }) => void;
    const permissions = new Promise<{
      defaultAutonomy: 'yolo';
      externalGates: string[];
      workspaceOverrides: Record<string, string[]>;
    }>((resolve) => { resolvePermissions = resolve; });
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockReturnValueOnce(permissions);
    const { result } = await renderShellWithInheritedAutonomy();

    act(() => {
      publishSavedDefaultAutonomy('trusted');
    });
    expect(result.current.defaultAutonomy).toBe('trusted');
    expect(result.current.inheritedAutonomy).toBe('normal');

    await act(async () => {
      resolvePermissions({ defaultAutonomy: 'yolo', externalGates: [], workspaceOverrides: {} });
      await permissions;
    });
    expect(result.current.defaultAutonomy).toBe('trusted');
    expect(result.current.inheritedAutonomy).toBe('normal');
  });

  it('hydrates a pending chat only from startup state and keeps Settings changes for future chats', async () => {
    const { useInheritedDefaultAutonomy } = await import('@/components/os/ChatHost');
    type Props = {
      level: 'normal' | 'trusted' | 'yolo';
      source: 'pending' | 'initial' | 'settings';
    };
    const existing = renderHook(
      ({ level, source }: Props) => useInheritedDefaultAutonomy(level, source),
      { initialProps: { level: 'normal', source: 'pending' } as Props },
    );
    expect(existing.result.current).toBeUndefined();
    existing.rerender({ level: 'yolo', source: 'settings' });
    expect(existing.result.current).toBe('normal');

    const hydrated = renderHook(
      ({ level, source }: Props) => useInheritedDefaultAutonomy(level, source),
      { initialProps: { level: 'normal', source: 'pending' } as Props },
    );
    hydrated.rerender({ level: 'trusted', source: 'initial' });
    expect(hydrated.result.current).toBe('trusted');

    const future = renderHook(
      ({ level, source }: Props) => useInheritedDefaultAutonomy(level, source),
      { initialProps: { level: 'yolo', source: 'settings' } as Props },
    );
    expect(future.result.current).toBe('yolo');
  });

  it('persists the safe normal snapshot so an existing chat cannot elevate after reload', async () => {
    const { useInheritedDefaultAutonomy } = await import('@/components/os/ChatHost');
    const { useChatWidgetState } = await import('@/hooks/useChatWidgetState');
    type Props = {
      level: 'normal' | 'trusted' | 'yolo';
      source: 'pending' | 'initial' | 'settings';
    };
    const existing = renderHook(
      ({ level, source }: Props) => {
        const inherited = useInheritedDefaultAutonomy(level, source);
        return useChatWidgetState('ws-reload-safe', {
          defaultAutonomy: inherited,
          persistNormalDefault: inherited !== undefined,
        });
      },
      { initialProps: { level: 'normal', source: 'pending' } as Props },
    );

    existing.rerender({ level: 'yolo', source: 'settings' });
    await waitFor(() => expect(existing.result.current.entry.autonomyLevel).toBe('normal'));
    existing.unmount();

    const reloaded = renderHook(() => {
      const inherited = useInheritedDefaultAutonomy('yolo', 'initial');
      return useChatWidgetState('ws-reload-safe', { defaultAutonomy: inherited });
    });
    expect(reloaded.result.current.entry.autonomyLevel).toBe('normal');
  });

  it('failed getTier touches neither billingTier nor trialInfo; tierResolved stays false', async () => {
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockRejectedValue(httpError(401, { code: 'MISSING_TOKEN' }, 'Unauthorized'));
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.tierError).toBe('Unauthorized'));
    expect(result.current.billingTier).toBe('FREE'); // fail-closed capability default…
    expect(result.current.tierResolved).toBe(false); // …never presented as resolved fact
    expect(result.current.trialInfo).toEqual({});    // trial countdown not clobbered
    expect(result.current.showTrialExpired).toBe(false);
  });

  it('a paying user is not reset to FREE by a transient failure, and recovers on connect-settled', async () => {
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValueOnce({
      tier: 'TEAMS', trialDaysRemaining: undefined, trialExpired: false, capabilities: {}, usage: {},
    });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.billingTier).toBe('TEAMS'));
    expect(result.current.tierResolved).toBe(true);

    // Transient failure (e.g. sidecar restart mid-refresh): state must hold.
    mocks.adapter.getTier.mockRejectedValueOnce(httpError(401, {}, 'Unauthorized'));
    await act(async () => { await result.current.refreshTier(); });
    expect(result.current.billingTier).toBe('TEAMS');
    expect(result.current.tierError).toBe('Unauthorized');

    // Recovery: connect-settled revalidates while errored.
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TEAMS', capabilities: {}, usage: {} });
    settleConnect();
    await waitFor(() => expect(result.current.tierError).toBeNull());
  });

  // ── F1: trial-expired auto-open gate ──
  it('auto-opens the paywall once and stamps the snooze when trial expired + onboarding done', async () => {
    seedOnboardingCompleted();
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.showTrialExpired).toBe(true));
    expect(window.localStorage.getItem('waggle:trial-expired-last-shown-at')).not.toBeNull();
  });

  it('does NOT auto-open within the post-onboarding quiet window', async () => {
    seedOnboardingCompleted(Date.now() - 60_000); // completed 1 min ago
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.tierResolved).toBe(true));
    expect(result.current.showTrialExpired).toBe(false);
  });

  it('a dismissed paywall stays closed on later same-session refreshTier re-runs', async () => {
    seedOnboardingCompleted();
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.showTrialExpired).toBe(true));
    act(() => { result.current.setShowTrialExpired(false); });
    await act(async () => { await result.current.refreshTier(); });
    expect(result.current.showTrialExpired).toBe(false);
  });

  it('a fresh session (reload) within the 7-day snooze does not auto-open', async () => {
    const now = Date.now();
    seedOnboardingCompleted(now - 2 * 24 * 60 * 60_000);
    window.localStorage.setItem('waggle:trial-expired-last-shown-at', String(now - 24 * 60 * 60_000));
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.tierResolved).toBe(true));
    expect(result.current.showTrialExpired).toBe(false);
  });
});

// ── LoginBriefing failure ≠ Day-0 ──────────────────────────────────────────

describe('LoginBriefing (P1b)', () => {
  async function renderBriefing() {
    const { default: LoginBriefing } = await import('@/components/os/overlays/LoginBriefing');
    const { ServiceProvider } = await import('@/providers/ServiceProvider');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    const { render, screen } = await import('@testing-library/react');
    render(
      <TooltipProvider>
        <ServiceProvider>
          <LoginBriefing onDismiss={() => {}} onOpenWorkspace={() => {}} />
        </ServiceProvider>
      </TooltipProvider>,
    );
    return screen;
  }

  it('batch failure renders the error state, NOT the Day-0 demo bubbles', async () => {
    mocks.adapter.getIdentity.mockRejectedValue(new Error('no identity'));
    mocks.adapter.searchMemory.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getMemoryStats.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getWorkspaces.mockRejectedValue(httpError(401, { code: 'MISSING_TOKEN' }, 'Unauthorized'));
    const screen = await renderBriefing();
    // Wave Q Lane A: a failed briefing degrades to the slim inline row (NOT a
    // blocking modal). The behavioral contract — error state, never the Day-0
    // demo bubbles — is unchanged; only the surface it renders on moved.
    await waitFor(() => expect(screen.getByTestId('login-briefing-error')).toBeInTheDocument());
    expect(screen.queryByTestId('login-briefing-empty-hook')).toBeNull();
    expect(screen.getByTestId('login-briefing-error').textContent).toContain('Briefing unavailable');
    // Generous budget: full framer-motion render under parallel suite load.
  }, 15000);

  it('a genuinely empty (Day-0) account still gets the demo bubbles', async () => {
    mocks.adapter.getIdentity.mockResolvedValue(null);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    const screen = await renderBriefing();
    await waitFor(() => expect(screen.getByTestId('login-briefing-empty-hook')).toBeInTheDocument());
    expect(screen.queryByTestId('login-briefing-error')).toBeNull();
  }, 15000);

  it('RECOVERS: connect-settled after the backend returns replaces the error with the briefing', async () => {
    mocks.adapter.getIdentity.mockRejectedValue(new Error('down'));
    mocks.adapter.searchMemory.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getMemoryStats.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getWorkspaces.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    const screen = await renderBriefing();
    await waitFor(() => expect(screen.getByTestId('login-briefing-error')).toBeInTheDocument());

    // Backend comes back; the bus settlement revalidates the errored briefing.
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    settleConnect();
    await waitFor(() => expect(screen.queryByTestId('login-briefing-error')).toBeNull());
    expect(screen.getByTestId('login-briefing-empty-hook')).toBeInTheDocument();
  }, 15000);
});

// ── BackupApp 404→empty (fetchRaw migration pin) ───────────────────────────

describe('BackupApp (P1b)', () => {
  it('a 404 metadata response renders the empty state, not the error panel', async () => {
    mocks.adapter.fetchRaw.mockResolvedValue(
      new Response(JSON.stringify({ error: 'no backups' }), { status: 404 }),
    );
    const { default: BackupApp } = await import('@/components/os/apps/BackupApp');
    const { render, screen } = await import('@testing-library/react');
    render(<BackupApp />);
    await waitFor(() => expect(screen.getByText(/no backups yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/couldn.t load backups|retry/i)).toBeNull();
  });

  it('a 500 metadata response renders the retryable error, never the empty state', async () => {
    mocks.adapter.fetchRaw.mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );
    const { default: BackupApp } = await import('@/components/os/apps/BackupApp');
    const { render, screen } = await import('@testing-library/react');
    render(<BackupApp />);
    await waitFor(() => expect(screen.queryByText(/no backups yet/i)).toBeNull());
  });

  it('restore uses an in-app approval before posting backup data', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mocks.adapter.fetchRaw
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'no backups' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ filesRestored: 2 }), { status: 200 }));

    const { default: BackupApp } = await import('@/components/os/apps/BackupApp');
    const { render, screen, fireEvent } = await import('@testing-library/react');
    render(<BackupApp />);

    await screen.findByText(/no backups yet/i);
    const file = new File(['backup-data'], 'team.waggle-backup', { type: 'application/octet-stream' });
    fireEvent.change(screen.getByLabelText(/restore backup file/i), { target: { files: [file] } });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.fetchRaw).toHaveBeenCalledTimes(1);

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/restore backup/i);
    expect(modal).toHaveTextContent(/team\.waggle-backup/i);
    expect(modal).toHaveTextContent(/overwrite current data/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.fetchRaw).toHaveBeenCalledWith(
      '/api/restore',
      expect.objectContaining({ method: 'POST' }),
    ));
    await screen.findByText(/backup restored successfully \(2 files\)/i);
  });
});

// ── SettingsApp tier-as-fact pins ──────────────────────────────────────────

describe('SettingsApp tier badges (P1b D3-4)', () => {
  async function renderSettings(strict = false) {
    mocks.adapter.getSettings.mockResolvedValue({});
    mocks.adapter.getTelemetryStatus.mockResolvedValue({ enabled: false });
    mocks.adapter.getTeamStatus.mockResolvedValue({ connected: false });
    mocks.adapter.getServerUrl.mockReturnValue('http://127.0.0.1:3333');
    mocks.adapter.getProviders.mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' });
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
    const { default: SettingsApp } = await import('@/components/os/apps/SettingsApp');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    const { MemoryRouter } = await import('react-router-dom');
    const { StrictMode } = await import('react');
    const { render, screen, fireEvent } = await import('@testing-library/react');
    // SettingsApp reads `?tab=` via useSearchParams (PR7a/D12) — needs a Router.
    const tree = <MemoryRouter><TooltipProvider><SettingsApp /></TooltipProvider></MemoryRouter>;
    render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    // PR5 §11: Settings now opens on Models ("Models leads"). The tier card lives
    // in General — navigate there for these tier-as-fact assertions.
    fireEvent.click(await screen.findByRole('tab', { name: /general/i }));
    return screen;
  }

  it('getTier failure: General tab never renders "FREE plan" as fact', async () => {
    mocks.adapter.getTier.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    const screen = await renderSettings();
    await waitFor(() => expect(screen.getByText(/confirming plan/i)).toBeInTheDocument());
    expect(screen.queryByText(/FREE plan/i)).toBeNull();
  }, 15000);

  it('resolved TEAMS tier renders the real plan in the General tab', async () => {
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TEAMS', capabilities: {}, usage: {} });
    const screen = await renderSettings();
    await waitFor(() => {
      expect(screen.getAllByText(/Team plan/i).some((el) => el.textContent?.trim() === 'Team plan')).toBe(true);
    });
  }, 15000);

  it('publishes a new chat default only after the permission save succeeds', async () => {
    const { subscribeSavedDefaultAutonomy } = await import('@/providers/ShellContext');
    const { fireEvent } = await import('@testing-library/react');
    const updates: string[] = [];
    const unsubscribe = subscribeSavedDefaultAutonomy(level => updates.push(level));
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: [],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    try {
      const screen = await renderSettings();
      fireEvent.click(screen.getByRole('button', { name: /everything/i }));
      fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
      await screen.findByRole('heading', { name: /^permissions$/i, level: 3 });
      await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));

      fireEvent.click(screen.getByTestId('default-autonomy-trusted'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/permissions were not saved/i);
      expect(updates).toEqual([]);

      fireEvent.click(screen.getByTestId('default-autonomy-trusted'));
      await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(updates).toEqual(['trusted']));
    } finally {
      unsubscribe();
    }
  }, 15000);

  it('snapshots a mounted implicit chat before saving a new global default', async () => {
    const { useChatAutonomySnapshotGuard } = await import('@/components/os/ChatHost');
    const { loadChatEntries } = await import('@/hooks/useChatWidgetState');
    const { fireEvent } = await import('@testing-library/react');
    const guard = renderHook(() => useChatAutonomySnapshotGuard('ws-save-order', undefined));
    let resolveSave!: () => void;
    const save = new Promise<void>(resolve => { resolveSave = resolve; });
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: [],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockReturnValueOnce(save);

    const screen = await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /everything/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(screen.getByTestId('default-autonomy-trusted'));

    expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'trusted' });
    expect(loadChatEntries()['ws-save-order']?.autonomyLevel).toBe('normal');
    guard.unmount();

    await act(async () => {
      resolveSave();
      await save;
    });
  }, 15000);

  it('refuses the global save when an active chat snapshot is not durable', async () => {
    const { useChatAutonomySnapshotGuard } = await import('@/components/os/ChatHost');
    const { CHAT_STATE_KEY } = await import('@/hooks/useChatWidgetState');
    const { fireEvent } = await import('@testing-library/react');
    const guard = renderHook(() => useChatAutonomySnapshotGuard('ws-storage-fail', undefined));
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === CHAT_STATE_KEY) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: [],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockResolvedValueOnce(undefined);

    try {
      const screen = await renderSettings();
      fireEvent.click(screen.getByRole('button', { name: /everything/i }));
      fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
      await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
      fireEvent.click(screen.getByTestId('default-autonomy-trusted'));

      expect(await screen.findByRole('alert')).toHaveTextContent(/permissions were not saved/i);
      expect(mocks.adapter.savePermissions).not.toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      guard.unmount();
    }
  }, 15000);

  it('repairs a stale durable autonomy marker before an elevated default save', async () => {
    const { useChatAutonomySnapshotGuard } = await import('@/components/os/ChatHost');
    const {
      CHAT_STATE_KEY,
      loadChatEntries,
      writeChatEntry,
    } = await import('@/hooks/useChatWidgetState');
    const { fireEvent } = await import('@testing-library/react');
    const workspaceId = 'ws-stale-autonomy';
    window.localStorage.clear();
    loadChatEntries();
    window.localStorage.setItem(CHAT_STATE_KEY, JSON.stringify({
      version: 1,
      chats: { [workspaceId]: { autonomyLevel: 'yolo', autonomyExpiresAt: null } },
    }));
    expect(loadChatEntries()[workspaceId]?.autonomyLevel).toBe('yolo');

    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === CHAT_STATE_KEY) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    writeChatEntry(workspaceId, { autonomyLevel: 'normal', autonomyExpiresAt: null });
    expect(loadChatEntries()[workspaceId]?.autonomyLevel).toBe('normal');
    expect(JSON.parse(window.localStorage.getItem(CHAT_STATE_KEY) as string)
      .chats[workspaceId].autonomyLevel).toBe('yolo');
    setItemSpy.mockRestore();

    const guard = renderHook(() => useChatAutonomySnapshotGuard(workspaceId, 'yolo'));
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: [],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockReset();
    let durableAtSave: { autonomyLevel?: string; autonomyExpiresAt?: number | null } | undefined;
    mocks.adapter.savePermissions.mockImplementationOnce(async () => {
      durableAtSave = JSON.parse(window.localStorage.getItem(CHAT_STATE_KEY) as string)
        .chats[workspaceId];
    });

    try {
      const screen = await renderSettings();
      fireEvent.click(screen.getByRole('button', { name: /everything/i }));
      fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
      await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
      fireEvent.click(screen.getByTestId('default-autonomy-trusted'));
      await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'trusted' }));
      expect(durableAtSave).toMatchObject({ autonomyLevel: 'normal', autonomyExpiresAt: null });
    } finally {
      guard.unmount();
    }
  }, 15000);

  it('allows a safe downgrade to normal when chat storage is unavailable', async () => {
    const { useChatAutonomySnapshotGuard } = await import('@/components/os/ChatHost');
    const { CHAT_STATE_KEY } = await import('@/hooks/useChatWidgetState');
    const { fireEvent } = await import('@testing-library/react');
    window.localStorage.clear();
    const guard = renderHook(() => useChatAutonomySnapshotGuard('ws-safe-downgrade', 'trusted'));
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === CHAT_STATE_KEY) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'trusted',
      externalGates: [],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockReset();
    mocks.adapter.savePermissions.mockResolvedValueOnce(undefined);

    try {
      const screen = await renderSettings();
      fireEvent.click(screen.getByRole('button', { name: /everything/i }));
      fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
      await waitFor(() => expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'true'));
      fireEvent.click(screen.getByTestId('default-autonomy-normal'));
      await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'normal' }));
    } finally {
      setItemSpy.mockRestore();
      guard.unmount();
    }
  }, 15000);

  it('defers a first chat opened while an elevated default save is pending', async () => {
    const { ShellProvider } = await import('@/providers/ShellContext');
    const { default: ChatHost } = await import('@/components/os/ChatHost');
    const { default: SettingsApp } = await import('@/components/os/apps/SettingsApp');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    const { createMemoryRouter, RouterProvider } = await import('react-router-dom');
    const { render, screen, fireEvent } = await import('@testing-library/react');
    let resolveSave!: () => void;
    const save = new Promise<void>(resolve => { resolveSave = resolve; });
    mocks.adapter.getWorkspaces.mockReset().mockResolvedValue([{ id: 'ws-late', name: 'Late chat' }]);
    mocks.adapter.getTier.mockReset().mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.getPermissions.mockReset().mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: [],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockReset().mockReturnValueOnce(save);
    mocks.adapter.getSettings.mockResolvedValue({});
    mocks.adapter.getTelemetryStatus.mockResolvedValue({ enabled: false });
    mocks.adapter.getTeamStatus.mockResolvedValue({ connected: false });
    mocks.adapter.getServerUrl.mockReturnValue('http://127.0.0.1:3333');
    mocks.adapter.getProviders.mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' });
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
    const router = createMemoryRouter([{
      path: '*',
      element: (
        <ShellProvider>
          <TooltipProvider>
            <SettingsApp />
            <ChatHost />
          </TooltipProvider>
        </ShellProvider>
      ),
    }], { initialEntries: ['/home'] });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole('button', { name: /everything/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(screen.getByTestId('default-autonomy-trusted'));
    await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'trusted' }));

    await act(async () => { await router.navigate('/workspaces/ws-late/chat'); });
    expect(screen.queryByTestId('chat-instance-ws-late')).toBeNull();

    await act(async () => {
      resolveSave();
      await save;
    });
    expect(await screen.findByTestId('chat-instance-ws-late')).toBeInTheDocument();
  }, 15000);

  it('does not let a late StrictMode permission read overwrite a successful save', async () => {
    const { fireEvent } = await import('@testing-library/react');
    let resolveFirst!: (value: { defaultAutonomy: 'normal'; externalGates: string[]; workspaceOverrides: Record<string, string[]> }) => void;
    let resolveSecond!: (value: { defaultAutonomy: 'normal'; externalGates: string[]; workspaceOverrides: Record<string, string[]> }) => void;
    const first = new Promise<{ defaultAutonomy: 'normal'; externalGates: string[]; workspaceOverrides: Record<string, string[]> }>(
      resolve => { resolveFirst = resolve; },
    );
    const second = new Promise<{ defaultAutonomy: 'normal'; externalGates: string[]; workspaceOverrides: Record<string, string[]> }>(
      resolve => { resolveSecond = resolve; },
    );
    mocks.adapter.getPermissions.mockReset()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    mocks.adapter.getTier.mockReset().mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    mocks.adapter.savePermissions.mockResolvedValueOnce(undefined);

    const screen = await renderSettings(true);
    await waitFor(() => expect(mocks.adapter.getPermissions).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveSecond({ defaultAutonomy: 'normal', externalGates: [], workspaceOverrides: {} });
      await second;
    });

    fireEvent.click(screen.getByRole('button', { name: /everything/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(screen.getByTestId('default-autonomy-trusted'));
    await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'trusted' }));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'true'));

    await act(async () => {
      resolveFirst({ defaultAutonomy: 'normal', externalGates: [], workspaceOverrides: {} });
      await first;
    });
    expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'true');
  }, 15000);
});

// ── useChat catch semantics ────────────────────────────────────────────────

describe('useChat error surfacing (P1b)', () => {
  beforeEach(() => {
    mocks.adapter.getHistory.mockResolvedValue([]);
    mocks.adapter.abortAgent.mockReset().mockResolvedValue(undefined);
  });

  async function sendFailing(err: unknown) {
    const { useChat } = await import('@/hooks/useChat');
    mocks.adapter.sendMessage.mockImplementation(async function* (): AsyncGenerator<never> {
      throw err;
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-1' }));
    // Let the mount-time history fetch settle first — it resolves to [] and
    // would otherwise clobber the messages pushed by sendMessage.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.sendMessage('hello'); });
    return result;
  }

  it('HTTP failure renders a status-true error block, not the offline lie', async () => {
    const result = await sendFailing(httpError(500, { error: 'boom' }, 'boom'));
    const last = result.current.messages[result.current.messages.length - 1];
    const errBlock = last.blocks?.find(b => b.type === 'error') as { message?: string } | undefined;
    expect(errBlock?.message).toBe('Chat request failed (500): boom');
  });

  it('tier-403 copy defers to the UpgradeModal instead of duplicating the upsell', async () => {
    const result = await sendFailing(httpError(403, { error: 'TIER_INSUFFICIENT', required: 'TEAMS' }, 'Needs TEAMS'));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toBe('This action needs a higher plan — see the upgrade window.');
  });

  it('network failure keeps the Backend-is-offline copy', async () => {
    const result = await sendFailing(new TypeError('fetch failed'));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toBe('Backend is offline. Connect to a Waggle server to start chatting.');
  });

  // ── F2/F4: sendMessage success reporting + retryLastFailed ──
  it('sendMessage resolves true on a clean stream, false on HTTP failure', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-1' }));
    await act(async () => { await Promise.resolve(); });

    mocks.adapter.sendMessage.mockImplementation(async function* () {
      yield { type: 'done', data: { content: 'hi there' } };
    });
    let ok: boolean | void = undefined;
    await act(async () => { ok = await result.current.sendMessage('hello'); });
    expect(ok).toBe(true);

    mocks.adapter.sendMessage.mockImplementation(async function* (): AsyncGenerator<never> {
      throw httpError(500, { error: 'boom' }, 'boom');
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    let failed: boolean | void = undefined;
    await act(async () => { failed = await result.current.sendMessage('again'); });
    expect(failed).toBe(false);
  });

  it('reports only canonical terminal turns to the owning workspace and session', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const onTurnSettled = vi.fn();
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      onTurnSettled,
    }));
    await act(async () => { await Promise.resolve(); });

    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>(resolve => { releaseFirst = resolve; });
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        await firstHeld;
        yield { type: 'done', data: { content: 'first answer' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'error', data: { message: 'model failed' } };
      });

    let first!: Promise<boolean>;
    act(() => { first = result.current.sendMessage('first'); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await act(async () => {
      expect(await result.current.sendMessage('second')).toBe(true);
    });
    expect(onTurnSettled).not.toHaveBeenCalled();

    await act(async () => {
      releaseFirst();
      expect(await first).toBe(true);
    });
    await waitFor(() => expect(onTurnSettled).toHaveBeenCalledTimes(2));
    expect(onTurnSettled).toHaveBeenNthCalledWith(1, { workspaceId: 'ws-1', sessionId: 'sess-1' });
    expect(onTurnSettled).toHaveBeenNthCalledWith(2, { workspaceId: 'ws-1', sessionId: 'sess-1' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.adapter.sendMessage.mockImplementationOnce(async function* (): AsyncGenerator<never> {
      throw new TypeError('network down');
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    await act(async () => { await result.current.sendMessage('third'); });
    expect(onTurnSettled).toHaveBeenCalledTimes(2);
  });

  it('does not report a locally aborted stream as a settled turn', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const onTurnSettled = vi.fn();
    let releaseStream!: () => void;
    const heldStream = new Promise<void>(resolve => { releaseStream = resolve; });
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'partial' } };
      await heldStream;
      yield { type: 'done', data: { content: 'late final' } };
    });
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-1',
      onTurnSettled,
    }));
    await act(async () => { await Promise.resolve(); });

    let send!: Promise<boolean>;
    act(() => { send = result.current.sendMessage('stop this'); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await act(async () => { result.current.stopStreaming(); });
    expect(onTurnSettled).not.toHaveBeenCalled();

    await act(async () => {
      releaseStream();
      await send;
    });
    expect(onTurnSettled).not.toHaveBeenCalled();
    expect(mocks.adapter.abortAgent).toHaveBeenCalledWith('ws-1', 'sess-1');
  });

  it('retryLastFailed drops the failed pair and re-issues the same content (no duplicate user bubble)', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-1' }));
    await act(async () => { await Promise.resolve(); });

    mocks.adapter.sendMessage.mockImplementationOnce(async function* (): AsyncGenerator<never> {
      throw httpError(500, { error: 'boom' }, 'boom');
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    await act(async () => { await result.current.sendMessage('hello'); });
    expect(result.current.messages).toHaveLength(2); // user + assistant(error)

    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'recovered' } };
    });
    await act(async () => {
      result.current.retryLastFailed();
      await new Promise(r => setTimeout(r, 0));
    });

    const users = result.current.messages.filter(m => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(users[0].content).toBe('hello');
    // retryLastFailed identifies the exact persisted pair so the server cannot
    // delete a newer or merely identical-looking exchange.
    expect(mocks.adapter.sendMessage).toHaveBeenLastCalledWith(
      'ws-1',
      'hello',
      'sess-1',
      undefined,
      undefined,
      true,
      undefined,
      {
        kind: 'assistant-pair',
        expectedMessageCount: 2,
        expectedAssistantContent: 'Generation failed: Chat request failed (500): boom',
      },
    );
  });
});
