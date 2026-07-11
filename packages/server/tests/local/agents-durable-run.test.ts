import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addAgent } from '../../src/local/agents-store.js';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { agentEntityRoutes } from '../../src/local/routes/agents.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Agent Center durable Fleet run integration', () => {
  it('passes agentId, derives live state from the registry, and cancels only that run', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-durable-'));
    tempDirs.push(dataDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const agent = addAgent(dataDir, {
      name: 'Research agent',
      goal: 'Research the workspace',
      type: 'workspace',
      personaId: 'researcher',
      model: 'test-model',
      autonomyLevel: 'guided',
      workspaceIds: ['workspace-1'],
      memoryScopes: ['personal', 'workspace'],
      status: 'idle',
    });
    let receivedAgentId = '';
    let cancelledRunId = '';
    let legacyTraceStarts = 0;
    let legacyPauses = 0;
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('agentRunRegistry', registry);
    server.decorate('traceStore', {
      queryParsed: () => [],
      start: () => { legacyTraceStarts++; return 1; },
    } as never);
    server.decorate('sessionManager', {
      getActive: () => [],
      pause: () => { legacyPauses++; return true; },
    } as never);
    server.post('/api/fleet/spawn', async (request, reply) => {
      const body = request.body as { agentId: string; task: string; parentWorkspaceId: string };
      receivedAgentId = body.agentId;
      const room = registry.createRoom({
        workspaceIds: [body.parentWorkspaceId], source: 'fleet', title: 'Agent run', task: body.task,
      });
      const run = registry.createWorker({
        parentRunId: room.id,
        workspaceId: body.parentWorkspaceId,
        source: 'fleet',
        executor: { kind: 'waggle_agent', agentId: body.agentId, personaId: 'researcher', model: 'test-model' },
        title: 'Research agent',
        task: body.task,
        status: 'running',
        capabilities: { cancel: true },
      });
      registry.registerControls(run.id, { cancel: () => { cancelledRunId = run.id; } });
      return reply.code(202).send({
        runId: run.id,
        roomId: room.id,
        sessionId: `spawn-${run.id}`,
        workspaceId: body.parentWorkspaceId,
        status: 'running',
        statusUrl: `/api/agent-runs/${run.id}`,
        resumable: false,
        model: 'test-model',
      });
    });
    await server.register(agentEntityRoutes);

    const started = await server.inject({
      method: 'POST', url: `/api/agents/${agent.id}/run`, payload: { input: 'Investigate now' },
    });
    expect(started.statusCode).toBe(200);
    const startedBody = started.json() as { runId: string; roomId: string; resumable: boolean; statusUrl: string };
    expect(receivedAgentId).toBe(agent.id);
    expect(startedBody.runId).toMatch(/^run_/);
    expect(startedBody.roomId).toMatch(/^room_/);
    expect(startedBody.resumable).toBe(false);
    expect(startedBody.statusUrl).toBe(`/api/agent-runs/${startedBody.runId}`);
    expect(legacyTraceStarts).toBe(0);

    const agentsWhileRunning = await server.inject({ method: 'GET', url: '/api/agents' });
    expect(agentsWhileRunning.json().agents[0].status).toBe('running');

    const stopped = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` });
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json()).toMatchObject({ ok: true, paused: 0, cancelled: 1, runId: startedBody.runId });
    expect(cancelledRunId).toBe(startedBody.runId);
    expect(registry.get(startedBody.runId)?.status).toBe('cancelled');
    expect(legacyPauses).toBe(0);

    const agentsAfter = await server.inject({ method: 'GET', url: '/api/agents' });
    expect(agentsAfter.json().agents[0].status).toBe('completed');
    await server.close();
  });
});
