/**
 * Stripe Checkout — creates a checkout session for tier upgrades.
 *
 * POST /api/stripe/create-checkout-session
 * Body: { tier: 'PRO' | 'TEAMS', billingPeriod?: 'monthly' | 'annual' }
 * Returns: { url: string }
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Tier } from '@waggle/shared';
import { getStripe, priceIdForTier } from './index.js';
import { validateBody } from '../validate-body.js';

/** POST /api/stripe/create-checkout-session body — a billing action. `tier` is
 *  shape-validated here (required string); the PRO/TEAMS business rule stays in
 *  the handler so it can return the specific INVALID_TIER envelope. */
const createCheckoutSchema = z.object({
  tier: z.string().min(1),
  billingPeriod: z.enum(['monthly', 'annual']).optional(),
});

export const checkoutRoutes: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: { tier: string; billingPeriod?: 'monthly' | 'annual' };
  }>('/api/stripe/create-checkout-session', { preHandler: validateBody(createCheckoutSchema) }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(503).send({ error: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
    }

    const { tier, billingPeriod } = request.body ?? {};

    // Only BASIC and TEAMS have Stripe prices
    if (tier !== 'PRO' && tier !== 'TEAMS') {
      return reply.code(400).send({ error: 'INVALID_TIER', message: 'Only PRO and TEAMS tiers support Stripe checkout.' });
    }

    const priceId = priceIdForTier(tier as Tier, billingPeriod);
    if (!priceId) {
      return reply.code(400).send({ error: 'NO_PRICE_CONFIGURED', message: `No Stripe price configured for ${tier} (${billingPeriod ?? 'monthly'}).` });
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
