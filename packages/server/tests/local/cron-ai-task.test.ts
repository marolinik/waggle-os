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

function sseError(error: string, content = ''): Response {
  const body =
    `event: error\ndata: ${JSON.stringify({ error })}\n\n` +
    `event: done\ndata: ${JSON.stringify({ content, toolsUsed: [] })}\n\n`;
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
    vi.restoreAllMocks();
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

  it('records a failed full-agent turn and keeps a one-shot schedule enabled', async () => {
    fetchMock.mockResolvedValue(sseError('INCOMPLETE_COMPLETION', 'partial answer'));
    const sendSpy = vi.spyOn(server.channelManager!, 'sendTo').mockResolvedValue(true);
    const schedule = server.cronStore.create({
      name: 'Failed one shot',
      cronExpr: '0 9 * * *',
      jobType: 'agent_task',
      jobConfig: {
        prompt: 'Do the complete thing',
        mode: 'ai_task',
        once: true,
        deliverTo: { platform: 'telegram', chatId: 'chat-1' },
      },
      workspaceId: wsId,
    });

    await expect(server.scheduler.executeJob(schedule)).rejects.toThrow(/INCOMPLETE_COMPLETION/);
    expect(server.scheduler.getFailCount(schedule.id)).toBe(1);
    expect(server.cronStore.getById(schedule.id)?.enabled).toBe(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('treats stream EOF without done as incomplete and keeps the one-shot retryable', async () => {
    fetchMock.mockResolvedValue(new Response(
      'event: token\ndata: {"content":"partial"}\n\n',
      { status: 200 },
    ));
    const schedule = server.cronStore.create({
      name: 'Disconnected one shot',
      cronExpr: '0 9 * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Finish despite disconnects', mode: 'ai_task', once: true },
      workspaceId: wsId,
    });

    await expect(server.scheduler.executeJob(schedule)).rejects.toThrow(/before the done event/i);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(server.scheduler.getFailCount(schedule.id)).toBe(1);
    expect(server.cronStore.getById(schedule.id)?.enabled).toBe(1);
  });

  it('legacy agent_task without mode keeps the toolless /v1/chat/completions path', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'legacy output' } }],
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

  it('records a legacy task as failed instead of delivering a truncated completion', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: 'partial legacy output' } }],
    }), { status: 200 }));
    const schedule = server.cronStore.create({
      name: 'Truncated legacy task',
      cronExpr: '0 11 * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Old style but complete it' },
      workspaceId: wsId,
    });

    await expect(server.scheduler.executeJob(schedule)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(server.scheduler.getFailCount(schedule.id)).toBe(1);
  });

  it('does not persist a truncated Loop report or record the run as successful', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: 'partial loop report' } }],
    }), { status: 200 }));
    const schedule = server.cronStore.create({
      name: 'Integrity loop',
      cronExpr: '0 12 * * *',
      jobType: 'loop',
      jobConfig: { prompt: 'Inspect the workspace' },
      workspaceId: wsId,
    });

    await expect(server.scheduler.executeJob(schedule)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(server.scheduler.getFailCount(schedule.id)).toBe(1);
    const mind = server.agentState.getWorkspaceMindDb(wsId);
    const persisted = mind?.getDatabase().prepare(
      `SELECT COUNT(*) AS count FROM memory_frames WHERE content LIKE '[Loop:%'`
    ).get() as { count: number } | undefined;
    expect(persisted?.count ?? 0).toBe(0);
  });

  it('automatic tick refuses a workspace Loop after the role is downgraded to viewer', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: 'NOTHING_TO_DO' } }],
    }), { status: 200 }));
    const schedule = server.cronStore.create({
      name: 'Role downgrade guard',
      cronExpr: '*/5 * * * *',
      jobType: 'loop',
      jobConfig: { prompt: 'Inspect the workspace' },
      workspaceId: wsId,
    });
    server.multiMind.personal.getDatabase().prepare(
      "UPDATE cron_schedules SET next_run_at = datetime('now', '-1 minute') WHERE id = ?",
    ).run(schedule.id);
    const workspaceMind = server.agentState.getWorkspaceMindDb(wsId)!;
    const countFrames = () => (workspaceMind.getDatabase().prepare(
      'SELECT COUNT(*) AS count FROM memory_frames',
    ).get() as { count: number }).count;
    const framesBefore = countFrames();
    server.workspaceManager.update(wsId, { teamId: 'team-1', teamRole: 'viewer' });
    const leaseSpy = vi.spyOn(server.cronStore, 'acquireRunLease');
    const historyBefore = server.cronStore.getExecutionHistory(schedule.id).length;

    try {
      const executed = await server.scheduler.tick();

      expect(executed).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(countFrames()).toBe(framesBefore);
      expect(leaseSpy).not.toHaveBeenCalled();
      expect(server.cronStore.getExecutionHistory(schedule.id)).toHaveLength(historyBefore);
      expect(server.cronStore.getById(schedule.id)?.last_run_at).toBeNull();
      expect(server.cronStore.getById(schedule.id)?.enabled).toBe(1);
      expect(server.scheduler.getFailCount(schedule.id)).toBe(0);

      server.workspaceManager.update(wsId, { teamId: 'team-1', teamRole: 'member' });
      expect(await server.scheduler.tick()).toBe(1);
      expect(fetchMock).toHaveBeenCalled();
      expect(leaseSpy).toHaveBeenCalledOnce();
      expect(server.cronStore.getById(schedule.id)?.last_run_at).not.toBeNull();
    } finally {
      server.cronStore.update(schedule.id, { enabled: false });
      server.workspaceManager.update(wsId, { teamId: undefined, teamRole: undefined });
    }
  });

  it('blocks a global agent task atomically when any target is a viewer', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Viewer target', group: 'work' },
    });
    expect(res.statusCode).toBe(201);
    const viewerWorkspaceId = JSON.parse(res.body).id as string;
    const schedule = server.cronStore.create({
      name: 'Global role guard',
      cronExpr: '*/5 * * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Inspect every workspace', mode: 'ai_task' },
      workspaceId: '*',
    });
    server.multiMind.personal.getDatabase().prepare(
      "UPDATE cron_schedules SET next_run_at = datetime('now', '-1 minute') WHERE id = ?",
    ).run(schedule.id);
    server.workspaceManager.update(viewerWorkspaceId, {
      teamId: 'team-1',
      teamRole: 'viewer',
    });
    const leaseSpy = vi.spyOn(server.cronStore, 'acquireRunLease');

    try {
      expect(await server.scheduler.tick()).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(leaseSpy).not.toHaveBeenCalled();
      expect(server.cronStore.getExecutionHistory(schedule.id)).toEqual([]);
      expect(server.cronStore.getById(schedule.id)?.last_run_at).toBeNull();
      expect(server.cronStore.getById(schedule.id)?.enabled).toBe(1);
      expect(server.scheduler.getFailCount(schedule.id)).toBe(0);
      expect(server.cronStore.getDue().some((due) => due.id === schedule.id)).toBe(true);
    } finally {
      server.cronStore.update(schedule.id, { enabled: false });
      server.workspaceManager.update(viewerWorkspaceId, {
        teamId: undefined,
        teamRole: undefined,
      });
    }
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
