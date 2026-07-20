/**
 * Connector Hub Phase-4 extensions (S07/S14): sync (C16), revoke (C17),
 * connect-audit, and the GET /api/connectors lastSyncAt enrichment.
 *
 * Real VaultStore in a tmpdir + real ConnectorRegistry with a BaseConnector
 * fake + real InstallAuditStore over MindDB(':memory:'), real route plugin,
 * server.inject — same harness style as the Phase-3 suites.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, InstallAuditStore, VaultStore } from '@waggle/core';
import {
  ConnectorRegistry,
  BaseConnector,
  GoogleCalendarConnector,
  SalesforceConnector,
  type ConnectorAction,
  type ConnectorResult,
} from '@waggle/agent';
import type { ConnectorHealth } from '@waggle/shared';
import { connectorRoutes } from '../../src/local/routes/connectors.js';
import { registerConnectors } from '../../src/local/setup-connectors.js';

class TestConnector extends BaseConnector {
  readonly id = 'test-conn';
  readonly name = 'Test Service';
  readonly description = 'Phase-4 test connector';
  readonly service = 'test.example.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly actions: ConnectorAction[] = [
    { name: 'read_data', description: 'Read', inputSchema: { properties: {} }, riskLevel: 'low' },
  ];
  healthStatus: ConnectorHealth['status'] = 'connected';
  connectCalls = 0;
  executeCalls = 0;
  healthCheckCalls = 0;
  connectCallsObservedByHealth: number[] = [];
  credentialValue: string | null = null;
  connectGate: Promise<void> | null = null;
  connectError: Error | null = null;
  async connect(vault: VaultStore): Promise<void> {
    this.connectCalls += 1;
    if (this.connectGate) await this.connectGate;
    if (this.connectError) throw this.connectError;
    this.credentialValue = vault.getConnectorCredential(this.id)?.value ?? null;
  }
  async healthCheck(): Promise<ConnectorHealth> {
    this.healthCheckCalls += 1;
    this.connectCallsObservedByHealth.push(this.connectCalls);
    return { id: this.id, name: this.name, status: this.healthStatus, lastChecked: new Date().toISOString() };
  }
  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    this.executeCalls += 1;
    return { success: true, data: { action, ...params } };
  }
}

describe('Connector routes — Phase 4 extensions', () => {
  let tmpDir: string;
  let vault: VaultStore;
  let registry: ConnectorRegistry;
  let connector: TestConnector;
  let db: MindDB;
  let auditStore: InstallAuditStore;
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-conn4-'));
    vault = new VaultStore(tmpDir);
    connector = new TestConnector();
    registry = new ConnectorRegistry(vault);
    registry.register(connector);
    db = new MindDB(':memory:');
    auditStore = new InstallAuditStore(db);

    server = Fastify({ logger: false });
    server.decorate('vault', vault as never);
    server.decorate('connectorRegistry', registry as never);
    server.decorate('auditStore', auditStore as never);
    await server.register(connectorRoutes);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── connect → audit ──────────────────────────────────────────────────

  it('connect stores credentials AND records an install-audit entry', async () => {
    expect(connector.connectCalls).toBe(1);
    const res = await server.inject({
      method: 'POST', url: '/api/connectors/test-conn/connect',
      payload: { token: 'tok-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ connected: true, connectorId: 'test-conn' });
    expect(connector.connectCalls).toBe(2);
    expect(connector.credentialValue).toBe('tok-123');

    const audit = auditStore.getByCapability('test-conn');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      capability_type: 'connector',
      action: 'installed',
      initiator: 'user',
      risk_level: 'low',
    });
    expect(audit[0].detail).toContain('bearer');
  });

  it('reports connector hydration failure without claiming the connector is connected', async () => {
    connector.connectError = new Error('internal vault detail');

    const res = await server.inject({
      method: 'POST',
      url: '/api/connectors/test-conn/connect',
      payload: { token: 'tok-123' },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'Connector initialization failed' });
    expect(res.body).not.toContain('internal vault detail');
    expect(registry.getDefinitions().find(def => def.id === 'test-conn')?.status)
      .toBe('disconnected');
  });

  it('rejects an unsafe Salesforce instance URL before writing any credential or metadata', async () => {
    registry.register(new SalesforceConnector());

    const res = await server.inject({
      method: 'POST',
      url: '/api/connectors/salesforce/connect',
      payload: {
        token: 'secret-token',
        instanceUrl: 'https://salesforce.com.evil.test',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Valid Salesforce instanceUrl required' });
    expect(vault.getConnectorCredential('salesforce')).toBeNull();
    expect(vault.get('connector:salesforce:instance_url')).toBeNull();
  });

  it('normalizes and stores a valid Salesforce origin before hydrating the connector', async () => {
    const salesforce = new SalesforceConnector();
    registry.register(salesforce);

    const res = await server.inject({
      method: 'POST',
      url: '/api/connectors/salesforce/connect',
      payload: {
        token: 'secret-token',
        instanceUrl: ' HTTPS://Acme--Dev.Sandbox.My.Salesforce.Com/ ',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(vault.get('connector:salesforce:instance_url')?.value)
      .toBe('https://acme--dev.sandbox.my.salesforce.com');
    const result = await salesforce.execute('search', { query: '   ' });
    expect(result.error).toBe('Invalid Salesforce SOQL query');
    expect(registry.getDefinitions().find(def => def.id === 'salesforce')?.status).toBe('connected');
  });

  it('rehydrates persisted Salesforce state on restart and hides incomplete legacy state', async () => {
    vault.setConnectorCredential('salesforce', { type: 'bearer', value: 'persisted-token' });
    vault.set('connector:salesforce:instance_url', 'https://acme.my.salesforce.com');

    const restarted = registerConnectors(vault);
    const salesforce = restarted.get('salesforce')!;
    const result = await salesforce.execute('search', { query: '   ' });

    expect(result.error).toBe('Invalid Salesforce SOQL query');
    expect(restarted.getDefinitions().find(def => def.id === 'salesforce')?.status).toBe('connected');

    vault.delete('connector:salesforce:instance_url');
    const incompleteRestart = registerConnectors(vault);
    await incompleteRestart.hydrate('salesforce');
    expect(incompleteRestart.getDefinitions().find(def => def.id === 'salesforce')?.status).toBe('disconnected');
    expect(incompleteRestart.getConnected().some(connector => connector.id === 'salesforce')).toBe(false);
  });

  it('waits for startup hydration before health checks or issued-tool execution', async () => {
    vault.setConnectorCredential('test-conn', { type: 'bearer', value: 'persisted-token' });
    let releaseHydration!: () => void;
    const hydrationGate = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    const delayedConnector = new TestConnector();
    delayedConnector.connectGate = hydrationGate;
    const restarted = new ConnectorRegistry(vault);
    restarted.register(delayedConnector);

    const healthPending = restarted.healthCheck('test-conn');
    const rehydrationPending = restarted.hydrate('test-conn');
    let releaseRehydration!: () => void;
    delayedConnector.connectGate = new Promise<void>((resolve) => {
      releaseRehydration = resolve;
    });
    await Promise.resolve();

    expect(restarted.getConnected()).toEqual([]);
    expect(restarted.generateTools()).toEqual([]);
    expect(delayedConnector.healthCheckCalls).toBe(0);
    expect(delayedConnector.executeCalls).toBe(0);

    releaseHydration();
    await vi.waitFor(() => expect(delayedConnector.connectCalls).toBe(2));
    expect(delayedConnector.healthCheckCalls).toBe(0);
    releaseRehydration();
    const [health, rehydrated] = await Promise.all([healthPending, rehydrationPending]);
    const issuedTool = restarted.generateTools().find(tool => tool.name === 'connector_test-conn_read_data')!;
    const serializedResult = await issuedTool.execute({});
    expect(health?.status).toBe('connected');
    expect(rehydrated).toBe(true);
    expect(delayedConnector.connectCallsObservedByHealth).toEqual([2]);
    expect(restarted.getConnected()).toEqual([delayedConnector]);
    expect(JSON.parse(serializedResult).success).toBe(true);
    expect(delayedConnector.credentialValue).toBe('persisted-token');
  });

  it('blocks an already-issued connector tool after its Vault credential is disconnected', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/connectors/test-conn/connect',
      payload: { token: 'secret-token' },
    });
    const issuedTool = registry.generateTools().find(tool => tool.name === 'connector_test-conn_read_data')!;

    const disconnected = await server.inject({
      method: 'POST',
      url: '/api/connectors/test-conn/disconnect',
    });
    const result = JSON.parse(await issuedTool.execute({}));

    expect(disconnected.statusCode).toBe(200);
    expect(result).toEqual({ success: false, error: 'Connector is not connected' });
    expect(connector.credentialValue).toBeNull();
    expect(connector.connectCalls).toBe(3);
    expect(connector.executeCalls).toBe(0);
  });

  it('fails closed without leaking Vault errors from an already-issued connector tool', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/connectors/test-conn/connect',
      payload: { token: 'secret-token' },
    });
    const issuedTool = registry.generateTools().find(tool => tool.name === 'connector_test-conn_read_data')!;
    const credentialRead = vi.spyOn(vault, 'getConnectorCredential').mockImplementation(() => {
      throw new Error('vault offline');
    });

    let serializedResult: string;
    try {
      serializedResult = await issuedTool.execute({});
    } finally {
      credentialRead.mockRestore();
    }

    expect(JSON.parse(serializedResult)).toEqual({
      success: false,
      error: 'Connector is not connected',
    });
    expect(connector.executeCalls).toBe(0);
  });

  // ── sync (C16) ───────────────────────────────────────────────────────

  it.each(['disconnect', 'revoke'] as const)(
    '%s clears Google Calendar runtime tokens before a direct health path can use them',
    async (lifecycleAction) => {
      registry.register(new GoogleCalendarConnector());
      const connected = await server.inject({
        method: 'POST',
        url: '/api/connectors/gcal/connect',
        payload: {
          token: 'old-access-token',
          refreshToken: 'old-refresh-token',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      expect(connected.statusCode).toBe(200);

      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      let healthResponse;
      try {
        const lifecycleResponse = await server.inject({
          method: 'POST',
          url: `/api/connectors/gcal/${lifecycleAction}`,
        });
        expect(lifecycleResponse.statusCode).toBe(200);
        healthResponse = await server.inject({
          method: 'GET',
          url: '/api/connectors/gcal/health',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }

      expect(healthResponse.statusCode).toBe(200);
      expect(healthResponse.json().status).toBe('disconnected');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('does not resurrect a revoked Google Calendar credential from an in-flight refresh', async () => {
    registry.register(new GoogleCalendarConnector());
    vault.set('connector:gcal:client_id', 'client-id');
    vault.set('connector:gcal:client_secret', 'client-secret');
    const connected = await server.inject({
      method: 'POST',
      url: '/api/connectors/gcal/connect',
      payload: {
        token: 'expired-access-token',
        refreshToken: 'old-refresh-token',
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    });
    expect(connected.statusCode).toBe(200);

    let notifyRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      notifyRefreshStarted = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      notifyRefreshStarted();
      await refreshGate;
      return {
        ok: true,
        json: async () => ({ access_token: 'resurrected-token', expires_in: 3600 }),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let healthResponse;
    try {
      const healthPending = server.inject({ method: 'GET', url: '/api/connectors/gcal/health' });
      await refreshStarted;
      const revoked = await server.inject({ method: 'POST', url: '/api/connectors/gcal/revoke' });
      expect(revoked.statusCode).toBe(200);
      releaseRefresh();
      healthResponse = await healthPending;
    } finally {
      releaseRefresh();
      globalThis.fetch = originalFetch;
    }

    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json().status).toBe('error');
    expect(vault.getConnectorCredential('gcal')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sync re-probes health, stamps lastSyncAt in the vault and audits', async () => {
    await server.inject({ method: 'POST', url: '/api/connectors/test-conn/connect', payload: { token: 't' } });

    const res = await server.inject({ method: 'POST', url: '/api/connectors/test-conn/sync' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('connected');
    expect(Date.parse(body.lastSyncAt)).not.toBeNaN();

    // Stamp persisted as a connector sub-key (auto-cleaned on disconnect)
    expect(vault.get('connector:test-conn:lastSync')?.value).toBe(body.lastSyncAt);

    // Audit trail entry for the activity feed
    const audit = auditStore.getByCapability('test-conn');
    expect(audit.some((e) => e.detail.includes('Manual sync'))).toBe(true);
  });

  it('GET /api/connectors enriches the definition with lastSyncAt after a sync', async () => {
    const before = await server.inject({ method: 'GET', url: '/api/connectors' });
    expect(before.json().connectors[0].lastSyncAt).toBeUndefined();

    await server.inject({ method: 'POST', url: '/api/connectors/test-conn/sync' });

    const after = await server.inject({ method: 'GET', url: '/api/connectors' });
    const def = after.json().connectors.find((c: { id: string }) => c.id === 'test-conn');
    expect(Date.parse(def.lastSyncAt)).not.toBeNaN();
    // Existing definition payload intact (category etc. come from toDefinition)
    expect(def.tools).toEqual(['connector_test-conn_read_data']);
  });

  it('sync does NOT stamp lastSyncAt when the probe reports unhealthy (honest ok:false + failed audit)', async () => {
    connector.healthStatus = 'error';
    const res = await server.inject({ method: 'POST', url: '/api/connectors/test-conn/sync' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, connectorId: 'test-conn', status: 'error' });
    // A dead connector must not show "synced just now"
    expect(vault.get('connector:test-conn:lastSync')).toBeNull();
    // The activity feed records the failure, not a successful manual sync
    const audit = auditStore.getByCapability('test-conn');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'failed' });
    expect(audit[0].detail).toContain('error');
  });

  it('GET /api/connectors/:id/health carries lastSyncAt after a sync (typed ConnectorHealth field)', async () => {
    const before = await server.inject({ method: 'GET', url: '/api/connectors/test-conn/health' });
    expect(before.json().lastSyncAt).toBeUndefined();

    const sync = await server.inject({ method: 'POST', url: '/api/connectors/test-conn/sync' });
    const after = await server.inject({ method: 'GET', url: '/api/connectors/test-conn/health' });
    expect(after.statusCode).toBe(200);
    expect(after.json().lastSyncAt).toBe(sync.json().lastSyncAt);
  });

  it('sync 404s on unknown connectors and 502s when the probe throws', async () => {
    const unknown = await server.inject({ method: 'POST', url: '/api/connectors/ghost/sync' });
    expect(unknown.statusCode).toBe(404);

    connector.healthCheck = async () => { throw new Error('boom'); };
    const failed = await server.inject({ method: 'POST', url: '/api/connectors/test-conn/sync' });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().ok).toBe(false);
    // No stamp on a failed probe
    expect(vault.get('connector:test-conn:lastSync')).toBeNull();
  });

  // ── revoke (C17) ─────────────────────────────────────────────────────

  it('revoke purges credentials, sub-keys AND OAuth tokens, then audits', async () => {
    // Seed: connector credential + sub-keys + the oauth.ts-style token keys
    vault.setConnectorCredential('test-conn', { type: 'oauth2', value: 'access-tok', refreshToken: 'refresh-tok' });
    vault.set('connector:test-conn:email', 'a@b.c');
    vault.set('connector:test-conn:lastSync', new Date().toISOString());
    vault.set('test-conn_oauth_token', 'oauth-access', { credentialType: 'oauth2' });
    vault.set('test-conn_oauth_refresh_token', 'oauth-refresh', { credentialType: 'oauth2' });

    const res = await server.inject({ method: 'POST', url: '/api/connectors/test-conn/revoke' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, connectorId: 'test-conn', revoked: true, oauthPurged: 2 });

    // Everything gone: credential, every sub-key, both OAuth tokens
    expect(vault.getConnectorCredential('test-conn')).toBeNull();
    expect(vault.get('connector:test-conn:email')).toBeNull();
    expect(vault.get('connector:test-conn:lastSync')).toBeNull();
    expect(vault.get('connector:test-conn:refresh')).toBeNull();
    expect(vault.get('test-conn_oauth_token')).toBeNull();
    expect(vault.get('test-conn_oauth_refresh_token')).toBeNull();

    // Stronger audit entry than disconnect (which writes none)
    const audit = auditStore.getByCapability('test-conn');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ capability_type: 'connector', action: 'rejected', initiator: 'user' });
    expect(audit[0].detail).toContain('revoked');
  });

  it('revoke maps Google-family connector ids to the google provider token keys (C17)', async () => {
    // gcal/gdrive/gdocs/gmail/gsheets all authenticate via the 'google' OAuth
    // provider — oauth.ts stores google_oauth_token, never gcal_oauth_token.
    // Without the id→provider map the live google token pair survived forever.
    vault.setConnectorCredential('gcal', { type: 'oauth2', value: 'access-tok' });
    vault.set('google_oauth_token', 'g-access', { credentialType: 'oauth2' });
    vault.set('google_oauth_refresh_token', 'g-refresh', { credentialType: 'oauth2' });

    const res = await server.inject({ method: 'POST', url: '/api/connectors/gcal/revoke' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, connectorId: 'gcal', revoked: true, oauthPurged: 2 });

    // The PROVIDER-keyed pair (the actual live tokens) is purged
    expect(vault.get('google_oauth_token')).toBeNull();
    expect(vault.get('google_oauth_refresh_token')).toBeNull();
    expect(vault.getConnectorCredential('gcal')).toBeNull();

    const audit = auditStore.getByCapability('gcal');
    expect(audit).toHaveLength(1);
    expect(audit[0].detail).toContain('via provider "google"');
  });

  it('revoke 404s and writes NO audit row when nothing exists to purge', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/connectors/ghost/revoke' });
    expect(res.statusCode).toBe(404);
    expect(auditStore.getByCapability('ghost')).toHaveLength(0);
  });

  it('disconnect stays the lighter alias: cleans vault keys but writes NO audit entry', async () => {
    vault.setConnectorCredential('test-conn', { type: 'bearer', value: 'tok' });
    vault.set('test-conn_oauth_token', 'oauth-access');

    const res = await server.inject({ method: 'POST', url: '/api/connectors/test-conn/disconnect' });
    expect(res.statusCode).toBe(200);
    expect(res.json().disconnected).toBe(true);

    // Connector keyspace cleaned, but OAuth tokens are NOT purged (revoke-only)
    expect(vault.getConnectorCredential('test-conn')).toBeNull();
    expect(vault.get('test-conn_oauth_token')?.value).toBe('oauth-access');
    expect(auditStore.getByCapability('test-conn')).toHaveLength(0);
  });
});
