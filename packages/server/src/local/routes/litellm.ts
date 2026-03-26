import type { FastifyPluginAsync } from 'fastify';
import { getLiteLLMStatus, startLiteLLM, stopLiteLLM } from '../lifecycle.js';

export const litellmRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/litellm/status — Check if LiteLLM is running
   * Returns: { running: boolean, port: number }
   */
  server.get('/api/litellm/status', async () => {
    const status = await getLiteLLMStatus();
    const error = status.error ?? (status.status === 'timeout' ? 'LiteLLM did not start in time' : undefined);
    return {
      running: status.status === 'running',
      port: status.port,
      ...(error ? { error } : {}),
    };
  });

  /**
   * POST /api/litellm/restart — Stop then start LiteLLM
   * Returns: { running: boolean, port: number, error?: string }
   */
  server.post('/api/litellm/restart', async () => {
    try {
      await stopLiteLLM();
    } catch {
      // Best-effort stop — proceed to start anyway
    }
    const status = await startLiteLLM();
    const running = status.status === 'running' || status.status === 'started';
    const error = status.error ?? (status.status === 'timeout' ? 'LiteLLM did not start in time' : undefined);
    return {
      running,
      port: status.port,
      ...(error ? { error } : {}),
    };
  });

  /**
   * GET /api/litellm/models — List available models from LiteLLM
   * Returns: { models: string[] }
   */
  server.get('/api/litellm/models', async () => {
    try {
      const litellmUrl = server.localConfig.litellmUrl;
      const res = await fetch(`${litellmUrl}/models`);
      if (!res.ok) {
        return { models: [] };
      }
      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map((m) => m.id);
      return { models };
    } catch {
      return { models: [] };
    }
  });
};
