import type { FastifyInstance } from 'fastify';
import { ensureManagedLiteLLMModel } from './litellm-runtime-config.js';
import { getProviderApiKey } from './provider-env.js';
import {
  discoverProviderModels,
  isRemoteOllamaAlias,
  PROVIDER_MODEL_CATALOGS,
} from './provider-model-catalog.js';

interface OllamaRoutingModel {
  id: string;
  source: 'local' | 'cloud';
}

const PREFERRED_CLOUD_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  anthropic: ['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4-6'],
  openai: ['openai/gpt-5.6-sol', 'openai/gpt-5.4'],
  google: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro'],
  openrouter: [
    'openrouter/anthropic/claude-sonnet-5',
    'openrouter/openai/gpt-5.6-sol',
    'openrouter/openai/gpt-5.4',
    'openrouter/google/gemini-2.5-flash',
  ],
};

function qualityRankedFallbacks(provider: string, models: readonly string[]): string[] {
  const preferred = PREFERRED_CLOUD_FALLBACKS[provider] ?? [];
  const available = new Set(models);
  return [
    ...preferred.filter(model => available.has(model)),
    ...models.filter(model => !preferred.includes(model)),
  ];
}

export class OllamaModelNotLocalError extends Error {
  readonly statusCode = 409;
  readonly code = 'OLLAMA_MODEL_NOT_LOCAL';

  constructor(model: string) {
    super(
      `Ollama model "${model}" is not installed locally. `
      + 'Pull an offline model in Local Inference, or select an installed local tag. '
      + 'Ollama :cloud aliases require network access and never count as local.',
    );
    this.name = 'OllamaModelNotLocalError';
  }
}

function providerForModel(model: string): string | null {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return null;

  const slash = normalized.indexOf('/');
  if (slash > 0) {
    const provider = normalized.slice(0, slash);
    if (provider === 'anthropic') return 'anthropic';
    if (provider === 'openai') return 'openai';
    if (provider === 'google') return 'google';
    if (provider === 'deepseek') return 'deepseek';
    if (provider === 'xai') return 'xai';
    if (provider === 'mistral') return 'mistral';
    if (provider === 'alibaba') return 'alibaba';
    if (provider === 'minimax') return 'minimax';
    if (provider === 'zhipu') return 'zhipu';
    if (provider === 'moonshot') return 'moonshot';
    if (provider === 'perplexity') return 'perplexity';
    if (provider === 'openrouter') return 'openrouter';
    if (provider === 'ollama') return 'ollama';
  }

  if (normalized.startsWith('claude-')) return 'anthropic';
  if (normalized.startsWith('gpt-') || /^o\d/.test(normalized)) return 'openai';
  if (normalized.startsWith('gemini-')) return 'google';
  if (normalized.startsWith('deepseek-')) return 'deepseek';
  if (normalized.startsWith('grok-')) return 'xai';
  if (normalized.startsWith('mistral-') || normalized.startsWith('codestral-')) return 'mistral';
  if (normalized.startsWith('qwen')) return 'alibaba';
  if (normalized.startsWith('minimax-')) return 'minimax';
  if (normalized.startsWith('glm-')) return 'zhipu';
  if (normalized.startsWith('kimi-')) return 'moonshot';
  if (normalized.startsWith('sonar')) return 'perplexity';

  return null;
}

function providerIsReady(server: FastifyInstance, provider: string | null): boolean {
  if (!provider) return false;
  if (provider === 'ollama') return true;
  return Boolean(getProviderApiKey(provider, server.vault));
}

function canonicalModelId(model: string, provider: string | null): string {
  if (!provider || model.includes('/')) return model;
  return `${provider}/${model}`;
}

export function canonicalizeModelReference(model: string): string {
  const trimmed = model.trim();
  return canonicalModelId(trimmed, providerForModel(trimmed));
}

async function modelIsRoutable(
  server: FastifyInstance,
  model: string,
  provider: string | null,
): Promise<boolean> {
  if (provider === 'ollama') {
    return (await listOllamaChatModelIds()).includes(model);
  }
  if (!providerIsReady(server, provider)) return false;
  // The in-process proxy routes provider-prefixed models directly. Its live
  // request is the authority; managed LiteLLM catalog state may be stale or
  // absent after the service has fallen back from a failed LiteLLM launch.
  const activeProvider = server.agentState?.llmProvider;
  if (
    activeProvider?.provider === 'anthropic-proxy'
    && activeProvider.health !== 'unavailable'
  ) {
    return true;
  }
  return ensureManagedLiteLLMModel(server, model);
}

function isEmbeddingModel(modelId: string): boolean {
  const leaf = modelId.split('/').pop()?.toLowerCase() ?? modelId.toLowerCase();
  return leaf.includes('embed') || leaf.includes('embedding') || leaf.startsWith('nomic-');
}

