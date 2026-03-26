import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MSTeamsConnector } from '../../src/connectors/ms-teams-connector.js';
import { OutlookConnector } from '../../src/connectors/outlook-connector.js';
import { OneDriveConnector } from '../../src/connectors/onedrive-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(
  connectorId: string,
  cred?: { value: string; isExpired: boolean },
): VaultStore {
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

// ── Microsoft Teams Connector ─────────────────────────────────────────

describe('MSTeamsConnector', () => {
  let connector: MSTeamsConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new MSTeamsConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, service, and authType', () => {
    expect(connector.id).toBe('ms-teams');
    expect(connector.name).toBe('Microsoft Teams');
    expect(connector.service).toBe('teams.microsoft.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected number of actions', () => {
    expect(connector.actions).toHaveLength(6);
    expect(connector.actions.map(a => a.name)).toEqual([
      'list_teams', 'list_channels', 'get_messages', 'send_message', 'list_chats', 'send_chat_message',
    ]);
  });

  it('action risk levels are correct', () => {
    const risks = Object.fromEntries(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(risks.list_teams).toBe('low');
    expect(risks.list_channels).toBe('low');
    expect(risks.get_messages).toBe('low');
    expect(risks.send_message).toBe('medium');
    expect(risks.list_chats).toBe('low');
    expect(risks.send_chat_message).toBe('medium');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_teams', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected without token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('ms-teams');
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault('ms-teams', { value: 'graph-token-123', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('ms-teams');
  });

  it('healthCheck() returns connected when Graph API responds OK', async () => {
    const vault = createMockVault('ms-teams', { value: 'graph-token-123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ displayName: 'User' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('healthCheck() returns error when Graph API fails', async () => {
    const vault = createMockVault('ms-teams', { value: 'graph-token-123', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('error');
    expect(health.error).toContain('401');
  });

  it('execute(list_teams) calls Graph API', async () => {
    const vault = createMockVault('ms-teams', { value: 'graph-token-123', isExpired: false });
    await connector.connect(vault);

    const mockTeams = { value: [{ id: 't1', displayName: 'Engineering' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockTeams }) as any;

    const result = await connector.execute('list_teams', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockTeams);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/joinedTeams');
  });

  it('execute(send_message) posts to channel', async () => {
    const vault = createMockVault('ms-teams', { value: 'graph-token-123', isExpired: false });
    await connector.connect(vault);

    const mockMsg = { id: 'msg1' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockMsg }) as any;

    const result = await connector.execute('send_message', {
      team_id: 't1', channel_id: 'c1', content: 'Hello Teams!',
    });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/teams/t1/channels/c1/messages');
    expect(fetchCall[1].method).toBe('POST');
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault('ms-teams', { value: 'graph-token-123', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('ms-teams');
    expect(def.tools).toContain('connector_ms-teams_list_teams');
    expect(def.tools).toContain('connector_ms-teams_send_message');
    expect(def.tools).toHaveLength(6);
    expect(def.actions).toHaveLength(6);
  });
});

// ── Outlook Connector ─────────────────────────────────────────────────

describe('OutlookConnector', () => {
  let connector: OutlookConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new OutlookConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, service, and authType', () => {
    expect(connector.id).toBe('outlook');
    expect(connector.name).toBe('Outlook Calendar & Email');
    expect(connector.service).toBe('outlook.office365.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected number of actions', () => {
    expect(connector.actions).toHaveLength(6);
    expect(connector.actions.map(a => a.name)).toEqual([
      'list_events', 'create_event', 'list_emails', 'send_email', 'search_emails', 'get_email',
    ]);
  });

  it('action risk levels are correct', () => {
    const risks = Object.fromEntries(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(risks.list_events).toBe('low');
    expect(risks.create_event).toBe('medium');
    expect(risks.list_emails).toBe('low');
    expect(risks.send_email).toBe('medium');
    expect(risks.search_emails).toBe('low');
    expect(risks.get_email).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_events', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected without token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('outlook');
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('outlook');
  });

  it('healthCheck() returns connected when Graph API responds OK', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ displayName: 'User' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('execute(list_events) calls Graph API', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);

    const mockEvents = { value: [{ id: 'ev1', subject: 'Standup' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockEvents }) as any;

    const result = await connector.execute('list_events', { $top: 10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockEvents);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/events');
  });

  it('execute(create_event) creates event with attendees', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);

    const mockEvent = { id: 'ev2', subject: 'Team Sync' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockEvent }) as any;

    const result = await connector.execute('create_event', {
      subject: 'Team Sync',
      start: '2026-03-20T10:00:00',
      end: '2026-03-20T11:00:00',
      attendees: ['alice@example.com'],
    });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/events');
    expect(fetchCall[1].method).toBe('POST');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.subject).toBe('Team Sync');
    expect(body.attendees).toHaveLength(1);
    expect(body.attendees[0].emailAddress.address).toBe('alice@example.com');
  });

  it('execute(send_email) sends email', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' }) as any;

    const result = await connector.execute('send_email', {
      to: ['bob@example.com'],
      subject: 'Hello',
      body: '<p>Hi Bob!</p>',
    });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/sendMail');
    expect(fetchCall[1].method).toBe('POST');
  });

  it('execute(search_emails) searches with $search', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);

    const mockResults = { value: [{ id: 'm1', subject: 'Project Update' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResults }) as any;

    const result = await connector.execute('search_emails', { query: 'project' });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/messages');
    // URLSearchParams encodes $ as %24
    expect(decodeURIComponent(fetchCall[0])).toContain('$search');
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault('outlook', { value: 'graph-token-456', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('outlook');
    expect(def.tools).toContain('connector_outlook_list_events');
    expect(def.tools).toContain('connector_outlook_send_email');
    expect(def.tools).toHaveLength(6);
    expect(def.actions).toHaveLength(6);
  });
});

// ── OneDrive Connector ────────────────────────────────────────────────

describe('OneDriveConnector', () => {
  let connector: OneDriveConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new OneDriveConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id, name, service, and authType', () => {
    expect(connector.id).toBe('onedrive');
    expect(connector.name).toBe('OneDrive');
    expect(connector.service).toBe('onedrive.live.com');
    expect(connector.authType).toBe('bearer');
    expect(connector.substrate).toBe('waggle');
  });

  it('has expected number of actions', () => {
    expect(connector.actions).toHaveLength(5);
    expect(connector.actions.map(a => a.name)).toEqual([
      'list_files', 'get_file', 'search_files', 'upload_file', 'list_recent',
    ]);
  });

  it('action risk levels are correct', () => {
    const risks = Object.fromEntries(connector.actions.map(a => [a.name, a.riskLevel]));
    expect(risks.list_files).toBe('low');
    expect(risks.get_file).toBe('low');
    expect(risks.search_files).toBe('low');
    expect(risks.upload_file).toBe('medium');
    expect(risks.list_recent).toBe('low');
  });

  it('execute returns error when not connected', async () => {
    const result = await connector.execute('list_files', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not connected');
  });

  it('healthCheck returns disconnected without token', async () => {
    const health = await connector.healthCheck();
    expect(health.status).toBe('disconnected');
    expect(health.id).toBe('onedrive');
  });

  it('connect() retrieves token from vault', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('onedrive');
  });

  it('healthCheck() returns connected when Graph API responds OK', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ driveType: 'personal' }) }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('healthCheck() returns error when Graph API fails', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('error');
    expect(health.error).toContain('403');
  });

  it('execute(list_files) calls root children endpoint', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    const mockFiles = { value: [{ id: 'f1', name: 'document.docx' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockFiles }) as any;

    const result = await connector.execute('list_files', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockFiles);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/drive/root/children');
  });

  it('execute(list_files) with folder_path uses path-based endpoint', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    const mockFiles = { value: [{ id: 'f2', name: 'report.xlsx' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockFiles }) as any;

    const result = await connector.execute('list_files', { folder_path: 'Documents/Work' });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/drive/root:/Documents/Work:/children');
  });

  it('execute(search_files) searches via Graph API', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    const mockResults = { value: [{ id: 'f3', name: 'notes.txt' }] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResults }) as any;

    const result = await connector.execute('search_files', { query: 'notes' });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/drive/root/search');
    expect(fetchCall[0]).toContain('notes');
  });

  it('execute(upload_file) uploads via PUT', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    const mockFile = { id: 'f4', name: 'notes.txt' };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockFile }) as any;

    const result = await connector.execute('upload_file', {
      path: 'Documents/notes.txt',
      content: 'Hello World',
    });
    expect(result.success).toBe(true);

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/drive/root:/Documents/notes.txt:/content');
    expect(fetchCall[1].method).toBe('PUT');
  });

  it('execute(get_file) downloads file content', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'file content here',
    }) as any;

    const result = await connector.execute('get_file', { item_id: 'f1' });
    expect(result.success).toBe(true);
    expect((result.data as any).content).toBe('file content here');

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain('/me/drive/items/f1/content');
  });

  it('execute() returns error for unknown action', async () => {
    const vault = createMockVault('onedrive', { value: 'graph-token-789', isExpired: false });
    await connector.connect(vault);

    const result = await connector.execute('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('toDefinition() maps correctly', () => {
    const def = connector.toDefinition('connected');
    expect(def.id).toBe('onedrive');
    expect(def.tools).toContain('connector_onedrive_list_files');
    expect(def.tools).toContain('connector_onedrive_upload_file');
    expect(def.tools).toHaveLength(5);
    expect(def.actions).toHaveLength(5);
  });
});
