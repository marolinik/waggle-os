/**
 * useBilling — billing state management and Stripe checkout sync.
 *
 * After the user returns from Stripe checkout (detected by ?session_id= in URL),
 * this hook calls POST /api/stripe/sync to confirm payment, then refreshes
 * the tier via GET /api/tier.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';

export interface BillingState {
  tier: string;
  /** P1b D3-4: false until a getTier() round-trip succeeds. While false the
   *  default 'FREE' is a placeholder, NOT the user's plan — billing surfaces
   *  must render an unresolved state instead of the FREE card + upgrade grid. */
  tierResolved: boolean;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  /** PR7a/F8: whether Stripe checkout is configured server-side. Defaults true
   *  (never disable a working upgrade path on a probe hiccup); flips false only
   *  when the /api/stripe/status probe explicitly reports it unconfigured. */
  checkoutAvailable: boolean;
}

export function useBilling() {
  const [state, setState] = useState<BillingState>({
    tier: 'FREE',
    tierResolved: false,
    loading: true,
    error: null,
    syncing: false,
    checkoutAvailable: true,
  });

  // PR7a fix: on /payment-success, the mount refreshTier() and the post-checkout
  // syncAfterCheckout() race. The sync result is authoritative — once a checkout
  // sync owns the tier, a late getTier() (e.g. stale 'FREE') must not clobber it
  // back, which would flash the just-paid user a wrong "Nothing to confirm".
  const checkoutSyncStartedRef = useRef(false);

  /** Fetch current tier from the server. */
  const refreshTier = useCallback(async () => {
    try {
      const data = await adapter.getTier();
      setState((prev) =>
        checkoutSyncStartedRef.current
          // A checkout sync owns the tier on this surface — don't overwrite it.
          ? { ...prev, loading: false }
          : { ...prev, tier: data.tier, tierResolved: true, loading: false, error: null });
    } catch (err) {
      // P1b D3-4: keep the previous tier (never present the 'FREE' default as
      // fact) and surface the failure so the Billing tab can render it.
      const message = err instanceof Error ? err.message : 'Tier lookup failed';
      setState((prev) => ({ ...prev, loading: false, error: prev.tierResolved ? prev.error : message }));
    }
  }, []);
  // D3 plus-clause: revalidate an unresolved tier on focus/online/connect-settled.
  useRevalidateOnError(!state.tierResolved && !state.loading, refreshTier);

  /** Call after Stripe checkout redirect to confirm payment and update tier. */
  const syncAfterCheckout = useCallback(async (sessionId: string) => {
    // Claim tier ownership synchronously (before any await) so a concurrent
    // mount refreshTier() that resolves later won't overwrite the sync result.
    checkoutSyncStartedRef.current = true;
    setState((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const result = await adapter.syncStripeCheckout(sessionId);
      setState((prev) => ({
        ...prev,
        tier: result.tier,
        tierResolved: true,
        syncing: false,
        error: null,
      }));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout sync failed';
      setState((prev) => ({ ...prev, syncing: false, error: message }));
      return null;
    }
  }, []);

  /** Open Stripe checkout for a tier upgrade. Returns the checkout URL.
   *  PR7a/D8: billingPeriod honors the Monthly/Annual toggle (annual → the real
   *  annual Stripe price, not a cosmetic client discount). */
  const startCheckout = useCallback(async (tier: 'TEAMS', billingPeriod?: 'monthly' | 'annual') => {
    try {
      const { url } = await adapter.createCheckoutSession(tier, billingPeriod);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create checkout session';
      setState((prev) => ({ ...prev, error: message }));
      return null;
    }
  }, []);

  /** Open the Stripe customer portal for subscription management. */
  const openPortal = useCallback(async () => {
    try {
      const { url } = await adapter.createPortalSession();
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal';
      setState((prev) => ({ ...prev, error: message }));
      return null;
    }
  }, []);

  // On mount, fetch the current tier
  useEffect(() => {
    refreshTier();
  }, [refreshTier]);

  // PR7a/F8: probe whether Stripe checkout is configured so billing surfaces can
  // disable the upgrade CTAs pre-click instead of failing with a 503 after one.
  // Fail-safe: any probe error (or an adapter without the method, e.g. in tests)
  // leaves checkoutAvailable=true — the real checkout call still 503s honestly.
  useEffect(() => {
    let alive = true;
    Promise.resolve(adapter.getStripeStatus?.())
      .then((s) => { if (alive && s) setState((prev) => ({ ...prev, checkoutAvailable: s.configured })); })
      .catch(() => { /* leave checkoutAvailable=true */ });
    return () => { alive = false; };
  }, []);

  // Auto-detect session_id in URL params (post-checkout redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId) {
      syncAfterCheckout(sessionId).then(() => {
        // Clean the URL after sync
        const url = new URL(window.location.href);
        url.searchParams.delete('session_id');
        window.history.replaceState({}, '', url.toString());
      });
    }
  }, [syncAfterCheckout]);

  return {
    ...state,
    refreshTier,
    syncAfterCheckout,
    startCheckout,
    openPortal,
  };
}
