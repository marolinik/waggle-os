/**
 * Agent entity REST API Route Tests (UX-Refactor Phase 3, S09/S18 / gate B3).
 *
 * Covers the 7 routes in routes/agents.ts:
 *   GET    /api/agents             list + derived status/lastRunAt/successRate
 *   POST   /api/agents             create (UNGATED — CLAUDE.md §1 moat: agents
 *                                  are free on every tier; blueprint hard-gate
 *                                  validation + elevated-surface audit)
 *   GET    /api/agents/:id         one agent
 *   PATCH  /api/agents/:id         partial update (immutable id/createdAt,
 *                                  blank-field rejection, audit on
 *                                  connector/MCP changes)
 *   POST   /api/agents/:id/run     C23 one-shot delegation to /api/fleet/spawn
 *   POST   /api/agents/:id/pause   acts ONLY on the agent's OWN recorded run
 *   GET    /api/agents/:id/traces  execution_traces read via the agent:{id} tag
 *
 * The fleet spawn target is a STUB route registered on the test server — the
 * tests assert the delegation wiring (payload mapping + trace tagging), not the
 * agent loop itself. Trace derivation uses a real ExecutionTraceStore over an
 * in-memory mind. The REAL agentRoutes plugin (routes/agent.ts) registers
 * BEFORE agentEntityRoutes — same order as local/index.ts — so the static
 * /api/agents/active precedence is asserted against the real route, not a stub.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MindDB, ExecutionTraceStore } from '@waggle/core';
import { agentRoutes } from '../../src/local/routes/agent.js';
import { agentEntityRoutes } from '../../src/local/routes/agents.js';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { securityMiddleware } from '../../src/local/security-middleware.js';
import type { WorkspaceSession } from '../../src/local/workspace-sessions.js';

interface FakeSession {
  workspaceId: string;
  personaId?: string | null;
  /** Typed from the REAL session union ('active' | 'paused' | 'error') so the
   *  fake cannot drift from workspace-sessions.ts. */
  status: WorkspaceSession['status'];
}

