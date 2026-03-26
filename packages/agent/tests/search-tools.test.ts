import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSearchTools, tavilyLimiter, braveLimiter } from '../src/search-tools.js';
import type { ToolDefinition } from '../src/tools.js';

describe('Search Tools', () => {
  let tools: ToolDefinition[];
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let vaultFetch: ReturnType<typeof vi.fn>;

  function getTool(name: string): ToolDefinition {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    vaultFetch = vi.fn();
    tools = createSearchTools(vaultFetch);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    tavilyLimiter.reset();
    braveLimiter.reset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Tool registration ─────────────────────────────────────────────────

  it('creates 2 search tools', () => {
    expect(tools).toHaveLength(2);
    const names = tools.map(t => t.name);
    expect(names).toContain('tavily_search');
    expect(names).toContain('brave_search');
  });

  // ── tavily_search ─────────────────────────────────────────────────────

  describe('tavily_search', () => {
    it('returns helpful message when no API key configured', async () => {
      vaultFetch.mockResolvedValue(null);

      const tool = getTool('tavily_search');
      const result = await tool.execute({ query: 'test query' });

      expect(result).toContain('Tavily API key not configured');
      expect(result).toContain('TAVILY_API_KEY');
      expect(result).toContain('Settings > Vault');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('formats results correctly', async () => {
      vaultFetch.mockResolvedValue('tvly-test-key');
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              { title: 'Result One', url: 'https://example.com/1', content: 'First result snippet' },
              { title: 'Result Two', url: 'https://example.com/2', content: 'Second result snippet' },
            ],
          }),
          { status: 200 },
        ),
      );

      const tool = getTool('tavily_search');
      const result = await tool.execute({ query: 'test query' });

      expect(result).toContain('[1] Result One');
      expect(result).toContain('https://example.com/1');
      expect(result).toContain('First result snippet');
      expect(result).toContain('[2] Result Two');
      expect(result).toContain('https://example.com/2');
    });

    it('passes search_depth and max_results to API', async () => {
      vaultFetch.mockResolvedValue('tvly-test-key');
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );

      const tool = getTool('tavily_search');
      await tool.execute({ query: 'deep search', search_depth: 'advanced', max_results: 3 });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"search_depth":"advanced"'),
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
      expect(body.max_results).toBe(3);
      expect(body.api_key).toBe('tvly-test-key');
    });

    it('enforces daily rate limit — 51st call returns quota message', async () => {
      vaultFetch.mockResolvedValue('tvly-test-key');
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );

      const tool = getTool('tavily_search');

      // Exhaust the 50-call limit
      for (let i = 0; i < 50; i++) {
        await tool.execute({ query: `query ${i}` });
      }

      // 51st call should be rate-limited
      const result = await tool.execute({ query: 'one too many' });
      expect(result).toContain('Tavily daily quota reached');
      expect(result).toContain('web_search');

      // fetch should have been called 50 times (not 51 — the last was rate-limited)
      expect(fetchSpy).toHaveBeenCalledTimes(50);
    });

    it('handles API error responses', async () => {
      vaultFetch.mockResolvedValue('tvly-test-key');
      fetchSpy.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      const tool = getTool('tavily_search');
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain('Tavily search failed');
      expect(result).toContain('401');
    });

    it('handles empty results', async () => {
      vaultFetch.mockResolvedValue('tvly-test-key');
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );

      const tool = getTool('tavily_search');
      const result = await tool.execute({ query: 'obscure query' });

      expect(result).toBe('No search results found.');
    });
  });

  // ── brave_search ──────────────────────────────────────────────────────

  describe('brave_search', () => {
    it('returns helpful message when no API key configured', async () => {
      vaultFetch.mockResolvedValue(null);

      const tool = getTool('brave_search');
      const result = await tool.execute({ query: 'test query' });

      expect(result).toContain('Brave Search API key not configured');
      expect(result).toContain('BRAVE_API_KEY');
      expect(result).toContain('Settings > Vault');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('formats results correctly', async () => {
      vaultFetch.mockResolvedValue('BSA-test-key');
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            web: {
              results: [
                { title: 'Brave Result', url: 'https://brave.com/1', description: 'Brave snippet' },
              ],
            },
          }),
          { status: 200 },
        ),
      );

      const tool = getTool('brave_search');
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain('[1] Brave Result');
      expect(result).toContain('https://brave.com/1');
      expect(result).toContain('Brave snippet');
    });

    it('passes freshness and count as query params', async () => {
      vaultFetch.mockResolvedValue('BSA-test-key');
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }),
      );

      const tool = getTool('brave_search');
      await tool.execute({ query: 'recent news', count: 10, freshness: 'day' });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('api.search.brave.com');
      expect(calledUrl).toContain('q=recent+news');
      expect(calledUrl).toContain('count=10');
      expect(calledUrl).toContain('freshness=day');

      const headers = (fetchSpy.mock.calls[0][1] as any).headers;
      expect(headers['X-Subscription-Token']).toBe('BSA-test-key');
    });

    it('enforces daily rate limit — 101st call returns quota message', async () => {
      vaultFetch.mockResolvedValue('BSA-test-key');
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }),
      );

      const tool = getTool('brave_search');

      // Exhaust the 100-call limit
      for (let i = 0; i < 100; i++) {
        await tool.execute({ query: `query ${i}` });
      }

      // 101st call should be rate-limited
      const result = await tool.execute({ query: 'one too many' });
      expect(result).toContain('Brave Search daily quota reached');
      expect(result).toContain('web_search');

      // fetch should have been called 100 times (not 101)
      expect(fetchSpy).toHaveBeenCalledTimes(100);
    });

    it('handles network errors gracefully', async () => {
      vaultFetch.mockResolvedValue('BSA-test-key');
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const tool = getTool('brave_search');
      const result = await tool.execute({ query: 'test' });

      expect(result).toContain('Brave search error');
      expect(result).toContain('ECONNREFUSED');
    });
  });
});
