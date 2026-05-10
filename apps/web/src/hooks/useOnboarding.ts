import { useState, useCallback, useEffect } from 'react';
import type { UserTier } from '@/lib/dock-tiers';
import { adapter } from '@/lib/adapter';
import {
  isTauri,
  isFirstLaunch as tauriIsFirstLaunch,
  markFirstLaunchComplete as tauriMarkFirstLaunchComplete,
} from '@/lib/tauri-bindings';

export interface OnboardingState {
  completed: boolean;
  step: number;
  tier?: UserTier;
  workspaceId?: string;
  apiKeySet?: boolean;
  templateId?: string;
  personaId?: string;
  tooltipsDismissed?: boolean;
}

const STORAGE_KEY = 'waggle:onboarding';

const defaultState: OnboardingState = {
  completed: false,
  step: 0,
};

function loadState(): OnboardingState {
  try {
    // E2E test bypass: ?skipOnboarding=true skips wizard and sets tier to 'power'
    const params = new URLSearchParams(window.location.search);
    if (params.get('skipOnboarding') === 'true') {
      const tier = (params.get('tier') as UserTier) || 'power';
      const done: OnboardingState = { ...defaultState, completed: true, step: 7, tier, tooltipsDismissed: true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
      return done;
    }

    // PM walkthrough bypass (DEV only): ?forceWizard=true forces the wizard to
    // render at step 0 regardless of localStorage state OR the auto-complete
    // branch in this hook (which fires when /api/workspaces.length > 0,
    // including the boot-time default-workspace stub from
    // wsManager.ensureDefault). Mirrors ?skipOnboarding=true above as the
    // symmetric "always run" counterpart. Gated on import.meta.env.DEV so a
    // production deployment can't accidentally re-trigger onboarding for
    // returning users via a stray URL.
    if (import.meta.env.DEV && params.get('forceWizard') === 'true') {
      const fresh: OnboardingState = { ...defaultState, completed: false, step: 0 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      // FR #47: also clear the tour completion flag so the post-wizard Tour
      // renders fresh after the wizard completes. Without this clear, a
      // second walkthrough run would skip Tour because OnboardingTooltips
      // reads localStorage independently of `tooltipsDismissed` in the
      // onboarding state object. Symmetric reset for both surfaces.
      localStorage.removeItem('waggle:tooltips_done');
      return fresh;
    }

    // Migrate from old key
    if (localStorage.getItem('waggle_onboarding_complete') === 'true') {
      localStorage.removeItem('waggle_onboarding_complete');
      const done: OnboardingState = { ...defaultState, completed: true, step: 7 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
      return done;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = { ...defaultState, ...parsed };
      // Existing completed users without a tier default to 'simple'
      if (parsed.completed && !parsed.tier) {
        state.tier = 'simple';
      }
      return state;
    }
  } catch { /* ignore */ }
  return defaultState;
}

function saveState(state: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Notify other hook instances in the same tab via custom event
  window.dispatchEvent(new CustomEvent('waggle:onboarding-sync'));
}

export const useOnboarding = () => {
  const [state, setState] = useState<OnboardingState>(loadState);

  // Re-sync when another hook instance writes to localStorage
  useEffect(() => {
    const handler = () => setState(loadState());
    window.addEventListener('waggle:onboarding-sync', handler);
    return () => window.removeEventListener('waggle:onboarding-sync', handler);
  }, []);

  // CC Sesija A §2.3 A11: Tauri filesystem-flag fast-path for returning users.
  // Runs in Tauri mode only; if ~/.waggle/first-launch.flag exists the user
  // has completed onboarding before (even if this WebView profile is fresh).
  // Auto-completes the wizard in that case. Complementary to the workspaces-
  // check below — flag is faster + doesn't need sidecar; either trigger is
  // sufficient.
  useEffect(() => {
    if (state.completed) return;
    if (!isTauri()) return;
    let cancelled = false;
    tauriIsFirstLaunch()
      .then((firstLaunch) => {
        if (cancelled || firstLaunch) return;
        console.info(
          '[useOnboarding] Tauri filesystem flag indicates returning user — auto-completing wizard',
        );
        const next: OnboardingState = {
          ...defaultState,
          completed: true,
          step: 7,
          tier: state.tier || 'power',
          tooltipsDismissed: true,
          apiKeySet: true,
        };
        saveState(next);
        setState(next);
      })
      .catch(() => {
        /* command unavailable — fall through to existing returning-user check */
      });
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug #2: auto-complete onboarding for returning users.
  // The localStorage flag is per-webview, so a fresh Tauri webview (or a
  // browser switch) always looks "new" even when the sidecar has existing
  // memory and workspaces. Check the sidecar on mount — if there's already
  // workspace data, this is clearly a returning user and we should not
  // re-run the wizard.
  useEffect(() => {
    if (state.completed) return;
    // PM walkthrough bypass (DEV only): when ?forceWizard=true is set, skip
    // the auto-complete branch so the wizard renders even though the
    // backend's wsManager.ensureDefault has created the default-workspace
    // stub. Symmetric with the loadState() bypass above.
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forceWizard') === 'true') return;
    }
    let cancelled = false;
    (async () => {
      try {
        const workspaces = await adapter.getWorkspaces();
        if (cancelled) return;
        if (Array.isArray(workspaces) && workspaces.length > 0) {
          console.info(
            `[useOnboarding] returning user detected (${workspaces.length} workspaces on server) — auto-completing wizard`
          );
          const next: OnboardingState = {
            ...defaultState,
            completed: true,
            step: 7,
            tier: state.tier || 'power',
            tooltipsDismissed: true,
            apiKeySet: true,
          };
          saveState(next);
          setState(next);
        }
      } catch {
        /* sidecar unreachable — stay on the wizard so a truly new user can set up */
      }
    })();
    return () => { cancelled = true; };
    // Run once on mount — we intentionally don't re-run on state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((updates: Partial<OnboardingState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      // CC Sesija A §2.3 A11: persist completion to filesystem flag in Tauri
      // mode so onboarding doesn't re-trigger after a webview profile reset.
      // Fire-and-forget — failure is non-fatal (localStorage still completed).
      if (next.completed && !prev.completed && isTauri()) {
        tauriMarkFirstLaunchComplete().catch((err) => {
          console.warn('[useOnboarding] markFirstLaunchComplete failed:', err);
        });
      }
      return next;
    });
  }, []);

  const complete = useCallback(() => {
    update({ completed: true, step: 7 });
  }, [update]);

  const reset = useCallback(() => {
    const fresh = { ...defaultState };
    saveState(fresh);
    setState(fresh);
  }, []);

  // Phase 1 #6 — replay just the post-wizard Tour without rerunning the full
  // wizard. Clears the OnboardingTooltips localStorage flag (read independently
  // of the onboarding state object) AND flips `tooltipsDismissed` so Desktop's
  // gate fires the Tour overlay on next render. Wizard completion remains
  // intact — workspaces, persona, tier all preserved.
  const replayTour = useCallback(() => {
    try {
      window.localStorage.removeItem('waggle:tooltips_done');
    } catch { /* storage disabled — state-side flip still triggers re-render */ }
    setState(prev => {
      const next = { ...prev, tooltipsDismissed: false };
      saveState(next);
      return next;
    });
  }, []);

  return { state, update, complete, reset, replayTour };
};
