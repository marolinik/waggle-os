/**
 * Agent entity REST API Route Tests (UX-Refactor Phase 3, S09/S18 / gate B3).
 *
 * Covers the 7 routes in routes/agents.ts:
 *   GET    /api/agents             list + derived status/lastRunAt/successRate
 *   POST   /api/agents             create (PRO gate, blueprint hard-gate validation)
 *   GET    /api/agents/:id         one agent
 *   PATCH  /api/agents/:id         partial update (immutable id/createdAt)
 *   POST   /api/agents/:id/run     C23 one-shot delegation to /api/fleet/spawn
 *   POST   /api/agents/:id/pause   sessionManager.pause mapping
 *   GET    /api/agents/:id/traces  execution_traces read via the agent:{id} tag
 *
 * The fleet spawn target is a STUB route registered on the test server — the
 * tests assert the delegation wiring (payload mapping + trace tagging), not the
 * agent loop itself. Trace derivation uses a real ExecutionTraceStore over an
 * in-memory mind. requireTier reads {dataDir}/config.json — written as PRO in
 * beforeEach (one test rewrites it FREE to assert the 403).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MindDB, ExecutionTraceStore } from '@waggle/core';
import { agentEntityRoutes } from '../../src/local/routes/agents.js';

interface FakeSession {
  workspaceId: string;
  personaId?: string | null;
  status: 'active' | 'paused' | 'idle';
}

function createTestServer(opts: {
  dataDir: string;
  traceStore: ExecutionTraceStore;
  sessions?: FakeSession[];
  pausedIds?: string[];
  spawnCalls?: Array<Record<string, unknown>>;
  auditRecords?: Array<Record<string, unknown>>;
}) {
  const server = Fastify({ logger: false });
  server.decorate('localConfig', { dataDir: opts.dataDir });
  server.decorate('traceStore', opts.traceStore);
  server.decorate('sessionManager', {
    getActive: () => opts.sessions ?? [],
    pause: (wsId: string) => {
      opts.pausedIds?.push(wsId);
      return true;
    },
  });
  server.decorate('auditStore', {
    record: (input: Record<string, unknown>) => {
      opts.auditRecords?.push(input);
      return input;
    },
  });
  // Stub of the real executor path POST /api/fleet/spawn (fleet.ts).
  server.post('/api/fleet/spawn', async (request) => {
    const body = request.body as Record<string, unknown>;
    opts.spawnCalls?.push(body);
    return {
      id: body.parentWorkspaceId ?? 'default-workspace',
      workspaceId: body.parentWorkspaceId ?? 'default-workspace',
      sessionId: `spawn-${Date.now()}`,
      status: 'active',
      task: body.task,
      model: body.model,
    };
  });
  server.register(agentEntityRoutes);
  return server;
}

const VALID_BODY = {
  name: 'Research Scout',
  goal: 'Track competitor launches weekly',
  model: 'claude-haiku-4-5',
  autonomyLevel: 'guided',
  memoryScopes: ['workspace'],
  type: 'workspace',
  personaId: 'researcher',
  workspaceIds: ['ws-a'],
};

describe('Agent entity routes (Phase 3)', () => {
  let db: MindDB;
  let traceStore: ExecutionTraceStore;
  let dataDir: string;
  let server: ReturnType<typeof Fastify>;
  let spawnCalls: Array<Record<string, unknown>>;
  let pausedIds: string[];
  let auditRecords: Array<Record<string, unknown>>;
  let sessions: FakeSession[];

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `waggle-agents-${randomUUID()}`);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ tier: 'PRO' }), 'utf-8');
    db = new MindDB(':memory:');
    traceStore = new ExecutionTraceStore(db);
    spawnCalls = [];
    pausedIds = [];
    auditRecords = [];
    sessions = [];
    server = createTestServer({ dataDir, traceStore, sessions, pausedIds, spawnCalls, auditRecords });
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch { /* Windows handle lingering — ignore */ }
  });

  async function createAgent(body: Record<string, unknown> = VALID_BODY) {
    const res = await server.inject({ method: 'POST', url: '/api/agents', payload: body });
    expect(res.statusCode).toBe(201);
    return res.json().agent;
  }

  it('boots and lists an empty index', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agents: [], count: 0 });
  });

  it('POST creates an agent with defaults + agents.json persisted', async () => {
    const agent = await createAgent();
    expect(agent.id).toMatch(/^agent_/);
    expect(agent.status).toBe('idle');
    expect(agent.type).toBe('workspace');
    expect(agent.goal).toBe(VALID_BODY.goal);
    expect(typeof agent.createdAt).toBe('string');
    // The full effective surface is the stored record (no hidden access).
    const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'agents.json'), 'utf-8'));
    expect(file.agents).toHaveLength(1);
    expect(file.agents[0].memoryScopes).toEqual(['workspace']);
    // successRate/lastRunAt are NEVER persisted (B3).
    expect('successRate' in file.agents[0]).toBe(false);
    expect('lastRunAt' in file.agents[0]).toBe(false);
  });

  it('POST enforces the blueprint hard gate (goal/model/memoryScopes/autonomyLevel)', async () => {
    const cases: Array<Record<string, unknown>> = [
      { ...VALID_BODY, goal: undefined },
      { ...VALID_BODY, model: undefined },
      { ...VALID_BODY, memoryScopes: undefined },
      { ...VALID_BODY, memoryScopes: [] },
      { ...VALID_BODY, memoryScopes: ['enterprise'] }, // C36: not a Scope
      { ...VALID_BODY, autonomyLevel: undefined },
      { ...VALID_BODY, autonomyLevel: 'yolo' },
      { ...VALID_BODY, type: 'bogus' },
      { ...VALID_BODY, name: '  ' },
    ];
    for (const payload of cases) {
      const res = await server.inject({ method: 'POST', url: '/api/agents', payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it('POST is PRO-gated (FREE tier → 403 TIER_INSUFFICIENT)', async () => {
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ tier: 'FREE' }), 'utf-8');
    const res = await server.inject({ method: 'POST', url: '/api/agents', payload: VALID_BODY });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('TIER_INSUFFICIENT');
  });

  it('POST records an elevated-surface audit entry when connectors/MCPs are claimed (never riskLevel critical — M2)', async () => {
    await createAgent({ ...VALID_BODY, connectorIds: ['slack'], mcpIds: ['github-mcp'] });
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0].approvalClass).toBe('elevated');
    expect(auditRecords[0].riskLevel).toBe('medium');
    // No connectors/mcps → no audit entry.
    await createAgent({ ...VALID_BODY, name: 'Plain' });
    expect(auditRecords).toHaveLength(1);
  });

  it('GET /:id returns the agent; unknown id 404s; /active is not shadowed', async () => {
    const agent = await createAgent();
    const one = await server.inject({ method: 'GET', url: `/api/agents/${agent.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().agent.id).toBe(agent.id);
    expect((await server.inject({ method: 'GET', url: '/api/agents/agent_unknown' })).statusCode).toBe(404);
  });

  it('PATCH updates fields and preserves immutable id/createdAt', async () => {
    const agent = await createAgent();
    const res = await server.inject({
      method: 'PATCH', url: `/api/agents/${agent.id}`,
      payload: { name: 'Renamed', autonomyLevel: 'high', status: 'archived' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().agent;
    expect(updated.name).toBe('Renamed');
    expect(updated.autonomyLevel).toBe('high');
    expect(updated.status).toBe('archived');
    expect(updated.id).toBe(agent.id);
    expect(updated.createdAt).toBe(agent.createdAt);
  });

  it('PATCH rejects invalid enum values + unknown id', async () => {
    const agent = await createAgent();
    expect((await server.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, payload: { autonomyLevel: 'bogus' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, payload: { status: 'bogus' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PATCH', url: '/api/agents/agent_unknown', payload: { name: 'X' } })).statusCode).toBe(404);
  });

  it('run delegates to the real fleet spawn with the agent→spawn body mapping (C23)', async () => {
    const agent = await createAgent();
    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/run`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().sessionId).toMatch(/^spawn-/);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toMatchObject({
      task: VALID_BODY.goal,           // no input → the agent's goal is the task
      persona: 'researcher',
      model: 'claude-haiku-4-5',
      parentWorkspaceId: 'ws-a',       // single workspace → auto-selected
    });
  });

  it('run tags an execution trace with agent:{id} (B3 derived-at-read key)', async () => {
    const agent = await createAgent();
    await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/run`, payload: { input: 'Scan today' } });
    const traces = traceStore.queryParsed({ limit: 10 });
    expect(traces).toHaveLength(1);
    expect(traces[0].payload.tags).toContain(`agent:${agent.id}`);
    expect(traces[0].payload.input).toBe('Scan today');
    expect(traces[0].outcome).toBe('pending'); // spawn loop has no completion hook
  });

  it('run 400s on workspace ambiguity and on a non-assigned workspace (C23)', async () => {
    const agent = await createAgent({ ...VALID_BODY, workspaceIds: ['ws-a', 'ws-b'] });
    const ambiguous = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/run`, payload: {} });
    expect(ambiguous.statusCode).toBe(400);
    expect(ambiguous.json().error).toBe('workspace_ambiguous');
    expect(ambiguous.json().workspaceIds).toEqual(['ws-a', 'ws-b']);

    const wrong = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/run`, payload: { workspaceId: 'ws-c' } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('workspace_not_assigned');

    const picked = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/run`, payload: { workspaceId: 'ws-b' } });
    expect(picked.statusCode).toBe(200);
    expect(spawnCalls.at(-1)?.parentWorkspaceId).toBe('ws-b');
  });

  it('run 404s for an unknown agent; rejects a traversal workspaceId', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/agents/agent_unknown/run', payload: {} })).statusCode).toBe(404);
    const agent = await createAgent();
    const res = await server.inject({
      method: 'POST', url: `/api/agents/${agent.id}/run`,
      payload: { workspaceId: '../../etc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('pause maps the agent to its active workspace session', async () => {
    const agent = await createAgent();
    sessions.push({ workspaceId: 'ws-a', personaId: 'researcher', status: 'active' });
    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, paused: 1 });
    expect(pausedIds).toEqual(['ws-a']);
  });

  it('pause 404s when no matching active session exists (incl. persona mismatch)', async () => {
    const agent = await createAgent();
    expect((await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` })).statusCode).toBe(404);
    sessions.push({ workspaceId: 'ws-a', personaId: 'writer', status: 'active' });
    expect((await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` })).statusCode).toBe(404);
  });

  it('GET list overlays live running status from active sessions (B3 read-derived)', async () => {
    const agent = await createAgent();
    sessions.push({ workspaceId: 'ws-a', personaId: 'researcher', status: 'active' });
    const res = await server.inject({ method: 'GET', url: '/api/agents' });
    expect(res.json().agents[0].status).toBe('running');
    sessions[0].status = 'paused';
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe('paused');
    // Stored status comes back once the session is gone.
    sessions.length = 0;
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe(agent.status);
  });

  it('derives successRate and lastRunAt from tagged execution traces (B3)', async () => {
    const agent = await createAgent();
    const tag = [`agent:${agent.id}`];
    const t1 = traceStore.start({ sessionId: 's1', input: 'a', tags: tag });
    traceStore.finalize(t1, { outcome: 'success', output: 'ok' });
    const t2 = traceStore.start({ sessionId: 's2', input: 'b', tags: tag });
    traceStore.finalize(t2, { outcome: 'success', output: 'ok' });
    const t3 = traceStore.start({ sessionId: 's3', input: 'c', tags: tag });
    traceStore.finalize(t3, { outcome: 'corrected', output: 'meh' });
    traceStore.start({ sessionId: 's4', input: 'd', tags: tag }); // pending — excluded from rate

    const res = await server.inject({ method: 'GET', url: '/api/agents' });
    const view = res.json().agents[0];
    expect(view.successRate).toBeCloseTo(2 / 3, 5);
    expect(typeof view.lastRunAt).toBe('string');
  });

  it('GET /:id/traces returns only this agent\'s tagged traces, newest first', async () => {
    const agent = await createAgent();
    const other = await createAgent({ ...VALID_BODY, name: 'Other' });
    const t1 = traceStore.start({ sessionId: 's1', input: 'mine', tags: [`agent:${agent.id}`] });
    traceStore.finalize(t1, {
      outcome: 'success', output: 'ok',
      toolCalls: [{ tool: 'web_search', args: {}, result: 'r', ok: true, durationMs: 5, timestamp: new Date().toISOString() }],
    });
    traceStore.start({ sessionId: 's2', input: 'theirs', tags: [`agent:${other.id}`] });

    const res = await server.inject({ method: 'GET', url: `/api/agents/${agent.id}/traces` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.traces[0].sessionId).toBe('s1');
    expect(body.traces[0].outcome).toBe('success');
    expect(body.traces[0].tools).toEqual(['web_search']);
    expect((await server.inject({ method: 'GET', url: '/api/agents/agent_unknown/traces' })).statusCode).toBe(404);
  });

  it('survives a corrupt agents.json (degrades to empty, not 500)', async () => {
    fs.writeFileSync(path.join(dataDir, 'agents.json'), '{not json', 'utf-8');
    const res = await server.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(0);
  });
});
