/**
 * Stripe Checkout — creates a checkout session for tier upgrades.
 *
 * POST /api/stripe/create-checkout-session
 * Body: { tier: 'PRO' | 'TEAMS', billingPeriod?: 'monthly' | 'annual' }
 * Returns: { url: string }
 */

import type { FastifyPluginAsync } from 'fastify';
import { type Tier, TIER_CAPABILITIES } from '@waggle/shared';
import { getStripe } from './index.js';

export const checkoutRoutes: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: { tier: string; billingPeriod?: 'monthly' | 'annual' };
  }>('/api/stripe/create-checkout-session', async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(503).send({ error: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
    }

    const { tier, billingPeriod } = request.body ?? {};

    // Only BASIC and TEAMS have Stripe prices
    if (tier !== 'PRO' && tier !== 'TEAMS') {
      return reply.code(400).send({ error: 'INVALID_TIER', message: 'Only PRO and TEAMS tiers support Stripe checkout.' });
    }

    const capabilities = TIER_CAPABILITIES[tier as Tier];
    const priceId = capabilities.stripePriceId;
    if (!priceId) {
      return reply.code(400).send({ error: 'NO_PRICE_CONFIGURED', message: `No Stripe price ID configured for ${tier}. Set STRIPE_PRICE_${tier} env var.` });
    }

    try {
      const origin = request.headers['origin']
        ?? process.env['APP_URL']
        ?? 'http://localhost:1420';

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/payment-cancelled`,
        allow_promotion_codes: true,
        metadata: {
          tier,
          billingPeriod: billingPeriod ?? 'monthly',
        },
      });

      return { url: session.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe session creation failed';
      return reply.code(502).send({ error: 'STRIPE_ERROR', message });
    }
  });
};
