import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { agentRunsRoutes } from '../../src/local/routes/agent-runs.js';

const tempDirs: string[] = [];

function createRegistry(): { registry: AgentRunRegistry; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-runs-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'agent-runs.json');
  return { registry: new AgentRunRegistry(file), file };
}

function createTwoWorkerRoom(registry: AgentRunRegistry) {
  const room = registry.createRoom({
    workspaceIds: ['alpha', 'beta'],
    source: 'fleet',
    title: 'Research room',
    task: 'Research both workspaces',
    capabilities: { cancel: true },
  });
  const alpha = registry.createWorker({
    parentRunId: room.id,
    workspaceId: 'alpha',
    source: 'fleet',
    executor: { kind: 'waggle_agent', personaId: 'researcher' },
    title: 'Alpha researcher',
    task: room.task,
    capabilities: { cancel: true, pause: true, resume: true },
  });
  const beta = registry.createWorker({
    parentRunId: room.id,
    workspaceId: 'beta',
    source: 'fleet',
    executor: { kind: 'waggle_agent', personaId: 'writer' },
    title: 'Beta writer',
    task: room.task,
    capabilities: { cancel: true },
  });
  return { room, alpha, beta };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('AgentRunRegistry', () => {
  it('persists completed Rooms and complete worker snapshots atomically', () => {
    const { registry, file } = createRegistry();
    const { room, alpha, beta } = createTwoWorkerRoom(registry);
    registry.update(alpha.id, { status: 'running' });
    registry.update(beta.id, { status: 'running' });
    registry.update(alpha.id, { status: 'completed', result: { summary: 'Alpha done' } });
    registry.update(beta.id, { status: 'completed', result: { summary: 'Beta done' } });

    const restored = new AgentRunRegistry(file);
    expect(restored.get(alpha.id)?.status).toBe('completed');
    expect(restored.get(beta.id)?.result?.summary).toBe('Beta done');
    expect(restored.get(room.id)?.status).toBe('completed');
    expect(restored.snapshot().runs).toHaveLength(3);
  });

  it('enforces one workspace per worker and unique run ids', () => {
    const { registry } = createRegistry();
    const { room, alpha, beta } = createTwoWorkerRoom(registry);
    expect(new Set([room.id, alpha.id, beta.id]).size).toBe(3);
    expect(alpha.kind).toBe('worker');
    expect(alpha.workspaceId).toBe('alpha');
    expect(() => registry.createWorker({
      parentRunId: room.id,
      workspaceId: 'outside-room',
      source: 'fleet',
      executor: { kind: 'waggle_agent' },
      title: 'Invalid',
      task: 'Invalid',
    })).toThrow(/not part of Room/);
  });

  it('rejects illegal terminal transitions and derives a partial Room result', () => {
    const { registry } = createRegistry();
    const { room, alpha, beta } = createTwoWorkerRoom(registry);
    registry.update(alpha.id, { status: 'running' });
    registry.update(beta.id, { status: 'running' });
    registry.update(alpha.id, { status: 'completed' });
    registry.update(beta.id, { status: 'failed', result: { error: 'provider failed' } });

    expect(registry.get(room.id)?.status).toBe('completed');
    expect(registry.get(room.id)?.result?.summary).toContain('1/2 participants completed');
    expect(() => registry.update(alpha.id, { status: 'running' })).toThrow(/Illegal run transition/);
  });

  it('replays monotonic full-snapshot events with workspace filtering', () => {
    const { registry } = createRegistry();
    const { alpha } = createTwoWorkerRoom(registry);
    const before = registry.snapshot().lastSeq;
    registry.update(alpha.id, { status: 'running', progress: { message: 'Reading files' } });
    registry.update(alpha.id, { progress: { message: 'Writing result' } });

    const replay = registry.eventsSince(before, { workspaceId: 'alpha' });
    expect(replay.resetRequired).toBe(false);
    expect(replay.events.map((event) => event.seq)).toEqual(
      [...replay.events.map((event) => event.seq)].sort((a, b) => a - b),
    );
    expect(replay.events.at(-1)?.run.progress?.message).toBe('Writing result');
    expect(replay.events.every((event) =>
      event.run.kind === 'room' || event.run.workspaceId === 'alpha',
    )).toBe(true);
  });

  it('cancels only the selected same-Room worker', async () => {
    const { registry } = createRegistry();
    const room = registry.createRoom({
      workspaceIds: ['alpha'], source: 'fleet', title: 'Pair', task: 'Run twice',
    });
    const first = registry.createWorker({
      parentRunId: room.id, workspaceId: 'alpha', source: 'fleet',
      executor: { kind: 'waggle_agent' }, title: 'First', task: 'One',
      status: 'running', capabilities: { cancel: true },
    });
    const second = registry.createWorker({
      parentRunId: room.id, workspaceId: 'alpha', source: 'fleet',
      executor: { kind: 'waggle_agent' }, title: 'Second', task: 'Two',
      status: 'running', capabilities: { cancel: true },
    });
    let cancelled = '';
    registry.registerControls(first.id, { cancel: ({ run }) => { cancelled = run.id; } });
    registry.registerControls(second.id, { cancel: () => { throw new Error('wrong worker'); } });

    await registry.control(first.id, 'cancel');
    expect(cancelled).toBe(first.id);
    expect(registry.get(first.id)?.status).toBe('cancelled');
    expect(registry.get(second.id)?.status).toBe('running');
  });

  it('uses one truthful Room-level controller for a shared workflow', async () => {
    const { registry } = createRegistry();
    const room = registry.createRoom({
      workspaceIds: ['alpha'], source: 'agent_group', title: 'Shared workflow', task: 'Work together',
      capabilities: { cancel: true },
    });
    const first = registry.createWorker({
      parentRunId: room.id, workspaceId: 'alpha', source: 'agent_group',
      executor: { kind: 'waggle_agent' }, title: 'First', task: room.task,
      capabilities: { cancel: false },
    });
    const second = registry.createWorker({
      parentRunId: room.id, workspaceId: 'alpha', source: 'agent_group',
      executor: { kind: 'waggle_agent' }, title: 'Second', task: room.task,
      capabilities: { cancel: false },
    });
    let calls = 0;
    registry.registerControls(room.id, {
      cancel: () => {
        calls++;
        registry.update(first.id, { status: 'cancelled' });
        registry.update(second.id, { status: 'cancelled' });
      },
    });

    const cancelled = await registry.control(room.id, 'cancel');
    expect(calls).toBe(1);
    expect(cancelled.status).toBe('cancelled');
    expect(registry.get(first.id)?.status).toBe('cancelled');
    expect(registry.get(second.id)?.status).toBe('cancelled');
    await expect(registry.control(first.id, 'cancel')).rejects.toThrow(/already cancelled/);
  });

  it('issues ephemeral worker credentials and revokes them at terminal state', () => {
    const { registry, file } = createRegistry();
    const room = registry.createRoom({
      workspaceIds: ['alpha'], source: 'external_tool', title: 'External', task: 'Collaborate',
    });
    const worker = registry.createWorker({
      parentRunId: room.id, workspaceId: 'alpha', source: 'external_tool',
      executor: { kind: 'external_tool', toolId: 'codex' }, title: 'Codex', task: room.task,
      status: 'running',
    });

    const token = registry.issueCredential(worker.id);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(registry.authenticateCredential(token)?.id).toBe(worker.id);
    expect(registry.authenticateCredential('x'.repeat(43))).toBeUndefined();
    expect(fs.readFileSync(file, 'utf8')).not.toContain(token);

    registry.update(worker.id, { status: 'completed' });
    expect(registry.authenticateCredential(token)).toBeUndefined();
    expect(() => registry.issueCredential(room.id)).toThrow(/Worker run not found/);
  });

  it('marks internal work interrupted after restart and reconciles external pids separately', () => {
    const { registry, file } = createRegistry();
    const internalRoom = registry.createRoom({
      workspaceIds: ['alpha'], source: 'fleet', title: 'Internal', task: 'Run', status: 'running',
    });
    const internal = registry.createWorker({
      parentRunId: internalRoom.id, workspaceId: 'alpha', source: 'fleet',
      executor: { kind: 'waggle_agent' }, title: 'Internal', task: 'Run', status: 'running',
    });
    const externalRoom = registry.createRoom({
      workspaceIds: ['alpha'], source: 'external_tool', title: 'External', task: 'Run', status: 'running',
    });
    const external = registry.createWorker({
      parentRunId: externalRoom.id, workspaceId: 'alpha', source: 'external_tool',
      executor: { kind: 'external_tool', toolId: 'codex', pid: 4242 },
      title: 'Codex', task: 'Run', status: 'running',
    });

    const restored = new AgentRunRegistry(file);
    expect(restored.get(internal.id)?.status).toBe('interrupted');
    expect(restored.get(external.id)?.status).toBe('running');
    expect(restored.reconcileExternalProcesses(new Set())).toBe(1);
    expect(restored.get(external.id)?.status).toBe('interrupted');
  });
});

describe('agent run routes', () => {
  it('creates a Room, exposes snapshot/replay, and returns honest control errors', async () => {
    const { registry } = createRegistry();
    const server = Fastify({ logger: false });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', { get: (id: string) => id === 'alpha' ? { id } : undefined } as never);
    await server.register(agentRunsRoutes);

    const created = await server.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        workspaceIds: ['alpha'],
        source: 'fleet',
        title: 'Test room',
        task: 'Do the work',
      },
    });
    expect(created.statusCode).toBe(201);
    const roomId = (created.json() as { run: { id: string } }).run.id;

    const snapshot = await server.inject({ method: 'GET', url: '/api/agent-runs/snapshot?workspaceId=alpha' });
    expect(snapshot.statusCode).toBe(200);
    expect((snapshot.json() as { runs: unknown[] }).runs).toHaveLength(1);

    const events = await server.inject({ method: 'GET', url: '/api/agent-runs/events?since=0' });
    expect(events.statusCode).toBe(200);
    expect((events.json() as { events: unknown[] }).events.length).toBeGreaterThan(0);

    const unsupported = await server.inject({
      method: 'POST',
      url: `/api/agent-runs/${roomId}/control`,
      payload: { action: 'pause' },
    });
    expect(unsupported.statusCode).toBe(409);
    expect(unsupported.json().message).toMatch(/not supported/);
    await server.close();
  });
});
