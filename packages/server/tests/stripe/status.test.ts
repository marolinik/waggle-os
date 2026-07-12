/**
 * GET /api/stripe/status — the secret-free "is checkout wired" probe backing the
 * F8 honest disabled state. With no STRIPE_SECRET_KEY (the default test env),
 * getStripe() returns null, so the route reports { configured: false } and the
 * billing UI can disable the upgrade CTAs pre-click instead of 503-ing after one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { statusRoutes } from '../../src/stripe/index.js';

describe('GET /api/stripe/status', () => {
  let server: FastifyInstance;
  const hadKey = process.env['STRIPE_SECRET_KEY'];

  beforeEach(async () => {
    delete process.env['STRIPE_SECRET_KEY'];
    server = Fastify();
    await server.register(statusRoutes);
    await server.ready();
  });

  afterEach(async () => {
    if (hadKey !== undefined) process.env['STRIPE_SECRET_KEY'] = hadKey;
    await server.close();
  });

  it('reports configured:false when Stripe is not wired (no secret key)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/stripe/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ configured: false });
  });

  it('reports configured:true when the Stripe SDK has a secret key', async () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_status_probe';

    const res = await server.inject({ method: 'GET', url: '/api/stripe/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ configured: true });
  });
});
