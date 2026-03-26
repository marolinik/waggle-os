/**
 * Vault REST API Routes — manage encrypted secrets (API keys, tokens).
 *
 * Endpoints:
 *   GET    /api/vault              — list all secrets (names + types, NO values)
 *   POST   /api/vault              — add or update a secret
 *   DELETE /api/vault/:name        — delete a secret
 *   POST   /api/vault/:name/reveal — decrypt and return the full value
 *
 * Part of Vault Management — encrypted secret storage for Solo/Pro.
 */

import type { FastifyInstance } from 'fastify';

/** Well-known API key names for auto-detection and setup hints. */
const COMMON_KEYS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'TAVILY_API_KEY', 'BRAVE_API_KEY',
  'GOOGLE_API_KEY', 'GITHUB_TOKEN', 'SLACK_BOT_TOKEN', 'JIRA_API_TOKEN',
  'SENDGRID_API_KEY', 'GOOGLE_CALENDAR_TOKEN',
];

export async function vaultRoutes(fastify: FastifyInstance) {
  // GET /api/vault — list all secrets (names, types, dates — NO values)
  fastify.get('/api/vault', async (_request, reply) => {
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    const entries = fastify.vault.list();
    const existingNames = new Set(entries.map(e => e.name));

    const secrets = entries.map(entry => ({
      name: entry.name,
      type: (entry.metadata?.credentialType as string) ?? 'api_key',
      updatedAt: entry.updatedAt,
      isCommon: COMMON_KEYS.includes(entry.name),
    }));

    const suggestedKeys = COMMON_KEYS.filter(k => !existingNames.has(k));

    return { secrets, suggestedKeys };
  });

  // POST /api/vault — add or update a secret
  fastify.post('/api/vault', async (request, reply) => {
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    const { name, value, type } = (request.body ?? {}) as {
      name?: string;
      value?: string;
      type?: string;
    };

    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'name is required' });
    }
    if (!value || typeof value !== 'string') {
      return reply.code(400).send({ error: 'value is required' });
    }

    fastify.vault.set(name, value, type ? { credentialType: type } : undefined);

    return { success: true, name };
  });

  // DELETE /api/vault/:name — delete a secret
  fastify.delete('/api/vault/:name', async (request, reply) => {
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    const { name } = request.params as { name: string };
    const deleted = fastify.vault.delete(name);

    return { deleted, name };
  });

  // POST /api/vault/:name/reveal — decrypt and return the full value
  // Security: same-origin enforcement — reject requests from external origins
  fastify.post('/api/vault/:name/reveal', async (request, reply) => {
    if (!fastify.vault) return reply.code(503).send({ error: 'Vault not available' });

    // Same-origin check: only allow requests from the local app
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    if (origin && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost') && !origin.startsWith('tauri://')) {
      return reply.code(403).send({ error: 'Forbidden: external origin not allowed for vault reveal' });
    }
    if (!origin && referer && !referer.startsWith('http://127.0.0.1') && !referer.startsWith('http://localhost') && !referer.startsWith('tauri://')) {
      return reply.code(403).send({ error: 'Forbidden: external origin not allowed for vault reveal' });
    }

    const { name } = request.params as { name: string };
    const entry = fastify.vault.get(name);

    if (!entry) {
      return reply.code(404).send({ error: 'Secret not found' });
    }

    return {
      name: entry.name,
      value: entry.value,
      type: (entry.metadata?.credentialType as string) ?? 'api_key',
    };
  });
}
