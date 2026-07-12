/**
 * PR7b Clerk config — the shared-instance publishable key + the warm appearance.
 *
 * D2(b): Clerk is OPTIONAL. Hosted auth must be explicitly enabled; otherwise the
 * SPA runs fully accountless (WaggleClerkProvider renders children with no ClerkProvider;
 * /auth shows the local-first AccountlessNotice). The key is public-safe by design
 * (ships in the client bundle); the SECRET key is server-side only and the desktop
 * never uses it (the local sidecar authorizes with its device token).
 */
import { dark } from '@clerk/themes';

/**
 * Faithful inline of Clerk's own `isPublishableKey` shape check: a `pk_test_`/`pk_live_`
 * prefix plus a base64 payload that decodes to a frontend-API host ending in "$". Inlined
 * (not imported from `@clerk/shared/keys`) because the monorepo resolves MULTIPLE
 * `@clerk/shared` majors — clerk-react@5 bundles 3.x while @clerk/themes pulls 4.x — so an
 * imported validator could resolve to a different copy than ClerkProvider uses. This
 * deterministic inline can't drift from whichever copy hoists; the format itself is
 * fundamental to how Clerk keys are minted and is stable across majors.
 */
function isValidPublishableKey(key: string): boolean {
  if (!key.startsWith('pk_test_') && !key.startsWith('pk_live_')) return false;
  try {
    return atob(key.split('_')[2] ?? '').endsWith('$');
  } catch {
    return false;
  }
}

/**
 * The Clerk publishable key (shared "elegant-camel-8" instance), or undefined when
 * unconfigured OR shape-invalid. Read at CALL time (not module load) so it stays
 * test-stubbable and so the no-key fallback is decided at render.
 *
 * The shape gate is load-bearing: ClerkProvider throws *synchronously in render* on a
 * malformed key, and WaggleClerkProvider sits ABOVE AppErrorBoundary, so a placeholder /
 * typo'd / truncated key (e.g. the `.env.example` placeholder) would otherwise blank the
 * WHOLE app at boot. Rejecting it here degrades cleanly to the honest accountless state
 * instead (the §6/D16 "absent → accountless" guarantee).
 */
export function clerkPublishableKey(): string | undefined {
  if (import.meta.env.VITE_WAGGLE_ENABLE_CLERK !== '1') return undefined;
  const k = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return k && isValidPublishableKey(k) ? k : undefined;
}

/**
 * Warm-token Clerk appearance. Mirrors the apps/www pattern (baseTheme: dark + a
 * variables override) recolored to the WARM hex (apps/www uses the old cooler hex).
 * NOTE: do NOT add `as const` — it over-narrows Clerk's Appearance union and silently
 * drops `baseTheme` (recon 05 §5.3 / apps/www layout.tsx:31-34 gotcha).
 */
export function clerkAppearance(isDark: boolean) {
  return {
    baseTheme: isDark ? dark : undefined,
    variables: {
      colorPrimary: isDark ? '#e9a52c' : '#b57d12',
      colorBackground: isDark ? '#1a160f' : '#f1e9d8',
      colorText: isDark ? '#ece3cf' : '#2a2418',
      colorInputBackground: isDark ? '#14110b' : '#fffdf8',
      borderRadius: '11px',
      fontFamily: '"Hanken Grotesk", system-ui, sans-serif',
    },
    elements: {
      // We render our own design-faithful "New to Waggle? Create an account" toggle,
      // so hide Clerk's built-in switch link to avoid a duplicate.
      footerAction: { display: 'none' },
    },
  };
}
