import type { FastifyPluginAsync } from 'fastify';
import { getLiteLLMStatus } from '../lifecycle.js';
import { listOllamaChatModelIds } from '../model-availability.js';
import { discoverProviderModels, PROVIDER_MODEL_CATALOGS } from '../provider-model-catalog.js';
import { refreshManagedLiteLLM } from '../litellm-runtime-config.js';
import { getProviderApiKey } from '../provider-env.js';

const MODEL_CATALOG_TIMEOUT_MS = 3_000;

export const litellmRoutes: FastifyPluginAsync = async (server) => {
  server.get('/api/litellm/status', async () => {
    const status = await getLiteLLMStatus(server.localConfig.managedLiteLLMPort);
    const error = status.error ?? (status.status === 'timeout' ? 'LiteLLM did not start in time' : undefined);
    return {
      running: status.status === 'running',
      port: status.port,
      ...(error ? { error } : {}),
    };
  });

  server.post('/api/litellm/restart', async () => {
    const refresh = await refreshManagedLiteLLM(server);
    return {
      running: refresh.ready,
      port: refresh.port,
      models: refresh.models,
      unavailableProviders: refresh.unavailableProviders,
      ...(refresh.error ? { error: refresh.error } : {}),
    };
  });

  server.get('/api/litellm/models', async () => {
    const localModelsPromise = listOllamaChatModelIds();
    const providerModelsPromise = Promise.all(Object.keys(PROVIDER_MODEL_CATALOGS).map(async (providerId) => {
      const entry = server.vault?.get(providerId);
      const apiKey = getProviderApiKey(providerId, server.vault);
      if (!apiKey) return [] as string[];
      const baseUrl = typeof entry?.metadata?.baseUrl === 'string' ? entry.metadata.baseUrl : undefined;
      const catalog = await discoverProviderModels(providerId, apiKey, baseUrl);
      return catalog.models.map((model) => model.id);
    }));
    const [localModels, providerModels] = await Promise.all([localModelsPromise, providerModelsPromise]);
    try {
      const response = await fetch(`${server.localConfig.litellmUrl}/models`, {
        signal: AbortSignal.timeout(MODEL_CATALOG_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { models: [...new Set([...providerModels.flat(), ...localModels])] };
      }
      const body = await response.json() as { data?: Array<{ id: string }> };
      return {
        models: [...new Set([
          ...(body.data ?? []).map((model) => model.id),
          ...providerModels.flat(),
          ...localModels,
        ])],
      };
    } catch {
      return { models: [...new Set([...providerModels.flat(), ...localModels])] };
    }
  });

  // Pricing is router metadata, not a second static model catalog.
  server.get('/api/litellm/pricing', async () => {
    try {
      const response = await fetch(`${server.localConfig.litellmUrl}/model/info`);
      if (!response.ok) return [];
      const body = await response.json() as {
        data?: Array<{
          model_name?: string;
          model_info?: {
            input_cost_per_token?: number;
            output_cost_per_token?: number;
          };
        }>;
      };
      return (body.data ?? []).flatMap((entry) => {
        if (!entry.model_name) return [];
        const input = Number(entry.model_info?.input_cost_per_token);
        const output = Number(entry.model_info?.output_cost_per_token);
        if (!Number.isFinite(input) || !Number.isFinite(output)) return [];
        return [{
          model: entry.model_name,
          inputPer1k: input * 1000,
          outputPer1k: output * 1000,
          provider: entry.model_name.split('/')[0] ?? 'unknown',
        }];
      });
    } catch {
      return [];
    }
  });
};
