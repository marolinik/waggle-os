import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearConnector } from '../../src/connectors/linear-connector.js';
import { AsanaConnector } from '../../src/connectors/asana-connector.js';
import { TrelloConnector } from '../../src/connectors/trello-connector.js';
import { MondayConnector } from '../../src/connectors/monday-connector.js';
import type { VaultStore } from '@waggle/core';

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

// ─── Linear Connector ───

describe('LinearConnector', () => {
  let connector: LinearConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new LinearConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('linear');
    expect(connector.name).toBe('Linear');
    expect(connector.service).toBe('linear.app');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has at least 3 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(3);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels for actions', () => {
    const listIssues = connector.actions.find(a => a.name === 'list_issues');
    const createIssue = connector.actions.find(a => a.name === 'create_issue');
    const searchIssues = connector.actions.find(a => a.name === 'search_issues');
    expect(listIssues?.riskLevel).toBe('low');
    expect(createIssue?.riskLevel).toBe('medium');
    expect(searchIssues?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_issues', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('linear');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('linear', { value: 'lin_api_test123', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('linear');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('linear', { value: 'lin_api_test123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { viewer: { id: '1', name: 'User' } } }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_issues) calls GraphQL API', async () => {
    const vault = createMockVault('linear', { value: 'lin_api_test123', isExpired: false });
    await connector.connect(vault);

    const mockData = { data: { issues: { nodes: [{ id: '1', title: 'Test' }] } } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('list_issues', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData.data);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('linear', { value: 'lin_api_test123', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('linear');
    expect(def.tools).toContain('connector_linear_list_issues');
    expect(def.tools).toContain('connector_linear_create_issue');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});

// ─── Asana Connector ───

describe('AsanaConnector', () => {
  let connector: AsanaConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new AsanaConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('asana');
    expect(connector.name).toBe('Asana');
    expect(connector.service).toBe('asana.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has at least 3 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(3);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels for actions', () => {
    const listTasks = connector.actions.find(a => a.name === 'list_tasks');
    const createTask = connector.actions.find(a => a.name === 'create_task');
    const searchTasks = connector.actions.find(a => a.name === 'search_tasks');
    expect(listTasks?.riskLevel).toBe('low');
    expect(createTask?.riskLevel).toBe('medium');
    expect(searchTasks?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_tasks', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('asana');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('asana', { value: 'asana_pat_test123', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('asana');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('asana', { value: 'asana_pat_test123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { gid: '1', name: 'User' } }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_tasks) calls REST API', async () => {
    const vault = createMockVault('asana', { value: 'asana_pat_test123', isExpired: false });
    await connector.connect(vault);

    const mockData = { data: [{ gid: '1', name: 'Task 1' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('list_tasks', { project: 'proj123' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('asana', { value: 'asana_pat_test123', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('asana');
    expect(def.tools).toContain('connector_asana_list_tasks');
    expect(def.tools).toContain('connector_asana_create_task');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});

// ─── Trello Connector ───

describe('TrelloConnector', () => {
  let connector: TrelloConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new TrelloConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('trello');
    expect(connector.name).toBe('Trello');
    expect(connector.service).toBe('trello.com');
    expect(connector.authType).toBe('api_key');
    expect(connector.substrate).toBe('waggle');
  });

  it('has at least 3 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(3);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels for actions', () => {
    const listBoards = connector.actions.find(a => a.name === 'list_boards');
    const createCard = connector.actions.find(a => a.name === 'create_card');
    const searchCards = connector.actions.find(a => a.name === 'search_cards');
    expect(listBoards?.riskLevel).toBe('low');
    expect(createCard?.riskLevel).toBe('medium');
    expect(searchCards?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_boards', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('trello');
  });

  it('connect retrieves credentials from vault', async () => {
    const vault = createMockVault('trello', { value: 'trello_token_test', isExpired: false }, {
      'connector:trello:api_key': 'trello_key_test',
    });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('trello');
    expect(vault.get).toHaveBeenCalledWith('connector:trello:api_key');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('trello', { value: 'trello_token_test', isExpired: false }, {
      'connector:trello:api_key': 'trello_key_test',
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '1', username: 'user' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_boards) calls REST API with auth params', async () => {
    const vault = createMockVault('trello', { value: 'trello_token_test', isExpired: false }, {
      'connector:trello:api_key': 'trello_key_test',
    });
    await connector.connect(vault);

    const mockBoards = [{ id: '1', name: 'My Board' }];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockBoards }) as any;

    const result = await connector.execute('list_boards', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockBoards);

    // Verify auth params are in the URL
    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('key=trello_key_test');
    expect(fetchCall[0]).toContain('token=trello_token_test');
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('trello', { value: 'trello_token_test', isExpired: false }, {
      'connector:trello:api_key': 'trello_key_test',
    });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('trello');
    expect(def.tools).toContain('connector_trello_list_boards');
    expect(def.tools).toContain('connector_trello_create_card');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});

// ─── Monday.com Connector ───

describe('MondayConnector', () => {
  let connector: MondayConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new MondayConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('monday');
    expect(connector.name).toBe('Monday.com');
    expect(connector.service).toBe('monday.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has at least 3 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(3);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels for actions', () => {
    const listBoards = connector.actions.find(a => a.name === 'list_boards');
    const createItem = connector.actions.find(a => a.name === 'create_item');
    const searchItems = connector.actions.find(a => a.name === 'search_items');
    expect(listBoards?.riskLevel).toBe('low');
    expect(createItem?.riskLevel).toBe('medium');
    expect(searchItems?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_boards', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('monday');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('monday', { value: 'monday_api_test123', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('monday');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('monday', { value: 'monday_api_test123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { me: { id: '1', name: 'User' } } }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_boards) calls GraphQL API', async () => {
    const vault = createMockVault('monday', { value: 'monday_api_test123', isExpired: false });
    await connector.connect(vault);

    const mockData = { data: { boards: [{ id: '1', name: 'Sprint Board' }] } };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('list_boards', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData.data);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('monday', { value: 'monday_api_test123', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('monday');
    expect(def.tools).toContain('connector_monday_list_boards');
    expect(def.tools).toContain('connector_monday_create_item');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});
