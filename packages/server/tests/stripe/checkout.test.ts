/**
 * Stripe Checkout — billingPeriod-aware price resolution (FINDING R1-003).
 *
 * The checkout route must honour the requested billingPeriod when picking the
 * Stripe price: 'annual' resolves the annual price, 'monthly' (and omitted)
 * resolves the monthly price with a legacy single-var fallback. ANNUAL fails
 * closed (F9): it never falls back to a monthly-priced var, returning
 * NO_PRICE_CONFIGURED rather than silently charging the monthly price.
 *
 * We mock getStripe (mirroring webhook.test.ts's getStripe / process.env
 * mocking style) with a fake Stripe whose checkout.sessions.create records the
 * price it was handed, and keep the REAL priceIdForTier so the env-driven
 * resolution logic is exercised end-to-end. Price env vars are cleared between
 * cases so tests stay order-independent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Records the price passed to the most recent sessions.create call.
let lastPriceArg: string | null = null;

// Fake Stripe — only the surface checkout.ts touches.
const fakeStripe = {
  checkout: {
    sessions: {
      create: vi.fn(async (params: { line_items: Array<{ price: string }> }) => {
        lastPriceArg = params.line_items[0]?.price ?? null;
        return { url: 'https://checkout.stripe.test/session_123' };
      }),
    },
  },
};

// Mock the stripe barrel: override getStripe, keep the real priceIdForTier so
// the env-var resolution contract is genuinely under test.
vi.mock('../../src/stripe/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/stripe/index.js')>();
  return {
    ...actual,
    getStripe: () => fakeStripe,
  };
});

import { checkoutRoutes } from '../../src/stripe/checkout.js';

const PRICE_ENV_KEYS = [
  'STRIPE_PRICE_BASIC',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_TEAMS',
  'STRIPE_PRICE_TEAMS_MONTHLY',
  'STRIPE_PRICE_TEAMS_ANNUAL',
] as const;

describe('Stripe Checkout — billingPeriod-aware price resolution', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    for (const k of PRICE_ENV_KEYS) delete process.env[k];
    lastPriceArg = null;
    fakeStripe.checkout.sessions.create.mockClear();

    server = Fastify();
    await server.register(checkoutRoutes);
    await server.ready();
  });

  afterEach(async () => {
    for (const k of PRICE_ENV_KEYS) delete process.env[k];
    await server.close();
  });

  async function postCheckout(body: Record<string, unknown>) {
    return server.inject({
      method: 'POST',
      url: '/api/stripe/create-checkout-session',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
  }

  it('annual billingPeriod uses the annual price (price_pa)', async () => {
    process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_pm';
    process.env['STRIPE_PRICE_TEAMS_ANNUAL'] = 'price_pa';

    const res = await postCheckout({ tier: 'TEAMS', billingPeriod: 'annual' });

    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe('https://checkout.stripe.test/session_123');
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledOnce();
    expect(lastPriceArg).toBe('price_pa');
  });

  it('monthly billingPeriod uses the monthly price (price_pm)', async () => {
    process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_pm';
    process.env['STRIPE_PRICE_TEAMS_ANNUAL'] = 'price_pa';

    const res = await postCheckout({ tier: 'TEAMS', billingPeriod: 'monthly' });

    expect(res.statusCode).toBe(200);
    expect(lastPriceArg).toBe('price_pm');
  });

  it('omitted billingPeriod defaults to the monthly price (price_pm)', async () => {
    process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_pm';
    process.env['STRIPE_PRICE_TEAMS_ANNUAL'] = 'price_pa';

    const res = await postCheckout({ tier: 'TEAMS' });

    expect(res.statusCode).toBe(200);
    expect(lastPriceArg).toBe('price_pm');
  });

  it('monthly falls back to the legacy single-var price when no 4-var contract is set', async () => {
    process.env['STRIPE_PRICE_TEAMS'] = 'price_legacy';

    const res = await postCheckout({ tier: 'TEAMS', billingPeriod: 'monthly' });

    expect(res.statusCode).toBe(200);
    expect(lastPriceArg).toBe('price_legacy');
  });

  it('annual FAILS CLOSED when only a (monthly) legacy single-var is set — never silently charges monthly (F9)', async () => {
    // The legacy STRIPE_PRICE_TEAMS is a monthly price; an annual selection must not
    // resolve to it (would charge monthly while the UI shows the annual price).
    process.env['STRIPE_PRICE_TEAMS'] = 'price_legacy';

    const res = await postCheckout({ tier: 'TEAMS', billingPeriod: 'annual' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('NO_PRICE_CONFIGURED');
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('returns 400 NO_PRICE_CONFIGURED for an annual selection when nothing is configured', async () => {
    // The monthly path can fall back to the legacy single-var / TIER_CAPABILITIES
    // default (STRIPE_PRICE_TEAMS is present in .env at module load), so the
    // deterministic "no price" case is the annual one: annual fails closed (F9)
    // and never falls back, so with nothing configured it returns null → 400.
    const res = await postCheckout({ tier: 'TEAMS', billingPeriod: 'annual' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('NO_PRICE_CONFIGURED');
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a non-TEAMS tier (legacy PRO) with 400 INVALID_TIER — TEAMS is the only paid checkout (PRO removed)', async () => {
    // Even with a price configured, a PRO checkout must be refused before price
    // resolution — Solo is free, Team is the only Stripe tier.
    process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_pm';

    const res = await postCheckout({ tier: 'PRO', billingPeriod: 'monthly' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('INVALID_TIER');
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
