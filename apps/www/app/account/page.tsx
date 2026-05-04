import type { CSSProperties } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserProfile } from '@clerk/nextjs';

/**
 * Account management page (Sesija E §5.2).
 *
 * Server component: gates access via `await auth()`. Unauthenticated users
 * are redirected to /sign-in before any Clerk component mounts. Authenticated
 * users see Clerk's <UserProfile>, which handles email/password updates,
 * connected accounts, sessions, security settings.
 *
 * Stripe Customer ID surfaced in user.publicMetadata is set by §5.3 webhooks
 * (apps/www/app/api/webhooks/clerk/route.ts) on the user.created event.
 *
 * Appearance is inherited from <ClerkProvider> in app/layout.tsx (Hive DS).
 */
export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <main style={pageStyle}>
      <UserProfile />
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
