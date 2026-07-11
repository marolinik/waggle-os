/**
 * #17 ai_task scheduler mode — executor branch integration.
 *
 * The loopback fetch is stubbed, so the test asserts the executor's contract
 * with the chat route: full-agent turns go to POST /api/chat with
 * origin:'automation' (#13), a dedicated `schedule-<id>` session, and
 * proposeHeld; legacy rows (no mode) keep the toolless /v1/chat/completions
 * path; `once` disables the row after a successful run; the daily cap skips
 * execution entirely.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

function sseDone(content: string): Response {
  const body = `event: done\ndata: ${JSON.stringify({ content, toolsUsed: [] })}\n\n`;
  return new Response(body, { status: 200 });
}

describe('cron ai_task executor (#17)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let wsId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ai-task-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'AI Task WS', group: 'Test' },
    });
    expect(res.statusCode).toBe(201);
    wsId = JSON.parse(res.body).id;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* EBUSY on Windows */ }
  });

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => sseDone('scheduled result'));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function chatCalls() {
    return fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/chat'));
  }

  it('mode:ai_task runs a full agent turn — /api/chat with origin:automation, schedule session, proposeHeld', async () => {
    const schedule = server.cronStore.create({
      name: 'Morning digest',
      cronExpr: '0 8 * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Summarize yesterday', mode: 'ai_task' },
      workspaceId: wsId,
    });

    await server.scheduler.executeJob(schedule);

    const calls = chatCalls();
    expect(calls).toHaveLength(1);
    const body = JSON.parse((calls[0][1] as RequestInit).body as string);
    expect(body.origin).toBe('automation');
    expect(body.session).toBe(`schedule-${schedule.id}`);
    expect(body.proposeHeld).toBe(true);
    expect(body.workspace).toBe(wsId);
    expect(body.message).toContain('Summarize yesterday');
    // still enabled — not a one-shot
    expect(server.cronStore.getById(schedule.id)?.enabled).toBe(1);
  });

  it('once:true disables the schedule after a successful run (row kept)', async () => {
    const schedule = server.cronStore.create({
      name: 'One shot',
      cronExpr: '0 9 * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Do the thing', mode: 'ai_task', once: true },
      workspaceId: wsId,
    });

    await server.scheduler.executeJob(schedule);

    const row = server.cronStore.getById(schedule.id);
    expect(row).toBeDefined();
    expect(row?.enabled).toBe(0);
  });

  it('legacy agent_task without mode keeps the toolless /v1/chat/completions path', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'legacy output' } }],
    }), { status: 200 }));

    const schedule = server.cronStore.create({
      name: 'Legacy task',
      cronExpr: '0 10 * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Old style' },
      workspaceId: wsId,
    });

    await server.scheduler.executeJob(schedule);

    expect(chatCalls()).toHaveLength(0);
    const legacy = fetchMock.mock.calls.filter(c => String(c[0]).includes('/v1/chat/completions'));
    expect(legacy).toHaveLength(1);
    expect(server.cronStore.getById(schedule.id)?.enabled).toBe(1);
  });

  it('daily cap (24) skips execution before any agent turn', async () => {
    const schedule = server.cronStore.create({
      name: 'Capped',
      cronExpr: '*/5 * * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Spin', mode: 'ai_task' },
      workspaceId: wsId,
    });
    for (let i = 0; i < 24; i++) {
      server.cronStore.recordExecution(schedule.id, schedule.name, { success: true });
    }

    await server.scheduler.executeJob(schedule);

    expect(chatCalls()).toHaveLength(0);
  });
});
