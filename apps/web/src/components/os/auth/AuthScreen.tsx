/**
 * AuthScreen — warm-Hive PR7b Auth (design screen 13) split-layout shell.
 *
 * Left brand panel (hidden < lg) + right form panel (`children`). This is the ONE
 * pre-shell surface: it renders OUTSIDE AppShell (no sidebar / StatusBar / boot gate),
 * inheriting the warm tokens from <ThemeProvider> and the top-level AppErrorBoundary
 * (both already wrap <Routes> in App.tsx). The form content is injected as children so
 * B1 (accountless notice) and B2 (themed Clerk <SignIn/>, no-key fallback) share the
 * exact same chrome.
 */
import type { ReactNode } from 'react';
import AuthBrandPanel from './AuthBrandPanel';

export default function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background text-foreground">
      <AuthBrandPanel />
      <div className="flex items-center justify-center p-6 sm:p-10 overflow-auto">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}
