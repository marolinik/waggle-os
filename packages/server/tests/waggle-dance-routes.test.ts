/**
 * AI-OS Phase 1B — waggle-dance routes integration tests.
 *
 * Boots a real local server, posts signals, queries the bus.
 * Verifies the cross-tool activity bus end-to-end via REST.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-wd-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('Waggle-Dance routes (Phase 1B)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('routes');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('wd-routes-test');
    frames.createIFrame(s.gop_id, 'wd-routes-test seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  beforeEach(() => {
    // Reset the bus between tests so we don't have cross-test pollution.
    if (server?.signalBus) server.signalBus.clear();
  });

  // ── POST /api/waggle-dance/signal ────────────────────────────────

  it('POST returns 201 and persists a discovery signal', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        senderId: 'claude-code-hook',
        content: { tool: 'claude-code', topic: 'webhook rotation' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.dispatched).toBe(true);
    expect(body.message.subtype).toBe('discovery');
    expect(body.message.teamId).toBe('personal::claude-code-hook');
    expect(body.message.id).toBeTruthy();
  });

  it('POST defaults senderId to "local" and derives a personal team', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        content: { topic: 'no-sender case' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message.senderId).toBe('local');
    expect(body.message.teamId).toBe('personal::local');
  });

  it('POST rejects invalid type/subtype combo', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'request',
        subtype: 'discovery', // discovery is broadcast-only
        content: {},
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid type-subtype combination');
  });

  it('POST rejects unknown subtype', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'made_up_subtype',
        content: {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST accepts a routed_share with routing list', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'routed_share',
        senderId: 'hermes',
        content: { tool: 'hermes', payload: { docId: 'd-7' } },
        routing: [{ userId: 'u-1', reason: 'subscribed' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message.routing).toHaveLength(1);
  });

  it('POST accepts a knowledge_match response with referenceId', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'response',
        subtype: 'knowledge_match',
        senderId: 'cursor-hook',
        referenceId: 'orig-msg-id',
        content: { matchedEntities: ['e-1'] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.referenceId).toBe('orig-msg-id');
  });

  // ── GET /api/waggle-dance/signals ────────────────────────────────

  it('scopes an external run credential to its own sender, Room, and workspace', async () => {
    const room = server.agentRunRegistry.createRoom({
      workspaceIds: ['default'], source: 'external_tool', title: 'External room', task: 'Collaborate',
    });
    const run = server.agentRunRegistry.createWorker({
      parentRunId: room.id, workspaceId: 'default', source: 'external_tool',
      executor: { kind: 'external_tool', toolId: 'codex' }, title: 'Codex', task: room.task,
    });
    const token = server.agentRunRegistry.issueCredential(run.id);

    const spoofed = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': token },
      payload: {
        type: 'broadcast', subtype: 'discovery', senderId: 'run::someone-else',
        teamId: 'room::someone-else', content: { runId: 'someone-else', topic: 'spoof' },
      },
    });
    expect(spoofed.statusCode).toBe(403);
    expect(spoofed.json().code).toBe('RUN_SCOPE_VIOLATION');

    const sent = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': token },
      payload: {
        type: 'request', subtype: 'knowledge_check', content: { query: 'Who has the schema?' },
      },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().message).toMatchObject({
      senderId: `run::${run.id}`,
      teamId: `room::${room.id}`,
      content: { roomId: room.id, runId: run.id, workspaceId: 'default' },
    });

    const discovery = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': token },
      payload: {
        type: 'broadcast', subtype: 'discovery',
        content: {
          summary: 'Found the migration owner and saved the result.',
          frameId: '42', memoryWorkspace: 'default',
        },
      },
    });
    expect(discovery.statusCode).toBe(201);
    const updated = server.agentRunRegistry.get(run.id);
    expect(updated).toMatchObject({
      status: 'running',
      result: { summary: 'Found the migration owner and saved the result.' },
      memoryRefs: {
        status: 'complete',
        workspaceFrameIds: { default: [42] },
      },
    });
    expect(updated?.memoryRefs.personalFrameIds).toHaveLength(1);
    expect(new FrameStore(server.multiMind.personal).getById(updated!.memoryRefs.personalFrameIds![0])?.content)
      .toContain('Found the migration owner');

    const forbiddenRead = await server.inject({
      method: 'GET', url: '/api/waggle-dance/signals?teamId=room%3A%3Aother',
      headers: { 'x-waggle-run-token': token },
    });
    expect(forbiddenRead.statusCode).toBe(403);
    const ownRead = await server.inject({
      method: 'GET', url: '/api/waggle-dance/signals',
      headers: { 'x-waggle-run-token': token },
    });
    expect(ownRead.statusCode).toBe(200);
    expect((ownRead.json() as { signals: Array<{ teamId: string }> }).signals.every(
      (signal) => signal.teamId === `room::${room.id}`,
    )).toBe(true);
  });

  it('relays Room requests, correlated responses, and broadcasts exactly once', async () => {
    const room = server.agentRunRegistry.createRoom({
      workspaceIds: ['workspace-a', 'workspace-b'], source: 'external_tool',
      title: 'Collaboration room', task: 'Solve together',
    });
    const runA = server.agentRunRegistry.createWorker({
      parentRunId: room.id, workspaceId: 'workspace-a', source: 'external_tool',
      executor: { kind: 'external_tool', toolId: 'codex' }, title: 'Codex', task: room.task,
    });
    const runB = server.agentRunRegistry.createWorker({
      parentRunId: room.id, workspaceId: 'workspace-b', source: 'external_tool',
      executor: { kind: 'external_tool', toolId: 'claude-code' }, title: 'Claude Code', task: room.task,
    });
    const otherRoom = server.agentRunRegistry.createRoom({
      workspaceIds: ['workspace-c'], source: 'external_tool',
      title: 'Other room', task: 'Stay isolated',
    });
    const runC = server.agentRunRegistry.createWorker({
      parentRunId: otherRoom.id, workspaceId: 'workspace-c', source: 'external_tool',
      executor: { kind: 'external_tool', toolId: 'cursor' }, title: 'Cursor', task: otherRoom.task,
    });
    const tokenA = server.agentRunRegistry.issueCredential(runA.id);
    const tokenB = server.agentRunRegistry.issueCredential(runB.id);
    const tokenC = server.agentRunRegistry.issueCredential(runC.id);

    const knowledgeRequest = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': tokenA },
      payload: {
        type: 'request', subtype: 'knowledge_check',
        content: { query: 'Who owns the schema?' },
      },
    });
    expect(knowledgeRequest.statusCode).toBe(201);
    const knowledgeRequestId = knowledgeRequest.json().message.id as string;

    const taskRequest = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': tokenA },
      payload: {
        type: 'request', subtype: 'task_delegation',
        content: { task: 'Inspect the migrations', role: 'analyst' },
      },
    });
    expect(taskRequest.statusCode).toBe(201);
    const taskRequestId = taskRequest.json().message.id as string;

    const peerRead = await server.inject({
      method: 'GET', url: '/api/waggle-dance/signals',
      headers: { 'x-waggle-run-token': tokenB },
    });
    expect(peerRead.statusCode).toBe(200);
    const peerSignals = peerRead.json().signals as Array<{ id: string; senderId: string; teamId: string }>;
    expect(peerSignals.filter((signal) => signal.id === knowledgeRequestId)).toHaveLength(1);
    expect(peerSignals.filter((signal) => signal.id === taskRequestId)).toHaveLength(1);
    expect(peerSignals.every((signal) => signal.senderId === `run::${runA.id}`)).toBe(true);
    expect(peerSignals.every((signal) => signal.teamId === `room::${room.id}`)).toBe(true);

    const response = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': tokenB },
      payload: {
        type: 'response', subtype: 'knowledge_match', referenceId: knowledgeRequestId,
        content: { matchedEntities: ['schema-owner'] },
      },
    });
    expect(response.statusCode).toBe(201);
    const responseId = response.json().message.id as string;

    const broadcast = await server.inject({
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json', 'x-waggle-run-token': tokenB },
      payload: {
        type: 'broadcast', subtype: 'routed_share',
        content: { payload: { owner: 'run-b' } },
      },
    });
    expect(broadcast.statusCode).toBe(201);
    const broadcastId = broadcast.json().message.id as string;

    const requesterRead = await server.inject({
      method: 'GET', url: '/api/waggle-dance/signals',
      headers: { 'x-waggle-run-token': tokenA },
    });
    expect(requesterRead.statusCode).toBe(200);
    const requesterSignals = requesterRead.json().signals as Array<{
      id: string; senderId: string; referenceId?: string | null;
    }>;
    for (const id of [knowledgeRequestId, taskRequestId, responseId, broadcastId]) {
      expect(requesterSignals.filter((signal) => signal.id === id)).toHaveLength(1);
    }
    expect(requesterSignals.find((signal) => signal.id === responseId)).toMatchObject({
      senderId: `run::${runB.id}`,
      referenceId: knowledgeRequestId,
    });

    const isolatedRead = await server.inject({
      method: 'GET', url: '/api/waggle-dance/signals',
      headers: { 'x-waggle-run-token': tokenC },
    });
    expect(isolatedRead.statusCode).toBe(200);
    expect(isolatedRead.json().signals).toHaveLength(0);

    const forbiddenCrossRoomRead = await server.inject({
      method: 'GET',
      url: `/api/waggle-dance/signals?teamId=${encodeURIComponent(`room::${room.id}`)}`,
      headers: { 'x-waggle-run-token': tokenC },
    });
    expect(forbiddenCrossRoomRead.statusCode).toBe(403);
    expect(forbiddenCrossRoomRead.json().code).toBe('RUN_SCOPE_VIOLATION');
  });

  it('GET returns recently posted signals newest-first', async () => {
    for (const topic of ['a', 'b', 'c']) {
      await injectWithAuth(server, {
        method: 'POST',
        url: '/api/waggle-dance/signal',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'broadcast',
          subtype: 'discovery',
          senderId: 'test',
          content: { tool: 'cursor', topic },
        },
      });
    }
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.signals[0].content.topic).toBe('c');
    expect(body.signals[2].content.topic).toBe('a');
  });

  it('GET filters by subtype', async () => {
    await injectWithAuth(server, {
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast', subtype: 'discovery',
        senderId: 't', content: { tool: 'claude-code' },
      },
    });
    await injectWithAuth(server, {
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast', subtype: 'model_recipe',
        senderId: 't', content: { name: 'recipe-1', model: 'haiku' },
      },
    });
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?subtype=discovery',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.signals[0].subtype).toBe('discovery');
  });

  it('GET filters by tool', async () => {
    for (const tool of ['claude-code', 'cursor', 'claude-code']) {
      await injectWithAuth(server, {
        method: 'POST', url: '/api/waggle-dance/signal',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'broadcast', subtype: 'discovery',
          senderId: 't', content: { tool },
        },
      });
    }
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?tool=claude-code',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
  });

  it('GET honors limit', async () => {
    for (let i = 0; i < 5; i++) {
      await injectWithAuth(server, {
        method: 'POST', url: '/api/waggle-dance/signal',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'broadcast', subtype: 'discovery',
          senderId: 't', content: { tool: 'x', idx: i },
        },
      });
    }
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?limit=2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().signals).toHaveLength(2);
  });

  it('GET rejects unknown subtype filter', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?subtype=garbage',
    });
    expect(res.statusCode).toBe(400);
  });

  // ── round trip ────────────────────────────────────────────────────

  it('POST → GET round trip preserves full message shape', async () => {
    const postRes = await injectWithAuth(server, {
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        senderId: 'claude-code-hook',
        content: { tool: 'claude-code', topic: 'rotation', importance: 'high' },
      },
    });
    const postedId = postRes.json().message.id;

    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals',
    });
    const signals = getRes.json().signals;
    const found = signals.find((s: { id: string }) => s.id === postedId);
    expect(found).toBeTruthy();
    expect(found.content.topic).toBe('rotation');
    expect(found.senderId).toBe('claude-code-hook');
    expect(found.teamId).toBe('personal::claude-code-hook');
  });
});
