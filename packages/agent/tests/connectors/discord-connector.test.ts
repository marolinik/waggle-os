import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscordConnector } from '../../src/connectors/discord-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(cred?: { value: string; isExpired: boolean }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'discord' && cred) return { ...cred, type: 'bearer' };
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

describe('DiscordConnector', () => {
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

  it('implements WaggleConnector interface', () => {
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
    expect(connector.actions).toHaveLength(6);
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault({ value: 'bot-test-token', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('discord');
  });

  it('execute() returns error when not connected', async () => {
    const result = await connector.execute('list_guilds', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck() returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('discord');
  });

  it('healthCheck() returns connected when API responds ok', async () => {
    const vault = createMockVault({ value: 'bot-test-token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: '123', username: 'waggle-bot' }),
    }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(send_message) sends message to channel', async () => {
    const vault = createMockVault({ value: 'bot-test-token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: '987654321', content: 'Hello!' }),
    }) as any;

    const result = await connector.execute('send_message', { channel_id: '123456', content: 'Hello!' });
    expect(result.success).toBe(true);
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault({ value: 'bot-test-token', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('uses Bot prefix in Authorization header', async () => {
    const vault = createMockVault({ value: 'my-bot-token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ([]),
    }) as any;

    await connector.execute('list_guilds', {});

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('discord.com/api/v10');
    expect(fetchCall[1].headers.Authorization).toBe('Bot my-bot-token');
  });

  it('toDefinition() maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toEqual([
      'connector_discord_list_guilds',
      'connector_discord_list_channels',
      'connector_discord_get_messages',
      'connector_discord_send_message',
      'connector_discord_search_messages',
      'connector_discord_get_guild_info',
    ]);
  });

  it('risk levels are correct (list/get = low, send = medium)', () => {
    const actionMap = new Map(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(actionMap.get('list_guilds')).toBe('low');
    expect(actionMap.get('list_channels')).toBe('low');
    expect(actionMap.get('get_messages')).toBe('low');
    expect(actionMap.get('send_message')).toBe('medium');
    expect(actionMap.get('search_messages')).toBe('low');
    expect(actionMap.get('get_guild_info')).toBe('low');
  });
});
