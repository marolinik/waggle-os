/**
 * Vault REST API Route Tests
 *
 * Tests all 4 vault endpoints using a real VaultStore on a temp directory:
 *   GET    /api/vault              — list secrets (no values)
 *   POST   /api/vault              — add/update a secret
 *   DELETE /api/vault/:name        — delete a secret
 *   POST   /api/vault/:name/reveal — decrypt and return the full value
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Fastify from 'fastify';
import { VaultStore } from '@waggle/core';
import { vaultRoutes } from '../../src/local/routes/vault.js';

function createTestServer(vault: VaultStore) {
  const server = Fastify({ logger: false });
  server.decorate('vault', vault);
  server.register(vaultRoutes);
  return server;
}

describe('Vault Routes', () => {
  let tmpDir: string;
  let vault: VaultStore;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `waggle-vault-routes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    vault = new VaultStore(tmpDir);
    server = createTestServer(vault);
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── GET /api/vault ───────────────────────────────────────────────

  describe('GET /api/vault', () => {
    it('returns empty list initially', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/vault' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.secrets).toEqual([]);
      expect(body.suggestedKeys).toBeDefined();
      expect(Array.isArray(body.suggestedKeys)).toBe(true);
    });

    it('returns secrets after adding', async () => {
      vault.set('ANTHROPIC_API_KEY', 'sk-ant-test-123', { credentialType: 'api_key' });
      vault.set('MY_CUSTOM_KEY', 'custom-value-456');

      const res = await server.inject({ method: 'GET', url: '/api/vault' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.secrets).toHaveLength(2);

      const anthropicSecret = body.secrets.find((s: any) => s.name === 'ANTHROPIC_API_KEY');
      expect(anthropicSecret).toBeDefined();
      expect(anthropicSecret.type).toBe('api_key');
      expect(anthropicSecret.updatedAt).toBeDefined();
      // Ensure value is NOT exposed in list
      expect(anthropicSecret.value).toBeUndefined();
    });

    it('sets isCommon flag correctly', async () => {
      vault.set('ANTHROPIC_API_KEY', 'sk-ant-test');
      vault.set('MY_PRIVATE_KEY', 'secret');

      const res = await server.inject({ method: 'GET', url: '/api/vault' });
      const body = res.json();

      const anthropic = body.secrets.find((s: any) => s.name === 'ANTHROPIC_API_KEY');
      const custom = body.secrets.find((s: any) => s.name === 'MY_PRIVATE_KEY');

      expect(anthropic.isCommon).toBe(true);
      expect(custom.isCommon).toBe(false);
    });

    it('suggestedKeys excludes keys already in vault', async () => {
      vault.set('ANTHROPIC_API_KEY', 'sk-ant-test');

      const res = await server.inject({ method: 'GET', url: '/api/vault' });
      const body = res.json();

      expect(body.suggestedKeys).not.toContain('ANTHROPIC_API_KEY');
      expect(body.suggestedKeys).toContain('OPENAI_API_KEY');
      expect(body.suggestedKeys).toContain('TAVILY_API_KEY');
    });

    it('suggestedKeys contains all common keys when vault is empty', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/vault' });
      const body = res.json();

      expect(body.suggestedKeys).toContain('ANTHROPIC_API_KEY');
      expect(body.suggestedKeys).toContain('OPENAI_API_KEY');
      expect(body.suggestedKeys).toContain('GITHUB_TOKEN');
      expect(body.suggestedKeys.length).toBe(10);
    });
  });

  // ── POST /api/vault ──────────────────────────────────────────────

  describe('POST /api/vault', () => {
    it('adds a new secret', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/vault',
        payload: { name: 'OPENAI_API_KEY', value: 'sk-test-key-abc' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.name).toBe('OPENAI_API_KEY');

      // Verify it was actually stored
      const stored = vault.get('OPENAI_API_KEY');
      expect(stored).not.toBeNull();
      expect(stored!.value).toBe('sk-test-key-abc');
    });

    it('adds a secret with type metadata', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/vault',
        payload: { name: 'GITHUB_TOKEN', value: 'ghp_token', type: 'bearer' },
      });

      expect(res.statusCode).toBe(200);
      const stored = vault.get('GITHUB_TOKEN');
      expect(stored!.metadata?.credentialType).toBe('bearer');
    });

    it('updates an existing secret', async () => {
      vault.set('MY_KEY', 'old-value');

      const res = await server.inject({
        method: 'POST',
        url: '/api/vault',
        payload: { name: 'MY_KEY', value: 'new-value' },
      });

      expect(res.statusCode).toBe(200);
      const stored = vault.get('MY_KEY');
      expect(stored!.value).toBe('new-value');
    });

    it('rejects missing name', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/vault',
        payload: { value: 'some-value' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('name');
    });

    it('rejects missing value', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/vault',
        payload: { name: 'SOME_KEY' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('value');
    });
  });

  // ── DELETE /api/vault/:name ──────────────────────────────────────

  describe('DELETE /api/vault/:name', () => {
    it('deletes an existing secret', async () => {
      vault.set('TO_DELETE', 'doomed');

      const res = await server.inject({
        method: 'DELETE',
        url: '/api/vault/TO_DELETE',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.deleted).toBe(true);
      expect(body.name).toBe('TO_DELETE');

      // Verify deletion
      expect(vault.has('TO_DELETE')).toBe(false);
    });

    it('returns deleted:false for non-existent secret', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/vault/NONEXISTENT',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.deleted).toBe(false);
      expect(body.name).toBe('NONEXISTENT');
    });
  });

  // ── POST /api/vault/:name/reveal ─────────────────────────────────

  describe('POST /api/vault/:name/reveal', () => {
    it('reveals the decrypted value', async () => {
      vault.set('SECRET_KEY', 'super-secret-value', { credentialType: 'api_key' });

      const res = await server.inject({
        method: 'POST',
        url: '/api/vault/SECRET_KEY/reveal',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('SECRET_KEY');
      expect(body.value).toBe('super-secret-value');
      expect(body.type).toBe('api_key');
    });

    it('returns default type when no credentialType metadata', async () => {
      vault.set('PLAIN_KEY', 'plain-value');

      const res = await server.inject({
        method: 'POST',
        url: '/api/vault/PLAIN_KEY/reveal',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.type).toBe('api_key');
    });

    it('returns 404 for non-existent secret', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/vault/NONEXISTENT/reveal',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Secret not found');
    });
  });
});

// ── Module Export Check ──────────────────────────────────────────────

describe('Vault Routes Module', () => {
  it('exports vaultRoutes function', async () => {
    const mod = await import('../../src/local/routes/vault.js');
    expect(mod.vaultRoutes).toBeDefined();
    expect(typeof mod.vaultRoutes).toBe('function');
  });
});
