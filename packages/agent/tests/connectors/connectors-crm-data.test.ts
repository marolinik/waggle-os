import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HubSpotConnector } from '../../src/connectors/hubspot-connector.js';
import { SalesforceConnector } from '../../src/connectors/salesforce-connector.js';
import { PipedriveConnector } from '../../src/connectors/pipedrive-connector.js';
import { AirtableConnector } from '../../src/connectors/airtable-connector.js';
import { GitLabConnector } from '../../src/connectors/gitlab-connector.js';
import { BitbucketConnector } from '../../src/connectors/bitbucket-connector.js';
import { DropboxConnector } from '../../src/connectors/dropbox-connector.js';
import { PostgresConnector } from '../../src/connectors/postgres-connector.js';
import { safeFetch } from '../../src/url-egress-guard.js';
import type { VaultStore } from '@waggle/core';

vi.mock('../../src/url-egress-guard.js', () => ({
  safeFetch: vi.fn((url: string, init?: RequestInit) => globalThis.fetch(url, {
    ...init,
    redirect: 'manual',
  })),
}));

function createMockVault(connectorId: string, cred?: { value: string; isExpired: boolean }, extras?: Record<string, string>): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === connectorId && cred) return { ...cred, type: 'bearer' };
      return null;
    }),
    get: vi.fn((key: string) => {
      if (extras && extras[key]) return { value: extras[key] };
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

// ── CRM Connectors ──────────────────────────────────────────

describe('HubSpotConnector', () => {
  let connector: HubSpotConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new HubSpotConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('hubspot');
    expect(connector.name).toBe('HubSpot');
    expect(connector.service).toBe('hubspot.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(7);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_contacts');
    expect(names).toContain('get_contact');
    expect(names).toContain('create_contact');
    expect(names).toContain('search_contacts');
    expect(names).toContain('list_deals');
    expect(names).toContain('create_deal');
    expect(names).toContain('list_companies');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_contacts', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_hubspot_list_contacts');
    expect(def.tools).toContain('connector_hubspot_create_deal');
    expect(def.tools).toHaveLength(7);
  });

  it('execute(list_contacts) returns data when connected', async () => {
    const vault = createMockVault('hubspot', { value: 'test-token', isExpired: false });
    await connector.connect(vault);

    const mockData = { results: [{ id: '1', properties: { email: 'test@example.com' } }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as unknown as typeof fetch;

    const result = await connector.execute('list_contacts', { limit: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });
});

describe('SalesforceConnector', () => {
  let connector: SalesforceConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new SalesforceConnector();
    originalFetch = globalThis.fetch;
    vi.mocked(safeFetch).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('salesforce');
    expect(connector.name).toBe('Salesforce');
    expect(connector.service).toBe('salesforce.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(6);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('search');
    expect(names).toContain('list_contacts');
    expect(names).toContain('get_record');
    expect(names).toContain('create_record');
    expect(names).toContain('update_record');
    expect(names).toContain('list_opportunities');
  });

  it('marks arbitrary SOQL search as high risk', () => {
    expect(connector.actions.find(action => action.name === 'search')?.riskLevel).toBe('high');
  });

  it('execute returns error when not connected (no token)', async () => {
    const result = await connector.execute('search', { query: 'SELECT Id FROM Account' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('execute returns error when no instance URL', async () => {
    const vault = createMockVault('salesforce', { value: 'token123', isExpired: false });
    await connector.connect(vault);
    // Token is set but no instance_url
    const result = await connector.execute('search', { query: 'SELECT Id FROM Account' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_salesforce_search');
    expect(def.tools).toContain('connector_salesforce_create_record');
    expect(def.tools).toHaveLength(6);
  });

  it.each([
    'https://na123.salesforce.com',
    'https://acme.my.salesforce.com/',
    'https://acme--dev.sandbox.my.salesforce.com',
  ])('execute(search) works with official instance origin %s without redirects', async (instanceUrl) => {
    const vault = createMockVault('salesforce', { value: 'token123', isExpired: false }, {
      'connector:salesforce:instance_url': instanceUrl,
    });
    await connector.connect(vault);

    const mockData = { records: [{ Id: '001xx', Name: 'Test Account' }], totalSize: 1 };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as unknown as typeof fetch;

    const result = await connector.execute('search', { query: 'SELECT Id, Name FROM Account LIMIT 1' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(safeFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/[a-z0-9.-]+\.salesforce\.com\/services\/data\/v59\.0\/query\?q=/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
      }),
      { maxRedirects: 0 },
    );
  });

  it('uses guarded no-redirect fetch for health checks', async () => {
    const vault = createMockVault('salesforce', { value: 'token123', isExpired: false }, {
      'connector:salesforce:instance_url': 'https://acme.my.salesforce.com',
    });
    await connector.connect(vault);
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    expect((await connector.healthCheck()).status).toBe('connected');
    expect(safeFetch).toHaveBeenCalledWith(
      'https://acme.my.salesforce.com/services/data/v59.0/limits',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
      }),
      { maxRedirects: 0 },
    );
  });

  it.each([
    'http://myco.salesforce.com',
    'https://salesforce.com',
    'https://salesforce.com.evil.test',
    'https://user:pass@myco.salesforce.com',
    'https://myco.salesforce.com:443',
    'https://myco.salesforce.com/services/data',
    'https://myco.salesforce.com/?redirect=https://evil.test',
    'https://myco.salesforce.com/#fragment',
  ])('rejects unsafe instance URL %s before the bearer token reaches fetch', async (instanceUrl) => {
    const vault = createMockVault('salesforce', { value: 'secret-token', isExpired: false }, {
      'connector:salesforce:instance_url': instanceUrl,
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await connector.connect(vault);
    const health = await connector.healthCheck();
    const result = await connector.execute('search', { query: 'SELECT Id FROM Account' });

    expect(health.status).toBe('disconnected');
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('secret-token');
    expect(safeFetch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['fractional list limit', 'list_contacts', { limit: 1.5 }],
    ['zero list limit', 'list_contacts', { limit: 0 }],
    ['oversized list limit', 'list_opportunities', { limit: 2001 }],
    ['SOQL-injected field list', 'list_contacts', { fields: 'Id,Name FROM User' }],
    ['path-like object type', 'get_record', { objectType: '../limits', recordId: '003000000000001AAA' }],
    ['path-like record ID', 'get_record', { objectType: 'Contact', recordId: '../limits' }],
    ['invalid create field', 'create_record', { objectType: 'Contact', fields: { 'Name,Id': 'test' } }],
    ['invalid update record ID', 'update_record', { objectType: 'Contact', recordId: 'not-an-id', fields: { Name: 'test' } }],
    ['empty SOQL query', 'search', { query: '   ' }],
  ] as const)('rejects %s before any outbound request', async (_label, action, params) => {
    const vault = createMockVault('salesforce', { value: 'secret-token', isExpired: false }, {
      'connector:salesforce:instance_url': 'https://acme.my.salesforce.com',
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await connector.connect(vault);

    const result = await connector.execute(action, params);

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('secret-token');
    expect(safeFetch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves valid typed record and list operations with encoded paths', async () => {
    const vault = createMockVault('salesforce', { value: 'token123', isExpired: false }, {
      'connector:salesforce:instance_url': 'https://acme.my.salesforce.com',
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Id: '003000000000001AAA' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Id: '003000000000001' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '003000000000001AAA' }) })
      .mockResolvedValueOnce({ ok: true, status: 204 }) as unknown as typeof fetch;

    expect((await connector.execute('list_contacts', {
      limit: 50,
      fields: 'Id,Account.Owner.Name,Custom_Field__c',
    })).success).toBe(true);
    expect((await connector.execute('get_record', {
      objectType: 'Contact',
      recordId: '003000000000001AAA',
      fields: 'Id,Account.Name',
    })).success).toBe(true);
    expect((await connector.execute('get_record', {
      objectType: 'Contact',
      recordId: '003000000000001',
    })).success).toBe(true);
    expect((await connector.execute('create_record', {
      objectType: 'Contact',
      fields: { LastName: 'Example', Custom_Field__c: 'value' },
    })).success).toBe(true);
    expect((await connector.execute('update_record', {
      objectType: 'Contact',
      recordId: '003000000000001AAA',
      fields: { LastName: 'Updated' },
    })).success).toBe(true);

    expect(safeFetch).toHaveBeenCalledTimes(5);
    for (const [url, _init, options] of vi.mocked(safeFetch).mock.calls) {
      expect(url).toMatch(/^https:\/\/acme\.my\.salesforce\.com\/services\/data\/v59\.0\//);
      expect(options).toEqual({ maxRedirects: 0 });
    }
  });
});

describe('PipedriveConnector', () => {
  let connector: PipedriveConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new PipedriveConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('pipedrive');
    expect(connector.name).toBe('Pipedrive');
    expect(connector.service).toBe('pipedrive.com');
    expect(connector.authType).toBe('api_key');
    expect(connector.actions).toHaveLength(7);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_deals');
    expect(names).toContain('get_deal');
    expect(names).toContain('create_deal');
    expect(names).toContain('search_deals');
    expect(names).toContain('list_persons');
    expect(names).toContain('create_person');
    expect(names).toContain('list_activities');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_deals', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_pipedrive_list_deals');
    expect(def.tools).toContain('connector_pipedrive_create_person');
    expect(def.tools).toHaveLength(7);
  });

  it('execute(list_deals) returns data when connected', async () => {
    const vault = createMockVault('pipedrive', { value: 'api-key-123', isExpired: false });
    await connector.connect(vault);

    const mockData = { success: true, data: [{ id: 1, title: 'Big Deal' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as unknown as typeof fetch;

    const result = await connector.execute('list_deals', { limit: 10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });
});

// ── Data/Storage Connectors ────────────────────────────────

describe('AirtableConnector', () => {
  let connector: AirtableConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new AirtableConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('airtable');
    expect(connector.name).toBe('Airtable');
    expect(connector.service).toBe('airtable.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(6);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_bases');
    expect(names).toContain('list_records');
    expect(names).toContain('get_record');
    expect(names).toContain('create_record');
    expect(names).toContain('update_record');
    expect(names).toContain('search_records');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_bases', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_airtable_list_bases');
    expect(def.tools).toContain('connector_airtable_create_record');
    expect(def.tools).toHaveLength(6);
  });
});

describe('GitLabConnector', () => {
  let connector: GitLabConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GitLabConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('gitlab');
    expect(connector.name).toBe('GitLab');
    expect(connector.service).toBe('gitlab.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(6);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_projects');
    expect(names).toContain('list_issues');
    expect(names).toContain('create_issue');
    expect(names).toContain('list_merge_requests');
    expect(names).toContain('get_file');
    expect(names).toContain('search_code');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_projects', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_gitlab_list_projects');
    expect(def.tools).toContain('connector_gitlab_create_issue');
    expect(def.tools).toHaveLength(6);
  });

  it('supports self-hosted via vault base_url', async () => {
    const vault = createMockVault('gitlab', { value: 'glpat-test', isExpired: false }, {
      'connector:gitlab:base_url': 'https://gitlab.mycompany.com/api/v4',
    });
    await connector.connect(vault);

    const mockProjects = [{ id: 1, name: 'myproject' }];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockProjects }) as unknown as typeof fetch;

    const result = await connector.execute('list_projects', {});
    expect(result.success).toBe(true);
    // Verify the custom base URL was used
    const callUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(callUrl).toContain('gitlab.mycompany.com');
  });
});

describe('BitbucketConnector', () => {
  let connector: BitbucketConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new BitbucketConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('bitbucket');
    expect(connector.name).toBe('Bitbucket');
    expect(connector.service).toBe('bitbucket.org');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(5);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_repos');
    expect(names).toContain('list_pull_requests');
    expect(names).toContain('get_file');
    expect(names).toContain('create_pull_request');
    expect(names).toContain('list_issues');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_repos', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_bitbucket_list_repos');
    expect(def.tools).toContain('connector_bitbucket_create_pull_request');
    expect(def.tools).toHaveLength(5);
  });
});

describe('DropboxConnector', () => {
  let connector: DropboxConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new DropboxConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('dropbox');
    expect(connector.name).toBe('Dropbox');
    expect(connector.service).toBe('dropbox.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.actions).toHaveLength(5);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('list_folder');
    expect(names).toContain('get_file_metadata');
    expect(names).toContain('search_files');
    expect(names).toContain('download_file');
    expect(names).toContain('upload_file');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_folder', { path: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_dropbox_list_folder');
    expect(def.tools).toContain('connector_dropbox_upload_file');
    expect(def.tools).toHaveLength(5);
  });

  it('healthCheck uses POST (Dropbox convention)', async () => {
    const vault = createMockVault('dropbox', { value: 'sl.test-token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ account_id: 'dbid:ABC', name: { display_name: 'Test' } }),
    }) as unknown as typeof fetch;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    // Verify POST method was used
    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(fetchCall[1].method).toBe('POST');
  });
});

