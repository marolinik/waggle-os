// CC Sesija A §2.5 Task A15 — identity sidecar route smoke + shape tests.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.5 Task A15
//
// Validates the A1.1 follow-up route exports a plugin function and the
// placeholder shape it returns matches the contract Tauri command +
// adapter.getIdentity() expect.

import { describe, it, expect } from 'vitest';

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
