import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { updateUserTier } from '../../src/stripe/webhook.js';
import { tierFromPriceId } from '../../src/stripe/index.js';
import { securityMiddleware } from '../../src/local/security-middleware.js';
import { parseTier } from '@waggle/shared';

// Mock only getStripe; keep the real tierFromPriceId so the 17 existing tests
// (which import the genuine env-driven resolver) stay green.
vi.mock('../../src/stripe/index.js', async (importActual) => {
  const actual = await importActual<typeof import('../../src/stripe/index.js')>();
  return { ...actual, getStripe: () => fakeStripe };
});

// Fake Stripe whose webhooks.constructEvent returns whatever event the test
// queued. The webhook handler never inspects the signature beyond calling this.
let nextEvent: unknown = null;
const fakeStripe = {
  webhooks: {
    constructEvent: () => nextEvent,
  },
} as unknown as import('stripe').default;

describe('Stripe Webhook — tier update logic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-stripe-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('updateUserTier', () => {
    it('creates config.json and sets tier to PRO on checkout complete', () => {
      updateUserTier(tmpDir, 'PRO');

      const configPath = path.join(tmpDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('PRO');
    });

    it('updates existing config.json without losing other fields', () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ theme: 'dark', tier: 'FREE' }));

      updateUserTier(tmpDir, 'TEAMS');

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('TEAMS');
      expect(raw.theme).toBe('dark');
    });

    it('downgrades tier to FREE on subscription deleted', () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ tier: 'TEAMS' }));

      updateUserTier(tmpDir, 'FREE');

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('FREE');
    });

    it('handles missing config.json gracefully', () => {
      // No config.json exists — should create one
      expect(() => updateUserTier(tmpDir, 'ENTERPRISE')).not.toThrow();

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      expect(raw.tier).toBe('ENTERPRISE');
    });
  });

  describe('tierFromPriceId', () => {
    // All Stripe price env vars we touch. Cleared before/after each test so
    // tests are order-independent and don't leak into one another.
    const PRICE_ENV_KEYS = [
      'STRIPE_PRICE_BASIC',
      'STRIPE_PRICE_PRO',
      'STRIPE_PRICE_PRO_MONTHLY',
      'STRIPE_PRICE_PRO_ANNUAL',
      'STRIPE_PRICE_TEAMS',
      'STRIPE_PRICE_TEAMS_MONTHLY',
      'STRIPE_PRICE_TEAMS_ANNUAL',
    ] as const;

    beforeEach(() => {
      for (const k of PRICE_ENV_KEYS) delete process.env[k];
    });

    afterEach(() => {
      for (const k of PRICE_ENV_KEYS) delete process.env[k];
    });

    // ── Legacy single-var contract (back-compat) ────────────────────────

    it('returns null when no env vars are set', () => {
      expect(tierFromPriceId('price_abc123')).toBeNull();
    });

    it('maps legacy BASIC price env to PRO tier', () => {
      // BASIC was renamed to PRO; STRIPE_PRICE_BASIC is kept as a legacy
      // alias that now resolves to the PRO tier (see stripe/index.ts).
      process.env['STRIPE_PRICE_BASIC'] = 'price_basic_test';
      expect(tierFromPriceId('price_basic_test')).toBe('PRO');
    });

    it('maps legacy STRIPE_PRICE_PRO to PRO tier', () => {
      process.env['STRIPE_PRICE_PRO'] = 'price_pro_test';
      expect(tierFromPriceId('price_pro_test')).toBe('PRO');
    });

    it('maps legacy STRIPE_PRICE_TEAMS to TEAMS tier', () => {
      process.env['STRIPE_PRICE_TEAMS'] = 'price_teams_test';
      expect(tierFromPriceId('price_teams_test')).toBe('TEAMS');
    });

    it('returns null for unknown price ID with legacy contract', () => {
      process.env['STRIPE_PRICE_BASIC'] = 'price_basic_test';
      process.env['STRIPE_PRICE_TEAMS'] = 'price_teams_test';
      expect(tierFromPriceId('price_unknown')).toBeNull();
    });

    // ── New 4-var contract (apps/www Next.js port) ──────────────────────

    it('maps STRIPE_PRICE_PRO_MONTHLY to PRO tier', () => {
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_test';
      expect(tierFromPriceId('price_pro_monthly_test')).toBe('PRO');
    });

    it('maps STRIPE_PRICE_PRO_ANNUAL to PRO tier', () => {
      process.env['STRIPE_PRICE_PRO_ANNUAL'] = 'price_pro_annual_test';
      expect(tierFromPriceId('price_pro_annual_test')).toBe('PRO');
    });

    it('maps STRIPE_PRICE_TEAMS_MONTHLY to TEAMS tier', () => {
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_teams_monthly_test';
      expect(tierFromPriceId('price_teams_monthly_test')).toBe('TEAMS');
    });

    it('maps STRIPE_PRICE_TEAMS_ANNUAL to TEAMS tier', () => {
      process.env['STRIPE_PRICE_TEAMS_ANNUAL'] = 'price_teams_annual_test';
      expect(tierFromPriceId('price_teams_annual_test')).toBe('TEAMS');
    });

    // ── Coexistence: both contracts active simultaneously ───────────────

    it('resolves correctly when both new + legacy contracts are set with different IDs', () => {
      // apps/www landing config + sidecar legacy config on the same env.
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_landing_pro_m';
      process.env['STRIPE_PRICE_PRO_ANNUAL']  = 'price_landing_pro_y';
      process.env['STRIPE_PRICE_PRO']         = 'price_sidecar_pro';
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_landing_teams_m';
      process.env['STRIPE_PRICE_TEAMS_ANNUAL']  = 'price_landing_teams_y';
      process.env['STRIPE_PRICE_TEAMS']         = 'price_sidecar_teams';

      // Every configured Pro price → PRO, every configured Teams price → TEAMS.
      expect(tierFromPriceId('price_landing_pro_m')).toBe('PRO');
      expect(tierFromPriceId('price_landing_pro_y')).toBe('PRO');
      expect(tierFromPriceId('price_sidecar_pro')).toBe('PRO');
      expect(tierFromPriceId('price_landing_teams_m')).toBe('TEAMS');
      expect(tierFromPriceId('price_landing_teams_y')).toBe('TEAMS');
      expect(tierFromPriceId('price_sidecar_teams')).toBe('TEAMS');
    });

    it('does not cross-pollute tiers (Teams price does not resolve to PRO)', () => {
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_m';
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_teams_m';

      expect(tierFromPriceId('price_pro_m')).toBe('PRO');
      expect(tierFromPriceId('price_teams_m')).toBe('TEAMS');
      // And the negative case explicitly:
      expect(tierFromPriceId('price_teams_m')).not.toBe('PRO');
      expect(tierFromPriceId('price_pro_m')).not.toBe('TEAMS');
    });

    it('returns null for unknown price ID when only the 4-var contract is set', () => {
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_m';
      process.env['STRIPE_PRICE_PRO_ANNUAL']  = 'price_pro_y';
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_teams_m';
      process.env['STRIPE_PRICE_TEAMS_ANNUAL']  = 'price_teams_y';

      expect(tierFromPriceId('price_unknown')).toBeNull();
    });
  });

  describe('tier round-trip via parseTier', () => {
    it('tier written by updateUserTier is readable via parseTier', () => {
      updateUserTier(tmpDir, 'PRO');

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      const parsed = parseTier(String(raw.tier));
      expect(parsed).toBe('PRO');
    });
  });

  // ── Webhook handler: atomic write + idempotency (R1-011) ────────────
  // Drives the full POST /api/stripe/webhook handler via fastify.inject,
  // with getStripe mocked (above) and STRIPE_WEBHOOK_SECRET set.
  describe('webhook handler — atomic write + idempotency', () => {
    afterEach(() => {
      nextEvent = null;
      delete process.env['STRIPE_WEBHOOK_SECRET'];
    });

    async function buildServer() {
      const { webhookRoutes } = await import('../../src/stripe/webhook.js');
      const app = Fastify();
      app.decorate('localConfig', { dataDir: tmpDir });
      await app.register(webhookRoutes);
      await app.ready();
      return app;
    }

    function postEvent(app: ReturnType<typeof Fastify>) {
      return app.inject({
        method: 'POST',
        url: '/api/stripe/webhook',
        headers: { 'stripe-signature': 't=1,v1=fake', 'content-type': 'application/json' },
        payload: Buffer.from('{}'),
      });
    }

    it('writes valid config.json with no leftover *.tmp file after checkout.session.completed', async () => {
      process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test';
      nextEvent = {
        id: 'evt_atomic_1',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { tier: 'PRO' }, customer: 'cus_123' } },
      };

      const app = await buildServer();
      try {
        const res = await postEvent(app);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ received: true });
      } finally {
        await app.close();
      }

      // config.json exists and is valid JSON with the expected tier
      const configPath = path.join(tmpDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('PRO');
      expect(raw.stripe_customer_id).toBe('cus_123');

      // No torn/leftover temp file remains in dataDir
      const leftovers = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
      expect(leftovers).toEqual([]);
    });

    it('is idempotent — replaying the same event.id returns duplicate:true and does not change config', async () => {
      process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test';
      nextEvent = {
        id: 'evt_dup_1',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { tier: 'PRO' }, customer: 'cus_abc' } },
      };

      const configPath = path.join(tmpDir, 'config.json');

      // First delivery: applies the tier, returns plain received.
      const app1 = await buildServer();
      try {
        const res1 = await postEvent(app1);
        expect(res1.statusCode).toBe(200);
        expect(res1.json()).toEqual({ received: true });
      } finally {
        await app1.close();
      }
      const afterFirst = fs.readFileSync(configPath, 'utf-8');
      expect(JSON.parse(afterFirst).tier).toBe('PRO');

      // Tamper with the config object the second event WOULD have produced,
      // so any non-idempotent re-processing would be observable.
      nextEvent = {
        id: 'evt_dup_1', // same id
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid', metadata: { tier: 'TEAMS' }, customer: 'cus_xyz' } },
      };

      const app2 = await buildServer();
      try {
        const res2 = await postEvent(app2);
        expect(res2.statusCode).toBe(200);
        expect(res2.json()).toEqual({ received: true, duplicate: true });
      } finally {
        await app2.close();
      }

      // Config must be byte-identical to the first write (TEAMS was NOT applied)
      const afterSecond = fs.readFileSync(configPath, 'utf-8');
      expect(afterSecond).toBe(afterFirst);
      expect(JSON.parse(afterSecond).tier).toBe('PRO');
    });

    // ── R1-002 (webhook path): payment gate ─────────────────────────────
    // checkout.session.completed fires for UNPAID sessions too (async payment
    // methods, expired/incomplete checkouts). Granting a paid tier on those is
    // a free-upgrade bypass. Mirror the sync.ts:46 guard: only payment_status
    // 'paid' | 'no_payment_required' may grant.
    it('does NOT grant a tier when payment_status is unpaid (R1-002 webhook gate)', async () => {
      process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test';
      nextEvent = {
        id: 'evt_unpaid_1',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'unpaid', metadata: { tier: 'TEAMS' }, customer: 'cus_unpaid' } },
      };

      const app = await buildServer();
      try {
        const res = await postEvent(app);
        // Still ack the event (200) so Stripe stops retrying — but no grant.
        expect(res.statusCode).toBe(200);
      } finally {
        await app.close();
      }

      // No config.json written at all (no tier ever granted from an unpaid session).
      const configPath = path.join(tmpDir, 'config.json');
      const tier = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8')).tier
        : undefined;
      expect(tier).not.toBe('TEAMS');
      expect(tier).toBeUndefined();
    });

    it('grants a tier when payment_status is no_payment_required (100%-off coupon)', async () => {
      process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test';
      nextEvent = {
        id: 'evt_free_1',
        type: 'checkout.session.completed',
        data: { object: { payment_status: 'no_payment_required', metadata: { tier: 'PRO' }, customer: 'cus_free' } },
      };

      const app = await buildServer();
      try {
        const res = await postEvent(app);
        expect(res.statusCode).toBe(200);
      } finally {
        await app.close();
      }

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      expect(raw.tier).toBe('PRO');
    });
  });
});

