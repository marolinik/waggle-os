/**
 * Stripe Webhook — handles subscription lifecycle events.
 *
 * POST /api/stripe/webhook
 * Validates stripe-signature header, updates tier in config.json.
 *
 * CRITICAL: This route needs raw body for signature validation.
 * Fastify's addContentTypeParser is used to capture raw bytes.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { type Tier, parseTier, getCapabilities } from '@waggle/shared';
import { getStripe, tierFromPriceId } from './index.js';

/**
 * Update the user's tier in config.json.
 * This is the same storage used by readTierFromRequest() in the tier middleware.
 */
function updateUserTier(dataDir: string, tier: Tier): void {
  const configPath = path.join(dataDir, 'config.json');
  let raw: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* fresh config */ }
  raw.tier = tier;
  fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
}

export const webhookRoutes: FastifyPluginAsync = async (server) => {
  // Register raw body parser for this route only
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  server.post('/api/stripe/webhook', async (request, reply) => {
    const stripe = getStripe();
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!stripe || !webhookSecret) {
      return reply.code(503).send({ error: 'STRIPE_NOT_CONFIGURED' });
    }

    const signature = request.headers['stripe-signature'];
    if (!signature) {
      return reply.code(400).send({ error: 'MISSING_SIGNATURE' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        signature as string,
        webhookSecret,
      );
    } catch {
      return reply.code(400).send({ error: 'INVALID_SIGNATURE' });
    }

    const dataDir = (server as any).localConfig?.dataDir;
    if (!dataDir) {
      return reply.code(500).send({ error: 'SERVER_MISCONFIGURED' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { metadata?: Record<string, string> };
        const tierRaw = session.metadata?.tier;
        if (tierRaw) {
          const parsed = parseTier(tierRaw);
          if (parsed) {
            updateUserTier(dataDir, parsed);
            server.log.info({ event: 'checkout_completed', tier: parsed });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as { items?: { data?: Array<{ price?: { id?: string } }> } };
        const priceId = subscription.items?.data?.[0]?.price?.id;
        if (priceId) {
          const newTier = tierFromPriceId(priceId);
          if (newTier) {
            updateUserTier(dataDir, newTier);
            server.log.info({ event: 'subscription_updated', tier: newTier });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        updateUserTier(dataDir, 'SOLO');
        server.log.info({ event: 'subscription_cancelled' });
        break;
      }

      default:
        // Unknown event types are silently acknowledged
        break;
    }

    return { received: true };
  });
};

export { updateUserTier };
