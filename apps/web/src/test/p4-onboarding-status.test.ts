/**
 * P4 — clean-install onboarding fix (S4 founder flag, confirmed):
 * useOnboarding's returning-user auto-complete keys on the server's
 * /api/onboarding/status, NOT the workspace count. The boot-time
 * wsManager.ensureDefault() stub gave every clean install ≥1 workspace, so
 * the old `getWorkspaces().length > 0` evidence silently skipped the wizard
 * for brand-new production users.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getOnboardingStatus: vi.fn(),
    markOnboardingComplete: vi.fn().mockResolvedValue(undefined),
  },
  isTauri: vi.fn(() => false),
  tauriIsFirstLaunch: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/lib/tauri-bindings', () => ({
  isTauri: mocks.isTauri,
  isFirstLaunch: mocks.tauriIsFirstLaunch,
  markFirstLaunchComplete: vi.fn().mockResolvedValue(undefined),
}));

const PROFILE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('useOnboarding clean-install gate (P4)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    mocks.adapter.getOnboardingStatus.mockReset();
    mocks.adapter.markOnboardingComplete.mockReset().mockResolvedValue(undefined);
    mocks.isTauri.mockReset().mockReturnValue(false);
    mocks.tauriIsFirstLaunch.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('CLEAN INSTALL: server says not completed → the wizard stays (no auto-complete)', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalled());
    // Give any (wrong) auto-complete a tick to land, then assert it didn't.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.completed).toBe(false);
  });

  it('RETURNING USER: server says completed → auto-completes the wizard', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'legacy-evidence',
      profileId: PROFILE_A,
    });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(result.current.state.completed).toBe(true));
    expect(result.current.state.step).toBe(7);
    expect(result.current.state.profileId).toBe(PROFILE_A);
  });

  it('sidecar unreachable → stays on the wizard (fail toward onboarding)', async () => {
    mocks.adapter.getOnboardingStatus.mockRejectedValue(new Error('ECONNREFUSED'));
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.completed).toBe(false);
  });

  it('STORAGE DENIED: reconciliation classifies the profile as unavailable instead of rejecting', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: false,
      source: 'none',
      profileId: PROFILE_A,
    });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key: string) {
      if (key === 'waggle:onboarding') throw new DOMException('Access denied', 'SecurityError');
      return null;
    });
    try {
      await expect(resolveReturningUserOnboarding()).resolves.toBe('unavailable');
      expect(mocks.adapter.getOnboardingStatus).not.toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
    }
  });

  it('STALE WEBVIEW: a fresh server resets completion before the hook mounts', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-from-another-data-dir',
      profileId: PROFILE_B,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.state).toEqual({ completed: false, step: 0, profileId: PROFILE_A });
  });

  it('TAURI STALE FLAG: an authoritative fresh server keeps the wizard visible', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.tauriIsFirstLaunch.mockResolvedValue(false);
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.state).toEqual({ completed: false, step: 0, profileId: PROFILE_A });
  });

  it('TAURI PENDING: a stale filesystem flag cannot beat an in-flight fresh-server result', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.tauriIsFirstLaunch.mockResolvedValue(false);
    let settleServer!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    const pendingServer = new Promise<{ completed: false; source: 'none'; profileId: string }>((resolve) => {
      settleServer = resolve;
    });
    mocks.adapter.getOnboardingStatus.mockReturnValue(pendingServer);
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await act(async () => { await Promise.resolve(); });
    settleServer({ completed: false, source: 'none', profileId: PROFILE_A });
    await act(async () => { await bootProbe; });

    expect(result.current.state).toEqual({ completed: false, step: 0, profileId: PROFILE_A });
  });

  it('STALE SHELL WRITE: incidental cache changes cannot hide an authoritative fresh server', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-from-another-data-dir',
      profileId: PROFILE_B,
    }));
    let settleServer!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    const pendingServer = new Promise<{ completed: false; source: 'none'; profileId: string }>((resolve) => {
      settleServer = resolve;
    });
    mocks.adapter.getOnboardingStatus.mockReturnValue(pendingServer);
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-from-another-data-dir',
      tooltipsDismissed: true,
      profileId: PROFILE_B,
    }));
    settleServer({ completed: false, source: 'none', profileId: PROFILE_A });
    await bootProbe;

    expect(JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    });
  });

  it('OFFLINE CACHE: rechecks once the sidecar reconnects, then reveals a fresh wizard', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-from-another-data-dir',
      profileId: PROFILE_B,
    }));
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.state.completed).toBe(true);

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('OFFLINE MID-WIZARD: reconnect reconciles foreign progress against the active profile', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 3,
      workspaceId: 'foreign-workspace',
      profileId: PROFILE_B,
    }));
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('boot offline'))
      .mockRejectedValueOnce(new Error('mount offline'))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A });
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
      useOnboarding,
    } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2));
    expect(result.current.state).toMatchObject({
      completed: false,
      step: 3,
      workspaceId: 'foreign-workspace',
      profileId: PROFILE_B,
    });

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(3);
  });

  it('OFFLINE MATCHING WIZARD: reconnect confirms and preserves same-profile progress', async () => {
    const cached = {
      completed: false,
      step: 3,
      workspaceId: 'profile-a-workspace',
      profileId: PROFILE_A,
    };
    localStorage.setItem('waggle:onboarding', JSON.stringify(cached));
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('boot offline'))
      .mockRejectedValueOnce(new Error('mount offline'))
      .mockResolvedValueOnce({ completed: false, source: 'pending', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2));

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(3));
    expect(result.current.state).toEqual(cached);
  });

  it('PRODUCTION RECONNECT: concurrent generation checks keep one successful profile result', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 3,
      workspaceId: 'foreign-workspace',
      profileId: PROFILE_B,
    }));
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('boot offline'))
      .mockRejectedValueOnce(new Error('mount offline'))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A })
      .mockRejectedValueOnce(new Error('unexpected duplicate probe'));
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
      useOnboarding,
    } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2));

    await act(async () => {
      await Promise.all([
        revalidateReturningUserOnboarding(),
        revalidateReturningUserOnboarding(),
      ]);
    });

    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(3);
  });

  it('LATE FOREIGN ADVANCE: delayed profile response never relabels foreign wizard state', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 1,
      personaId: 'researcher',
      workspaceId: 'foreign-workspace',
      profileId: PROFILE_B,
    }));
    let settle!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    mocks.adapter.getOnboardingStatus.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
      useOnboarding,
    } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    act(() => { result.current.update({ step: 2 }); });
    settle({ completed: false, source: 'none', profileId: PROFILE_A });
    await act(async () => { await bootProbe; });

    expect(result.current.state).toEqual({ completed: false, step: 0, profileId: PROFILE_A });
  });

  it('LATE UNBOUND LEGACY ADVANCE: scoped legacy progress is never claimed by a new profile', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 1,
      profileSeeded: true,
      personaId: 'researcher',
      workspaceId: 'legacy-workspace',
    }));
    let settle!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    mocks.adapter.getOnboardingStatus.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    act(() => { result.current.update({ step: 2 }); });
    settle({ completed: false, source: 'none', profileId: PROFILE_A });
    await act(async () => { await bootProbe; });

    expect(result.current.state).toEqual({ completed: false, step: 0, profileId: PROFILE_A });
  });

  it('SAME PROFILE COMPLETION: a missing server flag preserves choices without an unbound repair write', async () => {
    const cached = {
      completed: true,
      step: 7,
      tier: 'simple' as const,
      workspaceId: 'profile-a-workspace',
      personaId: 'researcher',
      profileId: PROFILE_A,
    };
    localStorage.setItem('waggle:onboarding', JSON.stringify(cached));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: false,
      source: 'pending',
      profileId: PROFILE_A,
    });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}')).toEqual(cached);
    expect(mocks.adapter.markOnboardingComplete).not.toHaveBeenCalled();
  });

  it('SAME PROFILE FLAG: authoritative completion advances a stale mid-wizard cache', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 3,
      tier: 'simple',
      workspaceId: 'profile-a-workspace',
      personaId: 'researcher',
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'flag',
      profileId: PROFILE_A,
    });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}')).toEqual({
      completed: true,
      step: 7,
      tier: 'simple',
      tooltipsDismissed: true,
      profileId: PROFILE_A,
    });
  });

  it('SERVICE GENERATION: a successful reconnect revalidates a previously confirmed profile', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'profile-a-workspace',
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag', profileId: PROFILE_A })
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_B });
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
      useOnboarding,
    } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await act(async () => {
      await revalidateReturningUserOnboarding();
    });

    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('HUNG OLD GENERATION: replacement profile check does not wait for the stale endpoint', async () => {
    mocks.adapter.getOnboardingStatus
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A });
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
    } = await import('@/hooks/useOnboarding');

    void resolveReturningUserOnboarding();
    void revalidateReturningUserOnboarding();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('LATE OLD GENERATION: a replaced profile result cannot overwrite the confirmed successor', async () => {
    let settleProfileA!: (value: { completed: true; source: 'flag'; profileId: string }) => void;
    mocks.adapter.getOnboardingStatus
      .mockReturnValueOnce(new Promise((resolve) => { settleProfileA = resolve; }))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_B });
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
    } = await import('@/hooks/useOnboarding');

    const staleProbe = resolveReturningUserOnboarding();
    await expect(revalidateReturningUserOnboarding()).resolves.toBe('confirmed');
    expect(JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });

    settleProfileA({ completed: true, source: 'flag', profileId: PROFILE_A });
    await expect(staleProbe).resolves.toBe('confirmed');

    expect(JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });
    await expect(resolveReturningUserOnboarding()).resolves.toBe('confirmed');
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('HUNG FORCED GENERATION: an explicit retry replaces a stalled reconnect probe', async () => {
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag', profileId: PROFILE_A })
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_B });
    const {
      resolveReturningUserOnboarding,
      revalidateReturningUserOnboarding,
    } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    void revalidateReturningUserOnboarding();
    await act(async () => { await Promise.resolve(); });
    const recovered = revalidateReturningUserOnboarding(true);

    await expect(recovered).resolves.toBe('confirmed');
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(3);
    expect(JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });
  });

  it('CONFIRMED CACHE: recovery events do not poll an already confirmed server state', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: true, source: 'flag', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    renderHook(() => useOnboarding());
    window.dispatchEvent(new Event('online'));
    await act(async () => { await Promise.resolve(); });

    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
  });

  it('FRESH OFFLINE: reconnect completes a returning user after both startup probes fail', async () => {
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('boot offline'))
      .mockRejectedValueOnce(new Error('mount offline'))
      .mockResolvedValueOnce({ completed: true, source: 'database', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2));
    expect(result.current.state.completed).toBe(false);

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(result.current.state.completed).toBe(true));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(3);
  });

  it.each([
    { completed: false as const, source: 'none', profileId: PROFILE_A },
    { completed: true as const, source: 'database', profileId: PROFILE_A },
  ])('LATE BOOT $completed: preserves an already-started wizard', async (status) => {
    let settle!: (value: typeof status) => void;
    const pending = new Promise<typeof status>((resolve) => { settle = resolve; });
    mocks.adapter.getOnboardingStatus.mockReturnValue(pending);
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.update({
      step: 2,
      profileSeeded: true,
      personaId: 'researcher',
      workspaceId: 'workspace-in-progress',
    }));
    settle(status);
    await act(async () => { await bootProbe; });

    expect(result.current.state).toMatchObject({
      completed: false,
      step: 2,
      profileSeeded: true,
      personaId: 'researcher',
      workspaceId: 'workspace-in-progress',
      profileId: PROFILE_A,
    });
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
  });

  it('SINGLE FLIGHT: boot and hook mount share one pending status request', async () => {
    let settle!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    const pending = new Promise<{ completed: false; source: 'none'; profileId: string }>((resolve) => { settle = resolve; });
    mocks.adapter.getOnboardingStatus.mockReturnValue(pending);
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    renderHook(() => useOnboarding());
    await act(async () => { await Promise.resolve(); });
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);

    settle({ completed: false, source: 'none', profileId: PROFILE_A });
    await act(async () => { await bootProbe; });
  });

  it('CONFIRMED FRESH: recovery events do not re-probe a confirmed false state', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    renderHook(() => useOnboarding());
    window.dispatchEvent(new Event('online'));
    await act(async () => { await Promise.resolve(); });

    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
  });

  it('REPEATED OFFLINE: duplicate recovery events coalesce and preserve cache until confirmation', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      profileId: PROFILE_B,
    }));
    let rejectRetry!: (reason: Error) => void;
    const pendingRetry = new Promise<never>((_resolve, reject) => { rejectRetry = reject; });
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('boot offline'))
      .mockReturnValueOnce(pendingRetry)
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2));

    rejectRetry(new Error('still offline'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.completed).toBe(true);

    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(3);
  });

  it('MID-WIZARD: step > 0 never auto-completes — an in-wizard C33 import must not eject the user', async () => {
    // The import step writes personal-mind frames BEFORE completion — that is
    // legacy evidence to the server. A refresh mid-wizard must keep the wizard.
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'legacy-evidence',
      profileId: PROFILE_A,
    });
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 3,
      profileId: PROFILE_A,
    }));
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());

    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
    expect(result.current.state.completed).toBe(false);
    expect(result.current.state.step).toBe(3);
    expect(result.current.state.profileId).toBe(PROFILE_A);
  });

  it('FOREIGN MID-WIZARD: a different profile resets scoped progress', async () => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: false,
      step: 3,
      personaId: 'researcher',
      workspaceId: 'foreign-workspace',
      profileId: PROFILE_B,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: false,
      source: 'pending',
      profileId: PROFILE_A,
    });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    }));
  });

  it('MISSING PROFILE ID: stays unconfirmed and retries on reconnect', async () => {
    const cached = {
      completed: true,
      step: 7,
      tier: 'simple' as const,
      workspaceId: 'cached-workspace',
      profileId: PROFILE_A,
    };
    localStorage.setItem('waggle:onboarding', JSON.stringify(cached));
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag' })
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_B });
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.state).toEqual(cached);

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(result.current.state).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('completing the wizard stamps the server-side flag', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(result.current.state.profileId).toBe(PROFILE_A));
    act(() => { result.current.complete(); });

    expect(result.current.state.completed).toBe(true);
    expect(mocks.adapter.markOnboardingComplete).toHaveBeenCalledTimes(1);
  });
});
