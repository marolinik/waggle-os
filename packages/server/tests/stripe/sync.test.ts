import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';

// ── Mock the Stripe SDK singleton ────────────────────────────────────
// We control checkout.sessions.retrieve per-test via a settable holder.
// tierFromPriceId stays REAL (we only override getStripe) so the
// price-env resolution path is exercised end-to-end.
let nextSession: unknown = null;

vi.mock('../../src/stripe/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/stripe/index.js')>(
    '../../src/stripe/index.js',
  );
  return {
    ...actual,
    getStripe: () => ({
      checkout: {
        sessions: {
          retrieve: async () => nextSession,
        },
      },
    }),
  };
});

// Imported AFTER the mock is declared so the route picks up mocked getStripe.
const { syncRoutes } = await import('../../src/stripe/sync.js');

function buildServer(dataDir: string): FastifyInstance {
  const server = Fastify();
  server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
  server.register(syncRoutes);
  return server;
}

function readTier(dataDir: string): string | undefined {
  const configPath = path.join(dataDir, 'config.json');
  if (!fs.existsSync(configPath)) return undefined;
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return raw.tier as string | undefined;
}

describe('POST /api/stripe/sync — payment gate (R1-002)', () => {
  let tmpDir: string;
  let server: FastifyInstance;

  const PRICE_ENV_KEYS = ['STRIPE_PRICE_PRO'] as const;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sync-test-'));
    nextSession = null;
    for (const k of PRICE_ENV_KEYS) delete process.env[k];
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy'; // not used (getStripe mocked) but keeps intent clear
    server = buildServer(tmpDir);
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of PRICE_ENV_KEYS) delete process.env[k];
    delete process.env['STRIPE_SECRET_KEY'];
  });

  // (a) UNPAID session → 402, tier NOT persisted.
  it('rejects an unpaid session with 402 and does not change the tier', async () => {
    nextSession = {
      status: 'open',
      payment_status: 'unpaid',
      customer: 'cus_unpaid',
      metadata: { tier: 'TEAMS' },
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/stripe/sync',
      payload: { sessionId: 'cs_test_unpaid' },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: 'PAYMENT_NOT_COMPLETED' });
    // config.json must NOT have been written with a paid tier.
    expect(readTier(tmpDir)).toBeUndefined();
  });

  // Defensive: a 'complete' session that somehow is still 'unpaid' is also gated.
  it('rejects a complete-but-unpaid session with 402 and does not change the tier', async () => {
    nextSession = {
      status: 'complete',
      payment_status: 'unpaid',
      customer: 'cus_weird',
      metadata: { tier: 'TEAMS' },
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/stripe/sync',
      payload: { sessionId: 'cs_test_weird' },
    });

    expect(res.statusCode).toBe(402);
    expect(readTier(tmpDir)).toBeUndefined();
  });

  // (b) Paid session with a legacy PRO subscription price → 200. Post-collapse a
  // legacy PRO price resolves to FREE (Solo), so a legacy PRO subscriber lands on
  // Solo rather than being locked out (decision #5).
  it('accepts a paid session and maps a legacy PRO subscription price to FREE (Solo)', async () => {
    process.env['STRIPE_PRICE_PRO'] = 'price_x';
    nextSession = {
      status: 'complete',
      payment_status: 'paid',
      customer: 'cus_paid',
      subscription: { items: { data: [{ price: { id: 'price_x' } }] } },
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/stripe/sync',
      payload: { sessionId: 'cs_test_paid' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tier: 'FREE', customerId: 'cus_paid' });
    expect(readTier(tmpDir)).toBe('FREE');
  });

  // (c) Promo / 100%-off session → no_payment_required is treated as paid → 200.
  // A legacy PRO metadata tier collapses to FREE via parseTier.
  it('accepts a no_payment_required (promo) session and maps a legacy PRO metadata tier to FREE', async () => {
    nextSession = {
      status: 'complete',
      payment_status: 'no_payment_required',
      customer: 'cus_promo',
      metadata: { tier: 'PRO' },
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/stripe/sync',
      payload: { sessionId: 'cs_test_promo' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tier: 'FREE' });
    expect(readTier(tmpDir)).toBe('FREE');
  });
});
