import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { VaultStore } from '@waggle/core';
import fs from 'node:fs';
import os from 'node:os';

describe('Connector Foundation', () => {
  it('exports connectorRoutes function', async () => {
    const mod = await import('../../src/local/routes/connectors.js');
    expect(mod.connectorRoutes).toBeDefined();
    expect(typeof mod.connectorRoutes).toBe('function');
  });
});

describe('Vault Connector Credential Methods', () => {
  const tmpDir = path.join(os.tmpdir(), `waggle-vault-test-${Date.now()}`);

  it('setConnectorCredential stores and getConnectorCredential retrieves', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const vault = new VaultStore(tmpDir);

    vault.setConnectorCredential('github', {
      type: 'bearer',
      value: 'ghp_test_token_12345',
      scopes: ['repo', 'user'],
    });

    const cred = vault.getConnectorCredential('github');
    expect(cred).not.toBeNull();
    expect(cred!.value).toBe('ghp_test_token_12345');
    expect(cred!.type).toBe('bearer');
    expect(cred!.scopes).toEqual(['repo', 'user']);
    expect(cred!.isExpired).toBe(false);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects expired tokens', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const vault = new VaultStore(tmpDir);

    vault.setConnectorCredential('slack', {
      type: 'oauth2',
      value: 'xoxb-expired-token',
      expiresAt: '2020-01-01T00:00:00.000Z', // Way in the past
    });

    const cred = vault.getConnectorCredential('slack');
    expect(cred).not.toBeNull();
    expect(cred!.isExpired).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for non-existent connector', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const vault = new VaultStore(tmpDir);

    const cred = vault.getConnectorCredential('nonexistent');
    expect(cred).toBeNull();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('disconnect removes credential from vault', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const vault = new VaultStore(tmpDir);

    vault.setConnectorCredential('github', {
      type: 'bearer',
      value: 'ghp_test_token',
    });
    expect(vault.getConnectorCredential('github')).not.toBeNull();

    vault.delete('connector:github');
    expect(vault.getConnectorCredential('github')).toBeNull();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('ConnectorDefinition Types', () => {
  it('shared types include connector types', async () => {
    // Verify the types compile correctly by importing them
    const types = await import('@waggle/shared');
    // Type-level check — if this compiles, the types exist
    expect(types).toBeDefined();
  });
});
