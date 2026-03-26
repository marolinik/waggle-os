import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraConnector } from '../../src/connectors/jira-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(opts?: { token?: string; email?: string; baseUrl?: string }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'jira' && opts?.token) return { value: opts.token, type: 'bearer', isExpired: false };
      return null;
    }),
    get: vi.fn((name: string) => {
      if (name === 'connector:jira:email' && opts?.email) return { value: opts.email };
      if (name === 'connector:jira:base_url' && opts?.baseUrl) return { value: opts.baseUrl };
      return null;
    }),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
    setConnectorCredential: vi.fn(),
    migrateFromConfig: vi.fn(() => 0),
  } as unknown as VaultStore;
}

describe('JiraConnector', () => {
  let connector: JiraConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new JiraConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('implements WaggleConnector interface', () => {
    expect(connector.id).toBe('jira');
    expect(connector.name).toBe('Jira');
    expect(connector.actions).toHaveLength(5);
  });

  it('connect() builds basic auth from email + API token', async () => {
    const vault = createMockVault({
      token: 'jira-api-token',
      email: 'user@example.com',
      baseUrl: 'https://mycompany.atlassian.net',
    });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('jira');
    expect(vault.get).toHaveBeenCalledWith('connector:jira:email');
  });

  it('healthCheck() returns connected when API responds OK', async () => {
    const vault = createMockVault({
      token: 'jira-api-token',
      email: 'user@example.com',
      baseUrl: 'https://mycompany.atlassian.net',
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ displayName: 'Test User' }),
    }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(create_issue) creates issue', async () => {
    const vault = createMockVault({
      token: 'jira-api-token',
      email: 'user@example.com',
      baseUrl: 'https://mycompany.atlassian.net',
    });
    await connector.connect(vault);

    const mockIssue = { key: 'PROJ-42', id: '10042' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => mockIssue,
    }) as any;

    const result = await connector.execute('create_issue', {
      project: 'PROJ',
      summary: 'Test issue',
      issuetype: 'Bug',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockIssue);
  });

  it('execute(transition_issue) transitions issue', async () => {
    const vault = createMockVault({
      token: 'jira-api-token',
      email: 'user@example.com',
      baseUrl: 'https://mycompany.atlassian.net',
    });
    await connector.connect(vault);

    // First call: get transitions. Second call: do transition.
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, json: async () => ({ transitions: [{ id: '31', name: 'Done' }, { id: '21', name: 'In Progress' }] }),
      })
      .mockResolvedValueOnce({
        ok: true, json: async () => ({}), text: async () => '',
      }) as any;

    const result = await connector.execute('transition_issue', {
      issueKey: 'PROJ-42',
      transitionName: 'Done',
    });
    expect(result.success).toBe(true);
  });

  it('execute() returns error when not connected', async () => {
    const result = await connector.execute('list_issues', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('disconnected');
    expect(def.id).toBe('jira');
    expect(def.status).toBe('disconnected');
    expect(def.tools).toContain('connector_jira_create_issue');
    expect(def.tools).toContain('connector_jira_transition_issue');
    expect(def.tools).toHaveLength(5);
  });
});
