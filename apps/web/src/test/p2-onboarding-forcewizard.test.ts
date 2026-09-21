/**
 * P2 regression lock — the ?forceWizard reset must fire ONCE per page load.
 *
 * Found by the acceptance-check-8 live run: loadState() also runs in the
 * 'waggle:onboarding-sync' listener, so without the once-per-load latch every
 * wizard save (e.g. workspace-create persisting workspaceId) triggered a sync
 * reload that reset state to {completed:false, step:0} AND wiped the
 * just-saved fields — onFinish then ran with a fallback `local-*` id and the
 * chat seeding/navigation chain silently broke, stranding the user on /home.
 *
 * vi.resetModules() per test gives each test a fresh module-level latch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    // P4: the auto-complete effect keys on /api/onboarding/status now (the
    // workspace count counted the boot-seeded default — clean-install skip).
    getOnboardingStatus: vi.fn().mockResolvedValue({ completed: false }),
    markOnboardingComplete: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/lib/tauri-bindings', () => ({
  isTauri: () => false,
  isFirstLaunch: vi.fn().mockResolvedValue(true),
  markFirstLaunchComplete: vi.fn().mockResolvedValue(undefined),
}));

const PROFILE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('useOnboarding ?forceWizard latch (P2)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('resets to step 0 at load, but wizard saves SURVIVE the sync reload', async () => {
    window.history.replaceState({}, '', '/?forceWizard=true');
    localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7 }));

    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());
    // The forced reset applied at page load:
    expect(result.current.state.completed).toBe(false);
    expect(result.current.state.step).toBe(0);

    // A mid-wizard save (workspace-create persisting its result). saveState()
    // fires the waggle:onboarding-sync event, whose handler reloads via
    // loadState() — pre-fix, that re-ran the forceWizard reset and wiped this.
    act(() => { result.current.update({ workspaceId: 'ws-live', step: 4 }); });

    expect(result.current.state.workspaceId).toBe('ws-live');
    expect(result.current.state.step).toBe(4);
    const persisted = JSON.parse(localStorage.getItem('waggle:onboarding') ?? '{}');
    expect(persisted.workspaceId).toBe('ws-live');
  });

  it('completion survives too — complete() is not undone by the sync reload', async () => {
    window.history.replaceState({}, '', '/?forceWizard=true');
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());

    act(() => { result.current.update({ workspaceId: 'ws-live' }); });
    await act(async () => { await result.current.complete(); });

    expect(result.current.state.completed).toBe(true);
    // The wizard-completion shape keeps the saved fields (no defaultState wipe).
    expect(result.current.state.workspaceId).toBe('ws-live');
  });

  it('without forceWizard, profile-bound persisted completion loads as-is', async () => {
    window.history.replaceState({}, '', '/');
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'power',
      profileId: PROFILE_A,
    }));
    const { useOnboarding } = await import('@/hooks/useOnboarding');
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.state.completed).toBe(true);
  });
});
