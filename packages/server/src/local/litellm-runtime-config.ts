import fs from 'node:fs';
import path from 'node:path';
import type { VaultStore } from '@waggle/core';
import type { FastifyInstance } from 'fastify';
import {
  discoverProviderModels,
  PROVIDER_MODEL_CATALOGS,
  type DiscoveryOptions,
  type DiscoveredProviderModel,
} from './provider-model-catalog.js';
import { applyProviderKeyToEnv, getProviderApiKeys } from './provider-env.js';
import { startLiteLLM, stopLiteLLM } from './lifecycle.js';

interface LiteLLMProviderRoute {
  envName: string;
  modelPrefix: string;
  apiBase?: string;
}

interface LiteLLMModelEntry {
  model_name: string;
  litellm_params: {
    model: string;
    api_key: string;
    api_base?: string;
  };
}

export interface LiteLLMRuntimeConfigResult {
  configPath: string | null;
  modelIds: string[];
  unavailableProviders: string[];
}

export interface LiteLLMRefreshResult {
  managed: boolean;
  ready: boolean;
  port: number;
  models: string[];
  unavailableProviders: string[];
  error?: string;
}

/** Routing metadata only. Model identities always come from provider APIs. */
const LITELLM_PROVIDER_ROUTES: Record<string, LiteLLMProviderRoute> = {
  anthropic: { envName: 'ANTHROPIC_API_KEY', modelPrefix: 'anthropic' },
  openai: { envName: 'OPENAI_API_KEY', modelPrefix: 'openai' },
  google: { envName: 'GEMINI_API_KEY', modelPrefix: 'gemini' },
  deepseek: { envName: 'DEEPSEEK_API_KEY', modelPrefix: 'deepseek' },
  xai: { envName: 'XAI_API_KEY', modelPrefix: 'xai' },
  mistral: { envName: 'MISTRAL_API_KEY', modelPrefix: 'mistral' },
  alibaba: {
    envName: 'DASHSCOPE_API_KEY',
    modelPrefix: 'openai',
    apiBase: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  minimax: {
    envName: 'MINIMAX_API_KEY',
    modelPrefix: 'openai',
    apiBase: 'https://api.minimax.io/v1',
  },
  zhipu: {
    envName: 'ZHIPU_API_KEY',
    modelPrefix: 'openai',
    apiBase: 'https://open.bigmodel.cn/api/paas/v4',
  },
  moonshot: {
    envName: 'MOONSHOT_API_KEY',
    modelPrefix: 'openai',
    apiBase: 'https://api.moonshot.ai/v1',
  },
  perplexity: { envName: 'PERPLEXITY_API_KEY', modelPrefix: 'perplexity' },
  openrouter: { envName: 'OPENROUTER_API_KEY', modelPrefix: 'openrouter' },
};

function routeModel(providerId: string, model: DiscoveredProviderModel): string {
  const route = LITELLM_PROVIDER_ROUTES[providerId];
  const providerPrefix = `${providerId}/`;
  const providerModelId = model.id.startsWith(providerPrefix)
    ? model.id.slice(providerPrefix.length)
    : model.id;
  return `${route.modelPrefix}/${providerModelId}`;
}

export function buildLiteLLMRuntimeConfig(
  catalogs: ReadonlyMap<string, DiscoveredProviderModel[]>,
  customBaseUrls: ReadonlyMap<string, string> = new Map(),
): { model_list: LiteLLMModelEntry[] } {
  const modelList: LiteLLMModelEntry[] = [];
  for (const [providerId, models] of catalogs) {
    const route = LITELLM_PROVIDER_ROUTES[providerId];
    if (!route) continue;
    for (const model of models) {
      const apiBase = customBaseUrls.get(providerId) ?? route.apiBase;
      modelList.push({
        model_name: model.id,
        litellm_params: {
          model: routeModel(providerId, model),
          api_key: `os.environ/${route.envName}`,
          ...(apiBase ? { api_base: apiBase } : {}),
        },
      });
    }
  }
  return { model_list: modelList };
}

/** Build the executable router catalog from the same live APIs used by the UI. */
export async function prepareLiteLLMRuntimeConfig(
  dataDir: string,
  vault: VaultStore,
  discoveryOptions: DiscoveryOptions = {},
): Promise<LiteLLMRuntimeConfigResult> {
  const catalogs = new Map<string, DiscoveredProviderModel[]>();
  const customBaseUrls = new Map<string, string>();
  const unavailableProviders: string[] = [];

  await Promise.all(Object.keys(PROVIDER_MODEL_CATALOGS).map(async (providerId) => {
    const entry = vault.get(providerId);
    const apiKeys = getProviderApiKeys(providerId, vault);
    if (apiKeys.length === 0) return;
    const baseUrl = typeof entry?.metadata?.baseUrl === 'string' ? entry.metadata.baseUrl : undefined;
    if (baseUrl) customBaseUrls.set(providerId, baseUrl);
    let result = await discoverProviderModels(providerId, apiKeys[0], baseUrl, discoveryOptions);
    let workingKey = result.status === 'unavailable' ? null : apiKeys[0];
    for (let index = 1; !workingKey && index < apiKeys.length; index += 1) {
      result = await discoverProviderModels(providerId, apiKeys[index], baseUrl, discoveryOptions);
      if (result.status !== 'unavailable') workingKey = apiKeys[index];
    }
    // Keep aliases such as GEMINI_API_KEY / GOOGLE_API_KEY aligned to the key
    // that actually passed provider discovery. Otherwise a stale machine-level
    // alias can poison LiteLLM even though another configured alias is valid.
    if (workingKey) applyProviderKeyToEnv(providerId, workingKey, true);
    if (result.models.length > 0) catalogs.set(providerId, result.models);
    if (result.status === 'unavailable') unavailableProviders.push(providerId);
  }));

  const config = buildLiteLLMRuntimeConfig(catalogs, customBaseUrls);
  const modelIds = config.model_list.map((entry) => entry.model_name);
  if (modelIds.length === 0) {
    return { configPath: null, modelIds, unavailableProviders };
  }

  const configPath = path.join(dataDir, 'litellm.runtime.json');
  const tempPath = `${configPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    fs.renameSync(tempPath, configPath);
  } catch {
    try { fs.unlinkSync(configPath); } catch { /* first write */ }
    fs.renameSync(tempPath, configPath);
  }
  return { configPath, modelIds, unavailableProviders };
}

/** Rebuild and restart the managed router after credentials or catalogs change. */
export async function refreshManagedLiteLLM(server: FastifyInstance): Promise<LiteLLMRefreshResult> {
  const port = server.localConfig.managedLiteLLMPort ?? 4000;
  if (!server.localConfig.manageLiteLLM) {
    return {
      managed: false,
      ready: false,
      port,
      models: [],
      unavailableProviders: [],
      error: 'LiteLLM lifecycle is managed outside this server.',
    };
  }

  const runtime = await prepareLiteLLMRuntimeConfig(server.localConfig.dataDir, server.vault);
  if (!runtime.configPath) {
    return {
      managed: true,
      ready: false,
      port,
      models: runtime.modelIds,
      unavailableProviders: runtime.unavailableProviders,
      error: 'No provider model catalog is currently available.',
    };
  }

  try {
    await stopLiteLLM();
  } catch {
    // The prior child may already have exited. startLiteLLM checks the port.
  }
  const status = await startLiteLLM(port, runtime.configPath);
  const ready = status.status === 'running' || status.status === 'started';
  if (ready) {
    server.localConfig.litellmUrl = `http://localhost:${port}`;
    server.agentState.litellmApiKey = process.env.LITELLM_API_KEY
      ?? process.env.LITELLM_MASTER_KEY
      ?? 'sk-waggle-dev';
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: `LiteLLM on port ${port} (${runtime.modelIds.length} provider models)`,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    managed: true,
    ready,
    port,
    models: runtime.modelIds,
    unavailableProviders: runtime.unavailableProviders,
    ...(!ready ? {
      error: status.error ?? (status.status === 'timeout'
        ? 'LiteLLM did not start in time'
        : 'LiteLLM did not become ready.'),
    } : {}),
  };
}

function readManagedModelIds(dataDir: string): string[] {
  const configPath = path.join(dataDir, 'litellm.runtime.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      model_list?: Array<{ model_name?: unknown }>;
    };
    return (parsed.model_list ?? [])
      .map((entry) => entry.model_name)
      .filter((modelName): modelName is string => typeof modelName === 'string' && modelName.length > 0);
  } catch {
    return [];
  }
}

/**
 * Make a provider-discovered model executable in the already-running managed
 * router. Existing models are a zero-cost read; only a genuinely new model
 * causes catalog regeneration and one router restart.
 */
export async function ensureManagedLiteLLMModel(
  server: FastifyInstance,
  model: string,
): Promise<boolean> {
  if (!server.localConfig.manageLiteLLM || model.startsWith('ollama/')) return true;
  if (readManagedModelIds(server.localConfig.dataDir).includes(model)) return true;

  const refresh = await refreshManagedLiteLLM(server);
  return refresh.ready && refresh.models.includes(model);
}
