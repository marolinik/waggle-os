import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { connectorRoutes } from '../../src/local/routes/connectors.js';

// The raw secret that a throwing connector might leak through an error message.
// The route must NEVER echo this back to the client.
const RAW_INTERNAL_DETAIL = 'ECONNREFUSED 10.0.0.5:5432 (db password=hunter2)';

/**
 * Build a Fastify instance with `connectorRoutes` registered and a stub
 * `connectorRegistry` whose `healthCheck()` throws — reproducing a connector
 * that blows up during a live probe.
 */
async function buildServerWithThrowingRegistry(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  fastify.decorate('connectorRegistry', {
    getDefinitions: () => [],
    get: (_id: string) => ({ id: _id }),
    healthCheck: async () => {
      throw new Error(RAW_INTERNAL_DETAIL);
    },
  });
  await fastify.register(connectorRoutes);
  await fastify.ready();
  return fastify;
}

describe('GET /api/connectors/:id/health — throwing connector (R1-009)', () => {
  it('does not return an unhandled 500 when healthCheck() throws', async () => {
    const fastify = await buildServerWithThrowingRegistry();
    try {
      const res = await fastify.inject({ method: 'GET', url: '/api/connectors/github/health' });
      // An unhandled throw inside the handler surfaces as a 500 with Fastify's
      // default error envelope. A graceful degrade must NOT be 500.
      expect(res.statusCode).not.toBe(500);
    } finally {
      await fastify.close();
    }
  });

  it('returns a structured degraded status (error) instead of crashing', async () => {
    const fastify = await buildServerWithThrowingRegistry();
    try {
      const res = await fastify.inject({ method: 'GET', url: '/api/connectors/github/health' });
      const body = res.json();
      expect(body.status).toBe('error');
      expect(body.id).toBe('github');
    } finally {
      await fastify.close();
    }
  });

  it('does not leak the raw internal error message to the client', async () => {
    const fastify = await buildServerWithThrowingRegistry();
    try {
      const res = await fastify.inject({ method: 'GET', url: '/api/connectors/github/health' });
      // Whole payload, however it's shaped, must not contain the raw detail
      // (which can carry secrets, internal hostnames, stack traces, etc.).
      expect(res.payload).not.toContain('hunter2');
      expect(res.payload).not.toContain('10.0.0.5');
      expect(res.payload).not.toContain(RAW_INTERNAL_DETAIL);
    } finally {
      await fastify.close();
    }
  });

  it('still returns 404 for an unknown connector (null health, no throw)', async () => {
    const fastify = Fastify({ logger: false });
    fastify.decorate('connectorRegistry', {
      getDefinitions: () => [],
      get: (_id: string) => ({ id: _id }),
      healthCheck: async () => null,
    });
    await fastify.register(connectorRoutes);
    await fastify.ready();
    try {
      const res = await fastify.inject({ method: 'GET', url: '/api/connectors/ghost/health' });
      expect(res.statusCode).toBe(404);
    } finally {
      await fastify.close();
    }
  });

  it('returns healthy status unchanged when healthCheck() succeeds', async () => {
    const fastify = Fastify({ logger: false });
    fastify.decorate('connectorRegistry', {
      getDefinitions: () => [],
      get: (_id: string) => ({ id: _id }),
      healthCheck: async (id: string) => ({
        id,
        name: id,
        status: 'connected',
        lastChecked: new Date().toISOString(),
      }),
    });
    await fastify.register(connectorRoutes);
    await fastify.ready();
    try {
      const res = await fastify.inject({ method: 'GET', url: '/api/connectors/github/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('connected');
    } finally {
      await fastify.close();
    }
  });
});
