/**
 * Providers API — single source of truth for LLM providers, models, and search tools.
 *
 * GET /api/providers — returns all providers with models and vault key status.
 * Used by: Settings, Onboarding, Workspace model selector, Spawn dialog, Agents.
 */

import type { FastifyPluginAsync } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { discoverProviderModels, fetchOllamaModels } from '../provider-model-catalog.js';
import { getProviderApiKey } from '../provider-env.js';

interface ProviderDef {
  id: string;
  name: string;
  keyPrefix: string | null;
  keyUrl: string | null;
  badge: string | null;
  requiresKey: boolean;
}

interface SearchProviderDef {
  id: string;
  name: string;
  vaultKey: string;
  priority: number;
  requiresKey: boolean;
}

/** All LLM providers. Model inventories are fetched from each provider API. */
const LLM_PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', name: 'Anthropic', keyPrefix: 'sk-ant-', keyUrl: 'https://console.anthropic.com/settings/keys', badge: null, requiresKey: true },
  { id: 'openai', name: 'OpenAI', keyPrefix: 'sk-', keyUrl: 'https://platform.openai.com/api-keys', badge: null, requiresKey: true },
  { id: 'openai-compatible', name: 'OpenAI-compatible', keyPrefix: null, keyUrl: null, badge: 'Custom endpoint', requiresKey: false },
  { id: 'google', name: 'Google', keyPrefix: null, keyUrl: 'https://aistudio.google.com/apikey', badge: null, requiresKey: true },
  { id: 'deepseek', name: 'DeepSeek', keyPrefix: null, keyUrl: 'https://platform.deepseek.com/api_keys', badge: null, requiresKey: true },
  { id: 'xai', name: 'xAI', keyPrefix: null, keyUrl: 'https://console.x.ai/', badge: null, requiresKey: true },
  { id: 'mistral', name: 'Mistral', keyPrefix: null, keyUrl: 'https://console.mistral.ai/api-keys', badge: null, requiresKey: true },
  { id: 'alibaba', name: 'Alibaba / Qwen', keyPrefix: null, keyUrl: 'https://dashscope.console.aliyun.com/apiKey', badge: null, requiresKey: true },
  { id: 'minimax', name: 'MiniMax', keyPrefix: null, keyUrl: 'https://www.minimaxi.com/platform', badge: null, requiresKey: true },
  { id: 'zhipu', name: 'GLM / Zhipu', keyPrefix: null, keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', badge: null, requiresKey: true },
  { id: 'moonshot', name: 'Kimi / Moonshot', keyPrefix: null, keyUrl: 'https://platform.moonshot.cn/console/api-keys', badge: null, requiresKey: true },
  { id: 'perplexity', name: 'Perplexity', keyPrefix: 'pplx-', keyUrl: 'https://www.perplexity.ai/settings/api', badge: 'Search + LLM', requiresKey: true },
  { id: 'openrouter', name: 'OpenRouter', keyPrefix: 'sk-or-', keyUrl: 'https://openrouter.ai/keys', badge: 'Provider catalog', requiresKey: true },
  { id: 'ollama', name: 'Local / Ollama', keyPrefix: null, keyUrl: 'https://ollama.ai/download', badge: 'No key needed', requiresKey: false },
];

/** Search providers with priority order */
const SEARCH_PROVIDERS: SearchProviderDef[] = [
  { id: 'perplexity', name: 'Perplexity', vaultKey: 'perplexity', priority: 1, requiresKey: true },
  { id: 'tavily', name: 'Tavily', vaultKey: 'TAVILY_API_KEY', priority: 2, requiresKey: true },
  { id: 'brave', name: 'Brave Search', vaultKey: 'BRAVE_API_KEY', priority: 3, requiresKey: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', vaultKey: '', priority: 4, requiresKey: false },
];

export const providerRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/providers — single source of truth for all providers, models, and key status
  fastify.get('/api/providers', async () => {
    const vault = fastify.vault;
    const configProviders = new WaggleConfig(fastify.localConfig.dataDir).getProviders();

    const ollamaPromise = fetchOllamaModels();
    const providers = await Promise.all(LLM_PROVIDERS.map(async (p) => {
      if (p.id === 'ollama') {
        const ollama = await ollamaPromise;
        return {
          ...p,
          hasKey: ollama.reachable,
          reachable: ollama.reachable,
          models: ollama.models,
          modelsSource: 'local-runtime' as const,
          badge: ollama.reachable
            ? (ollama.models.length > 0 ? `${ollama.models.length} installed` : 'Running')
            : 'Not running',
        };
      }

      const entry = vault?.get(p.id);
      const apiKey = getProviderApiKey(p.id, vault);
      const hasKey = Boolean(apiKey);
      const baseUrl = typeof entry?.metadata?.baseUrl === 'string'
        ? entry.metadata.baseUrl
        : configProviders[p.id]?.baseUrl;
      if (!apiKey && p.requiresKey) {
        return {
          ...p,
          hasKey,
          models: [],
          modelsSource: 'requires-key' as const,
          ...(baseUrl ? { baseUrl } : {}),
        };
      }
      if (p.id === 'openai-compatible' && !baseUrl) {
        return { ...p, hasKey, models: [], modelsSource: 'requires-endpoint' as const };
      }

      const catalog = await discoverProviderModels(p.id, apiKey ?? '', baseUrl);
      return {
        ...p,
        hasKey,
        ...(baseUrl ? { baseUrl } : {}),
        models: catalog.models,
        modelsSource: catalog.status,
        ...(catalog.updatedAt ? { modelsUpdatedAt: catalog.updatedAt } : {}),
        ...(catalog.error ? { modelsError: catalog.error } : {}),
      };
    }));

    // Check search provider keys
    const search = SEARCH_PROVIDERS.map(s => {
      let hasKey = !s.requiresKey; // DuckDuckGo doesn't need a key
      if (s.requiresKey && vault && s.vaultKey) {
        const entry = vault.get(s.vaultKey);
        hasKey = !!entry;
      }
      return { ...s, hasKey };
    });

    // Active search provider (highest priority with a key)
    const activeSearch = search.find(s => s.hasKey) ?? search[search.length - 1];

    return { providers, search, activeSearch: activeSearch.id };
  });
};

/** Export the provider definitions for use in other server modules */
export { LLM_PROVIDERS, SEARCH_PROVIDERS };
