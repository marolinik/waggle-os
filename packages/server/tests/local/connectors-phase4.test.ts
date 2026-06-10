/**
 * Connector Hub Phase-4 extensions (S07/S14): sync (C16), revoke (C17),
 * connect-audit, and the GET /api/connectors lastSyncAt enrichment.
 *
 * Real VaultStore in a tmpdir + real ConnectorRegistry with a BaseConnector
 * fake + real InstallAuditStore over MindDB(':memory:'), real route plugin,
 * server.inject — same harness style as the Phase-3 suites.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, InstallAuditStore, VaultStore } from '@waggle/core';
import { ConnectorRegistry, BaseConnector, type ConnectorAction, type ConnectorResult } from '@waggle/agent';
import type { ConnectorHealth } from '@waggle/shared';
import { connectorRoutes } from '../../src/local/routes/connectors.js';

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
  async connect(): Promise<void> { /* no-op */ }
  async healthCheck(): Promise<ConnectorHealth> {
    return { id: this.id, name: this.name, status: this.healthStatus, lastChecked: new Date().toISOString() };
  }
  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
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
    const res = await server.inject({
      method: 'POST', url: '/api/connectors/test-conn/connect',
      payload: { token: 'tok-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ connected: true, connectorId: 'test-conn' });

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

  // ── sync (C16) ───────────────────────────────────────────────────────

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
