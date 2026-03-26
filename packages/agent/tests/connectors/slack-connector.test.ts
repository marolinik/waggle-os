import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlackConnector } from '../../src/connectors/slack-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(cred?: { value: string; isExpired: boolean }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'slack' && cred) return { ...cred, type: 'bearer' };
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

describe('SlackConnector', () => {
  let connector: SlackConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new SlackConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('implements WaggleConnector interface', () => {
    expect(connector.id).toBe('slack');
    expect(connector.name).toBe('Slack');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(4);
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault({ value: 'xoxb-test-token', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('slack');
  });

  it('healthCheck() returns connected when auth.test succeeds', async () => {
    const vault = createMockVault({ value: 'xoxb-test-token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, user: 'waggle-bot' }),
    }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(send_message) sends message', async () => {
    const vault = createMockVault({ value: 'xoxb-test-token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, ts: '1234567890.123456' }),
    }) as any;

    const result = await connector.execute('send_message', { channel: '#general', text: 'Hello!' });
    expect(result.success).toBe(true);
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault({ value: 'xoxb-test-token', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition() maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toEqual([
      'connector_slack_list_channels',
      'connector_slack_read_channel',
      'connector_slack_search_messages',
      'connector_slack_send_message',
    ]);
  });
});
