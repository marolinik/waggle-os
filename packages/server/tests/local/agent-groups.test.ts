import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FrameStore, MindDB } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { localJobRoutes } from '../../src/local/routes/jobs.js';
import { agentGroupRoutes } from '../../src/local/routes/agent-groups.js';
import { LocalJobStore } from '../../src/local/job-store.js';
import { SignalBus } from '../../src/local/signal-bus.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function createServer(runLoop: (config: { systemPrompt: string }) => Promise<AgentResponse>) {
  const server = Fastify({ logger: false });
  const store = new LocalJobStore();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-groups-'));
  server.decorate('localConfig', {
    dataDir,
    port: 0,
    host: '127.0.0.1',
    litellmUrl: 'http://localhost:4000',
  });
  server.decorate('localJobStore', store);
  server.decorate('agentState', {
    allTools: [],
    currentModel: 'test-model',
    litellmApiKey: 'test-key',
    hookRegistry: undefined,
    spawnSecurityContext: null,
  });
  server.decorate('agentRunner', runLoop);
  server.register(agentGroupRoutes);
  server.register(localJobRoutes);
  return server;
}

async function waitForJob(server: ReturnType<typeof Fastify>, jobId: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await server.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    const job = response.json() as { status: string; output?: Record<string, unknown> };
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('job did not finish');
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

describe('local agent group execution', () => {
  let server: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await server?.close();
    const dataDir = server?.localConfig.dataDir;
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    server = undefined;
  });

  it('executes a persisted group and exposes worker output through the job endpoint', async () => {
    const prompts: string[] = [];
    server = createServer(async (config) => {
      prompts.push(config.systemPrompt);
      return {
        content: `result-${prompts.length}`,
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });

    const created = await server.inject({
      method: 'POST',
      url: '/api/agent-groups',
      payload: {
        name: 'Research pair',
        strategy: 'parallel',
        members: [
          { agentId: 'researcher', roleInGroup: 'worker', executionOrder: 0 },
          { agentId: 'writer', roleInGroup: 'worker', executionOrder: 1 },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    const group = created.json() as { id: string };
    const started = await server.inject({
      method: 'POST',
      url: `/api/agent-groups/${group.id}/run`,
      payload: { task: 'Compare the two draft options' },
    });
    expect(started.statusCode).toBe(202);

    const job = await waitForJob(server, (started.json() as { jobId: string }).jobId);
    expect(job.status).toBe('completed');
    expect((job.output?.workers as unknown[])).toHaveLength(2);
    expect(job.output?.aggregated).toContain('result-');
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('Agent Instructions');
  });

  it('runs a parallel group in one durable Room with Dance events and two-mind result attribution', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-group-room-'));
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const signalBus = new SignalBus();
    const personalMind = new MindDB(':memory:');
    const workspaceMind = new MindDB(':memory:');
    const calls: Array<{ config: AgentLoopConfig; finish: ReturnType<typeof deferred<AgentResponse>> }> = [];
    const toolBuilds: Array<{ cwd: string; workspaceId?: string }> = [];

    server = Fastify({ logger: false });
    server.decorate('localConfig', {
      dataDir, port: 0, host: '127.0.0.1', litellmUrl: 'http://llm.test',
    });
    server.decorate('localJobStore', new LocalJobStore());
    server.decorate('agentRunRegistry', registry);
    server.decorate('signalBus', signalBus);
    server.decorate('multiMind', { personal: personalMind } as never);
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
    server.decorate('mindCache', {
      acquire: () => workspaceMind,
      release: () => {},
    } as never);
    server.decorate('agentState', {
      allTools: [],
      currentModel: 'fallback-model',
      litellmApiKey: 'test-key',
      hookRegistry: undefined,
      spawnSecurityContext: null,
      createSessionOrchestrator: () => ({ autoSaveFromExchange: async () => {} }),
      buildToolsForSession: (_orchestrator: unknown, cwd: string, workspaceId?: string) => {
        toolBuilds.push({ cwd, workspaceId });
        return [];
      },
    } as never);
    server.decorate('agentRunner', (config: AgentLoopConfig) => {
      const finish = deferred<AgentResponse>();
      calls.push({ config, finish });
      return finish.promise;
    });
    server.addHook('onClose', async () => {
      registry.close();
      personalMind.close();
      workspaceMind.close();
    });
    server.register(agentGroupRoutes);
    server.register(localJobRoutes);

    const created = await server.inject({
      method: 'POST', url: '/api/agent-groups',
      payload: {
        name: 'Parallel research room', strategy: 'parallel',
        members: [
          { agentId: 'researcher', roleInGroup: 'worker', executionOrder: 0 },
          { agentId: 'writer', roleInGroup: 'worker', executionOrder: 1 },
        ],
      },
    });
    const groupId = (created.json() as { id: string }).id;
    const started = await server.inject({
      method: 'POST', url: `/api/agent-groups/${groupId}/run`,
      payload: { task: 'Research and draft the answer', workspaceId: 'workspace-1' },
    });
    expect(started.statusCode).toBe(202);
    const startBody = started.json() as { jobId: string; roomId: string; runIds: string[] };
    expect(startBody.runIds).toHaveLength(2);

    await waitFor(() => calls.length === 2, 'parallel members did not start together');
    expect(toolBuilds).toEqual([{
      cwd: fs.realpathSync(workspaceDir), workspaceId: 'workspace-1',
    }]);
    expect(calls.every(({ config }) => config.model === 'claude-sonnet-4-6')).toBe(true);
    expect(registry.get(startBody.roomId)?.status).toBe('running');
    expect(startBody.runIds.map((id) => registry.get(id)?.status)).toEqual(['running', 'running']);
    expect(signalBus.query({ teamId: `room::${startBody.roomId}` }).filter((signal) => signal.subtype === 'task_delegation')).toHaveLength(2);
    expect(signalBus.query({ teamId: `room::${startBody.roomId}` }).filter((signal) => signal.subtype === 'task_claim')).toHaveLength(2);

    calls[0].finish.resolve({
      content: 'Research result', toolsUsed: ['search_memory'], usage: { inputTokens: 3, outputTokens: 4 },
    });
    calls[1].finish.resolve({
      content: 'Draft result', toolsUsed: ['write_file'], usage: { inputTokens: 5, outputTokens: 6 },
    });
    const job = await waitForJob(server, startBody.jobId);
    expect(job.status).toBe('completed');
    await waitFor(
      () => startBody.runIds.every((id) => registry.get(id)?.memoryRefs.status === 'complete')
        && registry.get(startBody.roomId)?.memoryRefs.status === 'complete',
      'worker and Room results were not attributed to both minds',
    );
    const room = registry.get(startBody.roomId)!;
    const workerRuns = startBody.runIds.map((id) => registry.get(id)!);
    expect(room.status).toBe('completed');
    expect(room.memoryRefs.status).toBe('complete');

    const personalStore = new FrameStore(personalMind);
    const workspaceStore = new FrameStore(workspaceMind);
    const workerPersonalIds = workerRuns.flatMap((run) => run.memoryRefs.personalFrameIds);
    const workerWorkspaceIds = workerRuns.flatMap((run) => run.memoryRefs.workspaceFrameIds['workspace-1'] ?? []);
    const roomPersonalIds = room.memoryRefs.personalFrameIds;
    const roomWorkspaceIds = room.memoryRefs.workspaceFrameIds['workspace-1'] ?? [];
    expect(workerPersonalIds).toHaveLength(2);
    expect(workerWorkspaceIds).toHaveLength(2);
    expect(roomPersonalIds).toHaveLength(1);
    expect(roomWorkspaceIds).toHaveLength(1);
    expect(new Set([...workerPersonalIds, ...roomPersonalIds]).size).toBe(3);
    expect(new Set([...workerWorkspaceIds, ...roomWorkspaceIds]).size).toBe(3);

    for (const run of workerRuns) {
      const expected = run.executor.personaId === 'researcher' ? 'Research result' : 'Draft result';
      const other = expected === 'Research result' ? 'Draft result' : 'Research result';
      const personalFrame = personalStore.getById(run.memoryRefs.personalFrameIds[0]!);
      const workspaceFrame = workspaceStore.getById(run.memoryRefs.workspaceFrameIds['workspace-1']![0]!);
      expect(personalFrame?.content).toContain(`Run: ${run.id}`);
      expect(personalFrame?.content).toContain(expected);
      expect(personalFrame?.content).not.toContain(other);
      expect(workspaceFrame?.content).toContain(`Run: ${run.id}`);
      expect(workspaceFrame?.content).toContain(expected);
      expect(workspaceFrame?.content).not.toContain(other);
    }

    const roomPersonalFrame = personalStore.getById(roomPersonalIds[0]!);
    const roomWorkspaceFrame = workspaceStore.getById(roomWorkspaceIds[0]!);
    expect(roomPersonalFrame?.content).toContain('Research result');
    expect(roomPersonalFrame?.content).toContain('Draft result');
    expect(roomWorkspaceFrame?.content).toContain('Research result');
    expect(roomWorkspaceFrame?.content).toContain('Draft result');
    expect(signalBus.query({ teamId: `room::${startBody.roomId}` }).filter((signal) => signal.subtype === 'routed_share')).toHaveLength(2);
  });

  it('cancels a shared group once through the Room controller', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-group-cancel-'));
    const workspaceDir = path.join(dataDir, 'project');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const calls: Array<{ signal?: AbortSignal }> = [];
    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('localJobStore', new LocalJobStore());
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      getDefault: () => 'workspace-1', list: () => [{ id: 'workspace-1' }],
      get: () => ({
        id: 'workspace-1', name: 'Project', group: 'test', created: new Date().toISOString(),
        directory: workspaceDir, model: 'test-model',
      }),
    } as never);
    server.decorate('mindCache', { acquire: () => ({}), release: () => {} } as never);
    server.decorate('multiMind', { personal: {} } as never);
    server.decorate('agentState', {
      allTools: [], currentModel: 'model', litellmApiKey: 'key', hookRegistry: undefined,
      spawnSecurityContext: null,
      createSessionOrchestrator: () => ({ autoSaveFromExchange: async () => {} }),
      buildToolsForSession: () => [],
    } as never);
    server.decorate('agentRunner', (config: AgentLoopConfig) => new Promise<AgentResponse>((resolve) => {
      calls.push({ signal: config.signal });
      config.signal?.addEventListener('abort', () => resolve({
        content: 'Stopped', toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 },
      }), { once: true });
    }));
    server.register(agentGroupRoutes);

    const created = await server.inject({
      method: 'POST', url: '/api/agent-groups',
      payload: {
        name: 'Cancelable group', strategy: 'parallel',
        members: [
          { agentId: 'researcher', roleInGroup: 'worker', executionOrder: 0 },
          { agentId: 'writer', roleInGroup: 'worker', executionOrder: 1 },
        ],
      },
    });
    const started = await server.inject({
      method: 'POST', url: `/api/agent-groups/${(created.json() as { id: string }).id}/run`,
      payload: { task: 'Keep working until cancelled', workspaceId: 'workspace-1' },
    });
    const body = started.json() as { jobId: string; roomId: string; runIds: string[] };
    await waitFor(() => calls.length === 2, 'group workers did not start');

    await registry.control(body.roomId, 'cancel');
    expect(registry.get(body.roomId)?.status).toBe('cancelled');
    expect(body.runIds.map((id) => registry.get(id)?.status)).toEqual(['cancelled', 'cancelled']);
    expect(server.localJobStore.get(body.jobId)?.status).toBe('cancelled');
    expect(calls.every((call) => call.signal?.aborted)).toBe(true);
  });

  it('rejects malformed groups before they can create a permanently queued run', async () => {
    server = createServer(async () => ({
      content: 'unused',
      toolsUsed: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }));

    const response = await server.inject({
      method: 'POST',
      url: '/api/agent-groups',
      payload: {
        name: 'Incomplete group',
        strategy: 'parallel',
        members: [{ agentId: 'researcher', roleInGroup: 'worker', executionOrder: 0 }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('at least two');
  });
});
