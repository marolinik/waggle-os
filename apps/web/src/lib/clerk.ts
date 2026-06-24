/**
 * PR7b Clerk config — the shared-instance publishable key + the warm appearance.
 *
 * D2(b): Clerk is OPTIONAL. With a key, sign-in unlocks sync/Teams/billing; without
 * one the SPA runs fully accountless (WaggleClerkProvider renders children with no
 * ClerkProvider; /auth shows the local-first AccountlessNotice). The key is public-safe
 * by design (ships in the client bundle); the SECRET key is server-side only and the
 * desktop never uses it (the local sidecar authorizes with its device token).
 */
import { dark } from '@clerk/themes';

/**
 * The Clerk publishable key (shared "elegant-camel-8" instance), or undefined when
 * unconfigured. Read at CALL time (not module load) so it stays test-stubbable and so
 * the no-key fallback is decided at render.
 */
export function clerkPublishableKey(): string | undefined {
  const k = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return k && k.length > 0 ? k : undefined;
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
