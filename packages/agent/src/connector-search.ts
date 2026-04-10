/**
 * Connector Search Tools — give the agent semantic discovery over the
 * MCP connector catalog.
 *
 * Two tools:
 *   - find_connector(query, limit?, category?)
 *       Natural-language search over the 148-entry catalog. Returns ranked
 *       matches with install command, description, and a match score.
 *   - list_connector_categories()
 *       Category breakdown of the catalog. Use this first when the user
 *       asks what kinds of integrations are available.
 *
 * Uses weighted keyword scoring — no LLM calls, no embeddings, zero
 * additional cost. Handles the 90% of queries where the intent is in
 * the words. For the edge cases, the agent can iterate by refining
 * the query or calling list_connector_categories to orient itself.
 */

import { MCP_CATALOG, MCP_CATEGORIES, type McpServer } from '@waggle/shared';
import type { ToolDefinition } from './tools.js';

/**
 * Strip common English suffixes so "automate" also matches "automation",
 * "messages" matches "message", "scenarios" matches "scenario", etc.
 * Not a real stemmer — just enough to bridge the vocabulary gap between
 * user queries and catalog descriptions.
 */
function stem(word: string): string {
  if (word.length < 5) return word;
  for (const suffix of ['ations', 'ation', 'ings', 'ing', 'ies', 'ed', 'es', 's']) {
    if (word.endsWith(suffix)) {
      const base = word.slice(0, -suffix.length);
      if (base.length >= 3) return base;
    }
  }
  return word;
}

/**
 * Domain synonym map — bridges common user vocabulary to the terms our
 * catalog descriptions actually use. Keyed by stemmed query word.
 * Kept deliberately small: each entry must solve a query where the naive
 * substring match misses the obvious answer.
 */
const SYNONYMS: Record<string, string[]> = {
  chat: ['message', 'channel', 'communication'],
  messag: ['chat', 'channel', 'send'],
  automat: ['workflow', 'scenario', 'trigger', 'webhook'],
  workflow: ['scenario', 'trigger', 'automat'],
  crm: ['salesforce', 'hubspot', 'customer', 'contact', 'deal'],
  db: ['database', 'query', 'schema'],
  auth: ['identity', 'sso', 'token', 'oauth'],
  payment: ['subscription', 'invoice', 'checkout', 'billing'],
  invoice: ['billing', 'subscription', 'payment'],
  analytic: ['metric', 'event', 'report', 'funnel'],
  metric: ['analytic', 'event', 'monitor'],
  monitor: ['metric', 'alert', 'observability'],
  log: ['observability', 'trace', 'monitor'],
  task: ['issue', 'ticket', 'project'],
  issue: ['task', 'ticket', 'bug'],
  note: ['document', 'page', 'wiki'],
  document: ['page', 'file', 'note'],
  email: ['send', 'inbox', 'mail'],
  sms: ['send', 'text', 'twilio'],
  voice: ['call', 'speech', 'audio'],
  vector: ['embedding', 'search', 'similarity'],
  embedding: ['vector', 'search'],
  scrap: ['crawl', 'extract', 'fetch'],
  crawl: ['scrap', 'fetch', 'extract'],
};

/**
 * Build the expanded word set for a query: the original words, their
 * stems, and any synonym expansions. Uses a Set so duplicates don't
 * double-score.
 */
function expandQueryWords(words: string[]): string[] {
  const expanded = new Set<string>();
  for (const word of words) {
    if (word.length < 3) continue;
    expanded.add(word);
    const stemmed = stem(word);
    if (stemmed !== word && stemmed.length >= 3) expanded.add(stemmed);
    for (const syn of SYNONYMS[stemmed] ?? SYNONYMS[word] ?? []) {
      expanded.add(syn);
    }
  }
  return [...expanded];
}

/**
 * Score a catalog entry against a natural-language query.
 * Higher = better match. Zero means no signal.
 *
 * Scoring weights (tuned to rank exact-name hits above thematic hits):
 *   name exact      → 20
 *   name includes   → 10
 *   id includes     →  8
 *   category match  →  6  (e.g. "database" surfaces all DB entries)
 *   description     →  5
 *   capability      →  3 each (max 3 hits counted)
 *   per-word bonus  →  1-3 depending on where the word lands
 *
 * Expanded words (stems + synonyms) only score at half weight so the
 * original user vocabulary always wins ties.
 */
