/**
 * validateBody preHandler tests (P3 — boundary validation).
 *
 * A malformed body must 400 with the zod issues at the boundary — never reach a
 * handler that casts it and silently persists bad data (or 500s on a cast).
 */

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { validateBody } from '../../src/validate-body.js';

describe('validateBody preHandler', () => {
  const schema = z.object({ name: z.string().min(1), count: z.number().int().optional() });

  async function buildApp() {
    const app = Fastify({ logger: false });
    app.post('/thing', { preHandler: validateBody(schema) }, async (request) => ({ received: request.body }));
    await app.ready();
    return app;
  }

  it('rejects a body missing a required field with 400 + issues (not 500, not a silent write)', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/thing', payload: { count: 3 } }); // no name
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('Invalid request body');
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.some((i: { path: string }) => i.path === 'name')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('rejects a wrong-typed field with 400 (count must be an integer)', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/thing', payload: { name: 'ok', count: 'three' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues.some((i: { path: string }) => i.path === 'count')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('passes a valid body through to the handler and strips unknown keys', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'POST', url: '/thing', payload: { name: 'ok', count: 2, extra: 'x' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().received).toEqual({ name: 'ok', count: 2 });
    } finally {
      await app.close();
    }
  });
});

describe('validateBody wired into the vault route (real mutating route)', () => {
  it('POST /api/vault with a missing value → 400 issues and NO write; a valid body writes', async () => {
    const { vaultRoutes } = await import('../../src/local/routes/vault.js');
    const { VaultStore } = await import('@waggle/core');
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');

    const tmpDir = path.join(os.tmpdir(), `waggle-vault-validate-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const vault = new VaultStore(tmpDir);

    const app = Fastify({ logger: false });
    app.decorate('vault', vault);
    await app.register(vaultRoutes);
    await app.ready();

    try {
      const bad = await app.inject({ method: 'POST', url: '/api/vault', payload: { name: 'anthropic' } }); // no value
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error).toBe('Invalid request body');
      expect(vault.get('anthropic')).toBeFalsy(); // nothing persisted

      const good = await app.inject({ method: 'POST', url: '/api/vault', payload: { name: 'CUSTOM_API_KEY', value: 'sk-xyz' } });
      expect(good.statusCode).toBe(200);
      expect(good.json().success).toBe(true);
      expect(vault.get('CUSTOM_API_KEY')?.value).toBe('sk-xyz');
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
