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

async function modelIsRoutable(
  server: FastifyInstance,
  model: string,
  provider: string | null,
): Promise<boolean> {
  if (provider === 'ollama') {
    return (await listOllamaChatModelIds()).includes(model);
  }
  if (!providerIsReady(server, provider)) return false;
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
    for (const model of models) {
      if (await modelIsRoutable(server, model, provider)) return model;
    }
  }
  return null;
}

export async function fetchOllamaRoutingModels(): Promise<OllamaRoutingModel[]> {
  const endpoint = process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
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

export async function listOllamaChatModelIds(): Promise<string[]> {
  const models = await fetchOllamaRoutingModels();
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
  if (provider === 'ollama') {
    const localModels = await listOllamaChatModelIds();
    return localModels.includes(canonical) ? canonical : null;
  }
  const apiKey = getProviderApiKey(provider, server.vault);
  if (!apiKey) return null;
  const entry = server.vault?.get(provider);
  const baseUrl = typeof entry?.metadata?.baseUrl === 'string' ? entry.metadata.baseUrl : undefined;
  const catalog = await discoverProviderModels(provider, apiKey, baseUrl);
  if (!catalog.models.some((model) => model.id === canonical)) return null;
  return await ensureManagedLiteLLMModel(server, canonical) ? canonical : null;
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

  const cloudFallback = await findRoutableCloudFallback(server);
  if (cloudFallback) return cloudFallback;

  const localModels = await listOllamaChatModelIds();
  return localModels[0]
    ?? canonicalPreferred;
}