function scoreEntry(server: McpServer, query: string, words: string[]): number {
  let score = 0;
  const name = server.name.toLowerCase();
  const id = server.id.toLowerCase();
  const desc = server.description.toLowerCase();
  const cat = server.category.toLowerCase();

  // Whole-query phrase signals
  if (name === query) score += 20;
  else if (name.includes(query)) score += 10;
  if (id.includes(query)) score += 8;
  if (cat === query || cat.includes(query)) score += 6;
  if (desc.includes(query)) score += 5;

  const originalWords = new Set(words);
  const allWords = expandQueryWords(words);

  let capabilityHits = 0;
  for (const word of allWords) {
    if (word.length < 3) continue;
    const isOriginal = originalWords.has(word);
    // Expanded (stem/synonym) hits score at half so originals always rank higher.
    const mul = isOriginal ? 1 : 0.5;
    if (name.includes(word)) score += 3 * mul;
    if (id.includes(word)) score += 2 * mul;
    if (desc.includes(word)) score += 2 * mul;
    if (cat.includes(word)) score += 1 * mul;
    for (const capability of server.capabilities) {
      if (capabilityHits >= 3) break;
      if (capability.toLowerCase().includes(word)) {
        score += 3 * mul;
        capabilityHits++;
      }
    }
  }

  return score;
}

/** Human-readable compact view of a catalog entry for tool output. */
function formatMatch(server: McpServer, score: number) {
  return {
    id: server.id,
    name: server.name,
    category: server.category,
    description: server.description,
    capabilities: server.capabilities,
    installCmd: server.installCmd,
    url: server.url,
    official: server.official ?? false,
    matchScore: score,
  };
}

export function createConnectorSearchTools(): ToolDefinition[] {
  return [
    {
      name: 'find_connector',
      description: [
        'Search the MCP connector catalog by natural-language query to find integrations the user can connect.',
        'Returns ranked matches with name, category, description, install command, and a match score.',
        'Use this whenever the user mentions connecting, integrating, or plugging in a service — even vaguely.',
        'Examples:',
        '  query="project management" → Linear, Jira, Asana, ClickUp, Todoist...',
        '  query="team chat" → Slack, Discord, Microsoft Teams, Telegram...',
        '  query="postgres" → PostgreSQL, Neon, Supabase, PlanetScale...',
        '  query="analytics" → PostHog, Mixpanel, Amplitude, Google Analytics, Plausible...',
      ].join(' '),
      parameters: {
        type: 'object' as const,
        required: ['query'],
        properties: {
          query: {
            type: 'string' as const,
            description: 'Natural-language description of the integration the user needs.',
          },
          limit: {
            type: 'number' as const,
            description: 'Maximum matches to return. Default 10, capped at 30.',
          },
          category: {
            type: 'string' as const,
            description: `Optional category filter. One of: ${MCP_CATEGORIES.join(', ')}`,
          },
        },
      },
      offlineCapable: true,
      execute: async (args: Record<string, unknown>) => {
        const rawQuery = String(args.query ?? '').trim();
        if (!rawQuery) {
          return JSON.stringify({
            error: 'query is required',
            hint: 'Pass a short description of the integration the user wants.',
          });
        }
        const query = rawQuery.toLowerCase();
        const words = query.split(/[^a-z0-9]+/).filter(Boolean);
        const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
        const categoryFilter = typeof args.category === 'string' ? args.category : undefined;

        const scored: Array<{ server: McpServer; score: number }> = [];
        for (const server of MCP_CATALOG) {
          if (categoryFilter && server.category !== categoryFilter) continue;
          const score = scoreEntry(server, query, words);
          if (score > 0) scored.push({ server, score });
        }
        scored.sort((a, b) => b.score - a.score);
        const matches = scored.slice(0, limit);

        if (matches.length === 0) {
          const categoriesList = MCP_CATEGORIES.join(', ');
          return JSON.stringify({
            query: rawQuery,
            matchCount: 0,
            hint: `No matches. Try broader terms, or filter by category. Available categories: ${categoriesList}. Call list_connector_categories for counts.`,
          });
        }

        return JSON.stringify({
          query: rawQuery,
          catalogSize: MCP_CATALOG.length,
          matchCount: matches.length,
          matches: matches.map(({ server, score }) => formatMatch(server, score)),
        });
      },
    },

    {
      name: 'list_connector_categories',
      description: [
        'List every MCP connector category with the number of servers in each.',
        'Use this first when the user asks what kinds of integrations are available',
        'or wants to browse by type rather than search for a specific tool.',
      ].join(' '),
      parameters: {
        type: 'object' as const,
        required: [],
        properties: {},
      },
      offlineCapable: true,
      execute: async () => {
        const counts = new Map<string, number>();
        for (const server of MCP_CATALOG) {
          counts.set(server.category, (counts.get(server.category) ?? 0) + 1);
        }
        const categories = [...counts.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([category, count]) => ({ category, count }));
        const officialCount = MCP_CATALOG.filter((s) => s.official).length;
        return JSON.stringify({
          totalServers: MCP_CATALOG.length,
          officialServers: officialCount,
          categoryCount: categories.length,
          categories,
        });
      },
    },
  ];
}
