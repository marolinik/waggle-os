/**
 * Stripe integration — checkout, webhook, and customer portal.
 *
 * All Stripe functionality is gated behind STRIPE_SECRET_KEY env var.
 * When not set, all /api/stripe/* routes return 503 STRIPE_NOT_CONFIGURED.
 */

import type { FastifyPluginAsync } from 'fastify';
import { type Tier, TIER_CAPABILITIES } from '@waggle/shared';

export { checkoutRoutes } from './checkout.js';
export { webhookRoutes } from './webhook.js';
export { portalRoutes } from './portal.js';
export { syncRoutes } from './sync.js';

// ── Stripe SDK singleton ─────────────────────────────────────────────

let stripeInstance: import('stripe').default | null = null;
let stripeInitAttempted = false;

/**
 * Get the Stripe SDK instance (lazy-initialized).
 * Returns null if STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): import('stripe').default | null {
  if (stripeInitAttempted) return stripeInstance;
  stripeInitAttempted = true;

  const secretKey = process.env['STRIPE_SECRET_KEY'];
  if (!secretKey) return null;

  try {
    // Dynamic import to avoid requiring stripe as a hard dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe').default ?? require('stripe');
    stripeInstance = new Stripe(secretKey, { apiVersion: '2025-03-31.basil' });
  } catch {
    // stripe package not installed — graceful degradation
    stripeInstance = null;
  }

  return stripeInstance;
}

// ── Tier ↔ Price ID mapping ──────────────────────────────────────────

/** Collect non-empty env values for the given keys, preserving order. */
function readPriceEnvs(...keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const v = process.env[k];
    if (v) out.push(v);
  }
  return out;
}

/**
 * Map a Stripe price ID back to a canonical Tier.
 *
 * Supports two env-var contracts that can coexist:
 *   - **New 4-var contract** (matches `apps/www` Next.js port):
 *       STRIPE_PRICE_PRO_MONTHLY    / STRIPE_PRICE_PRO_ANNUAL
 *       STRIPE_PRICE_TEAMS_MONTHLY  / STRIPE_PRICE_TEAMS_ANNUAL
 *   - **Legacy single-var contract** (older desktop sidecar env):
 *       STRIPE_PRICE_PRO            / STRIPE_PRICE_TEAMS
 *       STRIPE_PRICE_BASIC          (oldest alias)
 *
 * New contract is checked first; legacy vars act as additional fallbacks.
 * Resolution is synchronous and offline-safe — no Stripe API round-trip.
 *
 * PRO removed (Solo/Team collapse): the legacy PRO/BASIC price vars are still
 * READ, but now resolve to `'FREE'` so a legacy PRO subscriber lands on Solo
 * (never null, never locked out). Only TEAMS mints a paid tier.
 */
export function tierFromPriceId(priceId: string): Tier | null {
  const proPrices = readPriceEnvs(
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_ANNUAL',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_BASIC',
  );
  const teamsPrices = readPriceEnvs(
    'STRIPE_PRICE_TEAMS_MONTHLY',
    'STRIPE_PRICE_TEAMS_ANNUAL',
    'STRIPE_PRICE_TEAMS',
  );

  if (proPrices.includes(priceId)) return 'FREE';
  if (teamsPrices.includes(priceId)) return 'TEAMS';
  return null;
}

/** Resolve the Stripe price ID for a (tier, billingPeriod). Prefers the 4-var
 *  period-specific contract, falls back to legacy single-var, then TIER_CAPABILITIES. */
export function priceIdForTier(tier: Tier, billingPeriod: 'monthly' | 'annual' = 'monthly'): string | null {
  const period = billingPeriod === 'annual' ? 'ANNUAL' : 'MONTHLY';
  // The period-specific 4-var price is always preferred. TEAMS is the only
  // paid tier post-PRO-removal, so it is the only tier with a checkout price.
  const periodSpecific = tier === 'TEAMS'
    ? process.env[`STRIPE_PRICE_TEAMS_${period}`]
    : undefined;
  if (periodSpecific) return periodSpecific;
  // F9 fail-closed: for ANNUAL, never fall back to a monthly-priced var. The legacy
  // single-var (STRIPE_PRICE_PRO/TEAMS/BASIC) and the TIER_CAPABILITIES default are
  // all monthly prices; charging one for an annual selection — while the UI shows the
  // annual price — is a billing lie. Returning null yields an honest 400
  // NO_PRICE_CONFIGURED (checkout.ts:30) instead of a wrong charge.
  if (billingPeriod === 'annual') return null;
  const candidates = tier === 'TEAMS'
    ? [process.env.STRIPE_PRICE_TEAMS]
    : [];
  for (const c of candidates) if (c) return c;
  return TIER_CAPABILITIES[tier]?.stripePriceId ?? null;
}

/**
 * GET /api/stripe/status → { configured } — a secret-free probe of whether Stripe
 * checkout is wired (STRIPE_SECRET_KEY present + stripe SDK loadable). Lets the
 * billing UI render the F8 honest "not configured" disabled state BEFORE a click,
 * instead of only surfacing the 503 after the user tries to subscribe.
 */
export const statusRoutes: FastifyPluginAsync = async (server) => {
  server.get('/api/stripe/status', async () => ({ configured: !!getStripe() }));
};

// ── Combined route registration ──────────────────────────────────────

/**
 * Register all Stripe routes on a Fastify server.
 * Safe to call even when Stripe is not configured — routes will return 503.
 */
export const stripeRoutes: FastifyPluginAsync = async (server) => {
  // Webhook needs its own content type parser, so register in isolated context
  await server.register(async (webhookScope) => {
    const { webhookRoutes } = await import('./webhook.js');
    await webhookScope.register(webhookRoutes);
  });

  // Checkout, portal, sync, and the config-status probe use standard JSON parsing
  const { checkoutRoutes } = await import('./checkout.js');
  const { portalRoutes } = await import('./portal.js');
  const { syncRoutes } = await import('./sync.js');
  await server.register(checkoutRoutes);
  await server.register(portalRoutes);
  await server.register(syncRoutes);
  await server.register(statusRoutes);
};
