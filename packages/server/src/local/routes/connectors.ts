import type { FastifyInstance } from 'fastify';
import type { ConnectorHealth } from '@waggle/shared';

export async function connectorRoutes(fastify: FastifyInstance) {
  // GET /api/connectors — list all connectors with live status from registry
  fastify.get('/api/connectors', async () => {
    const registry = (fastify as any).connectorRegistry;
    if (registry) {
      return { connectors: registry.getDefinitions() };
    }
    // Fallback: no registry (shouldn't happen in production)
    return { connectors: [] };
  });

  // GET /api/connectors/:id/health — delegate to registry healthCheck
  fastify.get('/api/connectors/:id/health', async (request, reply) => {
    const { id } = request.params as { id: string };
    const registry = (fastify as any).connectorRegistry;

    if (registry) {
      const health = await registry.healthCheck(id);
      if (!health) return reply.code(404).send({ error: 'Connector not found' });
      return health;
    }

    // Fallback: basic health without registry
    const cred = fastify.vault?.getConnectorCredential(id);
    const health: ConnectorHealth = {
      id,
      name: id,
      status: cred ? (cred.isExpired ? 'expired' : 'connected') : 'disconnected',
      lastChecked: new Date().toISOString(),
      tokenExpiresAt: cred?.expiresAt,
    };
    return health;
  });

  // POST /api/connectors/:id/connect — store credentials in vault
  fastify.post('/api/connectors/:id/connect', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify the connector exists in the registry
    const registry = (fastify as any).connectorRegistry;
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

    return { connected: true, connectorId: id };
  });

  // POST /api/connectors/:id/disconnect — remove credentials from vault
  fastify.post('/api/connectors/:id/disconnect', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    // Delete primary credential and all sub-keys (email, base_url, client_id, client_secret)
    const deleted = fastify.vault.delete(`connector:${id}`);
    const subKeys = fastify.vault.list()
      .filter((e: { name: string }) => e.name.startsWith(`connector:${id}:`))
      .map((e: { name: string }) => e.name);
    for (const key of subKeys) {
      fastify.vault.delete(key);
    }
    return { disconnected: deleted, connectorId: id, cleanedKeys: subKeys.length };
  });
}
