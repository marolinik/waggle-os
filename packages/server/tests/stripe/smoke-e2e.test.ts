/**
 * H-33 Stripe smoke — programmatic end-to-end.
 *
 * Covers every item in `docs/OPS/stripe-smoke.md` without needing the
 * `stripe listen` / long-lived-sidecar dance:
 *
 *   1. `checkout.session.completed`         → tier updated + customer ID stored
 *   2. `customer.subscription.updated`      → tier reflects new price
 *   3. `customer.subscription.deleted`      → tier reverts to FREE
 *   4. Duplicate event                      → .stripe-processed-events.json dedup
 *   5. `/api/stripe/create-checkout-session` returns a real Stripe Checkout URL
 *   6. `/api/stripe/create-portal-session`  returns a real Stripe portal URL
 *   7. Signature validation                 → invalid sig → 400 INVALID_SIGNATURE
 *
 * Signs events using `Stripe.webhooks.generateTestHeaderString` so we exercise
 * the real signature-validation path without running `stripe listen`.
 *
 * ## How to run
 *
 * ```sh
 * STRIPE_SECRET_KEY=sk_test_... \
 * STRIPE_PRICE_PRO=price_... \
 * STRIPE_PRICE_TEAMS=price_... \
 * WAGGLE_STRIPE_SMOKE=1 \
 * npx vitest run packages/server/tests/stripe/smoke-e2e.test.ts
 * ```
 *
 * Without `WAGGLE_STRIPE_SMOKE=1` the suite self-skips so CI stays green on
 * dev machines that don't have a Stripe sandbox wired up.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

// ── Gate: self-skip when the smoke env isn't configured ────────

const ENABLED = process.env.WAGGLE_STRIPE_SMOKE === '1' || process.env.WAGGLE_STRIPE_SMOKE === 'true';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const PRICE_PRO = process.env.STRIPE_PRICE_PRO ?? '';
const PRICE_TEAMS = process.env.STRIPE_PRICE_TEAMS ?? '';

// Generate a webhook secret fresh for this run — the sidecar would read
// whsec_... from `stripe listen`, but since we sign events ourselves the
// only requirement is that both sides share the same secret.
const WEBHOOK_SECRET = `whsec_${'smoke'.padEnd(32, '0')}`;
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

const SHOULD_RUN =
  ENABLED &&
  STRIPE_KEY.startsWith('sk_test_') &&
  PRICE_PRO.startsWith('price_') &&
  PRICE_TEAMS.startsWith('price_');

// ── Skip block that emits a visible reason in test output ──────

if (!SHOULD_RUN) {
  describe.skip('Stripe smoke E2E (H-33)', () => {
    it('skipped — set WAGGLE_STRIPE_SMOKE=1 + STRIPE_* env vars to run', () => {
      // Intentional no-op.
    });
  });
} else {
  describe('Stripe smoke E2E (H-33)', () => {
    let server: FastifyInstance;
    let tmpDir: string;
    let stripe: import('stripe').default;
    // Record structured checklist output for later inclusion in ops notes.
    const checklist: Record<string, { passed: boolean; detail: string }> = {};

    beforeAll(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-stripe-smoke-'));

      // Seed config.json at FREE so the tier flip is visible in step 1.
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ tier: 'FREE' }, null, 2),
      );

      // Lazy imports so env stubs above land before @waggle/shared module-loads.
      const [{ buildLocalServer }, stripeModule, { authInject }] = await Promise.all([
        import('../../src/local/index.js'),
        import('stripe'),
        import('../test-utils.js'),
      ]);

      const Stripe = (stripeModule as unknown as { default: typeof import('stripe').default }).default;
      stripe = new Stripe(STRIPE_KEY, { apiVersion: '2025-03-31.basil' });

      server = await buildLocalServer({ dataDir: tmpDir });
      // Attach the helper so individual tests don't re-import.
      (server as unknown as { _authInject: typeof authInject })._authInject = authInject;
    }, 60_000);

    afterAll(async () => {
      try { await server?.close(); } catch { /* best effort */ }
      await new Promise(r => setTimeout(r, 150));
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 */ }

      // Print the structured checklist. Surfaces a CI-friendly summary even
      // when the UI rolls up per-assertion green ticks.
      // eslint-disable-next-line no-console
      console.log('\n=== H-33 Stripe smoke checklist ===\n' +
        Object.entries(checklist)
          .map(([k, v]) => `  [${v.passed ? 'x' : ' '}] ${k} — ${v.detail}`)
          .join('\n') + '\n');
    });

    function readConfig(): Record<string, unknown> {
      const raw = fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    }

    function postWebhook(rawEvent: unknown, signatureOverride?: string): ReturnType<FastifyInstance['inject']> {
      const payload = JSON.stringify(rawEvent);
      const sig = signatureOverride ?? stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });
      return server.inject({
        method: 'POST',
        url: '/api/stripe/webhook',
        payload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sig,
        },
      });
    }

    // Build a minimal-but-valid Stripe event shape. Our webhook doesn't
    // validate the whole schema — only the fields it consumes — so this
    // saves us from round-tripping through the real API.
    interface MinimalEvent {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    }
    function makeEvent(id: string, type: string, object: Record<string, unknown>): MinimalEvent {
      return { id, type, data: { object } };
    }

    it('[1] checkout.session.completed → tier=PRO + stripe_customer_id set', async () => {
      const event = makeEvent('evt_smoke_checkout_1', 'checkout.session.completed', {
        metadata: { tier: 'PRO' },
        customer: 'cus_smoke_1',
      });
      const res = await postWebhook(event);
      expect(res.statusCode).toBe(200);

      const cfg = readConfig();
      expect(cfg.tier).toBe('PRO');
      expect(cfg.stripe_customer_id).toBe('cus_smoke_1');
      checklist['1. checkout.session.completed'] = {
        passed: true,
        detail: `tier=PRO + customer=cus_smoke_1`,
      };
    });

    it('[2] customer.subscription.updated → tier flips to TEAMS for PRICE_TEAMS', async () => {
      const event = makeEvent('evt_smoke_sub_upd_1', 'customer.subscription.updated', {
        customer: 'cus_smoke_1',
        items: { data: [{ price: { id: PRICE_TEAMS } }] },
      });
      const res = await postWebhook(event);
      expect(res.statusCode).toBe(200);

      const cfg = readConfig();
      expect(cfg.tier).toBe('TEAMS');
      checklist['2. customer.subscription.updated'] = {
        passed: true,
        detail: `PRICE_TEAMS (${PRICE_TEAMS.slice(0, 16)}…) → tier=TEAMS`,
      };
    });

    it('[3] customer.subscription.deleted → tier reverts to FREE', async () => {
      const event = makeEvent('evt_smoke_sub_del_1', 'customer.subscription.deleted', {
        customer: 'cus_smoke_1',
      });
      const res = await postWebhook(event);
      expect(res.statusCode).toBe(200);

      const cfg = readConfig();
      expect(cfg.tier).toBe('FREE');
      checklist['3. customer.subscription.deleted'] = {
        passed: true,
        detail: 'tier reverted to FREE',
      };
    });

    it('[4] duplicate event ID is deduped — config unchanged', async () => {
      // Flip back to PRO, then re-fire the same event id. Second call must
      // be a no-op according to .stripe-processed-events.json.
      await postWebhook(makeEvent('evt_smoke_dedup_pre', 'checkout.session.completed', {
        metadata: { tier: 'TEAMS' },
        customer: 'cus_smoke_1',
      }));
      expect(readConfig().tier).toBe('TEAMS');

      // Now mutate state would-be: send a dedup-checking event, then resend.
      const event = makeEvent('evt_smoke_checkout_1', 'checkout.session.completed', {
        metadata: { tier: 'PRO' },  // would downgrade if re-processed
        customer: 'cus_smoke_1',
      });
      const res = await postWebhook(event);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { received: boolean; duplicate?: boolean };
      expect(body.duplicate).toBe(true);

      // Tier unchanged — the dedup guard kept us on TEAMS.
      expect(readConfig().tier).toBe('TEAMS');
      checklist['4. duplicate event dedup'] = {
        passed: true,
        detail: 'resending evt_smoke_checkout_1 left tier on TEAMS (duplicate skipped)',
      };
    });

    it('[5] invalid signature → 400 INVALID_SIGNATURE', async () => {
      const event = makeEvent('evt_smoke_badsig', 'checkout.session.completed', {
        metadata: { tier: 'PRO' },
      });
      const res = await postWebhook(event, 't=0,v1=bogus');
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { error: string };
      expect(body.error).toBe('INVALID_SIGNATURE');
      checklist['5. signature validation'] = {
        passed: true,
        detail: 'bogus signature → 400 INVALID_SIGNATURE',
      };
    });

    it('[6] POST /api/stripe/create-checkout-session returns a real checkout URL', async () => {
      const authInject = (server as unknown as { _authInject: typeof import('../test-utils.js').authInject })._authInject;
      const res = await server.inject(authInject(server, {
        method: 'POST',
        url: '/api/stripe/create-checkout-session',
        headers: { 'content-type': 'application/json' },
        payload: { tier: 'PRO' },
      }));

      // Current tier is TEAMS (leftover from step 4). The checkout route is
      // tier-agnostic — it only needs STRIPE_PRICE_PRO to be configured.
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { url: string };
      expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      checklist['6. create-checkout-session'] = {
        passed: true,
        detail: `URL = ${body.url.slice(0, 48)}…`,
      };
    }, 30_000);

    it('[7] POST /api/stripe/create-portal-session returns a real portal URL', async () => {
      // Create a real test-mode customer in the sandbox so the portal call
      // has something valid to target. Steps 1-4 wrote cus_smoke_1 into
      // config.json — that ID doesn't exist in Stripe, so we override it.
      const customer = await stripe.customers.create({
        description: 'Waggle H-33 smoke — ephemeral',
        metadata: { smoke_run: new Date().toISOString() },
      });

      // Update config.json to point at the real customer (also keep the
      // tier as something that clears requireTier('PRO')).
      const cfgPath = path.join(tmpDir, 'config.json');
      const current = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      fs.writeFileSync(cfgPath, JSON.stringify({
        ...current,
        tier: 'PRO',
        stripe_customer_id: customer.id,
      }, null, 2));

      const authInject = (server as unknown as { _authInject: typeof import('../test-utils.js').authInject })._authInject;
      const res = await server.inject(authInject(server, {
        method: 'POST',
        url: '/api/stripe/create-portal-session',
        headers: { 'content-type': 'application/json' },
        payload: {},
      }));

      // Clean up the ephemeral customer so we don't accumulate fixtures.
      try { await stripe.customers.del(customer.id); } catch { /* best effort */ }

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { url: string };
      expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
      checklist['7. create-portal-session'] = {
        passed: true,
        detail: `customer=${customer.id} · URL = ${body.url.slice(0, 48)}…`,
      };
    }, 30_000);
  });
}
