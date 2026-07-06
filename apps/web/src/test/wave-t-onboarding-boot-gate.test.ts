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

const STORAGE_KEY = 'waggle:onboarding';

describe('isOnboardingStatusKnownSync (Wave T item 1)', () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/'); });
  afterEach(() => { vi.clearAllMocks(); });

  it('fresh localStorage → NOT known (must ask the server)', async () => {
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(false);
  });

  it('completed in localStorage → known', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: true, step: 7 }));
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(true);
  });

  it('mid-wizard (step > 0) → known (the server is never consulted mid-wizard)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: false, step: 3 }));
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(true);
  });

  it('?skipOnboarding=true (E2E) → known', async () => {
    window.history.replaceState({}, '', '/?skipOnboarding=true');
    const { isOnboardingStatusKnownSync } = await import('@/hooks/useOnboarding');
    expect(isOnboardingStatusKnownSync()).toBe(true);
  });
});

describe('resolveReturningUserOnboarding (Wave T item 1)', () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/'); });
  afterEach(() => { vi.clearAllMocks(); });

  it('RETURNING USER: server says completed → persists completed=true synchronously', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: true, source: 'legacy-evidence' });
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    expect(mocks.adapter.getOnboardingStatus).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.completed).toBe(true);
    expect(persisted.step).toBe(7);
  });

  it('CLEAN INSTALL: server says not completed → does NOT persist completion', async () => {
    mocks.adapter.getOnboardingStatus.mockResolvedValue({ completed: false, source: 'none' });
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

  it('already known locally (completed) → skips the server probe entirely', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: true, step: 7 }));
    const { resolveReturningUserOnboarding } = await import('@/hooks/useOnboarding');
    await resolveReturningUserOnboarding();
    expect(mocks.adapter.getOnboardingStatus).not.toHaveBeenCalled();
  });
});
