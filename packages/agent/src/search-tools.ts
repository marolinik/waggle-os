/**
 * Search Tools — premium search providers with rate limiting.
 *
 * Tools:
 *   tavily_search — Search via Tavily API (AI-optimized search)
 *   brave_search  — Search via Brave Search API
 *
 * Both tools fetch API keys from the vault. If no key is configured,
 * they return a helpful message directing the user to Settings > Vault.
 * DuckDuckGo (web_search) remains the free fallback.
 */

import type { ToolDefinition } from './tools.js';

/** Daily rate limiter — resets at midnight UTC */
class DailyRateLimiter {
  private count = 0;
  private resetDate: string = '';
  private maxPerDay: number;

  constructor(maxPerDay: number) {
    this.maxPerDay = maxPerDay;
  }

  canProceed(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.resetDate) {
      this.count = 0;
      this.resetDate = today;
    }
    if (this.count >= this.maxPerDay) return false;
    this.count++;
    return true;
  }

  /** Expose count for testing */
  getCount(): number { return this.count; }

  /** Reset for testing */
  reset(): void { this.count = 0; this.resetDate = ''; }
}

// Module-level rate limiters — shared across tool invocations
const tavilyLimiter = new DailyRateLimiter(50);
const braveLimiter = new DailyRateLimiter(100);

export function createSearchTools(
  vaultFetch: (key: string) => Promise<string | null>,
): ToolDefinition[] {
  return [
    // 1. tavily_search — AI-optimized web search
    {
      name: 'tavily_search',
      description:
        'Search the web using Tavily AI search. Returns high-quality, AI-optimized results. Requires a Tavily API key in the vault.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          search_depth: {
            type: 'string',
            enum: ['basic', 'advanced'],
            description: 'Search depth — "basic" (fast) or "advanced" (thorough). Default: basic.',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results (default: 5, max: 10)',
          },
        },
        required: ['query'],
      },
      execute: async (args) => {
        try {
          const query = args.query as string;
          const searchDepth = (args.search_depth as string) ?? 'basic';
          const maxResults = Math.min((args.max_results as number) ?? 5, 10);

          // Fetch API key from vault
          const apiKey = await vaultFetch('TAVILY_API_KEY');
          if (!apiKey) {
            return 'Tavily API key not configured. Add TAVILY_API_KEY in Settings > Vault.';
          }

          // Rate limit check
          if (!tavilyLimiter.canProceed()) {
            return 'Tavily daily quota reached (50/day). Falling back to web_search for free DuckDuckGo results.';
          }

          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              search_depth: searchDepth,
              max_results: maxResults,
            }),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);
            return `Tavily search failed (${response.status}): ${errText}`;
          }

          const data = (await response.json()) as {
            results?: Array<{
              title: string;
              url: string;
              content: string;
            }>;
          };

          const results = data.results ?? [];
          if (results.length === 0) return 'No search results found.';

          return results
            .map(
              (r, i) =>
                `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.content}`,
            )
            .join('\n\n');
        } catch (err: any) {
          return `Tavily search error: ${err.message}`;
        }
      },
    },

    // 2. brave_search — Brave Search API
    {
      name: 'brave_search',
      description:
        'Search the web using Brave Search API. Supports freshness filtering for recent results. Requires a Brave API key in the vault.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: {
            type: 'number',
            description: 'Number of results (default: 5, max: 20)',
          },
          freshness: {
            type: 'string',
            enum: ['day', 'week', 'month'],
            description:
              'Filter by freshness — "day" (past 24h), "week" (past 7 days), "month" (past 30 days)',
          },
        },
        required: ['query'],
      },
      execute: async (args) => {
        try {
          const query = args.query as string;
          const count = Math.min((args.count as number) ?? 5, 20);
          const freshness = args.freshness as string | undefined;

          // Fetch API key from vault
          const apiKey = await vaultFetch('BRAVE_API_KEY');
          if (!apiKey) {
            return 'Brave Search API key not configured. Add BRAVE_API_KEY in Settings > Vault.';
          }

          // Rate limit check
          if (!braveLimiter.canProceed()) {
            return 'Brave Search daily quota reached (100/day). Falling back to web_search for free DuckDuckGo results.';
          }

          const params = new URLSearchParams({
            q: query,
            count: String(count),
          });
          if (freshness) {
            params.set('freshness', freshness);
          }

          const response = await fetch(
            `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
            {
              headers: {
                Accept: 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': apiKey,
              },
            },
          );

          if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);
            return `Brave search failed (${response.status}): ${errText}`;
          }

          const data = (await response.json()) as {
            web?: {
              results?: Array<{
                title: string;
                url: string;
                description: string;
              }>;
            };
          };

          const results = data.web?.results ?? [];
          if (results.length === 0) return 'No search results found.';

          return results
            .map(
              (r, i) =>
                `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.description}`,
            )
            .join('\n\n');
        } catch (err: any) {
          return `Brave search error: ${err.message}`;
        }
      },
    },
  ];
}

/** Expose rate limiters for testing */
export { tavilyLimiter, braveLimiter };
