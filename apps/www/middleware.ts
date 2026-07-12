// Next.js 15.5.15 convention: middleware.ts
// Per Clerk skill version note + Next.js ≤15 docs, middleware.ts is the runtime-supported filename.
// Future Next.js 16+ canary will support proxy.ts as successor naming convention.
// Re-verify framework convention before any Next.js major version upgrade.

import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Clerk auth middleware.
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
