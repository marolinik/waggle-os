/**
 * PostHog cloud analytics — project "Default project" (id 161685), org "Egzakta".
 *
 * Opt-in gate: Only fires when both of the following are true:
 *   1. VITE_POSTHOG_KEY is set at compile time (baked into the Vite bundle by P4-win build).
 *   2. The user has not opted out (no client-side telemetry-disabled marker in localStorage).
 *
 * No-op behavior:
 *   - If VITE_POSTHOG_KEY is absent (key never baked in or dev machine without .env.local)
 *     → all functions are silent no-ops. App boots normally.
 *   - If user has opted out via localStorage('waggle:telemetry-opt-out') === 'true'
 *     → all capture calls are silently skipped.
 *
 * IMPORTANT — COMPILE-TIME BAKE:
 *   VITE_POSTHOG_KEY is read via import.meta.env at Vite bundle time.
 *   If the key is absent when `npm run tauri:build:win` runs, the shipped binary
 *   will have VITE_POSTHOG_KEY === undefined permanently — rebuilding is the only fix.
 *   Per Phase 2 plan, Marko must paste phc_* into apps/web/.env.local BEFORE the
 *   binary build (Wave 1 / P2b prerequisite for P4-win).
 *
 * Usage:
 *   import { initPostHog, captureOnboardingComplete } from '@/lib/posthog';
 *
 *   // In main.tsx — call once on app boot (non-blocking):
 *   initPostHog().catch(() => {});
 *
 *   // In OnboardingWizard.tsx — alongside existing trackTelemetry call:
 *   captureOnboardingComplete({ templateId, personaId, model });
 */

import posthog from 'posthog-js';

/** PostHog project API key — baked into bundle at Vite build time. */
const PH_KEY: string | undefined = import.meta.env['VITE_POSTHOG_KEY'] as string | undefined;

/** PostHog ingestion host — us.i.posthog.com for project 161685. */
const PH_HOST = 'https://us.i.posthog.com';

/** localStorage key used to persist the user's opt-out preference. */
const OPT_OUT_KEY = 'waggle:telemetry-opt-out';

let initialized = false;

/**
 * Returns true if the user has opted out of telemetry via the localStorage key.
 * Default (key absent or any value other than 'true') = opted IN.
 */
function isOptedOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === 'true';
  } catch {
    // localStorage unavailable (sandboxed, private browsing) — treat as opted out
    return true;
  }
}

/**
 * Initialize PostHog on app boot.
 *
 * - Silent no-op if VITE_POSTHOG_KEY is absent.
 * - Silent no-op if user has opted out.
 * - Non-blocking: caller should wrap in try/catch or `.catch(() => {})`.
 *
 * @returns Promise<void> — resolves when initialization is complete or skipped.
 */
export async function initPostHog(): Promise<void> {
  if (!PH_KEY || initialized || isOptedOut()) {
    return;
  }
  try {
    posthog.init(PH_KEY, {
      api_host: PH_HOST,
      // Capture only explicit events — no auto-capture of clicks/pageviews.
      autocapture: false,
      capture_pageview: false,
      // Disable persistence in cookies; use localStorage only (privacy-first).
      persistence: 'localStorage',
      // Opt-in to telemetry is explicit (this init path only runs when opted-in).
      opt_out_capturing_by_default: false,
    });
    initialized = true;
  } catch {
    // PostHog init failure must never block app boot.
    initialized = false;
  }
}

/** Payload captured at onboarding completion. */
export interface OnboardingCompletePayload {
  templateId: string | null;
  personaId: string | null;
  model: string | null;
}

/**
 * Capture the `onboarding_complete` event alongside the existing local
 * telemetry call in OnboardingWizard.tsx.
 *
 * - Silent no-op if PostHog was not initialized (key absent or opted out).
 * - Does NOT replace the existing `trackTelemetry` call — both fire together.
 *
 * @param payload - Template, persona, and model selected during onboarding.
 */
export function captureOnboardingComplete(payload: OnboardingCompletePayload): void {
  if (!initialized || isOptedOut()) {
    return;
  }
  try {
    posthog.capture('onboarding_complete', {
      template_id: payload.templateId,
      persona_id: payload.personaId,
      model: payload.model,
    });
  } catch {
    // Never throw — telemetry capture failures must not interrupt user flow.
  }
}

/**
 * Opt the current user out of PostHog telemetry.
 * Persists the opt-out preference to localStorage and stops all future captures.
 */
export function optOutPostHog(): void {
  try {
    window.localStorage.setItem(OPT_OUT_KEY, 'true');
  } catch {
    // Ignore localStorage errors.
  }
  if (initialized) {
    try {
      posthog.opt_out_capturing();
    } catch {
      // Ignore.
    }
  }
}

/**
 * Opt the current user back into PostHog telemetry.
 * Removes the opt-out preference from localStorage.
 * Note: initPostHog() must be called again if it was previously skipped.
 */
export function optInPostHog(): void {
  try {
    window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Ignore localStorage errors.
  }
  if (initialized) {
    try {
      posthog.opt_in_capturing();
    } catch {
      // Ignore.
    }
  }
}
