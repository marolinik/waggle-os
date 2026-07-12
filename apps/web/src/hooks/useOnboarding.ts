import { useState, useCallback, useEffect } from 'react';
import type { UserTier } from '@/lib/dock-tiers';
import { adapter } from '@/lib/adapter';
import { ONBOARDED_THIS_SESSION_KEY, COACH_MARKS_FORCE_KEY } from '@/lib/coach-marks-gate';
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
  /** Epoch ms the wizard was completed via update() (F1/F5). Legacy/returning
   *  profiles that auto-complete leave this undefined on purpose. */
  completedAt?: number;
  // --- Phase 2D additive fields (localStorage only, back-compat) ---
  /** Set once the Who-Are-You step has written profile + seeded identity (B8). */
  profileSeeded?: boolean;
  /** Tool/connector ids the user said they use (S14, deferred; reserved). */
  toolsUsed?: string[];
}

const STORAGE_KEY = 'waggle:onboarding';

const defaultState: OnboardingState = {
  completed: false,
  step: 0,
};

// P2 fix (acceptance check 8 live-run): the ?forceWizard reset must fire ONCE
// per page load, not on every loadState() call. loadState() also runs in the
// 'waggle:onboarding-sync' listener — without this latch, every wizard save
// (e.g. workspace-create persisting workspaceId) triggered a sync reload that
// reset state to {completed:false, step:0} AND wiped the just-saved fields,
// so onFinish ran with a fallback local-* id and the seeding/navigation chain
// silently broke.
let forceWizardConsumed = false;

function forceWizardParamAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_WAGGLE_E2E === '1';
}

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

    // PM walkthrough bypass (DEV/E2E only): ?forceWizard=true forces the wizard to
    // render at step 0 regardless of localStorage state OR the auto-complete
    // branch in this hook (which fires when /api/onboarding/status says a
    // prior client completed the wizard against this dataDir — P4). Mirrors
    // ?skipOnboarding=true above as the symmetric "always run" counterpart.
    // Gated so a production deployment can't accidentally re-trigger onboarding
    // for returning users via a stray URL.
    if (forceWizardParamAllowed() && params.get('forceWizard') === 'true' && !forceWizardConsumed) {
      forceWizardConsumed = true;
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

/**
 * Wave T Lane A (item 1): can we decide wizard-vs-shell WITHOUT the server?
 * True when localStorage already settles it (completed, or mid-wizard step>0), or
 * a DEV forceWizard / E2E skipOnboarding param forces the decision. False only
 * for a fresh localStorage that must ask /api/onboarding/status — the exact case
 * where the wizard flashes for ~1s before the async auto-complete lands. Reads
 * raw localStorage with no side effects (does NOT consume the forceWizard latch),
 * so AppShell can gate the boot screen on it.
 */
export function isOnboardingStatusKnownSync(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('skipOnboarding') === 'true') return true;
    if (forceWizardParamAllowed() && params.get('forceWizard') === 'true') return true;
    if (localStorage.getItem('waggle_onboarding_complete') === 'true') return true;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      if (parsed?.completed) return true;
      if (typeof parsed?.step === 'number' && parsed.step > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Wave T Lane A (item 1): resolve a fresh-localStorage user's onboarding against
 * the server BEFORE the shell mounts, and persist the completed flag so
 * useOnboarding reads it synchronously (the wizard never paints for a
 * server-onboarded returning user). No-op when the decision is already known
 * locally. The boot-time counterpart of the in-hook auto-complete effect below;
 * never throws — a dead sidecar leaves the wizard in place for a truly new user.
 */
export async function resolveReturningUserOnboarding(): Promise<void> {
  if (isOnboardingStatusKnownSync()) return;
  try {
    const status = await adapter.getOnboardingStatus();
    if (status?.completed) {
      const next: OnboardingState = {
        ...defaultState,
        completed: true,
        step: 7,
        tier: 'power',
        tooltipsDismissed: true,
        apiKeySet: true,
      };
      saveState(next);
    }
  } catch {
    /* sidecar unreachable — stay on the wizard so a truly new user can set up */
  }
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
  // memory and workspaces. Ask the sidecar on mount.
  //
  // P4 fix (S4 founder flag, confirmed): the evidence used to be
  // `getWorkspaces().length > 0` — but buildLocalServer's wsManager
  // .ensureDefault() seeds a default workspace at BOOT, so a clean production
  // install always had ≥1 workspace and a brand-new user NEVER saw the wizard.
  // /api/onboarding/status is the server-authoritative signal instead: the
  // completion flag (stamped below on complete) or legacy usage evidence
  // (frames in the personal mind / user-created workspaces) — the seeded stub
  // alone is not evidence.
  useEffect(() => {
    if (state.completed) return;
    // Mid-wizard guard: step > 0 means THIS webview is actively onboarding —
    // not a fresh-localStorage returning user. Without it, a C33 import run
    // during the wizard writes personal-mind frames (= legacy evidence), and
    // a refresh would auto-complete the wizard out from under the user,
    // skipping the remaining steps.
    if (state.step > 0) return;
    // PM walkthrough bypass (DEV/E2E only): when ?forceWizard=true is set, skip
    // the auto-complete branch so the wizard renders even for a returning
    // user. Symmetric with the loadState() bypass above.
    if (forceWizardParamAllowed()) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forceWizard') === 'true') return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await adapter.getOnboardingStatus();
        if (cancelled) return;
        if (status?.completed) {
          console.info(
            `[useOnboarding] returning user detected (server onboarding status: ${status.source ?? 'flag'}) — auto-completing wizard`
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
      // F1/F5: stamp the completion time on the transition ONLY (immutable copy)
      // so the trial-modal gate + coach-marks gate can quiet themselves right
      // after the wizard. The two returning-user auto-complete effects use
      // saveState() directly and deliberately leave completedAt unset.
      const justCompleted = next.completed && !prev.completed;
      const stamped = justCompleted ? { ...next, completedAt: Date.now() } : next;
      saveState(stamped);
      if (justCompleted) {
        // F5: per-session latch so the coach-mark carousel defers on the very
        // first landing right after finishing the wizard.
        try {
          sessionStorage.setItem(ONBOARDED_THIS_SESSION_KEY, '1');
        } catch { /* storage disabled — the completedAt window still covers first-run */ }
        // P4: stamp the server-side completion flag — the durable signal the
        // auto-complete effect above keys on. Fire-and-forget; failure is
        // non-fatal (localStorage still says completed for this webview).
        adapter.markOnboardingComplete().catch((err) => {
          console.warn('[useOnboarding] markOnboardingComplete failed:', err);
        });
        // CC Sesija A §2.3 A11: Tauri filesystem flag too (default ~/.waggle
        // installs share the same file; the IPC path works even when the
        // sidecar is mid-restart).
        if (isTauri()) {
          tauriMarkFirstLaunchComplete().catch((err) => {
            console.warn('[useOnboarding] markFirstLaunchComplete failed:', err);
          });
        }
      }
      return stamped;
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
    // F5: force the coach-marks gate to show immediately, bypassing the
    // post-completion deferral (this is an explicit user "replay" action).
    try {
      sessionStorage.setItem(COACH_MARKS_FORCE_KEY, '1');
    } catch { /* storage disabled — tooltipsDismissed flip still re-renders */ }
    setState(prev => {
      const next = { ...prev, tooltipsDismissed: false };
      saveState(next);
      return next;
    });
  }, []);

  return { state, update, complete, reset, replayTour };
};
