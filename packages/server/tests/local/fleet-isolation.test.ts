import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MultiMindCache } from '@waggle/core';
import {
  createSubAgentTools,
  createWorkflowTools,
  type AgentLoopConfig,
  type AgentResponse,
  type ToolDefinition,
} from '@waggle/agent';
import { fleetRoutes } from '../../src/local/routes/fleet.js';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import {
  DEFAULT_TURN_SCHEMA_CHAR_LIMIT,
  DEFAULT_TURN_TOOL_LIMIT,
  measureOpenAiToolSchemaChars,
} from '../../src/local/persona-tool-filter.js';
import {
  bindWorkspaceChildTools,
  type WorkspaceCollaborationBinding,
} from '../../src/local/index.js';
import { WorkspaceTurnCoordinator } from '../../src/local/workspace-turn-coordinator.js';

const tempDirs: string[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('isolated Fleet execution', () => {
  it('rejects an unavailable explicit model without creating a run and uses an available explicit model exactly', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-explicit-model-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const runnerModels: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'anthropic/claude-explicit' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const server = Fastify({ logger: false });
    server.decorate('localConfig', {
      dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test', manageLiteLLM: false,
    });
    server.decorate('agentRunRegistry', registry);
    server.decorate('vault', {
      get: (provider: string) => provider === 'anthropic' ? { value: 'anthropic-test-key' } : undefined,
    } as never);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: (id: string) => id === 'workspace-1'
        ? { id, name: 'Project', group: 'test', created: new Date().toISOString(), directory: workspaceDir, model: 'anthropic/workspace-default' }
        : undefined,
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 10, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('agentState', {
      currentModel: 'anthropic/current-fallback',
      litellmApiKey: 'test-key',
      createSessionOrchestrator: () => ({
        setGoalAncestry: () => {},
        buildSystemPrompt: () => 'system',
        buildAssembledPrompt: async () => ({ system: 'assembled', responseScaffold: '', debug: {} }),
      }),
      buildToolsForSession: () => [],
    } as never);
    server.decorate('agentRunner', async (config: { model: string }) => {
      runnerModels.push(config.model);
      return { content: 'Done', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    server.decorate('fleetResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] },
    }));
    await server.register(fleetRoutes);

    const unavailable = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: { task: 'Do not substitute', model: 'openai/gpt-explicit-missing', parentWorkspaceId: 'workspace-1' },
    });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json()).toMatchObject({ error: 'model_unavailable' });
    expect(unavailable.json().message).toContain('openai/gpt-explicit-missing');
    expect(registry.snapshot().runs).toHaveLength(0);
    expect(runnerModels).toHaveLength(0);

    const explicitModel = 'anthropic/claude-explicit';
    const available = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: { task: 'Use this exact model', model: explicitModel, parentWorkspaceId: 'workspace-1' },
    });
    expect(available.statusCode).toBe(202);
    const body = available.json() as { runId: string; model: string };
    expect(body.model).toBe(explicitModel);
    await waitFor(() => runnerModels.length === 1, 'explicit model run did not start');
    expect(runnerModels).toEqual([explicitModel]);
    expect(registry.get(body.runId)?.executor.model).toBe(explicitModel);
    await server.close();
  });

  it('runs an explicit keyless OpenAI-compatible model configured by base URL', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-compatible-model-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
      providers: {
        'openai-compatible': {
          apiKey: '',
          baseUrl: 'http://qwen.test/v1',
          models: ['openai-compatible/qwen3.8-flash-next'],
        },
      },
    }));
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const runnerModels: string[] = [];
    const server = Fastify({ logger: false });
    server.decorate('localConfig', {
      dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test', manageLiteLLM: false,
    });
    server.decorate('agentRunRegistry', registry);
    server.decorate('vault', { get: () => undefined } as never);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: (id: string) => id === 'workspace-1'
        ? { id, name: 'Project', group: 'test', created: new Date().toISOString(), directory: workspaceDir }
        : undefined,
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 10, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('agentState', {
      currentModel: 'openai-compatible/qwen3.8-flash-next',
      litellmApiKey: 'test-key',
      llmProvider: { provider: 'anthropic-proxy', health: 'degraded' },
      createSessionOrchestrator: () => ({
        setGoalAncestry: () => {},
        buildSystemPrompt: () => 'system',
        buildAssembledPrompt: async () => ({ system: 'assembled', responseScaffold: '', debug: {} }),
      }),
      buildToolsForSession: () => [],
    } as never);
    server.decorate('agentRunner', async (config: { model: string }) => {
      runnerModels.push(config.model);
      return { content: 'Done', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    server.decorate('fleetResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] },
    }));
    await server.register(fleetRoutes);

    const model = 'openai-compatible/qwen3.8-flash-next';
    const unavailable = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: {
        task: 'Reject a model that the compatible endpoint did not advertise',
        model: 'openai-compatible/unlisted-model',
        parentWorkspaceId: 'workspace-1',
      },
    });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json()).toMatchObject({
      error: 'model_unavailable',
      message: expect.stringContaining('openai-compatible/unlisted-model'),
    });
    expect(registry.list()).toEqual([]);
    expect(runnerModels).toEqual([]);

    const nestedPrefix = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: {
        task: 'Reject a duplicated provider prefix',
        model: 'openai-compatible/openai-compatible/qwen3.8-flash-next',
        parentWorkspaceId: 'workspace-1',
      },
    });
    expect(nestedPrefix.statusCode).toBe(409);
    expect(nestedPrefix.json()).toMatchObject({
      error: 'model_unavailable',
      message: expect.stringContaining('openai-compatible/openai-compatible/qwen3.8-flash-next'),
    });
    expect(registry.list()).toEqual([]);
    expect(runnerModels).toEqual([]);

    const response = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: { task: 'Use the configured Qwen model', model, parentWorkspaceId: 'workspace-1' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ model });
    await waitFor(() => runnerModels.length === 1, 'keyless compatible Fleet run did not start');
    expect(runnerModels).toEqual([model]);
    await server.close();
  });

  it('falls back from a stale implicit workspace Ollama model to the installed current model', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-stale-workspace-model-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const currentModel = 'ollama/llama3.2:latest';
    const runnerModels: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      models: [{ name: 'llama3.2:latest' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const server = Fastify({ logger: false });
    server.decorate('localConfig', {
      dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://127.0.0.1:37421/v1',
    });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: (id: string) => id === 'workspace-1'
        ? {
            id,
            name: 'Project',
            group: 'test',
            created: new Date().toISOString(),
            directory: workspaceDir,
            model: 'ollama/removed:latest',
          }
        : undefined,
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 10, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('agentState', {
      currentModel,
      litellmApiKey: 'test-key',
      createSessionOrchestrator: () => ({
        setGoalAncestry: () => {},
        buildSystemPrompt: () => 'system',
        buildAssembledPrompt: async () => ({ system: 'assembled', responseScaffold: '', debug: {} }),
      }),
      buildToolsForSession: () => [],
    } as never);
    server.decorate('agentRunner', async (config: { model: string }) => {
      runnerModels.push(config.model);
      return { content: 'Done', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    server.decorate('fleetResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] },
    }));
    await server.register(fleetRoutes);

    const response = await server.inject({
      method: 'POST',
      url: '/api/fleet/spawn',
      payload: { task: 'Use the installed local model', model: 'auto', parentWorkspaceId: 'workspace-1' },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json() as { runId: string; model: string };
    expect(body.model).toBe(currentModel);
    await waitFor(() => runnerModels.length === 1, 'fallback Fleet run did not start');
    expect(runnerModels).toEqual([currentModel]);
    expect(registry.get(body.runId)?.executor.model).toBe(currentModel);
    await server.close();
  });

  it('filters availability and selects at most 14 tools from 29 relevant candidates in a 78-tool pool', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-tool-context-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const availabilityCheck = vi.fn(() => false);
    const makeTool = (
      name: string,
      description: string,
      checkAvailability?: () => boolean,
    ): ToolDefinition => ({
      name,
      description,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: `Input for ${name}` } },
      },
      execute: async () => 'ok',
      ...(checkAvailability ? { checkAvailability } : {}),
    });
    const relevantTools = Array.from({ length: 29 }, (_, index) =>
      makeTool(`code_tool_${index}`, 'Run code tests and inspect implementation.'));
    const irrelevantTools = Array.from({ length: 48 }, (_, index) =>
      makeTool(`calendar_tool_${index}`, 'Schedule calendar meetings and manage appointments.'));
    const unavailableTool = makeTool(
      'offline_calendar_tool',
      'Schedule calendar meetings while offline.',
      availabilityCheck,
    );
    const fullPool = [...relevantTools, ...irrelevantTools, unavailableTool];
    let capturedConfig: AgentLoopConfig | null = null;

    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test' });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: (id: string) => id === 'workspace-1'
        ? { id, name: 'Project', group: 'test', created: new Date().toISOString(), directory: workspaceDir, model: 'test-model' }
        : undefined,
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 10, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('agentState', {
      currentModel: 'test-model',
      litellmApiKey: 'test-key',
      createSessionOrchestrator: () => ({
        setGoalAncestry: () => {},
        buildSystemPrompt: () => 'system',
        buildAssembledPrompt: async () => ({ system: 'assembled', responseScaffold: '', debug: {} }),
      }),
      buildToolsForSession: () => fullPool,
    } as never);
    server.decorate('agentRunner', async (config: AgentLoopConfig) => {
      capturedConfig = config;
      return { content: 'Done', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    server.decorate('fleetResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] },
    }));
    await server.register(fleetRoutes);

    expect(fullPool).toHaveLength(78);
    expect(relevantTools).toHaveLength(29);
    const response = await server.inject({
      method: 'POST',
      url: '/api/fleet/spawn',
      payload: {
        task: 'Run code tests and inspect this implementation',
        persona: 'fleet-tool-context-regression',
        parentWorkspaceId: 'workspace-1',
      },
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json() as { runId: string };
    await waitFor(() => capturedConfig !== null, 'Fleet runner did not receive its selected tool context');

    const selected = capturedConfig?.tools ?? [];
    expect(availabilityCheck).toHaveBeenCalledOnce();
    expect(selected).toHaveLength(DEFAULT_TURN_TOOL_LIMIT);
    expect(selected.map((tool) => tool.name)).toEqual(
      relevantTools.slice(0, DEFAULT_TURN_TOOL_LIMIT).map((tool) => tool.name),
    );
    expect(measureOpenAiToolSchemaChars(selected)).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
    expect(capturedConfig).toMatchObject({
      maxTurns: 9,
      maxToolRounds: 8,
      maxTokenBudget: 80_000,
      synthesisReserveTokens: 14_000,
      toolContextBudget: {
        maxSingleResultChars: 8_000,
        recentResultCount: 2,
        historicalResultChars: 750,
      },
    });
    await waitFor(() => registry.get(runId)?.status === 'completed', 'bounded Fleet run did not complete');
    await server.close();
  });

  it('runs two same-workspace agents with distinct orchestrators, tools, and abort signals', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-isolation-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const releases: string[] = [];
    const orchestrators: unknown[] = [];
    const toolBuilds: Array<{ cwd: string; workspaceId?: string; tools: unknown[] }> = [];
    const calls: Array<{ signal?: AbortSignal; tools: unknown[]; finish: ReturnType<typeof deferred<AgentResponse>> }> = [];
    const memoryRuns: string[] = [];
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test' });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: (id: string) => id === 'workspace-1'
        ? { id, name: 'Project', group: 'test', created: new Date().toISOString(), directory: workspaceDir, model: 'test-model' }
        : undefined,
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 10, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', {
      acquire: (workspaceId: string) => ({ workspaceId }),
      release: (workspaceId: string) => { releases.push(workspaceId); },
    } as never);
    server.decorate('agentState', {
      currentModel: 'test-model',
      litellmApiKey: 'test-key',
      createSessionOrchestrator: () => {
        const orchestrator = {
          setGoalAncestry: () => {},
          buildSystemPrompt: () => 'system',
          buildAssembledPrompt: async () => ({ system: 'assembled', responseScaffold: '', debug: {} }),
        };
        orchestrators.push(orchestrator);
        return orchestrator;
      },
      buildToolsForSession: (_orchestrator: unknown, cwd: string, workspaceId?: string) => {
        const tools = [{ name: 'edit_file', description: '', parameters: {}, execute: async () => '' }];
        toolBuilds.push({ cwd, workspaceId, tools });
        return tools;
      },
      bindWorkspaceCollaborationTools: ({ visibleTools }: { visibleTools: ToolDefinition[] }) => visibleTools,
      workspaceTurnCoordinator: new WorkspaceTurnCoordinator(),
    } as never);
    server.decorate('agentRunner', (config: { signal?: AbortSignal; tools: unknown[] }) => {
      const finish = deferred<AgentResponse>();
      calls.push({ signal: config.signal, tools: config.tools, finish });
      config.signal?.addEventListener('abort', () => finish.resolve({
        content: 'Cancelled', toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 },
      }), { once: true });
      return finish.promise;
    });
    server.decorate('fleetResultRecorder', async ({ run }) => {
      memoryRuns.push(run.id);
      return { status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] } };
    });
    await server.register(fleetRoutes);

    const firstResponse = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: { task: 'Edit the first file', persona: 'coder', parentWorkspaceId: 'workspace-1' },
    });
    const secondResponse = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: { task: 'Edit the second file', persona: 'writer', parentWorkspaceId: 'workspace-1' },
    });
    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);
    const first = firstResponse.json() as { runId: string; roomId: string; resumable: boolean; statusUrl: string };
    const second = secondResponse.json() as { runId: string; roomId: string; resumable: boolean; statusUrl: string };
    expect(first.runId).not.toBe(second.runId);
    expect(first.roomId).not.toBe(second.roomId);
    expect(first.resumable).toBe(false);
    expect(first.statusUrl).toBe(`/api/agent-runs/${first.runId}`);
    await waitFor(() => calls.length >= 1, 'first mutating agent did not enter the runner');
    expect(calls.map((call) => call.tools.map((item) => (item as ToolDefinition).name)))
      .toEqual([['edit_file']]);

    expect(orchestrators).toHaveLength(2);
    expect(orchestrators[0]).not.toBe(orchestrators[1]);
    expect(toolBuilds).toHaveLength(2);
    expect(toolBuilds.every((build) => build.cwd === fs.realpathSync(workspaceDir))).toBe(true);
    expect(toolBuilds.every((build) => build.workspaceId === 'workspace-1')).toBe(true);
    expect(registry.get(second.runId)?.status).toBe('queued');

    await registry.control(first.runId, 'cancel');
    await waitFor(() => calls.length === 2, 'second mutating agent did not start after the first released the workspace');
    expect(registry.get(first.runId)?.status).toBe('cancelled');
    expect(registry.get(second.runId)?.status).toBe('running');
    expect(calls[0].tools).not.toBe(calls[1].tools);
    expect(calls[0].signal).not.toBe(calls[1].signal);
    calls[1].finish.resolve({
      content: 'Second completed', toolsUsed: ['edit_file'], usage: { inputTokens: 3, outputTokens: 4 },
    });
    await waitFor(() => registry.get(second.runId)?.status === 'completed', 'second run did not complete');
    expect(registry.get(second.runId)).toMatchObject({
      status: 'completed',
      result: { summary: 'Second completed' },
      metrics: { inputTokens: 3, outputTokens: 4 },
      memoryRefs: { status: 'complete' },
    });
    expect(registry.get(second.roomId)).toMatchObject({
      status: 'completed',
      result: { summary: 'Second completed' },
      memoryRefs: { status: 'complete' },
    });
    expect(memoryRuns).toEqual([second.runId]);
    expect(releases).toEqual(['workspace-1', 'workspace-1']);

    const restored = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    expect(restored.get(first.runId)?.status).toBe('cancelled');
    expect(restored.get(second.runId)?.status).toBe('completed');
    await server.close();
  });

  it('does not resolve cancellation before the real workspace mind pin is released', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-cancel-drain-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const mindCache = new MultiMindCache({
      maxOpen: 1,
      allowedRoot: dataDir,
      getMindPath: (workspaceId) => path.join(dataDir, `${workspaceId}.mind`),
    });
    const runnerStarted = deferred<void>();
    const abortObserved = deferred<void>();
    const runnerMayFinish = deferred<void>();
    const mutationStarted = deferred<void>();
    const mutationMayFinish = deferred<void>();
    let recorderCalled = false;
    const workspaceTurnCoordinator = new WorkspaceTurnCoordinator();
    const competingScope = workspaceTurnCoordinator.createScope(workspaceDir);
    let mutation: Promise<unknown> | undefined;
    const server = Fastify({ logger: false });
    server.decorate('localConfig', {
      dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test',
    });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: (id: string) => id === 'workspace-1'
        ? {
            id, name: 'Project', group: 'test', created: new Date().toISOString(),
            directory: workspaceDir, model: 'test-model',
          }
        : undefined,
    } as never);
    server.decorate('sessionManager', {
      getMaxSessions: () => 10, size: 0, getActive: () => [],
    } as never);
    server.decorate('mindCache', mindCache);
    server.decorate('agentState', {
      currentModel: 'test-model',
      litellmApiKey: 'test-key',
      createSessionOrchestrator: () => ({
        setGoalAncestry: () => {},
        buildSystemPrompt: () => 'system',
        buildAssembledPrompt: async () => ({
          system: 'assembled', responseScaffold: '', debug: {},
        }),
      }),
      buildToolsForSession: () => [{
        name: 'edit_file',
        description: '',
        parameters: {},
        execute: async () => {
          mutationStarted.resolve(undefined);
          await mutationMayFinish.promise;
          return 'edited';
        },
      }],
      bindWorkspaceCollaborationTools: ({ visibleTools }: { visibleTools: ToolDefinition[] }) => visibleTools,
      workspaceTurnCoordinator,
    } as never);
    server.decorate('agentRunner', (config: AgentLoopConfig) => new Promise<AgentResponse>((resolve) => {
      const editFile = config.tools.find((tool) => tool.name === 'edit_file');
      if (!editFile) throw new Error('Fleet runner did not receive edit_file');
      mutation = editFile.execute({});
      void mutation.catch(() => undefined);
      runnerStarted.resolve(undefined);
      config.signal?.addEventListener('abort', () => {
        abortObserved.resolve(undefined);
        void runnerMayFinish.promise.then(() => resolve({
          content: 'Cancelled',
          toolsUsed: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        }));
      }, { once: true });
    }));
    server.decorate('fleetResultRecorder', async ({ run }) => {
      recorderCalled = true;
      return {
        status: 'complete',
        personalFrameIds: [],
        workspaceFrameIds: { [run.workspaceId]: [] },
      };
    });
    server.addHook('onClose', async () => {
      registry.close();
      mindCache.closeAll();
    });
    await server.register(fleetRoutes);

    const response = await server.inject({
      method: 'POST',
      url: '/api/fleet/spawn',
      payload: {
        task: 'Edit until cancelled',
        persona: 'coder',
        parentWorkspaceId: 'workspace-1',
      },
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json() as { runId: string };
    await runnerStarted.promise;
    await mutationStarted.promise;
    let competingAcquired = false;
    const competing = competingScope.acquire('write').then(() => { competingAcquired = true; });
    const eventCursor = registry.snapshot().lastSeq;

    let cancelSettled = false;
    const cancel = registry.control(runId, 'cancel').then((run) => {
      cancelSettled = true;
      return run;
    });
    let concurrentCancelSettled = false;
    let concurrentCancelError: unknown;
    const concurrentCancel = registry.control(runId, 'cancel').then(
      (run) => {
        concurrentCancelSettled = true;
        return run;
      },
      (error: unknown) => {
        concurrentCancelSettled = true;
        concurrentCancelError = error;
        return undefined;
      },
    );
    let lateCancel: Promise<unknown> | undefined;
    let lateCancelSettled = false;
    let lateCancelError: unknown;
    try {
      await abortObserved.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(cancelSettled).toBe(false);
      expect(concurrentCancelSettled).toBe(false);
      expect(registry.get(runId)?.status).toBe('cancelling');

      mindCache.getOrOpen('pressure-1');
      expect(mindCache.has('workspace-1')).toBe(true);

      runnerMayFinish.resolve(undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(recorderCalled).toBe(false);
      expect(cancelSettled).toBe(false);
      expect(concurrentCancelSettled).toBe(false);
      expect(registry.get(runId)?.status).toBe('cancelling');
      expect(competingAcquired).toBe(false);

      lateCancel = registry.control(runId, 'cancel').then(
        (run) => {
          lateCancelSettled = true;
          return run;
        },
        (error: unknown) => {
          lateCancelSettled = true;
          lateCancelError = error;
          return undefined;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(lateCancelSettled).toBe(false);

      mutationMayFinish.resolve(undefined);
      if (mutation) await mutation;
      await Promise.all([cancel, concurrentCancel, lateCancel]);
      expect(concurrentCancelError).toBeUndefined();
      expect(lateCancelError).toBeUndefined();
      expect(registry.get(runId)?.status).toBe('cancelled');
      const terminalRunEvents = registry.eventsSince(eventCursor).events
        .filter((event) => event.run.id === runId)
        .map((event) => event.run.status)
        .filter((status) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(status));
      expect(terminalRunEvents).toEqual(['cancelled']);
      expect(recorderCalled).toBe(false);
      await competing;
      expect(competingAcquired).toBe(true);

      mindCache.getOrOpen('pressure-2');
      expect(mindCache.has('workspace-1')).toBe(false);
    } finally {
      runnerMayFinish.resolve(undefined);
      mutationMayFinish.resolve(undefined);
      await Promise.allSettled([
        ...(mutation ? [mutation] : []),
        cancel,
        concurrentCancel,
        ...(lateCancel ? [lateCancel] : []),
        competing,
      ]);
      await competingScope.release();
      await server.close();
    }
  });

  it('serializes nested workflow and subagent writers inside one Fleet checkout lease', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-nested-transaction-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const firstMayFinish = deferred<void>();
    const running = new Set<string>();
    const starts: string[] = [];
    const reads: string[] = [];
    let shared = 'v0';
    const spawnFirstMayFinish = deferred<void>();
    const spawnRunning = new Set<string>();
    const spawnStarts: string[] = [];
    const spawnReads: string[] = [];
    let spawnShared = 's0';
    let activeRunnerCalls = 0;
    const checkoutTools: ToolDefinition[] = [
      { name: 'read_file', description: 'Read shared state', parameters: {}, execute: async () => shared },
      { name: 'edit_file', description: 'Edit shared state', parameters: {}, execute: async () => 'edited' },
    ];
    const buildCollaborationTools = (
      availableTools: ToolDefinition[],
      childRunLoop: (config: AgentLoopConfig) => Promise<AgentResponse>,
      signal?: AbortSignal,
    ) => [
      ...createSubAgentTools({
        availableTools,
        runLoop: childRunLoop,
        litellmUrl: 'http://llm.test',
        litellmApiKey: 'test-key',
        defaultModel: 'test-model',
        onSubAgentStatus: (event) => {
          if (event.status === 'running') spawnRunning.add(event.name);
        },
      }),
      ...createWorkflowTools({
        availableTools,
        runLoop: childRunLoop,
        litellmUrl: 'http://llm.test',
        litellmApiKey: 'test-key',
        defaultModel: 'test-model',
        signal,
        onWorkerStatus: ({ status, workerState }) => {
          if (status === 'running') running.add(workerState.name);
        },
      }),
    ];
    const executeRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      const task = String(config.messages[0]?.content ?? '');
      if (task.includes('WORKER_A')) {
        starts.push('A');
        const seen = shared;
        reads.push(`A:${seen}`);
        await firstMayFinish.promise;
        shared = seen === 'v0' ? 'v1' : 'corrupt-a';
        return { content: 'A complete', toolsUsed: ['read_file', 'edit_file'], usage: { inputTokens: 1, outputTokens: 1 } };
      }
      if (task.includes('WORKER_B')) {
        starts.push('B');
        const seen = shared;
        reads.push(`B:${seen}`);
        shared = seen === 'v1' ? 'v2' : 'corrupt-b';
        return { content: 'B complete', toolsUsed: ['read_file', 'edit_file'], usage: { inputTokens: 1, outputTokens: 1 } };
      }
      if (task.includes('SPAWN_A')) {
        spawnStarts.push('A');
        const seen = spawnShared;
        spawnReads.push(`A:${seen}`);
        await spawnFirstMayFinish.promise;
        spawnShared = seen === 's0' ? 's1' : 'corrupt-spawn-a';
        return { content: 'Spawn A complete', toolsUsed: ['read_file', 'edit_file'], usage: { inputTokens: 1, outputTokens: 1 } };
      }
      if (task.includes('SPAWN_B')) {
        spawnStarts.push('B');
        const seen = spawnShared;
        spawnReads.push(`B:${seen}`);
        spawnShared = seen === 's1' ? 's2' : 'corrupt-spawn-b';
        return { content: 'Spawn B complete', toolsUsed: ['read_file', 'edit_file'], usage: { inputTokens: 1, outputTokens: 1 } };
      }
      const workflow = config.tools.find((tool) => tool.name === 'orchestrate_workflow');
      if (!workflow) throw new Error('Fleet did not receive orchestrate_workflow');
      const output = await workflow.execute({
        task: 'Exercise nested Fleet checkout isolation',
        inline_template: {
          name: 'Nested Fleet writers',
          description: 'Two parallel checkout writers',
          aggregation: 'concatenate',
          steps: [
            { name: 'Writer A', role: 'writer', task: 'WORKER_A mutate shared state', tools: ['read_file', 'edit_file'] },
            { name: 'Writer B', role: 'writer', task: 'WORKER_B mutate shared state', tools: ['read_file', 'edit_file'] },
          ],
        },
      });
      const spawn = config.tools.find((tool) => tool.name === 'spawn_agent');
      if (!spawn) throw new Error('Fleet did not receive spawn_agent');
      const spawnOutput = await Promise.all([
        spawn.execute({ name: 'Spawn A', role: 'writer', task: 'SPAWN_A mutate shared state' }),
        spawn.execute({ name: 'Spawn B', role: 'writer', task: 'SPAWN_B mutate shared state' }),
      ]);
      return {
        content: `${String(output)}\n${spawnOutput.join('\n')}`,
        toolsUsed: ['orchestrate_workflow', 'spawn_agent'],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };
    const runner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      activeRunnerCalls += 1;
      try {
        return await executeRunner(config);
      } finally {
        activeRunnerCalls -= 1;
      }
    };

    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test' });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1',
      list: () => [{ id: 'workspace-1' }],
      get: () => ({
        id: 'workspace-1', name: 'Project', group: 'test', created: new Date().toISOString(),
        directory: workspaceDir, model: 'test-model',
      }),
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 10, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('agentState', {
      currentModel: 'test-model',
      litellmApiKey: 'test-key',
      createSessionOrchestrator: () => ({
        setGoalAncestry: () => {},
        buildSystemPrompt: () => 'system',
        buildAssembledPrompt: async () => ({ system: 'assembled', responseScaffold: '', debug: {} }),
      }),
      buildToolsForSession: () => [
        ...checkoutTools,
        ...buildCollaborationTools(checkoutTools, runner),
      ],
      bindWorkspaceCollaborationTools: (options: WorkspaceCollaborationBinding) => (
        bindWorkspaceChildTools(options, buildCollaborationTools)
      ),
      workspaceTurnCoordinator: new WorkspaceTurnCoordinator(),
    } as never);
    server.decorate('agentRunner', runner);
    server.decorate('fleetResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [], workspaceFrameIds: { [run.workspaceId]: [] },
    }));
    server.addHook('onClose', async () => { registry.close(); });
    await server.register(fleetRoutes);

    const response = await server.inject({
      method: 'POST',
      url: '/api/fleet/spawn',
      payload: {
        task: 'Use orchestrate_workflow and spawn_agent for parallel writers',
        persona: 'general-purpose',
        parentWorkspaceId: 'workspace-1',
      },
    });
    expect(response.statusCode).toBe(202);
    const { runId } = response.json() as { runId: string };

    try {
      await waitFor(() => starts.length >= 1, 'first nested workflow writer did not start');
      await waitFor(() => running.size === 2, 'nested workflow writers were not both dispatched');
      expect(starts).toEqual(['A']);
      expect(reads).toEqual(['A:v0']);
      expect(shared).toBe('v0');
      firstMayFinish.resolve(undefined);
      await waitFor(() => starts.length === 2 && shared === 'v2', 'nested workflow writers did not settle');
      expect(starts).toEqual(['A', 'B']);
      expect(reads).toEqual(['A:v0', 'B:v1']);
      expect(shared).toBe('v2');
      await waitFor(() => spawnStarts.length >= 1, 'first nested subagent writer did not start');
      await waitFor(() => spawnRunning.size === 2, 'nested subagent writers were not both dispatched');
      expect(spawnStarts).toEqual(['A']);
      expect(spawnReads).toEqual(['A:s0']);
      expect(spawnShared).toBe('s0');
      spawnFirstMayFinish.resolve(undefined);
      await waitFor(() => registry.get(runId)?.status === 'completed', 'nested Fleet run did not complete');
      expect(spawnStarts).toEqual(['A', 'B']);
      expect(spawnReads).toEqual(['A:s0', 'B:s1']);
      expect(spawnShared).toBe('s2');
    } finally {
      firstMayFinish.resolve(undefined);
      spawnFirstMayFinish.resolve(undefined);
      const current = registry.get(runId);
      if (current && !['completed', 'failed', 'cancelled'].includes(current.status)) {
        await registry.control(runId, 'cancel');
      }
      await waitFor(() => activeRunnerCalls === 0, 'nested Fleet runner did not unwind');
      await waitFor(
        () => ['completed', 'failed', 'cancelled'].includes(registry.get(runId)?.status ?? ''),
        'nested Fleet run did not settle',
      );
      await server.close();
    }
  });

  it('enforces the shared concurrency cap before creating another run', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fleet-cap-'));
    tempDirs.push(dataDir);
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1', list: () => [{ id: 'workspace-1' }],
      get: () => ({ id: 'workspace-1', name: 'Project', group: 'test', created: new Date().toISOString(), directory: workspaceDir, model: 'test-model' }),
    } as never);
    server.decorate('sessionManager', { getMaxSessions: () => 1, size: 0, getActive: () => [] } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('agentState', {
      currentModel: 'test-model', litellmApiKey: 'key',
      createSessionOrchestrator: () => ({ setGoalAncestry: () => {}, buildSystemPrompt: () => 'system' }),
      buildToolsForSession: () => [],
    } as never);
    server.decorate('agentRunner', ({ signal }: { signal?: AbortSignal }) => new Promise<AgentResponse>((resolve) => {
      signal?.addEventListener('abort', () => resolve({ content: 'cancelled', toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 } }), { once: true });
    }));
    server.decorate('fleetResultRecorder', async ({ run }) => ({ status: 'complete', personalFrameIds: [], workspaceFrameIds: { [run.workspaceId]: [] } }));
    await server.register(fleetRoutes);

    const first = await server.inject({ method: 'POST', url: '/api/fleet/spawn', payload: { task: 'One' } });
    expect(first.statusCode).toBe(202);
    await waitFor(() => registry.get((first.json() as { runId: string }).runId)?.status === 'running', 'first did not start');
    const second = await server.inject({ method: 'POST', url: '/api/fleet/spawn', payload: { task: 'Two' } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('fleet_capacity_reached');
    await registry.control((first.json() as { runId: string }).runId, 'cancel');
    await server.close();
  });
});
