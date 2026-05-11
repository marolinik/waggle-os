/**
 * posthog.ts unit tests (Phase 2 P1 / DAY0-04)
 *
 * Run: npx vitest run apps/web/src/lib/posthog.test.ts
 *
 * Covers:
 *   Test 1 — When VITE_POSTHOG_KEY is absent, captureOnboardingComplete
 *             does NOT call posthog.capture.
 *   Test 2 — When user has opted out (waggle:telemetry-opt-out = 'true'),
 *             captureOnboardingComplete does NOT call posthog.capture.
 *   Test 3 — When key is present AND user is opted in,
 *             captureOnboardingComplete calls posthog.capture('onboarding_complete', payload).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Posthog mock ──────────────────────────────────────────────────────────────
// Must be declared before the module import so Vitest hoists the mock correctly.

const mockCapture = vi.fn();
const mockInit = vi.fn();
const mockOptOut = vi.fn();
const mockOptIn = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init: mockInit,
    capture: mockCapture,
    opt_out_capturing: mockOptOut,
    opt_in_capturing: mockOptIn,
  },
}));

// ── import.meta.env mock ──────────────────────────────────────────────────────
// We control PH_KEY presence by setting / clearing the env value before each test.

// ── localStorage mock ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ── Test helpers ──────────────────────────────────────────────────────────────

const OPT_OUT_KEY = 'waggle:telemetry-opt-out';

async function importPostHog() {
  // Re-import the module fresh for each test (Vitest clears module cache).
  // Using a dynamic import so vi.resetModules() takes effect.
  return import('./posthog.ts');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('posthog.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCapture.mockClear();
    mockInit.mockClear();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: VITE_POSTHOG_KEY absent → captureOnboardingComplete is a no-op', async () => {
    // Simulate absent key (import.meta.env.VITE_POSTHOG_KEY is undefined by default in test env)
    vi.stubEnv('VITE_POSTHOG_KEY', '');

    const { initPostHog, captureOnboardingComplete } = await importPostHog();

    await initPostHog();
    captureOnboardingComplete({ templateId: 'sales-pipeline', personaId: 'coder', model: 'claude-opus-4' });

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('Test 2: User opted out → captureOnboardingComplete is a no-op', async () => {
    // Set the opt-out key before importing so the module reads it.
    localStorageMock.setItem(OPT_OUT_KEY, 'true');

    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_testkey12345678901234567890123456789012');

    const { initPostHog, captureOnboardingComplete } = await importPostHog();

    await initPostHog();
    captureOnboardingComplete({ templateId: 'sales-pipeline', personaId: 'coder', model: 'claude-opus-4' });

    // posthog.init may or may not have been called (depends on module load order),
    // but posthog.capture must NOT have been called.
    expect(mockCapture).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('Test 3: Key present + opted in → captureOnboardingComplete calls posthog.capture', async () => {
    // Opted in (no opt-out key in localStorage).
    localStorageMock.removeItem(OPT_OUT_KEY);

    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_testkey12345678901234567890123456789012');

    const { initPostHog, captureOnboardingComplete } = await importPostHog();

    await initPostHog();

    const payload = { templateId: 'sales-pipeline', personaId: 'coder', model: 'claude-opus-4' };
    captureOnboardingComplete(payload);

    expect(mockCapture).toHaveBeenCalledOnce();
    expect(mockCapture).toHaveBeenCalledWith('onboarding_complete', {
      template_id: payload.templateId,
      persona_id: payload.personaId,
      model: payload.model,
    });

    vi.unstubAllEnvs();
  });
});
