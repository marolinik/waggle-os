import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComposioConnector } from '../../src/connectors/composio-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(cred?: { value: string; isExpired: boolean }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'composio' && cred) return { ...cred, type: 'api_key' };
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

describe('ComposioConnector', () => {
  let connector: ComposioConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new ComposioConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('composio');
    expect(connector.name).toBe('Composio (250+ services)');
    expect(connector.service).toBe('composio.dev');
    expect(connector.authType).toBe('api_key');
    expect(connector.substrate).toBe('waggle');
  });

  it('has all 5 actions', () => {
    expect(connector.actions).toHaveLength(5);
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_integrations');
    expect(names).toContain('list_actions');
    expect(names).toContain('execute_action');
    expect(names).toContain('list_connected_accounts');
    expect(names).toContain('search_actions');
  });

  it('execute_action has high risk level', () => {
    const executeAction = connector.actions.find(a => a.name === 'execute_action');
    expect(executeAction).toBeDefined();
    expect(executeAction!.riskLevel).toBe('high');
  });

  it('list/search actions have low risk level', () => {
    const lowRiskActions = connector.actions.filter(a => a.name !== 'execute_action');
    expect(lowRiskActions).toHaveLength(4);
    for (const action of lowRiskActions) {
      expect(action.riskLevel).toBe('low');
    }
  });

  it('connect() retrieves API key from vault', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('composio');
  });

  it('execute returns error when not connected', async () => {
    const vault = createMockVault(); // no credential
    await connector.connect(vault);

    const result = await connector.execute('list_integrations', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected without API key', async () => {
    const vault = createMockVault(); // no credential
    await connector.connect(vault);

    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('composio');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    expect(health.id).toBe('composio');
  });

  it('healthCheck returns error when API fails', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('error');
    expect(health.error).toContain('401');
  });

  it('execute(list_integrations) calls correct endpoint', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    const mockData = { items: [{ id: 'int_1', name: 'GitHub' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('list_integrations', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/integrations');
  });

  it('execute(list_actions) passes appName query param', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    const mockActions = { items: [{ name: 'GITHUB_CREATE_ISSUE' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockActions }) as any;

    const result = await connector.execute('list_actions', { appName: 'github' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockActions);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('appName=github');
  });

  it('execute(execute_action) POSTs to correct endpoint with params', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    const mockResult = { execution_output: { status: 'success' } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResult }) as any;

    const result = await connector.execute('execute_action', {
      actionId: 'GITHUB_CREATE_ISSUE',
      params: { title: 'Test issue', body: 'Test body' },
      connectedAccountId: 'acc_123',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).actionId).toBe('GITHUB_CREATE_ISSUE');
    expect((result.data as any).service).toBe('composio');
    expect((result.data as any).result).toEqual(mockResult);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/actions/GITHUB_CREATE_ISSUE/execute');
    expect(fetchCall[1].method).toBe('POST');
  });

  it('execute(execute_action) returns error without actionId', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('execute_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('actionId is required');
  });

  it('execute(search_actions) passes searchQuery param', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    const mockResults = { items: [{ name: 'GMAIL_SEND_EMAIL' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResults }) as any;

    const result = await connector.execute('search_actions', { searchQuery: 'send email' });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('searchQuery=send+email');
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault({ value: 'cmp_test_key', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('composio');
    expect(def.tools).toContain('connector_composio_list_integrations');
    expect(def.tools).toContain('connector_composio_execute_action');
    expect(def.tools).toContain('connector_composio_search_actions');
    expect(def.tools).toHaveLength(5);
    expect(def.actions).toHaveLength(5);
    expect(def.capabilities).toContain('read');
    expect(def.capabilities).toContain('write');
    expect(def.capabilities).toContain('search');
  });
});
