/**
 * WaggleClerkProvider — PR7b/D2(b) optional Clerk wrapper.
 *
 * With a publishable key present, wraps the app in a themed, router-integrated
 * ClerkProvider (routerPush/replace → react-router's navigate, per the Clerk v5 docs,
 * to avoid flicker/reload). WITHOUT a key, renders children untouched so the desktop
 * stays fully accountless — never crashes, never fabricates a user (F1).
 *
 * MUST live INSIDE <BrowserRouter> (it calls useNavigate). Appearance follows the live
 * ThemeProvider value so Clerk's components track the warm dark/light themes.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { useTheme } from '@/providers/ThemeProvider';
import { clerkPublishableKey, clerkAppearance } from '@/lib/clerk';

export default function WaggleClerkProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const pk = clerkPublishableKey();

  if (!pk) return <>{children}</>;

  return (
    <ClerkProvider
      publishableKey={pk}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      appearance={clerkAppearance(resolvedTheme === 'dark')}
    >
      {children}
    </ClerkProvider>
  );
}
