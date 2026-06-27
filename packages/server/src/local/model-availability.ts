import type { FastifyInstance } from 'fastify';

interface OllamaRoutingModel {
  id: string;
  source: 'local' | 'cloud';
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
  return Boolean(server.vault?.get(provider));
}

function isEmbeddingModel(modelId: string): boolean {
  const leaf = modelId.split('/').pop()?.toLowerCase() ?? modelId.toLowerCase();
  return leaf.includes('embed') || leaf.includes('embedding') || leaf.startsWith('nomic-');
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
        source: typeof m.remote_host === 'string' && m.remote_host.length > 0 ? 'cloud' : 'local',
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
    .filter((m) => !isEmbeddingModel(m.id))
    .map((m) => m.id);
}

export async function resolveUsableModel(
  server: FastifyInstance,
  preferredModel: string,
): Promise<string> {
  const trimmed = preferredModel.trim();
  if (providerIsReady(server, providerForModel(trimmed))) {
    return trimmed;
  }

  const currentModel = (server as FastifyInstance & { agentState?: { currentModel?: string } })
    .agentState?.currentModel?.trim();
  if (
    currentModel &&
    currentModel !== trimmed &&
    !isEmbeddingModel(currentModel) &&
    providerIsReady(server, providerForModel(currentModel))
  ) {
    return currentModel;
  }

  const localModels = (await fetchOllamaRoutingModels()).filter((m) => !isEmbeddingModel(m.id));
  return localModels[0]?.id
    ?? trimmed;
}