function createTestServer(opts: {
  dataDir: string;
  traceStore: ExecutionTraceStore;
  sessions?: FakeSession[];
  pausedIds?: string[];
  spawnCalls?: Array<Record<string, unknown>>;
  auditRecords?: Array<Record<string, unknown>>;
  agentRunRegistry?: AgentRunRegistry;
  workspaceManager?: { get(id: string): unknown };
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
  if (opts.agentRunRegistry) server.decorate('agentRunRegistry', opts.agentRunRegistry);
  if (opts.workspaceManager) server.decorate('workspaceManager', opts.workspaceManager as never);
  // Minimal agentState so the REAL agentRoutes plugin registers (it reads
  // costTracker at register time). No subagentOrchestrator → /api/agents/active
  // returns the empty orchestrator state.
  server.decorate('agentState', {
    costTracker: {
      getStats: () => ({ totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0, turns: 0 }),
      formatSummary: () => '',
    },
    currentModel: 'test-model',
    sessionHistories: new Map(),
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
  if (opts.agentRunRegistry && opts.workspaceManager) server.register(securityMiddleware);
  // Same order as local/index.ts: agentRoutes (static /api/agents/active)
  // first, then the /:id param plugin.
  server.register(agentRoutes);
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

  it('rejects workspace traversal before /api/history can read an escaped session file', async () => {
    const escapedDir = path.join(dataDir, 'outside', 'sessions');
    fs.mkdirSync(escapedDir, { recursive: true });
    fs.writeFileSync(
      path.join(escapedDir, 'leak.jsonl'),
      `${JSON.stringify({ role: 'assistant', content: 'outside-secret' })}\n`,
    );

    const res = await server.inject({
      method: 'GET',
      url: '/api/history?workspace=..%2Foutside&session=leak',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('outside-secret');
  });

  it.each([
    ['workspace', '..\\outside'],
    ['workspace', 'C:\\outside'],
    ['workspace', '\\\\server\\share'],
    ['workspace', '/absolute'],
    ['session', '../../../outside/leak'],
    ['session', '..\\..\\..\\outside\\leak'],
  ] as const)('rejects unsafe %s history segment %s', async (field, value) => {
    const query = new URLSearchParams({ workspace: 'ws-safe', session: 'session-safe' });
    query.set(field, value);

    const res = await server.inject({
      method: 'GET',
      url: `/api/history?${query.toString()}`,
    });

    expect(res.statusCode).toBe(400);
  });

  it('loads a valid on-disk history after segment validation', async () => {
    const sessionDir = path.join(dataDir, 'workspaces', 'ws-safe', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'session-safe.jsonl'),
      `${JSON.stringify({ role: 'assistant', content: 'inside-history' })}\n`,
    );

    const res = await server.inject({
      method: 'GET',
      url: '/api/history?workspace=ws-safe&session=session-safe',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      sessionId: 'session-safe',
      count: 1,
      messages: [{ role: 'assistant', content: 'inside-history' }],
    });
  });

  /** One-shot run helper — also pushes the spawn's session into the fake
   *  session manager so liveStatus/pause have something to act on. */
  async function runAgent(agent: { id: string }, payload: Record<string, unknown> = {}) {
    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/run`, payload });
    expect(res.statusCode).toBe(200);
    return res.json() as { sessionId: string; workspaceId: string };
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

  it('POST is NOT tier-gated — agents are free on every tier (CLAUDE.md §1 moat)', async () => {
    // FREE-tier config present: creation must still succeed — the executor
    // (fleet spawn) is free for all tiers, so a paid-tier gate here would be
    // an incoherent surface.
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ tier: 'FREE' }), 'utf-8');
    const res = await server.inject({ method: 'POST', url: '/api/agents', payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
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

  it('GET /:id returns the agent; unknown id 404s', async () => {
    const agent = await createAgent();
    const one = await server.inject({ method: 'GET', url: `/api/agents/${agent.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().agent.id).toBe(agent.id);
    expect((await server.inject({ method: 'GET', url: '/api/agents/agent_unknown' })).statusCode).toBe(404);
  });

  it('GET /api/agents/active is NOT shadowed — the real agentRoutes orchestrator state answers, not /:id', async () => {
    await createAgent();
    const res = await server.inject({ method: 'GET', url: '/api/agents/active' });
    expect(res.statusCode).toBe(200);
    // The orchestrator-state shape from routes/agent.ts (no orchestrator
    // running → empty arrays) — NOT a 404 and NOT an AgentRecord envelope.
    expect(res.json()).toEqual({ workers: [], active: [] });
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

  it('PATCH rejects invalid enum values, blanked required fields + unknown id', async () => {
    const agent = await createAgent();
    expect((await server.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, payload: { autonomyLevel: 'bogus' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, payload: { status: 'bogus' } })).statusCode).toBe(400);
    // Required fields may change but never blank out (mirrors create).
    expect((await server.inject({ method: 'PATCH', url: `/api/agents/${agent.id}`, payload: { goal: '   ' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PATCH', url: '/api/agents/agent_unknown', payload: { name: 'X' } })).statusCode).toBe(404);
  });

  it('PATCH records an elevated-surface audit entry when connector/MCP claims change', async () => {
    const agent = await createAgent(); // created clean — no audit entry yet
    expect(auditRecords).toHaveLength(0);

    // create-clean-then-patch-in must not bypass the audit trail.
    const res = await server.inject({
      method: 'PATCH', url: `/api/agents/${agent.id}`,
      payload: { connectorIds: ['slack'] },
    });
    expect(res.statusCode).toBe(200);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0].approvalClass).toBe('elevated');
    expect(auditRecords[0].riskLevel).toBe('medium');
    expect(String(auditRecords[0].detail)).toContain('updated');

    // PATCHing the SAME lists again is not a surface change — no new entry.
    await server.inject({
      method: 'PATCH', url: `/api/agents/${agent.id}`,
      payload: { connectorIds: ['slack'] },
    });
    expect(auditRecords).toHaveLength(1);
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
      savedAgentId: agent.id,          // opt in to authoritative stored policy
      agentId: agent.id,               // preserve durable-run correlation
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

  it('run opens the workspace picker when the saved agent has no workspace assignment', async () => {
    server.decorate('workspaceManager', {
      list: () => [{ id: 'ws-a' }, { id: 'ws-b' }],
      get: () => undefined,
    } as never);
    const agent = await createAgent({ ...VALID_BODY, workspaceIds: [] });

    const response = await server.inject({
      method: 'POST', url: `/api/agents/${agent.id}/run`, payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'workspace_ambiguous',
      workspaceIds: ['ws-a', 'ws-b'],
    });
    expect(spawnCalls).toHaveLength(0);
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

  it('pause stops the agent\'s OWN recorded run only (no workspace+persona heuristic)', async () => {
    const agent = await createAgent();
    await runAgent(agent);
    sessions.push({ workspaceId: 'ws-a', personaId: 'researcher', status: 'active' });
    // An unrelated active session in ANOTHER workspace must never be touched.
    sessions.push({ workspaceId: 'ws-other', personaId: 'researcher', status: 'active' });

    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, paused: 1 });
    expect(pausedIds).toEqual(['ws-a']);

    // The run is consumed — a second pause has nothing to act on.
    expect((await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` })).statusCode).toBe(404);
  });

  it('pause never touches a session the agent did not spawn — even a same-workspace+persona co-tenant', async () => {
    const agent = await createAgent();
    // The OLD heuristic matched workspace+persona and would have aborted this
    // co-tenant chat session. With explicit run tracking: no recorded run → 404.
    sessions.push({ workspaceId: 'ws-a', personaId: 'researcher', status: 'active' });
    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/no recorded run/i);
    expect(pausedIds).toEqual([]);
  });

  it('blocks a viewer from pausing the agent durable run resolved by stored ownership', async () => {
    const agent = await createAgent({ ...VALID_BODY, workspaceIds: ['viewer-workspace'] });
    await server.close();
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    server = createTestServer({
      dataDir,
      traceStore,
      sessions,
      pausedIds,
      spawnCalls,
      auditRecords,
      agentRunRegistry: registry,
      workspaceManager: {
        get: (id: string) => id === 'viewer-workspace'
          ? { id, teamId: 'team-1', teamRole: 'viewer' }
          : undefined,
      },
    });
    const room = registry.createRoom({
      workspaceIds: ['viewer-workspace'],
      source: 'fleet',
      title: 'Viewer agent room',
      task: 'Keep running',
    });
    const worker = registry.createWorker({
      parentRunId: room.id,
      workspaceId: 'viewer-workspace',
      source: 'fleet',
      executor: { kind: 'waggle_agent', agentId: agent.id },
      title: 'Viewer agent worker',
      task: room.task,
      status: 'running',
      capabilities: { cancel: true },
    });
    let controlCalls = 0;
    registry.registerControls(worker.id, { cancel: () => { controlCalls++; } });

    const response = await server.inject({
      method: 'POST',
      url: `/api/agents/${agent.id}/pause`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(controlCalls).toBe(0);
    expect(registry.get(worker.id)?.status).toBe('running');
  });

  it('agent with no workspaceIds is pausable after an explicit runtime workspace pick', async () => {
    const agent = await createAgent({ ...VALID_BODY, name: 'NoWs', workspaceIds: undefined });
    const run = await runAgent(agent, { workspaceId: 'picked-workspace' });
    expect(run.workspaceId).toBe('picked-workspace');
    sessions.push({ workspaceId: 'picked-workspace', personaId: 'researcher', status: 'active' });

    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` });
    expect(res.statusCode).toBe(200);
    expect(pausedIds).toEqual(['picked-workspace']);
  });

  it('pause 404s when the recorded run has no active session left', async () => {
    const agent = await createAgent();
    await runAgent(agent);
    // No session in the fake manager at all → nothing to pause.
    expect((await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` })).statusCode).toBe(404);
  });

  it('GET list overlays live status from the agent\'s OWN recorded run (B3 read-derived)', async () => {
    const agent = await createAgent();
    // A co-tenant active session WITHOUT a recorded run must NOT read as running.
    sessions.push({ workspaceId: 'ws-a', personaId: 'researcher', status: 'active' });
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe('idle');

    await runAgent(agent);
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe('running');
    sessions[0].status = 'paused';
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe('paused');
    // Stored status comes back once the session is gone.
    sessions.length = 0;
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe(agent.status);
  });

  it('errored session: stored status shows and pause skips it (real status union incl. error)', async () => {
    const agent = await createAgent();
    await runAgent(agent);
    sessions.push({ workspaceId: 'ws-a', personaId: 'researcher', status: 'error' });

    // liveStatus: 'error' is neither active nor paused → stored status applies.
    expect((await server.inject({ method: 'GET', url: '/api/agents' })).json().agents[0].status).toBe('idle');

    // pause: no ACTIVE session → 404, and the errored session is untouched.
    const res = await server.inject({ method: 'POST', url: `/api/agents/${agent.id}/pause` });
    expect(res.statusCode).toBe(404);
    expect(pausedIds).toEqual([]);
  });

  it('derives successRate and lastRunAt from tagged execution traces only (B3 + tagLike filter)', async () => {
    const agent = await createAgent();
    const tag = [`agent:${agent.id}`];
    const t1 = traceStore.start({ sessionId: 's1', input: 'a', tags: tag });
    traceStore.finalize(t1, { outcome: 'success', output: 'ok' });
    const t2 = traceStore.start({ sessionId: 's2', input: 'b', tags: tag });
    traceStore.finalize(t2, { outcome: 'success', output: 'ok' });
    const t3 = traceStore.start({ sessionId: 's3', input: 'c', tags: tag });
    traceStore.finalize(t3, { outcome: 'corrected', output: 'meh' });
    traceStore.start({ sessionId: 's4', input: 'd', tags: tag }); // pending — excluded from rate

    // Unrelated traffic must not pollute the derivation: an untagged chat
    // trace and ANOTHER agent's failing trace (both would skew the rate if
    // the agent:{id} tag filter were not applied).
    const chat = traceStore.start({ sessionId: 'chat-1', input: 'unrelated chat' });
    traceStore.finalize(chat, { outcome: 'abandoned', output: '' });
    const other = traceStore.start({ sessionId: 's9', input: 'other agent', tags: ['agent:agent_other'] });
    traceStore.finalize(other, { outcome: 'abandoned', output: '' });

    const res = await server.inject({ method: 'GET', url: '/api/agents' });
    const view = res.json().agents[0];
    expect(view.successRate).toBeCloseTo(2 / 3, 5);
    expect(typeof view.lastRunAt).toBe('string');
    // B6: route-boundary timestamps are ISO-8601 UTC (SQLite 'YYYY-MM-DD
    // HH:MM:SS' would parse as LOCAL time in a browser).
    expect(view.lastRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
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
    expect(body.traces[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/); // B6 normalized
    expect((await server.inject({ method: 'GET', url: '/api/agents/agent_unknown/traces' })).statusCode).toBe(404);
  });

  it('survives a corrupt agents.json (degrades to empty, not 500)', async () => {
    fs.writeFileSync(path.join(dataDir, 'agents.json'), '{not json', 'utf-8');
    const res = await server.inject({ method: 'GET', url: '/api/agents' });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(0);
  });
});
