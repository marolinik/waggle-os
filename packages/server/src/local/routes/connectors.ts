import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import type { ConnectorHealth } from '@waggle/shared';
import { getCapabilities, parseTier, type Tier } from '@waggle/shared';
import type { RecordAuditInput } from '@waggle/core';
import { JiraConnector, SalesforceConnector } from '@waggle/agent';

/**
 * Tier cap for connecting connectors. All current tiers (Solo + Team) have an
 * unlimited connectorLimit (-1); the gate is retained for any future finite cap.
 * Re-connecting an already-connected connector (token refresh) does NOT
 * count against the cap. Returns the 403 payload data if the cap is exceeded,
 * else null. Pure (no IO) so it is unit-testable.
 */
export function connectorCapExceeded(
  tier: Tier,
  connectedIds: string[],
  id: string,
): { limit: number; current: number } | null {
  const limit = getCapabilities(tier).connectorLimit;
  if (limit <= 0) return null; // unlimited
  if (connectedIds.includes(id)) return null; // already connected — token refresh
  if (connectedIds.length >= limit) return { limit, current: connectedIds.length };
  return null;
}

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
      baseUrl?: string; // Jira Cloud site origin
      instanceUrl?: string; // Salesforce API origin
    };

    const value = body.token ?? body.apiKey;
    if (!value) return reply.code(400).send({ error: 'token or apiKey required' });
    if (id === 'jira' && value.trim() === '') {
      return reply.code(400).send({ error: 'token or apiKey required' });
    }

    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    let salesforceInstanceUrl: string | null = null;
    if (id === 'salesforce') {
      const storedInstanceUrl = fastify.vault.get('connector:salesforce:instance_url')?.value;
      const instanceUrl = body.instanceUrl === undefined ? storedInstanceUrl : body.instanceUrl;
      salesforceInstanceUrl = SalesforceConnector.normalizeInstanceOrigin(instanceUrl);
      if (!salesforceInstanceUrl) {
        return reply.code(400).send({ error: 'Valid Salesforce instanceUrl required' });
      }
    }

    let jiraEmail: string | null = null;
    let jiraBaseUrl: string | null = null;
    if (id === 'jira') {
      const storedEmail = fastify.vault.get('connector:jira:email')?.value;
      jiraEmail = (body.email === undefined ? storedEmail : body.email)?.trim() ?? '';
      if (!jiraEmail) {
        return reply.code(400).send({ error: 'Jira email required' });
      }

      const storedBaseUrl = fastify.vault.get('connector:jira:base_url')?.value;
      const baseUrl = body.baseUrl === undefined ? storedBaseUrl : body.baseUrl;
      jiraBaseUrl = JiraConnector.normalizeSiteOrigin(baseUrl);
      if (!jiraBaseUrl) {
        return reply.code(400).send({ error: 'Valid Jira baseUrl required' });
      }
    }

    // Tier cap — connectors are unlimited on all current tiers (Solo + Team);
    // gate retained for any future finite cap. Count REAL credentialed
    // connections (getDefinitions status==='connected' excludes the always-on
    // mock channels). Marker `error:'TIER_INSUFFICIENT'` so the adapter's tier
    // event + the install store's tier classification light up. Fail-open if the
    // tier read throws (matches the workspace-limit gate).
    try {
      const configPath = join(fastify.localConfig.dataDir, 'config.json');
      const tierRaw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')).tier : '';
      const tier = parseTier(String(tierRaw ?? '')) ?? 'FREE';
      const connectedIds = registry
        ? registry.getDefinitions().filter(d => d.status === 'connected').map(d => d.id)
        : [];
      const cap = connectorCapExceeded(tier, connectedIds, id);
      if (cap) {
        return reply.code(403).send({
          error: 'TIER_INSUFFICIENT',
          required: 'TEAMS',
          actual: tier,
          message: `Connector limit reached for ${tier} (${cap.limit} max). Upgrade to connect more.`,
          limit: cap.limit,
          current: cap.current,
        });
      }
    } catch { /* tier read failed — allow the connect (fail-open) */ }

    const connector = registry?.get(id);
    const authType = connector?.authType ?? 'bearer';

    const credential = {
      type: authType,
      value: id === 'jira' ? value.trim() : value,
      refreshToken: body.refreshToken,
      expiresAt: body.expiresAt,
      scopes: body.scopes,
    };

    if (jiraEmail && jiraBaseUrl) {
      fastify.vault.setConnectorCredentialBundle(id, credential, {
        email: jiraEmail,
        base_url: jiraBaseUrl,
      });
    } else {
      fastify.vault.setConnectorCredential(id, credential);
    }

    if (salesforceInstanceUrl) {
      fastify.vault.set('connector:salesforce:instance_url', salesforceInstanceUrl);
    }

    // Store extra metadata (e.g., email for Jira basic auth)
    if (body.email && id !== 'jira') {
      fastify.vault.set(`connector:${id}:email`, body.email);
    }

    // Re-initialize the connector with the new credentials
    if (registry && !(await registry.hydrate(id))) {
      return reply.code(502).send({ error: 'Connector initialization failed' });
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
    await fastify.connectorRegistry?.hydrate(id);
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
    await fastify.connectorRegistry?.hydrate(id);

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
