import type { FastifyInstance } from 'fastify';
import type { ConnectorHealth } from '@waggle/shared';
import type { RecordAuditInput } from '@waggle/core';

/** Vault sub-key holding the C16 manual-sync stamp. Matches the
 *  `connector:{id}:*` prefix so disconnect/revoke auto-clean it. */
const lastSyncKey = (id: string) => `connector:${id}:lastSync`;

/**
 * Connector id → oauth.ts provider key. oauth.ts stores tokens under
 * `${provider}_oauth_token` / `${provider}_oauth_refresh_token` keyed by the
 * OAUTH PROVIDER (github | slack | google | notion | jira), NOT the connector
 * id — the Google provider serves five connectors whose ids all differ from
 * the provider key. Every other connector id equals its provider key.
 */
const OAUTH_PROVIDER_FOR_CONNECTOR: Record<string, string> = {
  gcal: 'google',
  gdrive: 'google',
  gdocs: 'google',
  gmail: 'google',
  gsheets: 'google',
};
const oauthProviderFor = (id: string) => OAUTH_PROVIDER_FOR_CONNECTOR[id] ?? id;

export async function connectorRoutes(fastify: FastifyInstance) {
  /** Install-audit write — non-blocking like every other auditStore caller. */
  function recordConnectorAudit(input: Omit<RecordAuditInput, 'capabilityType' | 'source'>): void {
    try {
      fastify.auditStore?.record({ ...input, capabilityType: 'connector', source: 'connector' });
    } catch (err) {
      fastify.log.warn({ err, capability: input.capabilityName }, 'connector install-audit write failed');
    }
  }

  // GET /api/connectors — list all connectors with live status from registry.
  // Phase 4 (S07): payload enriched with lastSyncAt (category/tools/etc. are
  // already emitted by toDefinition()).
  fastify.get('/api/connectors', async () => {
    const registry = fastify.connectorRegistry;
    if (registry) {
      const connectors = registry.getDefinitions().map((def) => {
        const lastSyncAt = fastify.vault?.get(lastSyncKey(def.id))?.value;
        return lastSyncAt ? { ...def, lastSyncAt } : def;
      });
      return { connectors };
    }
    // Fallback: no registry (shouldn't happen in production)
    return { connectors: [] };
  });

  // GET /api/connectors/:id/health — delegate to registry healthCheck
  fastify.get('/api/connectors/:id/health', async (request, reply) => {
    const { id } = request.params as { id: string };
    const registry = fastify.connectorRegistry;

    if (registry) {
      try {
        const health = await registry.healthCheck(id);
        if (!health) return reply.code(404).send({ error: 'Connector not found' });
        // Merge the C16 manual-sync stamp so the typed ConnectorHealth field
        // is real on the route the adapter's getConnectorHealth() calls.
        const lastSyncAt = fastify.vault?.get(lastSyncKey(id))?.value;
        return lastSyncAt ? { ...health, lastSyncAt } : health;
      } catch (err) {
        // A throwing connector probe must degrade gracefully — never an
        // unhandled 500 that echoes the raw error (which can leak secrets,
        // internal hostnames, or stack traces). Log the detail server-side
        // and return a sanitized structured degraded status.
        fastify.log.error({ err, connectorId: id }, 'Connector health probe threw');
        const degraded: ConnectorHealth = {
          id,
          name: id,
          status: 'error',
          lastChecked: new Date().toISOString(),
          error: 'Health check failed',
        };
        return reply.code(502).send(degraded);
      }
    }

    // Fallback: basic health without registry
    const cred = fastify.vault?.getConnectorCredential(id);
    const lastSyncAt = fastify.vault?.get(lastSyncKey(id))?.value;
    const health: ConnectorHealth = {
      id,
      name: id,
      status: cred ? (cred.isExpired ? 'expired' : 'connected') : 'disconnected',
      lastChecked: new Date().toISOString(),
      tokenExpiresAt: cred?.expiresAt,
      ...(lastSyncAt ? { lastSyncAt } : {}),
    };
    return health;
  });

  // POST /api/connectors/:id/connect — store credentials in vault
  fastify.post('/api/connectors/:id/connect', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify the connector exists in the registry
    const registry = fastify.connectorRegistry;
    if (registry && !registry.get(id)) {
      return reply.code(404).send({ error: 'Connector not found' });
    }

    const body = request.body as {
      token?: string;
      apiKey?: string;
      refreshToken?: string;
      expiresAt?: string;
      scopes?: string[];
      email?: string; // For Jira (basic auth)
    };

    const value = body.token ?? body.apiKey;
    if (!value) return reply.code(400).send({ error: 'token or apiKey required' });

    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    const connector = registry?.get(id);
    const authType = connector?.authType ?? 'bearer';

    fastify.vault.setConnectorCredential(id, {
      type: authType,
      value,
      refreshToken: body.refreshToken,
      expiresAt: body.expiresAt,
      scopes: body.scopes,
    });

    // Store extra metadata (e.g., email for Jira basic auth)
    if (body.email) {
      fastify.vault.set(`connector:${id}:email`, body.email);
    }

    // Re-initialize the connector with the new credentials
    if (connector) {
      try {
        await connector.connect(fastify.vault);
      } catch {
        // Connection failure after credential storage is non-fatal
      }
    }

    // Phase 4 (S07): connect now leaves an install-audit trail entry.
    recordConnectorAudit({
      capabilityName: id,
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'installed',
      initiator: 'user',
      detail: `Connector credentials stored (authType=${authType})`,
    });

    return { connected: true, connectorId: id };
  });

  /** Shared credential cleanup for disconnect (light) and revoke (C17). */
  function deleteConnectorCredentials(id: string): { deleted: boolean; cleanedKeys: number } {
    // Delete primary credential and all sub-keys (email, base_url, client_id,
    // client_secret, lastSync)
    const deleted = fastify.vault!.delete(`connector:${id}`);
    const subKeys = fastify.vault!.list()
      .filter((e: { name: string }) => e.name.startsWith(`connector:${id}:`))
      .map((e: { name: string }) => e.name);
    for (const key of subKeys) {
      fastify.vault!.delete(key);
    }
    return { deleted, cleanedKeys: subKeys.length };
  }

  // POST /api/connectors/:id/disconnect — remove credentials from vault
  fastify.post('/api/connectors/:id/disconnect', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    const { deleted, cleanedKeys } = deleteConnectorCredentials(id);
    return { disconnected: deleted, connectorId: id, cleanedKeys };
  });

  // POST /api/connectors/:id/sync — C16 ratified v1: re-probe health + stamp
  // lastSyncAt. NO background data re-pull (the connector SDK has no sync();
  // the real data-pull is a scheduled SDK addition — see Phase-4 plan caveat C1).
  fastify.post('/api/connectors/:id/sync', async (request, reply) => {
    const { id } = request.params as { id: string };
    const registry = fastify.connectorRegistry;
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });
    if (registry && !registry.get(id)) {
      return reply.code(404).send({ error: 'Connector not found' });
    }

    let health: ConnectorHealth | null = null;
    if (registry) {
      try {
        health = await registry.healthCheck(id);
      } catch (err) {
        fastify.log.error({ err, connectorId: id }, 'Connector sync health probe threw');
        return reply.code(502).send({ ok: false, connectorId: id, error: 'Health check failed' });
      }
    }

    // An unhealthy probe is NOT a successful sync: no lastSyncAt stamp (a dead
    // connector must not show "synced just now"), audit as 'failed', ok:false.
    if (health && health.status !== 'connected') {
      recordConnectorAudit({
        capabilityName: id,
        riskLevel: 'low',
        trustSource: 'local_user',
        approvalClass: 'standard',
        action: 'failed',
        initiator: 'user',
        detail: `Manual sync failed — health status: ${health.status}`,
      });
      return { ok: false, connectorId: id, status: health.status };
    }

    const lastSyncAt = new Date().toISOString();
    fastify.vault.set(lastSyncKey(id), lastSyncAt);

    // Activity trail: the shared Extend audit feed (GET /api/extend/audit
    // ?type=connector) is backed by install_audit, whose action vocabulary has
    // no "synced" — 'approved' is the closest in-vocabulary verb (flagged in
    // the Phase-4 handoff; widening AuditAction is a contract change we did
    // not ratify).
    recordConnectorAudit({
      capabilityName: id,
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'approved',
      initiator: 'user',
      detail: `Manual sync — health status: ${health?.status ?? 'unknown'}`,
    });

    return { ok: true, connectorId: id, lastSyncAt, status: health?.status ?? 'unknown' };
  });

  // POST /api/connectors/:id/revoke — C17 ratified: the STRONG variant of
  // disconnect. Purges the connector credential, every connector:{id}:* sub-key
  // AND the OAuth token entries the oauth.ts callback stores under
  // `${provider}_oauth_token` (which the connector keyspace never covered),
  // then writes a stronger audit entry. disconnect stays the lighter alias.
  fastify.post('/api/connectors/:id/revoke', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    const { deleted, cleanedKeys } = deleteConnectorCredentials(id);

    // OAuth token purge (oauth.ts stores these outside the connector keyspace,
    // keyed by PROVIDER — see oauthProviderFor). Shared-provider semantics:
    // revoking ANY Google-family connector purges the shared google token pair
    // even if sibling connectors (gcal/gdrive/...) are still connected —
    // revoke is the deliberate strong path; siblings just need a reconnect.
    const provider = oauthProviderFor(id);
    let oauthPurged = 0;
    for (const key of [`${provider}_oauth_token`, `${provider}_oauth_refresh_token`]) {
      if (fastify.vault.delete(key)) oauthPurged++;
    }

    // Nothing existed under this id (or its provider): no audit row for a
    // revocation that revoked nothing, and an honest 404.
    if (!deleted && cleanedKeys === 0 && oauthPurged === 0) {
      return reply.code(404).send({ error: `No credentials found for connector "${id}"` });
    }

    recordConnectorAudit({
      capabilityName: id,
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'rejected',
      initiator: 'user',
      detail: `Access revoked — credentials purged (${cleanedKeys} sub-key(s), ${oauthPurged} OAuth token(s)`
        + `${provider !== id ? ` via provider "${provider}"` : ''})`,
    });

    return { ok: true, connectorId: id, revoked: deleted || oauthPurged > 0, cleanedKeys, oauthPurged };
  });
}
