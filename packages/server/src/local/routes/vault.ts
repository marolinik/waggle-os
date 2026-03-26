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

/** Well-known secret names grouped by category for UI hints. */
const SUGGESTED_SECRETS: { category: string; items: { name: string; type: string; label: string }[] }[] = [
  {
    category: 'LLM Providers',
    items: [
      { name: 'anthropic', type: 'api_key', label: 'Anthropic API Key' },
      { name: 'openai', type: 'api_key', label: 'OpenAI API Key' },
      { name: 'google', type: 'api_key', label: 'Google AI API Key' },
      { name: 'mistral', type: 'api_key', label: 'Mistral API Key' },
      { name: 'deepseek', type: 'api_key', label: 'DeepSeek API Key' },
      { name: 'xai', type: 'api_key', label: 'xAI (Grok) API Key' },
      { name: 'alibaba', type: 'api_key', label: 'Alibaba / Qwen API Key' },
      { name: 'minimax', type: 'api_key', label: 'MiniMax API Key' },
      { name: 'zhipu', type: 'api_key', label: 'GLM / Zhipu API Key' },
      { name: 'openrouter', type: 'api_key', label: 'OpenRouter API Key' },
    ],
  },
  {
    category: 'Search & Tools',
    items: [
      { name: 'perplexity', type: 'api_key', label: 'Perplexity API Key (Search + LLM)' },
      { name: 'moonshot', type: 'api_key', label: 'Kimi / Moonshot API Key' },
      { name: 'TAVILY_API_KEY', type: 'api_key', label: 'Tavily Search API Key' },
      { name: 'BRAVE_API_KEY', type: 'api_key', label: 'Brave Search API Key' },
      { name: 'COMPOSIO_API_KEY', type: 'api_key', label: 'Composio API Key (250+ integrations)' },
    ],
  },
  {
    category: 'Code & DevOps',
    items: [
      { name: 'GITHUB_TOKEN', type: 'bearer', label: 'GitHub Personal Access Token' },
      { name: 'GITLAB_TOKEN', type: 'bearer', label: 'GitLab Access Token' },
      { name: 'BITBUCKET_TOKEN', type: 'bearer', label: 'Bitbucket App Password' },
    ],
  },
  {
    category: 'Communication',
    items: [
      { name: 'SLACK_BOT_TOKEN', type: 'bearer', label: 'Slack Bot Token' },
      { name: 'DISCORD_BOT_TOKEN', type: 'bearer', label: 'Discord Bot Token' },
      { name: 'SENDGRID_API_KEY', type: 'api_key', label: 'SendGrid API Key' },
      { name: 'TEAMS_WEBHOOK_URL', type: 'bearer', label: 'Microsoft Teams Webhook' },
    ],
  },
  {
    category: 'Productivity',
    items: [
      { name: 'NOTION_TOKEN', type: 'bearer', label: 'Notion Integration Token' },
      { name: 'JIRA_API_TOKEN', type: 'basic', label: 'Jira API Token' },
      { name: 'LINEAR_API_KEY', type: 'api_key', label: 'Linear API Key' },
      { name: 'ASANA_TOKEN', type: 'bearer', label: 'Asana Personal Access Token' },
      { name: 'GOOGLE_CALENDAR_TOKEN', type: 'bearer', label: 'Google Calendar Token' },
    ],
  },
  {
    category: 'CRM & Sales',
    items: [
      { name: 'SALESFORCE_TOKEN', type: 'bearer', label: 'Salesforce Access Token' },
      { name: 'HUBSPOT_API_KEY', type: 'api_key', label: 'HubSpot API Key' },
      { name: 'PIPEDRIVE_API_KEY', type: 'api_key', label: 'Pipedrive API Key' },
    ],
  },
  {
    category: 'Cloud & Storage',
    items: [
      { name: 'AWS_ACCESS_KEY_ID', type: 'api_key', label: 'AWS Access Key ID' },
      { name: 'AWS_SECRET_ACCESS_KEY', type: 'api_key', label: 'AWS Secret Access Key' },
      { name: 'DROPBOX_TOKEN', type: 'bearer', label: 'Dropbox Access Token' },
    ],
  },
  {
    category: 'User Credentials',
    items: [
      { name: 'JIRA_EMAIL', type: 'basic', label: 'Jira Email (for Basic Auth)' },
    ],
  },
];

/** Flat list of all suggested secret names */
const COMMON_KEYS = SUGGESTED_SECRETS.flatMap(c => c.items.map(i => i.name));

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

    // Categorized suggestions with labels (for dropdown UI)
    const suggestedSecrets = SUGGESTED_SECRETS.map(cat => ({
      category: cat.category,
      items: cat.items.filter(i => !existingNames.has(i.name)),
    })).filter(cat => cat.items.length > 0);

    return { secrets, suggestedKeys, suggestedSecrets };
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
