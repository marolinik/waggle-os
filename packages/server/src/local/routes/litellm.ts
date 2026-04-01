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

  /**
   * GET /api/litellm/pricing — Model pricing info
   * Returns basic pricing data for known models (local reference, no external call)
   */
  server.get('/api/litellm/pricing', async () => {
    return [
      { model: 'claude-sonnet-4-6', inputPer1k: 0.003, outputPer1k: 0.015, provider: 'anthropic' },
      { model: 'claude-haiku-4-6', inputPer1k: 0.0008, outputPer1k: 0.004, provider: 'anthropic' },
      { model: 'claude-opus-4-6', inputPer1k: 0.015, outputPer1k: 0.075, provider: 'anthropic' },
      { model: 'gpt-5.4', inputPer1k: 0.005, outputPer1k: 0.015, provider: 'openai' },
      { model: 'gpt-5.4-mini', inputPer1k: 0.0004, outputPer1k: 0.0016, provider: 'openai' },
      { model: 'gemini-3.1-pro', inputPer1k: 0.00125, outputPer1k: 0.005, provider: 'google' },
      { model: 'gemini-3.1-flash', inputPer1k: 0.000075, outputPer1k: 0.0003, provider: 'google' },
    ];
  });
};
