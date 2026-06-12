// CC Sesija A §2.5 Task A15 — identity sidecar route smoke + shape tests.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.5 Task A15
//
// Validates the A1.1 follow-up route exports a plugin function and the
// placeholder shape it returns matches the contract Tauri command +
// adapter.getIdentity() expect.

import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { MindDB } from '@waggle/core';
import { identityRoutes } from '../../src/local/routes/identity.js';

describe('POST /api/identity — merge-on-update', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await server.close();
    db.close();
  });

  function boot() {
    db = new MindDB(':memory:');
    server = Fastify({ logger: false });
    server.decorate('multiMind', { personal: db });
    server.decorate('agentState', { getWorkspaceMindDb: () => undefined });
    server.register(identityRoutes);
  }

  it('a partial write keeps the stored values for omitted fields', async () => {
    boot();
    const first = await server.inject({
      method: 'POST', url: '/api/identity',
      payload: { name: 'Marko', role: 'Founder', department: 'Egzakta' },
    });
    expect(first.statusCode).toBe(200);

    // The onboarding wizard re-run sends name only — role/department must
    // survive (the old `body.x ?? ''` semantics silently wiped them).
    const partial = await server.inject({
      method: 'POST', url: '/api/identity',
      payload: { name: 'Marko M.' },
    });
    expect(partial.statusCode).toBe(200);
    const body = partial.json();
    expect(body.name).toBe('Marko M.');
    expect(body.role).toBe('Founder');
    expect(body.department).toBe('Egzakta');
  });

  it('an explicit empty string still clears a field', async () => {
    boot();
    await server.inject({
      method: 'POST', url: '/api/identity',
      payload: { name: 'Marko', role: 'Founder' },
    });
    const cleared = await server.inject({
      method: 'POST', url: '/api/identity',
      payload: { role: '' },
    });
    expect(cleared.json().role).toBe('');
    expect(cleared.json().name).toBe('Marko');
  });
});

describe('identity.ts route module', () => {
  it('exports identityRoutes plugin function', async () => {
    const mod = await import('../../src/local/routes/identity.js');
    expect(mod.identityRoutes).toBeDefined();
    expect(typeof mod.identityRoutes).toBe('function');
  });

  it('IdentityLayer is exported from @waggle/core for the route to consume', async () => {
    const { IdentityLayer } = await import('@waggle/core');
    expect(IdentityLayer).toBeDefined();
    expect(typeof IdentityLayer).toBe('function'); // class constructor
  });

  it('IdentityLayer exposes the API the identity route uses', async () => {
    const { IdentityLayer } = await import('@waggle/core');
    // Verify the methods the route calls actually exist on the prototype —
    // catches schema drift before the route fails at runtime in production.
    const proto = IdentityLayer.prototype as Record<string, unknown>;
    expect(typeof proto.exists).toBe('function');
    expect(typeof proto.get).toBe('function');
    expect(typeof proto.create).toBe('function');
    expect(typeof proto.update).toBe('function');
  });
});
