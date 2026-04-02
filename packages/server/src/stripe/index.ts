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

/**
 * Map a Stripe price ID back to a canonical Tier.
 * Reads STRIPE_PRICE_BASIC and STRIPE_PRICE_TEAMS from env.
 */
export function tierFromPriceId(priceId: string): Tier | null {
  const basicPrice = process.env['STRIPE_PRICE_BASIC'];
  const teamsPrice = process.env['STRIPE_PRICE_TEAMS'];

  if (basicPrice && priceId === basicPrice) return 'BASIC';
  if (teamsPrice && priceId === teamsPrice) return 'TEAMS';
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

  // Checkout and portal use standard JSON parsing
  const { checkoutRoutes } = await import('./checkout.js');
  const { portalRoutes } = await import('./portal.js');
  await server.register(checkoutRoutes);
  await server.register(portalRoutes);
};
