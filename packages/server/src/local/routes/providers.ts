/**
 * Providers API — single source of truth for LLM providers, models, and search tools.
 *
 * GET /api/providers — returns all providers with models and vault key status.
 * Used by: Settings, Onboarding, Workspace model selector, Spawn dialog, Agents.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '../logger.js';
const log = createLogger('providers');

interface ProviderModel {
  id: string;
  name: string;
  cost: '$' | '$$' | '$$$';
  speed: 'fast' | 'medium' | 'slow';
  /** Provenance: 'local' (on this machine), 'cloud' (Ollama Cloud remote), or undefined (provider-native) */
  source?: 'local' | 'cloud';
  /** Approximate disk footprint in MB (Ollama only) */
  sizeMB?: number;
}

interface ProviderDef {
  id: string;
  name: string;
  keyPrefix: string | null;
  keyUrl: string | null;
  badge: string | null;
  requiresKey: boolean;
  models: ProviderModel[];
}

interface SearchProviderDef {
  id: string;
  name: string;
  vaultKey: string;
  priority: number;
  requiresKey: boolean;
}

/** All LLM providers with their model catalogs */
const LLM_PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic', name: 'Anthropic', keyPrefix: 'sk-ant-', keyUrl: 'https://console.anthropic.com/settings/keys', badge: null, requiresKey: true,
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', cost: '$$$', speed: 'slow' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', cost: '$$$', speed: 'slow' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', cost: '$$', speed: 'medium' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'openai', name: 'OpenAI', keyPrefix: 'sk-', keyUrl: 'https://platform.openai.com/api-keys', badge: null, requiresKey: true,
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', cost: '$$$', speed: 'medium' },
      { id: 'gpt-4o', name: 'GPT-4o', cost: '$$', speed: 'fast' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', cost: '$', speed: 'fast' },
      { id: 'o3', name: 'o3', cost: '$$$', speed: 'slow' },
      { id: 'o3-mini', name: 'o3-mini', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'google', name: 'Google', keyPrefix: null, keyUrl: 'https://aistudio.google.com/apikey', badge: null, requiresKey: true,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', cost: '$$$', speed: 'medium' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', cost: '$', speed: 'fast' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', keyPrefix: null, keyUrl: 'https://platform.deepseek.com/api_keys', badge: null, requiresKey: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', cost: '$', speed: 'fast' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', cost: '$$', speed: 'slow' },
    ],
  },
  {
    id: 'xai', name: 'xAI', keyPrefix: null, keyUrl: 'https://console.x.ai/', badge: null, requiresKey: true,
    models: [
      { id: 'grok-3', name: 'Grok 3', cost: '$$', speed: 'medium' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'mistral', name: 'Mistral', keyPrefix: null, keyUrl: 'https://console.mistral.ai/api-keys', badge: null, requiresKey: true,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', cost: '$$', speed: 'medium' },
      { id: 'mistral-small-latest', name: 'Mistral Small', cost: '$', speed: 'fast' },
      { id: 'codestral-latest', name: 'Codestral', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'alibaba', name: 'Alibaba / Qwen', keyPrefix: null, keyUrl: 'https://dashscope.console.aliyun.com/apiKey', badge: null, requiresKey: true,
    models: [
      // LOCKED 2026-04-19 target model. 35B total / 3B active MoE,
      // Apache-2.0, thinking mode default ON. Opus-class standalone
      // benchmarks (GPQA 86 / AIME 92.7 / SWE-bench 73.4). Routed via
      // DashScope — not published on OpenRouter.
      { id: 'qwen3.6-35b-a3b', name: 'Qwen3.6 35B-A3B', cost: '$$', speed: 'slow' },
      { id: 'qwen-max', name: 'Qwen Max', cost: '$$', speed: 'medium' },
      { id: 'qwen-plus', name: 'Qwen Plus', cost: '$', speed: 'fast' },
      { id: 'qwen-turbo', name: 'Qwen Turbo', cost: '$', speed: 'fast' },
      { id: 'qwen-coder', name: 'Qwen Coder', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'minimax', name: 'MiniMax', keyPrefix: null, keyUrl: 'https://www.minimaxi.com/platform', badge: null, requiresKey: true,
    models: [
      { id: 'minimax-01', name: 'MiniMax-01', cost: '$$', speed: 'medium' },
      { id: 'minimax-2.7', name: 'MiniMax 2.7', cost: '$$', speed: 'medium' },
      { id: 'minimax-2.7-lite', name: 'MiniMax 2.7 Lite', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'zhipu', name: 'GLM / Zhipu', keyPrefix: null, keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', badge: null, requiresKey: true,
    models: [
      { id: 'glm-5', name: 'GLM-5', cost: '$$', speed: 'medium' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'moonshot', name: 'Kimi / Moonshot', keyPrefix: null, keyUrl: 'https://platform.moonshot.cn/console/api-keys', badge: null, requiresKey: true,
    models: [
      { id: 'kimi-2.5', name: 'Kimi 2.5', cost: '$$', speed: 'medium' },
      { id: 'kimi-2.5-thinking', name: 'Kimi 2.5 Thinking', cost: '$$', speed: 'slow' },
    ],
  },
  {
    id: 'perplexity', name: 'Perplexity', keyPrefix: 'pplx-', keyUrl: 'https://www.perplexity.ai/settings/api', badge: 'Search + LLM', requiresKey: true,
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', cost: '$$', speed: 'medium' },
      { id: 'sonar', name: 'Sonar', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'openrouter', name: 'OpenRouter', keyPrefix: 'sk-or-', keyUrl: 'https://openrouter.ai/keys', badge: 'Free models!', requiresKey: true,
    models: [
      { id: 'openrouter/auto', name: 'Auto (best available)', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'ollama', name: 'Local / Ollama', keyPrefix: null, keyUrl: 'https://ollama.ai/download', badge: 'No key needed', requiresKey: false,
    models: [],
  },
];

/** Search providers with priority order */
const SEARCH_PROVIDERS: SearchProviderDef[] = [
  { id: 'perplexity', name: 'Perplexity', vaultKey: 'perplexity', priority: 1, requiresKey: true },
  { id: 'tavily', name: 'Tavily', vaultKey: 'TAVILY_API_KEY', priority: 2, requiresKey: true },
  { id: 'brave', name: 'Brave Search', vaultKey: 'BRAVE_API_KEY', priority: 3, requiresKey: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', vaultKey: '', priority: 4, requiresKey: false },
];

/**
 * Best-effort OpenRouter free-model discovery — returns [] if offline or on error.
 * Cached for 1 hour to avoid hammering OR's /v1/models endpoint (~500KB response).
 */
let openRouterCache: { at: number; models: ProviderModel[] } | null = null;
const OPENROUTER_TTL_MS = 60 * 60 * 1000;

async function fetchOpenRouterFreeModels(): Promise<ProviderModel[]> {
  if (openRouterCache && Date.now() - openRouterCache.at < OPENROUTER_TTL_MS) {
    return openRouterCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    if (!res.ok) return openRouterCache?.models ?? [];
    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string | number; completion?: string | number };
      }>;
    };
    const free = (data.data ?? []).filter(m => {
      const p = parseFloat(String(m.pricing?.prompt ?? 0));
      const c = parseFloat(String(m.pricing?.completion ?? 0));
      return p === 0 && c === 0;
    });
    // Sort by context length desc (proxy for "best free")
    free.sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0));
    const models: ProviderModel[] = free.slice(0, 20).map(m => ({
      id: m.id,
      name: m.name ?? m.id,
      cost: '$',
      speed: 'medium',
      source: 'cloud',
    }));
    openRouterCache = { at: Date.now(), models };
    return models;
  } catch {
    return openRouterCache?.models ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Best-effort Ollama model discovery — returns [] if Ollama isn't running. */
async function fetchOllamaModels(): Promise<{ models: ProviderModel[]; reachable: boolean }> {
  const endpoint = process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { models: [], reachable: false };
    const data = (await res.json()) as {
      models?: Array<{ name: string; size?: number; remote_model?: string; remote_host?: string }>;
    };
    const models: ProviderModel[] = (data.models ?? []).map(m => {
      // Ollama marks cloud-proxied models with a remote_host (e.g. https://ollama.com:443)
      const isCloud = typeof m.remote_host === 'string' && m.remote_host.length > 0;
      const sizeMB = isCloud ? 0 : Math.round((m.size ?? 0) / 1024 / 1024);
      return {
        id: m.name,
        name: m.name,
        cost: isCloud ? '$$' : '$',
        speed: isCloud ? 'medium' : 'fast',
        source: isCloud ? 'cloud' : 'local',
        ...(sizeMB > 0 ? { sizeMB } : {}),
      };
    });
    return { models, reachable: true };
  } catch {
    return { models: [], reachable: false };
  } finally {
    clearTimeout(timeout);
  }
}

export const providerRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/providers — single source of truth for all providers, models, and key status
  fastify.get('/api/providers', async () => {
    const vault = fastify.vault;

    // Fetch live data in parallel (both fail silently)
    const openrouterHasKey = !!(vault && vault.get('openrouter'));
    const [ollama, openRouterFree] = await Promise.all([
      fetchOllamaModels(),
      openrouterHasKey ? fetchOpenRouterFreeModels() : Promise.resolve([] as ProviderModel[]),
    ]);

    // Check which providers have keys in vault
    const providers = LLM_PROVIDERS.map(p => {
      let hasKey = !p.requiresKey; // Ollama doesn't need a key
      if (p.requiresKey && vault) {
        const entry = vault.get(p.id);
        hasKey = !!entry;
      }
      // Enrich Ollama with live model list from localhost:11434
      if (p.id === 'ollama') {
        return {
          ...p,
          hasKey: ollama.reachable,
          reachable: ollama.reachable,
          models: ollama.models.length > 0 ? ollama.models : p.models,
          badge: ollama.reachable ? (ollama.models.length > 0 ? `${ollama.models.length} installed` : 'Running') : 'Not running',
        };
      }
      // Enrich OpenRouter with live free-tier model list
      if (p.id === 'openrouter' && openRouterFree.length > 0) {
        return {
          ...p,
          hasKey,
          // Keep the static auto entry + append live free models
          models: [...p.models, ...openRouterFree],
          badge: `${openRouterFree.length} free models`,
        };
      }
      return { ...p, hasKey };
    });

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
