import { describe, it, expect } from 'vitest';
import { createConnectorSearchTools } from '../src/connector-search.js';

// Isolated smoke test for the find_connector agent tool. Catches regressions
// in ranking, synonym expansion, category filtering, and category listing —
// the four guarantees the agent relies on when routing natural-language
// integration requests into the 148-entry MCP catalog.

interface SearchPayload {
  query: string;
  catalogSize: number;
  matchCount: number;
  matches: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    capabilities: string[];
    installCmd: string;
    url: string;
    official: boolean;
    matchScore: number;
  }>;
}

interface CategoriesPayload {
  totalServers: number;
  officialServers: number;
  categoryCount: number;
  categories: Array<{ category: string; count: number }>;
}

async function search(query: string, extras: Record<string, unknown> = {}): Promise<SearchPayload> {
  const [findConnector] = createConnectorSearchTools();
  const raw = await findConnector.execute({ query, ...extras });
  return JSON.parse(raw) as SearchPayload;
}

describe('find_connector', () => {
  it('exposes both tools with offlineCapable = true', () => {
    const tools = createConnectorSearchTools();
    expect(tools.map(t => t.name)).toEqual([
      'find_connector',
      'list_connector_categories',
    ]);
    for (const tool of tools) {
      expect(tool.offlineCapable).toBe(true);
    }
  });

  it('ranks exact-name matches above thematic matches', async () => {
    const result = await search('postgres');
    expect(result.matchCount).toBeGreaterThan(0);
    const top = result.matches[0];
    const topId = top.id.toLowerCase();
    const topName = top.name.toLowerCase();
    expect(topId.includes('postgres') || topName.includes('postgres')).toBe(true);
  });

  it('handles multi-word natural-language queries (project management)', async () => {
    const result = await search('project management tool');
    expect(result.matchCount).toBeGreaterThan(0);
    const topIds = result.matches.slice(0, 5).map(m => m.id.toLowerCase());
    // At least one of the top 5 should be a well-known PM tool.
    const knownPmTools = ['linear', 'jira', 'asana', 'clickup', 'monday', 'todoist', 'notion'];
    const hit = topIds.some(id => knownPmTools.some(tool => id.includes(tool)));
    expect(hit).toBe(true);
  });

  it('resolves chat synonyms to messaging platforms', async () => {
    const result = await search('team chat');
    expect(result.matchCount).toBeGreaterThan(0);
    const topIds = result.matches.slice(0, 5).map(m => m.id.toLowerCase());
    const knownChatTools = ['slack', 'discord', 'teams', 'telegram', 'mattermost'];
    const hit = topIds.some(id => knownChatTools.some(tool => id.includes(tool)));
    expect(hit).toBe(true);
  });

  it('respects the limit cap (30) and default (10)', async () => {
    const defaultResult = await search('database');
    expect(defaultResult.matches.length).toBeLessThanOrEqual(10);

    const cappedResult = await search('database', { limit: 500 });
    expect(cappedResult.matches.length).toBeLessThanOrEqual(30);
  });

  it('filters by category when provided', async () => {
    // Use an unfiltered search to discover a category that definitely
    // contains matches for the query, then re-run with that category filter.
    // This avoids flakiness if a random top-populated category has zero
    // string hits against our test query.
    const unfiltered = await search('postgres');
    expect(unfiltered.matchCount).toBeGreaterThan(0);
    const pickCategory = unfiltered.matches[0].category;

    const filtered = await search('postgres', { category: pickCategory });
    expect(filtered.matchCount).toBeGreaterThan(0);
    expect(filtered.matches).toBeDefined();
    for (const match of filtered.matches) {
      expect(match.category).toBe(pickCategory);
    }
  });

  it('returns a helpful hint when no matches are found', async () => {
    const result = await search('zzzzzzzzzzzzzzzzzzzz') as SearchPayload & { hint?: string };
    expect(result.matchCount).toBe(0);
    expect(result.hint).toBeTruthy();
  });

  it('rejects empty queries with a clear error', async () => {
    const [findConnector] = createConnectorSearchTools();
    const raw = await findConnector.execute({ query: '   ' });
    const parsed = JSON.parse(raw) as { error?: string };
    expect(parsed.error).toBeTruthy();
  });
});

describe('list_connector_categories', () => {
  it('returns total server count, official count, and sorted categories', async () => {
    const [, listCats] = createConnectorSearchTools();
    const payload = JSON.parse(await listCats.execute({})) as CategoriesPayload;

    expect(payload.totalServers).toBeGreaterThan(100);
    expect(payload.officialServers).toBeGreaterThanOrEqual(0);
    expect(payload.categoryCount).toBe(payload.categories.length);

    // Categories should be sorted by count descending.
    for (let i = 1; i < payload.categories.length; i++) {
      expect(payload.categories[i - 1].count).toBeGreaterThanOrEqual(
        payload.categories[i].count,
      );
    }
  });
});
