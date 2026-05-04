import { SignIn } from '@clerk/nextjs';
import type { CSSProperties } from 'react';

/**
 * Hosted sign-in fallback page (Sesija E §5.2).
 *
 * Reached when:
 *  - User lands on /sign-in directly (e.g. shared link).
 *  - <SignInButton mode="modal"> redirects (modal failure or full-flow opt-in).
 *  - /account redirects an unauthenticated user here.
 *
 * Catch-all `[[...sign-in]]` segment lets Clerk handle multi-step flows
 * (verification, social-OAuth callback) without explicit route definitions.
 *
 * Appearance is inherited from <ClerkProvider> in app/layout.tsx (Hive DS).
 */
export default function SignInPage() {
  return (
    <main style={pageStyle}>
      <SignIn />
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '96px 24px 48px',
  background: 'var(--hive-950, #08090c)',
};
