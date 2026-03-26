import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarConnector } from '../../src/connectors/gcal-connector.js';
import type { VaultStore } from '@waggle/core';

function createMockVault(opts?: {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  clientId?: string;
  clientSecret?: string;
}): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (id === 'gcal' && opts?.accessToken) {
        return {
          value: opts.accessToken,
          type: 'oauth2',
          isExpired: false,
          refreshToken: opts.refreshToken,
          expiresAt: opts.expiresAt,
        };
      }
      return null;
    }),
    get: vi.fn((name: string) => {
      if (name === 'connector:gcal:client_id' && opts?.clientId) return { value: opts.clientId };
      if (name === 'connector:gcal:client_secret' && opts?.clientSecret) return { value: opts.clientSecret };
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

describe('GoogleCalendarConnector', () => {
  let connector: GoogleCalendarConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GoogleCalendarConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('implements WaggleConnector interface', () => {
    expect(connector.id).toBe('gcal');
    expect(connector.name).toBe('Google Calendar');
    expect(connector.authType).toBe('oauth2');
    expect(connector.actions).toHaveLength(4);
  });

  it('connect() retrieves OAuth tokens from vault', async () => {
    const vault = createMockVault({
      accessToken: 'ya29.test_token',
      refreshToken: 'rt_test',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await connector.connect(vault);
    expect(vault.getConnectorCredential).toHaveBeenCalledWith('gcal');
  });

  it('healthCheck() validates access token', async () => {
    const vault = createMockVault({ accessToken: 'ya29.test_token' });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ items: [] }),
    }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('healthCheck() auto-refreshes expired access token', async () => {
    const vault = createMockVault({
      accessToken: 'ya29.expired',
      refreshToken: 'rt_test',
      expiresAt: '2020-01-01T00:00:00.000Z', // Expired
      clientId: 'client_123',
      clientSecret: 'secret_456',
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn()
      // First call: token refresh
      .mockResolvedValueOnce({
        ok: true, json: async () => ({
          access_token: 'ya29.refreshed',
          expires_in: 3600,
        }),
      })
      // Second call: calendar list (health check)
      .mockResolvedValueOnce({
        ok: true, json: async () => ({ items: [] }),
      }) as any;

    const health = await connector.healthCheck();
    expect(health.status).toBe('connected');
    // Verify tokens were stored back in vault
    expect(vault.setConnectorCredential).toHaveBeenCalledWith('gcal', expect.objectContaining({
      type: 'oauth2',
      value: 'ya29.refreshed',
    }));
  });

  it('execute(list_events) returns events', async () => {
    const vault = createMockVault({ accessToken: 'ya29.test_token' });
    await connector.connect(vault);

    const mockEvents = { items: [{ summary: 'Meeting', start: { dateTime: '2026-03-18T10:00:00Z' } }] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => mockEvents,
    }) as any;

    const result = await connector.execute('list_events', {});
    expect(result.success).toBe(true);
    expect((result.data as any).items).toHaveLength(1);
  });

  it('execute(create_event) creates event (medium risk)', async () => {
    const vault = createMockVault({ accessToken: 'ya29.test_token' });
    await connector.connect(vault);

    const mockEvent = { id: 'evt_123', summary: 'Team standup' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => mockEvent,
    }) as any;

    const result = await connector.execute('create_event', {
      summary: 'Team standup',
      start: '2026-03-19T09:00:00Z',
      end: '2026-03-19T09:15:00Z',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe('evt_123');
  });

  it('execute(find_free_time) returns available slots', async () => {
    const vault = createMockVault({ accessToken: 'ya29.test_token' });
    await connector.connect(vault);

    const mockFreeBusy = { calendars: { primary: { busy: [] } } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => mockFreeBusy,
    }) as any;

    const result = await connector.execute('find_free_time', {
      duration: 30,
      timeMin: '2026-03-19T08:00:00Z',
      timeMax: '2026-03-19T18:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('toDefinition() correctly reports OAuth2 auth type', () => {
    const def = connector.toDefinition('connected');
    expect(def.authType).toBe('oauth2');
    expect(def.tools).toContain('connector_gcal_list_events');
    expect(def.tools).toContain('connector_gcal_create_event');
    expect(def.tools).toHaveLength(4);
  });
});

describe('OAuth2 token refresh', () => {
  let connector: GoogleCalendarConnector;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    connector = new GoogleCalendarConnector();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('stores new access + refresh tokens back in vault', async () => {
    const vault = createMockVault({
      accessToken: 'ya29.expired',
      refreshToken: 'rt_test',
      expiresAt: '2020-01-01T00:00:00.000Z',
      clientId: 'client_123',
      clientSecret: 'secret_456',
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, json: async () => ({
          access_token: 'ya29.new',
          expires_in: 3600,
          refresh_token: 'rt_new',
        }),
      })
      .mockResolvedValueOnce({
        ok: true, json: async () => ({ items: [] }),
      }) as any;

    await connector.execute('list_events', {});

    expect(vault.setConnectorCredential).toHaveBeenCalledWith('gcal', expect.objectContaining({
      value: 'ya29.new',
      refreshToken: 'rt_new',
    }));
  });

  it('returns error when refresh token is invalid', async () => {
    const vault = createMockVault({
      accessToken: 'ya29.expired',
      refreshToken: 'rt_invalid',
      expiresAt: '2020-01-01T00:00:00.000Z',
      clientId: 'client_123',
      clientSecret: 'secret_456',
    });
    await connector.connect(vault);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => 'invalid_grant',
    }) as any;

    const result = await connector.execute('list_events', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Token refresh failed');
  });
});
