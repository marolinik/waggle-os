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
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/lib/tauri-bindings', () => ({
  isTauri: () => false,
  isFirstLaunch: vi.fn().mockResolvedValue(true),
  markFirstLaunchComplete: vi.fn().mockResolvedValue(undefined),
}));

describe('useOnboarding clean-install gate (P4)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('CLEAN INSTALL: server says not completed → the wizard stays (no auto-complete)', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none' });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalled());
    // Give any (wrong) auto-complete a tick to land, then assert it didn't.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.completed).toBe(false);
  });

  it('RETURNING USER: server says completed → auto-completes the wizard', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: true, source: 'legacy-evidence' });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(result.current.state.completed).toBe(true));
    expect(result.current.state.step).toBe(7);
  });

  it('sidecar unreachable → stays on the wizard (fail toward onboarding)', async () => {
    mocks.adapter.getOnboardingStatus.mockRejectedValue(new Error('ECONNREFUSED'));
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.completed).toBe(false);
  });

  it('MID-WIZARD: step > 0 never auto-completes — an in-wizard C33 import must not eject the user', async () => {
    // The import step writes personal-mind frames BEFORE completion — that is
    // legacy evidence to the server. A refresh mid-wizard must keep the wizard.
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: true, source: 'legacy-evidence' });
    localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: false, step: 3 }));
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    await act(async () => { await Promise.resolve(); });
    expect(mocks.adapter.getOnboardingStatus).not.toHaveBeenCalled();
    expect(result.current.state.completed).toBe(false);
    expect(result.current.state.step).toBe(3);
  });

  it('completing the wizard stamps the server-side flag', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none' });
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    act(() => { result.current.complete(); });

    expect(result.current.state.completed).toBe(true);
    expect(mocks.adapter.markOnboardingComplete).toHaveBeenCalledTimes(1);
  });
});