// ── P2: webhook reachable under the global bearer-auth middleware ────────────
// In a hosted (0.0.0.0) deploy the securityMiddleware requires a bearer token on
// every /api/* request when a sessionToken is configured. Stripe posts to
// /api/stripe/webhook with NO bearer (it can't have our per-process token), so
// without an auth exemption the webhook 401s BEFORE the handler and
// customer.subscription.deleted/updated never process — cancelled subs never
// downgrade. This composes the REAL securityMiddleware + REAL webhookRoutes and
// proves a no-auth POST reaches the handler (the route is independently
// authenticated by Stripe signature verification inside the handler).
describe('P2 — webhook is auth-exempt under securityMiddleware (hosted-deploy reachability)', () => {
  const SESSION_TOKEN = 'test-session-token-p2';
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-webhook-auth-'));
    // Exercise the SECURE auth path — the suite default is trust=1, which would
    // make this vacuous by trusting every loopback caller.
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  afterEach(() => {
    nextEvent = null;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.WAGGLE_TRUST_LOCALHOST = '1'; // restore suite default
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function buildGuardedServer() {
    const { webhookRoutes } = await import('../../src/stripe/webhook.js');
    const app = Fastify({ logger: false });
    await app.register(securityMiddleware, { sessionToken: SESSION_TOKEN });
    app.decorate('localConfig', { dataDir: tmpDir });
    // A normal protected route to prove auth IS enforced for non-exempt paths.
    app.post('/api/other', async () => ({ ok: true }));
    await app.register(webhookRoutes);
    await app.ready();
    return app;
  }

  it('a NO-Authorization POST to /api/stripe/webhook reaches the handler (not 401)', async () => {
    nextEvent = { id: 'evt_authexempt_1', type: 'customer.subscription.deleted', data: { object: {} } };
    const app = await buildGuardedServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/stripe/webhook',
        headers: { 'stripe-signature': 't=1,v1=fake', 'content-type': 'application/json' },
        payload: Buffer.from('{}'),
        // NOTE: deliberately NO authorization header.
      });
      // Passed the bearer gate and ran the handler → 200. The load-bearing
      // assertion is that it is NOT a 401 (auth did not block Stripe).
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ received: true });
      // The handler actually processed the cancel → tier downgraded to FREE.
      const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      expect(cfg.tier).toBe('FREE');
    } finally {
      await app.close();
    }
  });

  it('a NON-exempt /api/* POST with no token is STILL 401 (exemption is webhook-specific)', async () => {
    const app = await buildGuardedServer();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/other' });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('MISSING_TOKEN');
    } finally {
      await app.close();
    }
  });
});
