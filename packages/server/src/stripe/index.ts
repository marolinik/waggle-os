/**
 * Stripe integration — checkout, webhook, and customer portal.
 *
 * All Stripe functionality is gated behind STRIPE_SECRET_KEY env var.
 * When not set, all /api/stripe/* routes return 503 STRIPE_NOT_CONFIGURED.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Tier } from '@waggle/shared';

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
 *       STRIPE_PRICE_BASIC          (oldest alias, resolves to PRO)
 *
 * New contract is checked first; legacy vars act as additional fallbacks.
 * Resolution is synchronous and offline-safe — no Stripe API round-trip.
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

  if (proPrices.includes(priceId)) return 'PRO';
  if (teamsPrices.includes(priceId)) return 'TEAMS';
  return null;
}

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

  // Checkout, portal, and sync use standard JSON parsing
  const { checkoutRoutes } = await import('./checkout.js');
  const { portalRoutes } = await import('./portal.js');
  const { syncRoutes } = await import('./sync.js');
  await server.register(checkoutRoutes);
  await server.register(portalRoutes);
  await server.register(syncRoutes);
};
