import { useState, useCallback, useEffect, useRef } from 'react';
import type { UserTier } from '@/lib/dock-tiers';
import { adapter } from '@/lib/adapter';
import { ONBOARDED_THIS_SESSION_KEY, COACH_MARKS_FORCE_KEY } from '@/lib/coach-marks-gate';

export interface OnboardingState {
  completed: boolean;
  step: number;
  /** Opaque server-issued identity for the active personal-mind profile. */
  profileId?: string;
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
const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
export type OnboardingReconciliation = 'unknown' | 'confirmed' | 'unavailable';
const RECONCILIATION_EVENT = 'waggle:onboarding-reconciliation';
let serverReconciliation: OnboardingReconciliation = 'unknown';
let reconciliationInFlight: Promise<OnboardingReconciliation> | null = null;
let reconciliationGeneration = 0;
let generationRevalidationInFlight: Promise<OnboardingReconciliation> | null = null;

function setServerReconciliation(next: OnboardingReconciliation): OnboardingReconciliation {
  serverReconciliation = next;
  window.dispatchEvent(new CustomEvent(RECONCILIATION_EVENT));
  return next;
}

function forceWizardParamAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_WAGGLE_E2E === '1';
}

function loadState(): OnboardingState {
  try {
    // E2E test bypass: ?skipOnboarding=true skips wizard and sets tier to 'power'
    const params = new URLSearchParams(window.location.search);
    if (forceWizardParamAllowed() && params.get('skipOnboarding') === 'true') {
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

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = { ...defaultState, ...parsed };
      // The modern record is authoritative. A leftover legacy flag must never
      // erase richer tier/workspace/persona choices from a newer client.
      localStorage.removeItem('waggle_onboarding_complete');
      const profileBound = typeof state.profileId === 'string'
        && PROFILE_ID_PATTERN.test(state.profileId);
      const forcedWalkthrough = forceWizardParamAllowed()
        && params.get('forceWizard') === 'true';
      if (state.completed && !profileBound && !forcedWalkthrough) {
        // Pre-profile clients could persist a modern-looking completion record
        // without identifying the dataDir that earned it. Keep benign choices
        // provisional, but never let that record open the shell by itself.
        state.completed = false;
        state.step = 0;
        delete state.completedAt;
      }
      // Existing profile-bound completed users without a tier default to 'simple'
      if (state.completed && !parsed.tier) {
        state.tier = 'simple';
      }
      return state;
    }
    // The legacy flag is not bound to a server-issued profile identity. Retire
    // it instead of letting it complete onboarding for a replacement dataDir.
    // The profile-bound server status below remains the returning-user source
    // of truth and will restore completion when it belongs to this profile.
    localStorage.removeItem('waggle_onboarding_complete');
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
 * True only when an explicit DEV/E2E override settles the decision. Every
 * ordinary cache (completed or mid-wizard) is provisional because the desktop
 * may now point at a different/fresh dataDir, so the sidecar must confirm its
 * profile identity. Reads
 * raw localStorage with no side effects (does NOT consume the forceWizard latch),
 * so AppShell can gate the boot screen on it.
 */
export function isOnboardingStatusKnownSync(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (forceWizardParamAllowed() && params.get('skipOnboarding') === 'true') return true;
    if (forceWizardParamAllowed() && params.get('forceWizard') === 'true') return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Wave T Lane A (item 1): resolve browser onboarding state against the server
 * BEFORE the shell mounts. Server completion normalizes a returning-user cache;
 * explicit server incompletion resets stale WebView state for a fresh dataDir.
 * Never throws or erases a completed cache when the sidecar is unreachable.
 */
export async function resolveReturningUserOnboarding(
  confirmedCompletion?: OnboardingState,
): Promise<OnboardingReconciliation> {
  if (isOnboardingStatusKnownSync()) return 'confirmed';
  if (serverReconciliation === 'confirmed') return 'confirmed';
  if (reconciliationInFlight) return reconciliationInFlight;
  const generationAtStart = reconciliationGeneration;
  const reconcile = (async (): Promise<OnboardingReconciliation> => {
    const stateAtStart = loadState();
    try {
      const stateSnapshot = localStorage.getItem(STORAGE_KEY);
      const status = await adapter.getOnboardingStatus();
      if (generationAtStart !== reconciliationGeneration) return serverReconciliation;
      const profileId = typeof status?.profileId === 'string'
        && PROFILE_ID_PATTERN.test(status.profileId)
        ? status.profileId
        : undefined;
      if (!profileId) {
        return setServerReconciliation('unavailable');
      }
      const stateChanged = localStorage.getItem(STORAGE_KEY) !== stateSnapshot;
      const currentState = loadState();
      const wizardAdvanced = stateChanged
        && !stateAtStart.completed
        && (
          (!currentState.completed && currentState.step > stateAtStart.step)
          || (currentState.completed && typeof currentState.completedAt === 'number')
        );
      const startedAsPristineUnboundWizard = !stateAtStart.profileId
        && !stateAtStart.completed
        && stateAtStart.step === 0
        && !stateAtStart.workspaceId
        && !stateAtStart.personaId
        && !stateAtStart.templateId
        && !stateAtStart.profileSeeded
        && !(stateAtStart.toolsUsed?.length);
      const advancingProfileIsCompatible = (stateAtStart.profileId === profileId || startedAsPristineUnboundWizard)
        && (!currentState.profileId || currentState.profileId === profileId);
      if (wizardAdvanced && advancingProfileIsCompatible) {
        saveState({ ...currentState, profileId });
        return setServerReconciliation('confirmed');
      }
      const sameProfile = currentState.profileId === profileId;
      const hasDurableCompletionFlag = status?.completed === true && status?.source === 'flag';
      if (sameProfile && !currentState.completed && currentState.step > 0 && !hasDurableCompletionFlag) {
        return setServerReconciliation('confirmed');
      }
      localStorage.removeItem('waggle_onboarding_complete');
      if (status?.completed) {
        if (confirmedCompletion?.profileId && confirmedCompletion.profileId !== profileId) {
          // A completion attempt belongs to one immutable service profile. If
          // the desktop generation switched while it was in flight, bind the
          // fresh wizard to the replacement profile without inheriting either
          // profile's completion through the stale attempt. Normal boot-time
          // reconciliation (without confirmedCompletion) still restores a
          // genuinely returning user.
          saveState({ ...defaultState, profileId });
          return setServerReconciliation('confirmed');
        }
        const preserveConfirmedCompletion = confirmedCompletion?.profileId === profileId;
        const next: OnboardingState = sameProfile && (currentState.completed || preserveConfirmedCompletion)
          ? {
              ...(preserveConfirmedCompletion ? confirmedCompletion : currentState),
              completed: true,
              step: 7,
              profileId,
            }
          : {
              ...defaultState,
              completed: true,
              step: 7,
              tier: currentState.tier || 'power',
              tooltipsDismissed: true,
              profileId,
            };
        saveState(next);
      } else if (status?.completed === false) {
        if (sameProfile && currentState.completed) {
          // Preserve browser choices only when they belong to this exact
          // logical profile, then repair the missing durable flag. The server
          // compares this profile id immediately before writing, so a desktop
          // generation switch fails with 409 instead of stamping a replacement.
          saveState({ ...currentState, profileId });
          void adapter.markOnboardingComplete(profileId).catch((err) => {
            console.warn('[useOnboarding] profile-bound completion repair failed:', err);
          });
        } else {
          localStorage.removeItem('waggle:tooltips_done');
          saveState({ ...defaultState, profileId });
        }
      } else {
        return setServerReconciliation('unavailable');
      }
      return setServerReconciliation('confirmed');
    } catch {
      if (generationAtStart !== reconciliationGeneration) return serverReconciliation;
      /* sidecar unreachable — stay on the wizard so a truly new user can set up */
      return setServerReconciliation('unavailable');
    }
  })();
  reconciliationInFlight = reconcile;
  try {
    return await reconcile;
  } finally {
    if (reconciliationInFlight === reconcile) reconciliationInFlight = null;
  }
}

export async function revalidateReturningUserOnboarding(
  replaceInFlight = false,
  confirmedCompletion?: OnboardingState,
): Promise<OnboardingReconciliation> {
  if (generationRevalidationInFlight && !replaceInFlight) return generationRevalidationInFlight;
  if (replaceInFlight) generationRevalidationInFlight = null;
  const revalidate = (async () => {
    reconciliationGeneration += 1;
    setServerReconciliation('unknown');
    // A request owned by the previous sidecar generation may never settle.
    // Detach it: its generation guard prevents stale writes, while the equality
    // check in its finally block prevents it from clearing this new request.
    reconciliationInFlight = null;
    return resolveReturningUserOnboarding(confirmedCompletion);
  })();
  generationRevalidationInFlight = revalidate;
  try {
    return await revalidate;
  } finally {
    if (generationRevalidationInFlight === revalidate) generationRevalidationInFlight = null;
  }
}

export const useOnboarding = () => {
  const [state, setState] = useState<OnboardingState>(loadState);
  const completionInFlightRef = useRef<Promise<boolean> | null>(null);
  const [reconciliationUnavailable, setReconciliationUnavailable] = useState(
    () => serverReconciliation === 'unavailable',
  );

  // Re-sync when another hook instance writes to localStorage
  useEffect(() => {
    const handler = () => setState(loadState());
    window.addEventListener('waggle:onboarding-sync', handler);
    return () => window.removeEventListener('waggle:onboarding-sync', handler);
  }, []);

  useEffect(() => {
    const handler = () => setReconciliationUnavailable(serverReconciliation === 'unavailable');
    window.addEventListener(RECONCILIATION_EVENT, handler);
    return () => window.removeEventListener(RECONCILIATION_EVENT, handler);
  }, []);

  const params = new URLSearchParams(window.location.search);
  const onboardingOverrideActive = (forceWizardParamAllowed() && params.get('skipOnboarding') === 'true')
    || (forceWizardParamAllowed() && params.get('forceWizard') === 'true');
  // Retry an unavailable probe when the browser itself recovers. The AppShell
  // owns service-generation events so one production `connected:true` event
  // cannot race a generic retry against generation invalidation.
  useEffect(() => {
    if (!reconciliationUnavailable || onboardingOverrideActive) return;
    const retry = () => { void resolveReturningUserOnboarding(); };
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retryWhenVisible);
    };
  }, [onboardingOverrideActive, reconciliationUnavailable]);

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
    // Mid-wizard caches must also be profile-confirmed. The reconciliation
    // preserves progress for the matching profile (even if legacy evidence is
    // present) and resets it only when the server identifies another profile.
    // PM walkthrough bypass (DEV/E2E only): when ?forceWizard=true is set, skip
    // the auto-complete branch so the wizard renders even for a returning
    // user. Symmetric with the loadState() bypass above.
    if (forceWizardParamAllowed()) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forceWizard') === 'true') return;
    }
    void resolveReturningUserOnboarding();
    // Run once on mount — we intentionally don't re-run on state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((updates: Partial<OnboardingState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      // F1/F5: stamp the completion time on the transition ONLY (immutable copy)
      // so the trial-modal gate + coach-marks gate can quiet themselves right
      // after the wizard. Server-authoritative returning-user completion calls
      // saveState() directly and deliberately leaves completedAt unset.
      const justCompleted = next.completed && !prev.completed;
      const forcedWalkthrough = forceWizardParamAllowed()
        && new URLSearchParams(window.location.search).get('forceWizard') === 'true';
      if (justCompleted && !forcedWalkthrough) {
        console.warn('[useOnboarding] completion must be confirmed by the active profile');
        return prev;
      }
      const stamped = justCompleted ? { ...next, completedAt: Date.now() } : next;
      saveState(stamped);
      if (justCompleted) {
        // F5: per-session latch so the coach-mark carousel defers on the very
        // first landing right after finishing the wizard.
        try {
          sessionStorage.setItem(ONBOARDED_THIS_SESSION_KEY, '1');
        } catch { /* storage disabled — the completedAt window still covers first-run */ }
      }
      return stamped;
    });
  }, []);

  const complete = useCallback((): Promise<boolean> => {
    const forcedWalkthrough = forceWizardParamAllowed()
      && new URLSearchParams(window.location.search).get('forceWizard') === 'true';
    if (forcedWalkthrough) {
      update({ completed: true, step: 7 });
      return Promise.resolve(true);
    }

    const profileId = state.profileId;
    if (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId)) {
      console.warn('[useOnboarding] completion is not bound to an active profile');
      return Promise.resolve(false);
    }
    if (completionInFlightRef.current) return completionInFlightRef.current;

    const attempt = (async () => {
      try {
        // The server compares the expected profile atomically before writing.
        // Do not expose local completion until the durable stamp succeeds.
        await adapter.markOnboardingComplete(profileId);
      } catch (err) {
        console.warn('[useOnboarding] profile-bound completion failed:', err);
        // The server may have committed before the transport failed. The
        // profile-bound status read below is the durable authority: exact
        // same-profile completion recovers, while missing/mismatched state
        // remains incomplete.
      }

      const reconciliation = await revalidateReturningUserOnboarding(true, state);
      const confirmed = loadState();
      if (reconciliation !== 'confirmed'
        || !confirmed.completed
        || confirmed.profileId !== profileId) {
        return false;
      }

      const finalized: OnboardingState = {
        ...state,
        ...confirmed,
        completed: true,
        step: 7,
        profileId,
        completedAt: Date.now(),
      };
      saveState(finalized);
      try {
        sessionStorage.setItem(ONBOARDED_THIS_SESSION_KEY, '1');
      } catch { /* storage disabled — completedAt still protects first-run UX */ }
      return true;
    })();
    completionInFlightRef.current = attempt;
    void attempt.finally(() => {
      if (completionInFlightRef.current === attempt) completionInFlightRef.current = null;
    });
    return attempt;
  }, [state, update]);

  const reset = useCallback(() => {
    setState((previous) => {
      const fresh = { ...defaultState, profileId: previous.profileId };
      saveState(fresh);
      return fresh;
    });
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
