/**
 * Stripe Sync — poll-based tier synchronization for desktop apps.
 *
 * POST /api/stripe/sync
 * Body: { sessionId: string }
 * Returns: { tier: string, customerId: string }
 *
 * Desktop apps behind NAT cannot receive webhooks reliably.
 * The frontend calls this endpoint after Stripe checkout redirect
 * to confirm payment and update the local tier.
 */

import type { FastifyPluginAsync } from 'fastify';
import { type Tier, parseTier } from '@waggle/shared';
import { getStripe, tierFromPriceId } from './index.js';
import { updateUserTier } from './webhook.js';

export const syncRoutes: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: { sessionId: string };
  }>('/api/stripe/sync', async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(503).send({ error: 'STRIPE_NOT_CONFIGURED' });
    }

    const { sessionId } = request.body ?? {};
    if (!sessionId || typeof sessionId !== 'string') {
      return reply.code(400).send({ error: 'MISSING_SESSION_ID', message: 'sessionId is required.' });
    }

    const dataDir = (server as any).localConfig?.dataDir;
    if (!dataDir) {
      return reply.code(500).send({ error: 'SERVER_MISCONFIGURED' });
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });

      const customerId = typeof session.customer === 'string'
        ? session.customer
        : undefined;

      // Resolve tier from subscription price or session metadata
      let tier: Tier | null = null;

      // Try subscription price first (most reliable)
      const subscription = session.subscription;
      if (subscription && typeof subscription === 'object' && 'items' in subscription) {
        const sub = subscription as { items?: { data?: Array<{ price?: { id?: string } }> } };
        const priceId = sub.items?.data?.[0]?.price?.id;
        if (priceId) {
          tier = tierFromPriceId(priceId);
        }
      }

      // Fall back to session metadata
      if (!tier) {
        const tierRaw = session.metadata?.tier;
        if (tierRaw) {
          tier = parseTier(tierRaw);
        }
      }

      if (!tier) {
        return reply.code(400).send({ error: 'TIER_NOT_RESOLVED', message: 'Could not determine tier from checkout session.' });
      }

      updateUserTier(dataDir, tier, customerId);
      server.log.info({ event: 'stripe_sync', tier, customerId });

      return { tier, customerId: customerId ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe sync failed';
      server.log.error({ event: 'stripe_sync_error', error: message });
      return reply.code(502).send({ error: 'STRIPE_ERROR', message });
    }
  });
};
