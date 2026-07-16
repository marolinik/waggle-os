import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentResponse, ToolDefinition } from '@waggle/agent';
import { fleetRoutes } from '../../src/local/routes/fleet.js';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import {
  DEFAULT_TURN_SCHEMA_CHAR_LIMIT,
  DEFAULT_TURN_TOOL_LIMIT,
  measureOpenAiToolSchemaChars,
} from '../../src/local/persona-tool-filter.js';

const tempDirs: string[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
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
    let capturedTools: ToolDefinition[] | null = null;

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
    server.decorate('agentRunner', async (config: { tools: ToolDefinition[] }) => {
      capturedTools = config.tools;
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
    await waitFor(() => capturedTools !== null, 'Fleet runner did not receive its selected tool context');

    const selected = capturedTools ?? [];
    expect(availabilityCheck).toHaveBeenCalledOnce();
    expect(selected).toHaveLength(DEFAULT_TURN_TOOL_LIMIT);
    expect(selected.map((tool) => tool.name)).toEqual(
      relevantTools.slice(0, DEFAULT_TURN_TOOL_LIMIT).map((tool) => tool.name),
    );
    expect(measureOpenAiToolSchemaChars(selected)).toBeLessThanOrEqual(DEFAULT_TURN_SCHEMA_CHAR_LIMIT);
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
        const tools = [{ name: `tool-${toolBuilds.length}`, description: '', parameters: {}, execute: async () => '' }];
        toolBuilds.push({ cwd, workspaceId, tools });
        return tools;
      },
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
      payload: { task: 'First task', persona: 'researcher', parentWorkspaceId: 'workspace-1' },
    });
    const secondResponse = await server.inject({
      method: 'POST', url: '/api/fleet/spawn',
      payload: { task: 'Second task', persona: 'writer', parentWorkspaceId: 'workspace-1' },
    });
    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);
    const first = firstResponse.json() as { runId: string; roomId: string; resumable: boolean; statusUrl: string };
    const second = secondResponse.json() as { runId: string; roomId: string; resumable: boolean; statusUrl: string };
    expect(first.runId).not.toBe(second.runId);
    expect(first.roomId).not.toBe(second.roomId);
    expect(first.resumable).toBe(false);
    expect(first.statusUrl).toBe(`/api/agent-runs/${first.runId}`);
    await waitFor(() => calls.length === 2, 'both agents did not enter the runner');

    expect(orchestrators).toHaveLength(2);
    expect(orchestrators[0]).not.toBe(orchestrators[1]);
    expect(toolBuilds).toHaveLength(2);
    expect(toolBuilds.every((build) => build.cwd === fs.realpathSync(workspaceDir))).toBe(true);
    expect(toolBuilds.every((build) => build.workspaceId === 'workspace-1')).toBe(true);
    expect(calls[0].tools).not.toBe(calls[1].tools);
    expect(calls[0].signal).not.toBe(calls[1].signal);

    await registry.control(first.runId, 'cancel');
    expect(registry.get(first.runId)?.status).toBe('cancelled');
    expect(registry.get(second.runId)?.status).toBe('running');
    calls[1].finish.resolve({
      content: 'Second completed', toolsUsed: ['tool-1'], usage: { inputTokens: 3, outputTokens: 4 },
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
    expect(memoryRuns).toHaveLength(2);
    expect(releases).toEqual(['workspace-1', 'workspace-1']);

    const restored = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    expect(restored.get(first.runId)?.status).toBe('cancelled');
    expect(restored.get(second.runId)?.status).toBe('completed');
    await server.close();
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
