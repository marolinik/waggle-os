/**
 * ClerkAuthForm — PR7b/B2 Auth (design screen 13) real auth form.
 *
 * Rendered only when Clerk is configured (AuthRoute gates on the key; the whole app is
 * wrapped in ClerkProvider by WaggleClerkProvider). Uses Clerk's PREBUILT themed
 * <SignIn/>/<SignUp/> (D13) — which render the real social buttons (whatever is enabled
 * in the dashboard), email/password, "Forgot?", and the email-code verify step — so
 * there is NO fabricated SSO/OTP success (F10): every flow is a real Clerk round-trip.
 *
 * `routing="virtual"` embeds the multi-step flow in-place (no catch-all route needed);
 * `forceRedirectUrl="/home"` lands a signed-in user in the fully-local app. We render our
 * own design-faithful sign-in↔sign-up toggle (Clerk's built-in switch link is hidden via
 * appearance) and the §2b honey local-first note above Sign up.
 */
import { useState } from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import EnterpriseCTA from './EnterpriseCTA';

type Mode = 'signin' | 'signup';

export default function ClerkAuthForm() {
  const [mode, setMode] = useState<Mode>('signin');

  return (
    <div>
      {mode === 'signup' && (
        // The design's honey .localnote trust banner above Sign up (recon 03 §2b).
        <div className="mb-4 p-3.5 rounded-[12px] bg-[var(--honey-wash)] border border-[var(--honey-line)]">
          <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">
            <b className="text-foreground">You don’t need this to start.</b> Waggle works
            locally right away — create an account only when you want sync or a team.
          </p>
        </div>
      )}

      {mode === 'signin' ? (
        <SignIn routing="virtual" forceRedirectUrl="/home" signUpForceRedirectUrl="/home" />
      ) : (
        <SignUp routing="virtual" forceRedirectUrl="/home" signInForceRedirectUrl="/home" />
      )}

      <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">
        {mode === 'signin' ? 'New to Waggle?' : 'Already have an account?'}{' '}
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          className="font-[650] text-honey hover:text-[var(--honey-bright)] transition-colors"
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>

      <EnterpriseCTA />
    </div>
  );
}
