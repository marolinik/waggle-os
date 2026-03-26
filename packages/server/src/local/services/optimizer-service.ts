/**
 * Optimizer Service — wraps @waggle/optimizer with vault key resolution,
 * caching, and graceful fallback.
 *
 * Uses @ax-llm/ax directly (no LiteLLM dependency) with the Anthropic
 * key from the vault.
 *
 * Usage in chat loop:
 *   const optimizer = getOptimizerService(server);
 *   if (optimizer) {
 *     const intent = await optimizer.classify(message);
 *     const expanded = await optimizer.expandIfVague(message, intent);
 *   }
 */

import type { FastifyInstance } from 'fastify';

let _optimizerInstance: OptimizerService | null = null;
let _lastKeyHash: string | null = null;

interface OptimizerService {
  classify(text: string): Promise<string>;
  expandIfVague(text: string, intent: string): Promise<string | null>;
  summarize(text: string): Promise<string>;
}

/**
 * Get or create the optimizer service. Returns null if no API key available.
 * Caches the instance and recreates if the vault key changes.
 */
export async function getOptimizerService(server: FastifyInstance): Promise<OptimizerService | null> {
  // Get Anthropic key from vault
  const apiKey = server.vault?.get('anthropic')?.value;
  if (!apiKey) return null;

  // Check if key changed (user updated vault)
  const keyHash = apiKey.slice(-8);
  if (_optimizerInstance && _lastKeyHash === keyHash) {
    return _optimizerInstance;
  }

  try {
    // Dynamic import to avoid loading @ax-llm/ax at startup if not needed
    const { AxAI } = await import('@ax-llm/ax');
    const { PromptOptimizer } = await import('@waggle/optimizer');

    const ai = new AxAI({
      name: 'anthropic',
      apiKey,
      config: { model: 'claude-haiku-4-5-20251001' }, // Use cheapest model for optimization
    });

    const optimizer = new PromptOptimizer({ ai });

    // Simple cache to avoid re-classifying the same message
    const classifyCache = new Map<string, string>();
    const expandCache = new Map<string, string>();

    _optimizerInstance = {
      async classify(text: string): Promise<string> {
        const cacheKey = text.slice(0, 100);
        const cached = classifyCache.get(cacheKey);
        if (cached) return cached;

        try {
          const result = await optimizer.classify(text);
          classifyCache.set(cacheKey, result);
          // Cap cache size
          if (classifyCache.size > 200) {
            const firstKey = classifyCache.keys().next().value;
            if (firstKey) classifyCache.delete(firstKey);
          }
          return result;
        } catch {
          return 'request'; // Default fallback
        }
      },

      async expandIfVague(text: string, intent: string): Promise<string | null> {
        // Only expand vague requests, not questions/greetings/commands
        if (intent === 'greeting' || intent === 'question') return null;

        // Don't expand if message is already detailed (>100 chars)
        if (text.length > 100) return null;

        // Don't expand commands (starting with /)
        if (text.startsWith('/')) return null;

        const cacheKey = text.slice(0, 100);
        const cached = expandCache.get(cacheKey);
        if (cached) return cached;

        try {
          const expanded = await optimizer.expandPrompt(text);
          // Only use expansion if it's meaningfully different
          if (expanded && expanded.length > text.length * 1.5) {
            expandCache.set(cacheKey, expanded);
            if (expandCache.size > 100) {
              const firstKey = expandCache.keys().next().value;
              if (firstKey) expandCache.delete(firstKey);
            }
            return expanded;
          }
          return null;
        } catch {
          return null; // Graceful fallback — use original message
        }
      },

      async summarize(text: string): Promise<string> {
        try {
          return await optimizer.summarize(text);
        } catch {
          return text; // Fallback to original
        }
      },
    };

    _lastKeyHash = keyHash;
    return _optimizerInstance;
  } catch (err) {
    // @ax-llm/ax or @waggle/optimizer not available — graceful degradation
    return null;
  }
}