async function findRoutableCloudFallback(server: FastifyInstance): Promise<string | null> {
  // Object declaration order is the deterministic provider precedence. Catalogs
  // are fetched concurrently, while Promise.all preserves that input order.
  const catalogs = await Promise.all(
    Object.keys(PROVIDER_MODEL_CATALOGS).map(async (provider) => {
      const apiKey = getProviderApiKey(provider, server.vault);
      if (!apiKey) return { provider, models: [] as string[] };
      const entry = server.vault?.get(provider);
      const baseUrl = typeof entry?.metadata?.baseUrl === 'string' ? entry.metadata.baseUrl : undefined;
      const catalog = await discoverProviderModels(provider, apiKey, baseUrl);
      return {
        provider,
        models: catalog.models.map((model) => model.id).filter((model) => !isEmbeddingModel(model)),
      };
    }),
  );

  for (const { provider, models } of catalogs) {
    for (const model of qualityRankedFallbacks(provider, models)) {
      if (await modelIsRoutable(server, model, provider)) return model;
    }
  }
  return null;
}

function findBuiltInProxyFamilyFallback(
  server: FastifyInstance,
  preferredProvider: string | null,
): string | null {
  const activeProvider = server.agentState?.llmProvider;
  if (
    !preferredProvider
    || activeProvider?.provider !== 'anthropic-proxy'
    || activeProvider.health === 'unavailable'
    || !providerIsReady(server, 'openrouter')
  ) {
    return null;
  }
  return PREFERRED_CLOUD_FALLBACKS.openrouter
    .find(model => model.startsWith(`openrouter/${preferredProvider}/`))
    ?? null;
}

export async function fetchOllamaRoutingModels(signal?: AbortSignal): Promise<OllamaRoutingModel[]> {
  const endpoint = process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name: string; remote_host?: string }>;
    };
    return (data.models ?? [])
      .filter((m) => typeof m.name === 'string' && m.name.length > 0)
      .map((m) => ({
        id: `ollama/${m.name}`,
        source: isRemoteOllamaAlias(m.name, m.remote_host) ? 'cloud' : 'local',
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOllamaChatModelIds(signal?: AbortSignal): Promise<string[]> {
  const models = await fetchOllamaRoutingModels(signal);
  return models
    .filter((m) => m.source === 'local' && !isEmbeddingModel(m.id))
    .map((m) => m.id);
}

/**
 * Strict preflight for an explicitly selected model. Unlike
 * resolveUsableModel(), this never falls back to the current model or another
 * local model. A non-null result is provider-backed and executable now.
 */
export async function resolveExplicitRoutableModel(
  server: FastifyInstance,
  selectedModel: string,
): Promise<string | null> {
  const trimmed = selectedModel.trim();
  if (!trimmed || isEmbeddingModel(trimmed)) return null;
  const provider = providerForModel(trimmed);
  if (!provider) return null;
  const canonical = canonicalModelId(trimmed, provider);
  return await modelIsRoutable(server, canonical, provider) ? canonical : null;
}

export async function resolveUsableModel(
  server: FastifyInstance,
  preferredModel: string,
): Promise<string> {
  const trimmed = preferredModel.trim();
  const preferredProvider = providerForModel(trimmed);
  const canonicalPreferred = canonicalModelId(trimmed, preferredProvider);
  if (preferredProvider === 'ollama') {
    if (await modelIsRoutable(server, canonicalPreferred, preferredProvider)) {
      return canonicalPreferred;
    }
    throw new OllamaModelNotLocalError(canonicalPreferred);
  }
  if (await modelIsRoutable(server, canonicalPreferred, preferredProvider)) {
    return canonicalPreferred;
  }

  const currentModel = (server as FastifyInstance & { agentState?: { currentModel?: string } })
    .agentState?.currentModel?.trim();
  if (currentModel && currentModel !== trimmed && !isEmbeddingModel(currentModel)) {
    const currentProvider = providerForModel(currentModel);
    const canonicalCurrent = canonicalModelId(currentModel, currentProvider);
    if (await modelIsRoutable(server, canonicalCurrent, currentProvider)) {
      return canonicalCurrent;
    }
  }

  // The built-in proxy can route a known OpenRouter model directly. Preserve
  // the preferred model family without depending on a live catalog fetch;
  // the completion request remains the authority for current model validity.
  const proxyFamilyFallback = findBuiltInProxyFamilyFallback(server, preferredProvider);
  if (proxyFamilyFallback) return proxyFamilyFallback;

  const cloudFallback = await findRoutableCloudFallback(server);
  if (cloudFallback) return cloudFallback;

  const localModels = await listOllamaChatModelIds();
  return localModels[0]
    ?? canonicalPreferred;
}