describe('PostgresConnector', () => {
  let connector: PostgresConnector;

  beforeEach(() => {
    connector = new PostgresConnector();
  });

  it('has correct identity', () => {
    expect(connector.id).toBe('postgres');
    expect(connector.name).toBe('PostgreSQL');
    expect(connector.service).toBe('local');
    expect(connector.authType).toBe('api_key');
    expect(connector.actions).toHaveLength(4);
  });

  it('actions include expected names', () => {
    const names = connector.actions.map(a => a.name);
    expect(names).toContain('query');
    expect(names).toContain('execute');
    expect(names).toContain('list_tables');
    expect(names).toContain('describe_table');
  });

  it('risk levels are correct', () => {
    const queryAction = connector.actions.find(a => a.name === 'query');
    const executeAction = connector.actions.find(a => a.name === 'execute');
    const listAction = connector.actions.find(a => a.name === 'list_tables');
    const describeAction = connector.actions.find(a => a.name === 'describe_table');
    expect(queryAction?.riskLevel).toBe('low');
    expect(executeAction?.riskLevel).toBe('high');
    expect(listAction?.riskLevel).toBe('low');
    expect(describeAction?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('query', { sql: 'SELECT 1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('execute returns error when pg module is missing', async () => {
    // Mock vault with connection string but pg module will fail to import
    const vault = createMockVault('postgres', { value: 'postgresql://user:pass@localhost:5432/testdb', isExpired: false });
    await connector.connect(vault);

    // The dynamic import of 'pg' will likely fail in test env
    // The connector should handle this gracefully
    const result = await connector.execute('query', { sql: 'SELECT 1' });
    expect(result.success).toBe(false);
    // Either "pg module not installed" or some other error — both acceptable
    expect(result.error).toBeTruthy();
  });

  it('toDefinition maps tools correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.tools).toContain('connector_postgres_query');
    expect(def.tools).toContain('connector_postgres_execute');
    expect(def.tools).toContain('connector_postgres_list_tables');
    expect(def.tools).toContain('connector_postgres_describe_table');
    expect(def.tools).toHaveLength(4);
  });
});
