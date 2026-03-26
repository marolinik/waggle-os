import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GmailConnector } from '../../src/connectors/gmail-connector.js';
import { GoogleDocsConnector } from '../../src/connectors/gdocs-connector.js';
import { GoogleDriveConnector } from '../../src/connectors/gdrive-connector.js';
import { GoogleSheetsConnector } from '../../src/connectors/gsheets-connector.js';
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

// ─── Gmail Connector ───

describe('GmailConnector', () => {
  let connector: GmailConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GmailConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('gmail');
    expect(connector.name).toBe('Gmail');
    expect(connector.service).toBe('gmail.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected actions', () => {
    const actionNames = connector.actions.map(a => a.name);
    expect(actionNames).toContain('list_messages');
    expect(actionNames).toContain('get_message');
    expect(actionNames).toContain('send_message');
    expect(actionNames).toContain('search_messages');
    expect(actionNames).toContain('list_labels');
  });

  it('has at least 5 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(5);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels', () => {
    const listMessages = connector.actions.find(a => a.name === 'list_messages');
    const getMessage = connector.actions.find(a => a.name === 'get_message');
    const sendMessage = connector.actions.find(a => a.name === 'send_message');
    const searchMessages = connector.actions.find(a => a.name === 'search_messages');
    const listLabels = connector.actions.find(a => a.name === 'list_labels');
    expect(listMessages?.riskLevel).toBe('low');
    expect(getMessage?.riskLevel).toBe('low');
    expect(sendMessage?.riskLevel).toBe('medium');
    expect(searchMessages?.riskLevel).toBe('low');
    expect(listLabels?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_messages', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('gmail');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('gmail', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('gmail');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('gmail', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ emailAddress: 'user@gmail.com' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_messages) calls Gmail API', async () => {
    const vault = createMockVault('gmail', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const mockData = { messages: [{ id: '123', threadId: 'abc' }], resultSizeEstimate: 1 };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('list_messages', { maxResults: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('gmail', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('gmail');
    expect(def.tools).toContain('connector_gmail_list_messages');
    expect(def.tools).toContain('connector_gmail_send_message');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});

// ─── Google Docs Connector ───

describe('GoogleDocsConnector', () => {
  let connector: GoogleDocsConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GoogleDocsConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('gdocs');
    expect(connector.name).toBe('Google Docs');
    expect(connector.service).toBe('docs.google.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected actions', () => {
    const actionNames = connector.actions.map(a => a.name);
    expect(actionNames).toContain('get_document');
    expect(actionNames).toContain('create_document');
    expect(actionNames).toContain('update_document');
    expect(actionNames).toContain('list_comments');
  });

  it('has at least 4 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(4);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels', () => {
    const getDoc = connector.actions.find(a => a.name === 'get_document');
    const createDoc = connector.actions.find(a => a.name === 'create_document');
    const updateDoc = connector.actions.find(a => a.name === 'update_document');
    const listComments = connector.actions.find(a => a.name === 'list_comments');
    expect(getDoc?.riskLevel).toBe('low');
    expect(createDoc?.riskLevel).toBe('medium');
    expect(updateDoc?.riskLevel).toBe('medium');
    expect(listComments?.riskLevel).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('get_document', { documentId: 'abc' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('gdocs');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('gdocs', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('gdocs');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('gdocs', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { displayName: 'Test' } }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(get_document) calls Docs API', async () => {
    const vault = createMockVault('gdocs', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const mockData = { documentId: 'abc', title: 'Test Doc', body: {} };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('get_document', { documentId: 'abc' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('gdocs', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('gdocs');
    expect(def.tools).toContain('connector_gdocs_get_document');
    expect(def.tools).toContain('connector_gdocs_create_document');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});

// ─── Google Drive Connector ───

describe('GoogleDriveConnector', () => {
  let connector: GoogleDriveConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GoogleDriveConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('gdrive');
    expect(connector.name).toBe('Google Drive');
    expect(connector.service).toBe('drive.google.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected actions', () => {
    const actionNames = connector.actions.map(a => a.name);
    expect(actionNames).toContain('list_files');
    expect(actionNames).toContain('search_files');
    expect(actionNames).toContain('get_file_metadata');
    expect(actionNames).toContain('download_file');
    expect(actionNames).toContain('upload_file');
    expect(actionNames).toContain('create_folder');
  });

  it('has at least 6 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(6);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels', () => {
    const listFiles = connector.actions.find(a => a.name === 'list_files');
    const searchFiles = connector.actions.find(a => a.name === 'search_files');
    const getMetadata = connector.actions.find(a => a.name === 'get_file_metadata');
    const downloadFile = connector.actions.find(a => a.name === 'download_file');
    const uploadFile = connector.actions.find(a => a.name === 'upload_file');
    const createFolder = connector.actions.find(a => a.name === 'create_folder');
    expect(listFiles?.riskLevel).toBe('low');
    expect(searchFiles?.riskLevel).toBe('low');
    expect(getMetadata?.riskLevel).toBe('low');
    expect(downloadFile?.riskLevel).toBe('low');
    expect(uploadFile?.riskLevel).toBe('medium');
    expect(createFolder?.riskLevel).toBe('medium');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_files', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('gdrive');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('gdrive', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('gdrive');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('gdrive', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { displayName: 'Test' } }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_files) calls Drive API', async () => {
    const vault = createMockVault('gdrive', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const mockData = { files: [{ id: 'f1', name: 'report.pdf' }], nextPageToken: null };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('list_files', { pageSize: 10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('gdrive', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('gdrive');
    expect(def.tools).toContain('connector_gdrive_list_files');
    expect(def.tools).toContain('connector_gdrive_upload_file');
    expect(def.tools).toContain('connector_gdrive_create_folder');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});

// ─── Google Sheets Connector ───

describe('GoogleSheetsConnector', () => {
  let connector: GoogleSheetsConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GoogleSheetsConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, and service', () => {
    expect(connector.id).toBe('gsheets');
    expect(connector.name).toBe('Google Sheets');
    expect(connector.service).toBe('sheets.google.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected actions', () => {
    const actionNames = connector.actions.map(a => a.name);
    expect(actionNames).toContain('get_spreadsheet');
    expect(actionNames).toContain('get_values');
    expect(actionNames).toContain('update_values');
    expect(actionNames).toContain('append_values');
    expect(actionNames).toContain('create_spreadsheet');
  });

  it('has at least 5 actions with required fields', () => {
    expect(connector.actions.length).toBeGreaterThanOrEqual(5);
    for (const action of connector.actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.inputSchema).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(action.riskLevel);
    }
  });

  it('has correct risk levels', () => {
    const getSpreadsheet = connector.actions.find(a => a.name === 'get_spreadsheet');
    const getValues = connector.actions.find(a => a.name === 'get_values');
    const updateValues = connector.actions.find(a => a.name === 'update_values');
    const appendValues = connector.actions.find(a => a.name === 'append_values');
    const createSpreadsheet = connector.actions.find(a => a.name === 'create_spreadsheet');
    expect(getSpreadsheet?.riskLevel).toBe('low');
    expect(getValues?.riskLevel).toBe('low');
    expect(updateValues?.riskLevel).toBe('medium');
    expect(appendValues?.riskLevel).toBe('medium');
    expect(createSpreadsheet?.riskLevel).toBe('medium');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('get_spreadsheet', { spreadsheetId: 'abc' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected when no token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('gsheets');
  });

  it('connect retrieves token from vault', async () => {
    const vault = createMockVault('gsheets', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('gsheets');
  });

  it('healthCheck returns connected when API responds OK', async () => {
    const vault = createMockVault('gsheets', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { displayName: 'Test' } }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(get_spreadsheet) calls Sheets API', async () => {
    const vault = createMockVault('gsheets', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const mockData = { spreadsheetId: 'abc', properties: { title: 'Budget' }, sheets: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('get_spreadsheet', { spreadsheetId: 'abc' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it('execute(get_values) calls Sheets values API', async () => {
    const vault = createMockVault('gsheets', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const mockData = { range: 'Sheet1!A1:D10', majorDimension: 'ROWS', values: [['a', 'b'], ['c', 'd']] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockData }) as any;

    const result = await connector.execute('get_values', { spreadsheetId: 'abc', range: 'Sheet1!A1:D10' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it('execute returns error for unknown action', async () => {
    const vault = createMockVault('gsheets', { value: 'ya29.test_token', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('gsheets');
    expect(def.tools).toContain('connector_gsheets_get_spreadsheet');
    expect(def.tools).toContain('connector_gsheets_update_values');
    expect(def.tools).toContain('connector_gsheets_create_spreadsheet');
    expect(def.actions.length).toBe(connector.actions.length);
  });
});
