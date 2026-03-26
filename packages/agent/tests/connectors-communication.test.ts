import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscordConnector } from '../src/connectors/discord-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(connectorId: string, cred?: { value: string; isExpired: boolean }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === connectorId && cred) return { ...cred, type: 'bearer' };
      return null;
    }),
    get: vi.fn(() => null),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
    setConnectorCredential: vi.fn(),
    migrateFromConfig: vi.fn(() => 0),
  } as unknown as VaultStore;
}

describe('Discord connector (communication)', () => {
  let connector: DiscordConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new DiscordConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('discord');
    expect(connector.name).toBe('Discord');
    expect(connector.service).toBe('discord.com');
  });

  it('has at least 5 actions', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(5);
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_guilds', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
  });
});
