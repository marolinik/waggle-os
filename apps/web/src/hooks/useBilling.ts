/**
 * useBilling — billing state management and Stripe checkout sync.
 *
 * After the user returns from Stripe checkout (detected by ?session_id= in URL),
 * this hook calls POST /api/stripe/sync to confirm payment, then refreshes
 * the tier via GET /api/tier.
 */

import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';

export interface BillingState {
  tier: string;
  loading: boolean;
  error: string | null;
  syncing: boolean;
}

export function useBilling() {
  const [state, setState] = useState<BillingState>({
    tier: 'FREE',
    loading: true,
    error: null,
    syncing: false,
  });

  /** Fetch current tier from the server. */
  const refreshTier = useCallback(async () => {
    try {
      const data = await adapter.getTier();
      setState((prev) => ({ ...prev, tier: data.tier, loading: false, error: null }));
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  /** Call after Stripe checkout redirect to confirm payment and update tier. */
  const syncAfterCheckout = useCallback(async (sessionId: string) => {
    setState((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const result = await adapter.syncStripeCheckout(sessionId);
      setState((prev) => ({
        ...prev,
        tier: result.tier,
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

  /** Open Stripe checkout for a tier upgrade. Returns the checkout URL. */
  const startCheckout = useCallback(async (tier: 'PRO' | 'TEAMS') => {
    try {
      const { url } = await adapter.createCheckoutSession(tier);
      if (url) {
        window.open(url, '_blank');
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
        window.open(url, '_blank');
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
