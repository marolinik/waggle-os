import { SignUp } from '@clerk/nextjs';
import type { CSSProperties } from 'react';

/**
 * Hosted sign-up fallback page (Sesija E §5.2).
 *
 * Reached when:
 *  - User lands on /sign-up directly.
 *  - Pricing CTAs (§5.4) redirect signed-out users here with
 *    `forceRedirectUrl=/api/stripe/checkout?tier=...`.
 *
 * Catch-all `[[...sign-up]]` segment supports multi-step flows
 * (email verification, social-OAuth callback).
 *
 * Appearance is inherited from <ClerkProvider> in app/layout.tsx (Hive DS).
 */
export default function SignUpPage() {
  return (
    <main style={pageStyle}>
      <SignUp />
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
