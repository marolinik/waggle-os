/**
 * Wave T Lane A (item 1) — boot-time onboarding resolution.
 *
 * The wizard flashed for ~1s for a server-onboarded user whose webview
 * localStorage is fresh: /api/onboarding/status only resolved AFTER the shell
 * mounted. AppShell now holds the boot screen until the decision is KNOWN using
 * these two helpers. isOnboardingStatusKnownSync answers "can we decide without
 * the server?"; resolveReturningUserOnboarding persists the completed flag so
 * useOnboarding reads it synchronously and never paints the wizard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getOnboardingStatus: vi.fn(),
    markOnboardingComplete: vi.fn().mockResolvedValue(undefined),
  },
  isTauri: vi.fn(() => false),
  lifecycleListeners: [] as Array<(event: {
    status: 'restarting' | 'ready' | 'failed';
    endpoint?: { port: number; instanceId: string };
  }) => void>,
  listenDesktopServiceLifecycle: vi.fn(),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/lib/tauri-bindings', () => ({
  isTauri: mocks.isTauri,
  isFirstLaunch: vi.fn().mockResolvedValue(true),
  markFirstLaunchComplete: vi.fn().mockResolvedValue(undefined),
  listenDesktopServiceLifecycle: mocks.listenDesktopServiceLifecycle,
}));

const STORAGE_KEY = 'waggle:onboarding';
const PROFILE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('isOnboardingStatusKnownSync (Wave T item 1)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    mocks.adapter.getOnboardingStatus.mockReset();
    mocks.isTauri.mockReset().mockReturnValue(false);
    mocks.lifecycleListeners.length = 0;
    mocks.listenDesktopServiceLifecycle.mockReset().mockImplementation(async (listener) => {
      mocks.lifecycleListeners.push(listener);
      return () => {
        const index = mocks.lifecycleListeners.indexOf(listener);
        if (index >= 0) mocks.lifecycleListeners.splice(index, 1);
      };
    });
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('fresh localStorage → NOT known (must ask the server)', async () => {
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(false);
  });

  it('completed in localStorage → NOT known until the server confirms it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: true, step: 7 }));
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(false);
  });

  it('mid-wizard (step > 0) → NOT known until its profile is confirmed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: false, step: 3, profileId: PROFILE_A }));
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(false);
  });

  it('?skipOnboarding=true (E2E) → known', async () => {
    window.history.replaceState({}, '', '/?skipOnboarding=true');
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(true);
  });
});

describe('resolveReturningUserOnboarding (Wave T item 1)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    mocks.adapter.getOnboardingStatus.mockReset();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('RETURNING USER: server says completed → persists completed=true synchronously', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'legacy-evidence',
      profileId: PROFILE_A,
    });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.completed).toBe(true);
    expect(persisted.step).toBe(7);
    expect(persisted.profileId).toBe(PROFILE_A);
  });

  it('CONFIRMED CACHE: preserves returning-user choices without upgrading them', async () => {
    const cached = {
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-existing',
      templateId: 'research',
      personaId: 'researcher',
      completedAt: 1_777_777,
      profileId: PROFILE_A,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: true, source: 'flag', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(cached);
  });

  it('CLEAN INSTALL: server says not completed → does NOT persist completion', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw == null || JSON.parse(raw).completed !== true).toBe(true);
  });

  it('sidecar unreachable → does NOT persist (fail toward the wizard)', async () => {
    mocks.adapter.getOnboardingStatus.mockRejectedValue(new Error('ECONNREFUSED'));
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw == null || JSON.parse(raw).completed !== true).toBe(true);
  });

  it('reports unavailable so AppShell keeps provisional cache behind the recovery gate', async () => {
    mocks.adapter.getOnboardingStatus.mockRejectedValue(new Error('ECONNREFUSED'));
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await expect(resolveReturningUserOnboarding()).resolves.toBe('unavailable');
  });

  it('STALE BROWSER CACHE: fresh server resets locally completed onboarding', async () => {
    localStorage.setItem('waggle:tooltips_done', 'true');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      profileId: PROFILE_B,
      workspaceId: 'foreign-workspace',
      templateId: 'research',
      personaId: 'researcher',
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    });
    expect(localStorage.getItem('waggle:tooltips_done')).toBeNull();
  });

  it('LEGACY STALE CACHE: fresh server removes the old completion marker', async () => {
    localStorage.setItem('waggle_onboarding_complete', 'true');
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(localStorage.getItem('waggle_onboarding_complete')).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    });
  });

  it('DELAYED LEGACY CACHE: internal migration cannot hide an authoritative fresh server', async () => {
    localStorage.setItem('waggle_onboarding_complete', 'true');
    let settle!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    const pending = new Promise<{ completed: false; source: 'none'; profileId: string }>((resolve) => { settle = resolve; });
    mocks.adapter.getOnboardingStatus.mockReturnValue(pending);
    const { resolveReturningUserOnboarding, useOnboarding } = await import('@/hooks/useOnboarding');

    const bootProbe = resolveReturningUserOnboarding();
    renderHook(() => useOnboarding());
    settle({ completed: false, source: 'none', profileId: PROFILE_A });
    await act(async () => { await bootProbe; });

    expect(localStorage.getItem('waggle_onboarding_complete')).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_A,
    });
  });

  it('COEXISTING CACHE: a legacy marker cannot overwrite richer modern choices', async () => {
    const cached = {
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-existing',
      templateId: 'research',
      personaId: 'researcher',
      completedAt: 1_888_888,
      profileId: PROFILE_A,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    localStorage.setItem('waggle_onboarding_complete', 'true');
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: true, source: 'flag', profileId: PROFILE_A });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(cached);
    expect(localStorage.getItem('waggle_onboarding_complete')).toBeNull();
  });

  it('OFFLINE RETURNING USER: preserves cached completion when confirmation is unavailable', async () => {
    const cached = {
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'workspace-existing',
      profileId: PROFILE_A,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    mocks.adapter.getOnboardingStatus.mockRejectedValue(new Error('ECONNREFUSED'));
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(cached);
  });

  it('DIFFERENT COMPLETED PROFILE: drops foreign scoped choices', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      tier: 'simple',
      workspaceId: 'foreign-workspace',
      templateId: 'research',
      personaId: 'researcher',
      profileSeeded: true,
      toolsUsed: ['github'],
      profileId: PROFILE_B,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'flag',
      profileId: PROFILE_A,
    });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');

    await resolveReturningUserOnboarding();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: true,
      step: 7,
      tier: 'simple',
      tooltipsDismissed: true,
      profileId: PROFILE_A,
    });
  });
});

describe('AppShell profile recovery gate', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    mocks.adapter.getOnboardingStatus.mockReset();
    mocks.isTauri.mockReset().mockReturnValue(false);
    mocks.lifecycleListeners.length = 0;
    mocks.listenDesktopServiceLifecycle.mockReset().mockImplementation(async (listener) => {
      mocks.lifecycleListeners.push(listener);
      return () => {
        const index = mocks.lifecycleListeners.indexOf(listener);
        if (index >= 0) mocks.lifecycleListeners.splice(index, 1);
      };
    });
  });
  afterEach(() => cleanup());

  it('announces the protected hold and offers an explicit retry action', async () => {
    const { OnboardingRecoveryNotice } = await import('@/components/os/AppShell');
    const onRetry = vi.fn();

    render(OnboardingRecoveryNotice({ retrying: false, onRetry }));

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(/workspace stays protected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Connection' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('executes unavailable → retrying → confirmed without exposing provisional state', async () => {
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');

    const { result } = renderHook(() => useOnboardingProfileGate());
    await waitFor(() => expect(result.current.resolution).toBe('unavailable'));
    expect(result.current.recoveryVisible).toBe(true);

    act(() => result.current.retry());
    expect(result.current.resolution).toBe('checking');
    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    expect(result.current.recoveryVisible).toBe(false);
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('automatically recovers at the AppShell owner when the browser returns online', async () => {
    mocks.adapter.getOnboardingStatus
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_A });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');

    const { result } = renderHook(() => useOnboardingProfileGate());
    await waitFor(() => expect(result.current.resolution).toBe('unavailable'));
    act(() => window.dispatchEvent(new Event('online')));

    expect(result.current.resolution).toBe('checking');
    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('revalidates the active profile when AppShell remounts after a missed generation event', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag', profileId: PROFILE_A })
      .mockResolvedValueOnce({ completed: false, source: 'none', profileId: PROFILE_B });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');

    const first = renderHook(() => useOnboardingProfileGate());
    await waitFor(() => expect(first.result.current.resolution).toBe('confirmed'));
    first.unmount();

    const second = renderHook(() => useOnboardingProfileGate());
    await waitFor(() => expect(second.result.current.resolution).toBe('confirmed'));
    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });
  });

  it('coalesces production reconnect events and covers profile A until profile B confirms', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      workspaceId: 'profile-a-workspace',
      profileId: PROFILE_A,
    }));
    let settleProfileB!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag', profileId: PROFILE_A })
      .mockReturnValueOnce(new Promise((resolve) => { settleProfileB = resolve; }));
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');
    const { result } = renderHook(() => useOnboardingProfileGate());
    const connected = () => window.dispatchEvent(new CustomEvent('waggle:connect-settled', {
      detail: { connected: true },
    }));

    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    act(connected);
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);

    act(() => {
      connected();
      connected();
    });
    expect(result.current.resolution).toBe('checking');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').profileId).toBe(PROFILE_A);
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);

    settleProfileB({ completed: false, source: 'none', profileId: PROFILE_B });
    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('covers a real Tauri restart until the replacement profile confirms', async () => {
    mocks.isTauri.mockReturnValue(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      workspaceId: 'profile-a-workspace',
      profileId: PROFILE_A,
    }));
    let settleProfileB!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag', profileId: PROFILE_A })
      .mockReturnValueOnce(new Promise((resolve) => { settleProfileB = resolve; }));
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');
    const { result } = renderHook(() => useOnboardingProfileGate());

    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    await waitFor(() => expect(mocks.lifecycleListeners).toHaveLength(1));
    act(() => mocks.lifecycleListeners[0]({ status: 'restarting' }));
    expect(result.current.resolution).toBe('checking');

    act(() => mocks.lifecycleListeners[0]({
      status: 'ready',
      endpoint: { port: 43123, instanceId: 'replacement' },
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
    settleProfileB({ completed: false, source: 'none', profileId: PROFILE_B });
    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').profileId).toBe(PROFILE_B);
  });

  it('uses only the Tauri lifecycle owner during restart and ignores transport success events', async () => {
    mocks.isTauri.mockReturnValue(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      profileId: PROFILE_A,
    }));
    let settleProfileB!: (value: { completed: false; source: 'none'; profileId: string }) => void;
    mocks.adapter.getOnboardingStatus
      .mockResolvedValueOnce({ completed: true, source: 'flag', profileId: PROFILE_A })
      .mockReturnValueOnce(new Promise((resolve) => { settleProfileB = resolve; }))
      .mockRejectedValueOnce(new Error('unexpected duplicate Tauri profile probe'));
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');
    const { result } = renderHook(() => useOnboardingProfileGate());
    const connected = () => window.dispatchEvent(new CustomEvent('waggle:connect-settled', {
      detail: { connected: true },
    }));

    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    await waitFor(() => expect(mocks.lifecycleListeners).toHaveLength(1));
    act(() => mocks.lifecycleListeners[0]({ status: 'restarting' }));
    act(connected);

    expect(result.current.resolution).toBe('checking');
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);

    act(() => mocks.lifecycleListeners[0]({
      status: 'ready',
      endpoint: { port: 43123, instanceId: 'replacement' },
    }));
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
    settleProfileB({ completed: false, source: 'none', profileId: PROFILE_B });
    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));

    act(connected);
    await act(async () => { await Promise.resolve(); });
    expect(result.current.resolution).toBe('confirmed');
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(2);
  });

  it('ignores an unsolicited initial Tauri ready event', async () => {
    mocks.isTauri.mockReturnValue(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'flag',
      profileId: PROFILE_A,
    });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');
    const { result } = renderHook(() => useOnboardingProfileGate());

    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    await waitFor(() => expect(mocks.lifecycleListeners).toHaveLength(1));
    act(() => mocks.lifecycleListeners[0]({
      status: 'ready',
      endpoint: { port: 43123, instanceId: 'initial' },
    }));

    expect(result.current.resolution).toBe('confirmed');
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached profile protected when the Tauri replacement fails', async () => {
    mocks.isTauri.mockReturnValue(true);
    const cached = {
      completed: true,
      step: 7,
      workspaceId: 'profile-a-workspace',
      profileId: PROFILE_A,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: true,
      source: 'flag',
      profileId: PROFILE_A,
    });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');
    const { result } = renderHook(() => useOnboardingProfileGate());

    await waitFor(() => expect(result.current.resolution).toBe('confirmed'));
    await waitFor(() => expect(mocks.lifecycleListeners).toHaveLength(1));
    act(() => mocks.lifecycleListeners[0]({ status: 'restarting' }));
    act(() => mocks.lifecycleListeners[0]({ status: 'failed' }));

    expect(result.current.resolution).toBe('unavailable');
    expect(result.current.recoveryVisible).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      ...cached,
      tier: 'simple',
    });
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
  });

  it('fails closed and retries registration when the Tauri lifecycle listener is unavailable', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.listenDesktopServiceLifecycle
      .mockRejectedValueOnce(new Error('event bridge unavailable'))
      .mockImplementationOnce(async (listener) => {
        mocks.lifecycleListeners.push(listener);
        return () => {
          const index = mocks.lifecycleListeners.indexOf(listener);
          if (index >= 0) mocks.lifecycleListeners.splice(index, 1);
        };
      });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: false,
      source: 'none',
      profileId: PROFILE_B,
    });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');

    const gate = renderHook(() => useOnboardingProfileGate());

    await waitFor(() => expect(gate.result.current.resolution).toBe('unavailable'));
    expect(gate.result.current.recoveryVisible).toBe(true);
    expect(mocks.adapter.getOnboardingStatus).not.toHaveBeenCalled();

    act(() => gate.result.current.retry());

    await waitFor(() => expect(gate.result.current.resolution).toBe('confirmed'));
    expect(mocks.listenDesktopServiceLifecycle).toHaveBeenCalledTimes(2);
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });
    gate.unmount();
    expect(mocks.lifecycleListeners).toHaveLength(0);
  });

  it('replaces a hung Tauri lifecycle registration after the protected timeout', async () => {
    mocks.isTauri.mockReturnValue(true);
    let staleListener!: (event: { status: 'restarting' | 'ready' | 'failed' }) => void;
    let settleStaleRegistration!: (unlisten: () => void) => void;
    const staleUnlisten = vi.fn();
    mocks.listenDesktopServiceLifecycle
      .mockImplementationOnce((listener) => {
        staleListener = listener;
        return new Promise((resolve) => { settleStaleRegistration = resolve; });
      })
      .mockImplementationOnce(async (listener) => {
        mocks.lifecycleListeners.push(listener);
        return () => {
          const index = mocks.lifecycleListeners.indexOf(listener);
          if (index >= 0) mocks.lifecycleListeners.splice(index, 1);
        };
      });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: true,
      step: 7,
      profileId: PROFILE_A,
    }));
    mocks.adapter.getOnboardingStatus.mockResolvedValue({
      completed: false,
      source: 'none',
      profileId: PROFILE_B,
    });
    const { useOnboardingProfileGate } = await import('@/components/os/AppShell');
    const gate = renderHook(() => useOnboardingProfileGate());

    await waitFor(() => expect(gate.result.current.resolution).toBe('unavailable'), { timeout: 4_000 });
    expect(mocks.adapter.getOnboardingStatus).not.toHaveBeenCalled();

    act(() => gate.result.current.retry());

    await waitFor(() => expect(gate.result.current.resolution).toBe('confirmed'));
    expect(mocks.listenDesktopServiceLifecycle).toHaveBeenCalledTimes(2);
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      completed: false,
      step: 0,
      profileId: PROFILE_B,
    });

    settleStaleRegistration(staleUnlisten);
    await act(async () => { await Promise.resolve(); });
    expect(staleUnlisten).toHaveBeenCalledTimes(1);
    expect(mocks.lifecycleListeners).toHaveLength(1);

    act(() => staleListener({ status: 'restarting' }));
    expect(gate.result.current.resolution).toBe('confirmed');
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
  });
});
