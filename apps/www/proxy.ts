// Next.js 16 convention: proxy.ts replaces the deprecated middleware.ts name.

import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Clerk auth proxy.
 *
 * Default behavior: all routes are PUBLIC. Per-route protection is enforced
 * with `await auth.protect()` inside Server Components / Route Handlers.
 * Sign-up gating for Pro/Teams checkout is handled at CTA level via
 * <SignUpButton mode="modal"> (see §5.4).
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Keep public acquisition, legal, documentation, and download pages
    // independent of Clerk session refreshes. Auth is required only where the
    // route reads identity or owns an authenticated flow.
    '/account(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/(api|trpc)(.*)',
  ],
};
