import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubConnector } from '../../src/connectors/github-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(cred?: { value: string; isExpired: boolean }): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'github' && cred) return { ...cred, type: 'bearer' };
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

describe('GitHubConnector', () => {
  let connector: GitHubConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GitHubConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('implements WaggleConnector interface', () => {
    expect(connector.id).toBe('github');
    expect(connector.name).toBe('GitHub');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions.length).toBe(7);
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault({ value: 'ghp_test123', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('github');
  });

  it('healthCheck() returns connected when API responds OK', async () => {
    const vault = createMockVault({ value: 'ghp_test123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: 'user' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    expect(health.id).toBe('github');
  });

  it('healthCheck() returns error when API fails', async () => {
    const vault = createMockVault({ value: 'ghp_test123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('error');
    expect(health.error).toContain('401');
  });

  it('execute(list_repos) returns repo list', async () => {
    const vault = createMockVault({ value: 'ghp_test123', isExpired: false });
    await connector.connect(vault);

    const mockRepos = [{ name: 'waggle', full_name: 'user/waggle' }];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockRepos }) as any;

    const result = await connector.execute('list_repos', { per_page: 10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockRepos);
  });

  it('execute(create_issue) creates issue', async () => {
    const vault = createMockVault({ value: 'ghp_test123', isExpired: false });
    await connector.connect(vault);

    const mockIssue = { number: 42, title: 'Bug report' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockIssue }) as any;

    const result = await connector.execute('create_issue', {
      owner: 'user', repo: 'waggle', title: 'Bug report',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockIssue);
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault({ value: 'ghp_test123', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('github');
    expect(def.tools).toContain('connector_github_list_repos');
    expect(def.tools).toContain('connector_github_create_issue');
    expect(def.tools).toHaveLength(7);
    expect(def.actions).toHaveLength(7);
  });
});
