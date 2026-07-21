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
 * Atomically write JSON to disk: write to a unique temp file in the same
 * directory, then rename over the target. rename(2) is atomic on the same
 * volume, so a crash mid-write leaves the previous complete file intact
 * instead of a torn/partial one. A module-scoped counter (not a timestamp)
 * keeps the temp name unique even within the same millisecond.
 */
let __tmpSeq = 0;
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${process.pid}.${__tmpSeq++}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        fs.renameSync(tmp, filePath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
        if (!transient || attempt === 4) throw error;
        // Windows antivirus and indexers can briefly hold an exclusive handle.
        Atomics.wait(waitBuffer, 0, 0, 25 * attempt);
      }
    }
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

/**
 * R1-011: serialize the webhook critical section. atomicWriteJson prevents torn
 * files, but two concurrent deliveries of the SAME event (a real Stripe retry
 * scenario) could both read .stripe-processed-events.json before either wrote,
 * both pass the idempotency check, and both run updateUserTier — a TOCTOU race
 * that can write contradictory tiers. This module-scoped promise queue makes the
 * read-check-process-write sequence mutually exclusive; one failure never wedges
 * the queue (the tail swallows rejections).
 */
let __webhookTail: Promise<void> = Promise.resolve();
function serializeWebhook<T>(fn: () => Promise<T>): Promise<T> {
  const result = __webhookTail.then(() => fn());
  __webhookTail = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * Update the user's tier (and optionally Stripe customer ID) in config.json.
 * This is the same storage used by readTierFromRequest() in the tier middleware
 * and by the portal route to read stripe_customer_id.
 */
function updateUserTier(dataDir: string, tier: Tier, customerId?: string): void {
  const configPath = path.join(dataDir, 'config.json');
  let raw: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* fresh config */ }
  const updated = { ...raw, tier, ...(customerId ? { stripe_customer_id: customerId } : {}) };
  atomicWriteJson(configPath, updated);
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

    const dataDir = server.localConfig?.dataDir;
    if (!dataDir) {
      return reply.code(500).send({ error: 'SERVER_MISCONFIGURED' });
    }

    // R1-011: run idempotency-check + processing + processed-write as ONE
    // serialized critical section so concurrent retries of the same event cannot
    // both slip past the dedup check and double-process a tier change.
    const processedPath = path.join(dataDir, '.stripe-processed-events.json');
    const outcome = await serializeWebhook<'duplicate' | 'processed'>(async () => {
      let processedIds: string[] = [];
      try { processedIds = JSON.parse(fs.readFileSync(processedPath, 'utf-8')); } catch { /* first run */ }
      if (processedIds.includes(event.id)) {
        server.log.info({ event: 'webhook_duplicate_skipped', eventId: event.id });
        return 'duplicate';
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as { payment_status?: string; metadata?: Record<string, string>; customer?: string };
          // R1-002 (webhook path): checkout.session.completed also fires for
          // UNPAID sessions (async/delayed payment methods, incomplete
          // checkouts). Only grant a tier once payment has actually settled —
          // same gate as the /api/stripe/sync path (sync.ts). 'paid' covers
          // normal purchases; 'no_payment_required' covers 100%-off coupons.
          const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
          const tierRaw = session.metadata?.tier;
          if (paid && tierRaw) {
            const parsed = parseTier(tierRaw);
            if (parsed) {
              const customerId = typeof session.customer === 'string' ? session.customer : undefined;
              updateUserTier(dataDir, parsed, customerId);
              server.log.info({ event: 'checkout_completed', tier: parsed, customerId });
            }
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as { customer?: string; items?: { data?: Array<{ price?: { id?: string } }> } };
          const priceId = subscription.items?.data?.[0]?.price?.id;
          if (priceId) {
            const newTier = tierFromPriceId(priceId);
            if (newTier) {
              const customerId = typeof subscription.customer === 'string' ? subscription.customer : undefined;
              updateUserTier(dataDir, newTier, customerId);
              server.log.info({ event: 'subscription_updated', tier: newTier, customerId });
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          updateUserTier(dataDir, 'FREE');
          server.log.info({ event: 'subscription_cancelled' });
          break;
        }

        default:
          // Unknown event types are silently acknowledged
          break;
      }

      // Mark event as processed (keep last 500 IDs to avoid unbounded growth)
      processedIds.push(event.id);
      if (processedIds.length > 500) processedIds.splice(0, processedIds.length - 500);
      try { atomicWriteJson(processedPath, processedIds); } catch { /* best effort */ }
      return 'processed';
    });

    if (outcome === 'duplicate') return reply.send({ received: true, duplicate: true });
    return { received: true };
  });
};

export { updateUserTier };
