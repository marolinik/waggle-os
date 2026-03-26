import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailConnector } from '../../src/connectors/email-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(cred?: { value: string }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'email' && cred) return { ...cred, type: 'api_key', isExpired: false };
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

describe('EmailConnector', () => {
  let connector: EmailConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new EmailConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('implements WaggleConnector interface', () => {
    expect(connector.id).toBe('email');
    expect(connector.name).toBe('Email (SendGrid)');
    expect(connector.authType).toBe('api_key');
    expect(connector.actions).toHaveLength(3);
  });

  it('connect() retrieves API key from vault', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('email');
  });

  it('healthCheck() validates API key', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ username: 'waggle' }),
    }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(send_email) sends email (mocked)', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 202, ok: true, headers: new Map([['X-Message-Id', 'msg-123']]),
      text: async () => '',
    }) as any;

    const result = await connector.execute('send_email', {
      to: 'user@example.com',
      subject: 'Test',
      body: 'Hello from Waggle!',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).sent).toBe(true);
  });

  it('execute(send_email) requires to, subject, body params', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);

    // Missing 'to' — the connector will still call the API but SendGrid would reject
    // The connector trusts the agent to provide required params per inputSchema
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400, ok: false, text: async () => 'Missing to',
    }) as any;

    const result = await connector.execute('send_email', { subject: 'Test', body: 'Hello' });
    expect(result.success).toBe(false);
  });

  it('execute(send_template) sends template email', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 202, ok: true, headers: new Map(),
      text: async () => '',
    }) as any;

    const result = await connector.execute('send_template', {
      to: 'user@example.com',
      template_id: 'd-abc123',
      variables: { name: 'Test User' },
    });
    expect(result.success).toBe(true);
  });

  it('execute(check_delivery) returns delivery status', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: 'delivered', events: [] }),
    }) as any;

    const result = await connector.execute('check_delivery', { message_id: 'msg-123' });
    expect(result.success).toBe(true);
    expect((result.data as any).status).toBe('delivered');
  });

  it('rate limiter rejects after max daily sends', async () => {
    const vault = createMockVault({ value: 'SG.test_key' });
    await connector.connect(vault);

    // Artificially set send count to max
    (connector as any).dailySendCount = 100;
    (connector as any).dailyResetDate = new Date().toISOString().slice(0, 10);

    const result = await connector.execute('send_email', {
      to: 'user@example.com', subject: 'Test', body: 'Hello',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Daily email limit');
  });

  it('all send actions are riskLevel high', () => {
    const sendActions = connector.actions.filter(a => a.name.startsWith('send'));
    expect(sendActions).toHaveLength(2);
    for (const action of sendActions) {
      expect(action.riskLevel).toBe('high');
    }
  });
});
