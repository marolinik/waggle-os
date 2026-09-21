import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../../src/local/lifecycle.js', () => ({
  getLiteLLMStatus: vi.fn(async (port = 4000) => ({ status: 'running', port })),
  startLiteLLM: vi.fn(async (port = 4000) => ({ status: 'started', port })),
  stopLiteLLM: vi.fn(async () => undefined),
}));

import { runAgentLoop } from '../../../agent/src/agent-loop.js';
import { buildLocalServer } from '../../src/local/index.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';
import { startLiteLLM } from '../../src/local/lifecycle.js';
import { injectWithAuth } from '../test-utils.js';

describe('dynamic provider model completion path', () => {
  let server: FastifyInstance;
  let dataDir: string;
  const originalProviderEnv = new Map<string, string | undefined>();

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
      originalProviderEnv.set(envName, process.env[envName]);
      delete process.env[envName];
    }
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-dynamic-completion-'));
    server = await buildLocalServer({
      dataDir,
      port: 0,
      manageLiteLLM: true,
      managedLiteLLMPort: 4567,
    });
  }, 30_000);

  afterEach(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const [envName, value] of originalProviderEnv) {
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
    originalProviderEnv.clear();
    vi.restoreAllMocks();
  }, 30_000);

  it('saves a key, discovers an unseen model, configures it, and completes with that exact id', async () => {
    const newModel = 'openai/model-released-after-this-build';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.openai.com/v1/models') {
        return new Response(JSON.stringify({
          data: [{ id: 'model-released-after-this-build' }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected discovery request: ${url}`);
    });

    const save = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings',
      payload: { providers: { openai: { apiKey: 'new-provider-key' } } },
    });

    expect(save.statusCode).toBe(200);
    expect(save.json().router).toMatchObject({
      managed: true,
      ready: true,
      models: [newModel],
    });
    expect(startLiteLLM).toHaveBeenCalledWith(4567, path.join(dataDir, 'litellm.runtime.json'));

    const routerConfig = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'litellm.runtime.json'), 'utf8'),
    ) as { model_list: Array<{ model_name: string }> };
    expect(routerConfig.model_list.map((entry) => entry.model_name)).toContain(newModel);

    const completionFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      const configured = routerConfig.model_list.some((entry) => entry.model_name === body.model);
      return new Response(JSON.stringify(configured
        ? {
            choices: [{ message: { role: 'assistant', content: 'Dynamic model completed.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 4, completion_tokens: 3 },
          }
        : { error: { message: 'Model is not configured' } }), {
        status: configured ? 200 : 404,
        headers: { 'content-type': 'application/json' },
      });
    });

    const completion = await runAgentLoop({
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      model: newModel,
      systemPrompt: 'Be concise.',
      tools: [],
      messages: [{ role: 'user', content: 'Confirm routing.' }],
      fetch: completionFetch,
    });

    expect(completion.content).toBe('Dynamic model completed.');
    expect(JSON.parse(String(completionFetch.mock.calls[0]?.[1]?.body)).model).toBe(newModel);
  });

  it('makes a model released during the running session executable when selected', async () => {
    const existingModel = 'openai/existing-runtime-model';
    const newModel = 'openai/model-released-during-this-session';
    let released = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.openai.com/v1/models') {
        return new Response(JSON.stringify({
          data: [
            { id: 'existing-runtime-model' },
            ...(released ? [{ id: 'model-released-during-this-session' }] : []),
          ],
        }), { status: 200 });
      }
      if (url.endsWith('/v1/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'WAGGLE_OK' } }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected discovery request: ${url}`);
    });

    const save = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings',
      payload: { providers: { openai: { apiKey: 'hot-refresh-provider-key' } } },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().router.models).toEqual([existingModel]);

    released = true;
    const providers = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
    expect(providers.statusCode).toBe(200);
    expect(providers.json().providers.find((provider: { id: string }) => provider.id === 'openai').models)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: newModel })]));

    const selected = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings',
      payload: { defaultModel: newModel },
    });
    expect(selected.statusCode).toBe(200);
    expect(selected.json()).toMatchObject({ defaultModel: newModel });
    expect(server.agentState.currentModel).toBe(newModel);
    expect(startLiteLLM).toHaveBeenCalledTimes(2);

    const routerConfig = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'litellm.runtime.json'), 'utf8'),
    ) as { model_list: Array<{ model_name: string }> };
    expect(routerConfig.model_list.map((entry) => entry.model_name)).toContain(newModel);

    const completionFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Hot model completed.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 3 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const completion = await runAgentLoop({
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      model: server.agentState.currentModel,
      systemPrompt: 'Be concise.',
      tools: [],
      messages: [{ role: 'user', content: 'Confirm hot routing.' }],
      fetch: completionFetch,
    });
    expect(completion.content).toBe('Hot model completed.');
    expect(JSON.parse(String(completionFetch.mock.calls[0]?.[1]?.body)).model).toBe(newModel);
  });
});
