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
    // Skip Next.js internals and static files unless explicitly hit via a
    // path containing search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes (Stripe + Clerk webhooks, /api/stripe/checkout).
    '/(api|trpc)(.*)',
  ],
};
