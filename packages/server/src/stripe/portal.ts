/**
 * Stripe Customer Portal — lets paid users manage their subscription.
 *
 * POST /api/stripe/create-portal-session
 * Returns: { url: string }
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { requireTier } from '../middleware/assert-tier.js';
import { getStripe } from './index.js';

export const portalRoutes: FastifyPluginAsync = async (server) => {
  server.post('/api/stripe/create-portal-session', { preHandler: [requireTier('PRO')] }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(503).send({ error: 'STRIPE_NOT_CONFIGURED' });
    }

    // Read stripe_customer_id from config.json
    const dataDir = (server as any).localConfig?.dataDir;
    let customerId: string | null = null;
    try {
      const configPath = path.join(dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        customerId = raw.stripe_customer_id ?? null;
      }
    } catch { /* no config */ }

    if (!customerId) {
      return reply.code(400).send({ error: 'NO_STRIPE_CUSTOMER', message: 'No Stripe customer found. Complete a checkout first.' });
    }

    try {
      const origin = request.headers['origin']
        ?? process.env['APP_URL']
        ?? 'http://localhost:1420';

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/settings`,
      });
      return { url: session.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Portal session creation failed';
      return reply.code(502).send({ error: 'STRIPE_ERROR', message });
    }
  });
};
