import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, CronStore } from '@waggle/core';
import { approvalRoutes } from '../../src/local/routes/approval.js';

describe('approval routes — held actions (L2 union)', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: CronStore;
  let server: ReturnType<typeof Fastify>;
  let pendingApprovals: Map<string, { toolName: string; input: Record<string, unknown>; timestamp: number; resolve: (v: boolean) => void }>;
  let execSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-appr-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    store = new CronStore(db);
    pendingApprovals = new Map();
    execSpy = vi.fn(async () => 'email sent');

    server = Fastify({ logger: false });
    server.decorate('cronStore', store);
    server.decorate('localConfig', { dataDir: tmpDir });
    server.decorate('agentState', {
      cronStore: store,
      pendingApprovals,
      approvalGrantStore: { grant: vi.fn() },
      buildToolsForWorkspace: () => [{ name: 'send_email', description: '', parameters: {}, execute: execSpy }],
    });
    await server.register(approvalRoutes);
  });
  afterEach(async () => {
    await server.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function hold(id = 'pa-1') {
    return store.savePendingAction({
      id, workspaceId: 'w1', source: 'loop:1', toolName: 'send_email',
      argsJson: JSON.stringify({ to: 'x@y.z' }), summary: 'Send follow-up',
      riskLevel: 'medium', approvalClass: 'elevated',
    });
  }

  it('GET /pending returns held actions with source + risk + summary', async () => {
    hold();
    const res = await server.inject({ method: 'GET', url: '/api/approval/pending' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.pending[0]).toMatchObject({ requestId: 'pa-1', toolName: 'send_email', source: 'held', riskLevel: 'medium', summary: 'Send follow-up' });
    expect(body.pending[0].input).toEqual({ to: 'x@y.z' });
  });

  it('GET /pending unions live + held entries', async () => {
    pendingApprovals.set('live-1', { toolName: 'bash', input: { command: 'ls' }, timestamp: 123, resolve: vi.fn() });
    hold();
    const res = await server.inject({ method: 'GET', url: '/api/approval/pending' });
    const sources = res.json().pending.map((p: { source: string }) => p.source).sort();
    expect(sources).toEqual(['held', 'live']);
  });

  it('POST approve on a held id executes the tool and flips to executed', async () => {
    hold();
    const res = await server.inject({ method: 'POST', url: '/api/approval/pa-1', payload: { approved: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, approved: true, status: 'executed' });
    expect(execSpy).toHaveBeenCalledWith({ to: 'x@y.z' });
    expect(store.getPendingAction('pa-1')!.status).toBe('executed');
  });

  it('POST deny on a held id marks it denied (tool not run)', async () => {
    hold();
    const res = await server.inject({ method: 'POST', url: '/api/approval/pa-1', payload: { approved: false } });
    expect(res.json()).toMatchObject({ ok: true, approved: false, status: 'denied' });
    expect(execSpy).not.toHaveBeenCalled();
    expect(store.getPendingAction('pa-1')!.status).toBe('denied');
  });

  it('POST on an unknown id is 404', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/approval/nope', payload: { approved: true } });
    expect(res.statusCode).toBe(404);
  });

  it('POST on a live id resolves the live promise (interactive path unchanged)', async () => {
    const resolve = vi.fn();
    pendingApprovals.set('live-1', { toolName: 'write_file', input: {}, timestamp: 1, resolve });
    const res = await server.inject({ method: 'POST', url: '/api/approval/live-1', payload: { approved: true } });
    expect(res.statusCode).toBe(200);
    expect(resolve).toHaveBeenCalledWith(true);
    expect(pendingApprovals.has('live-1')).toBe(false);

    const second = await server.inject({ method: 'POST', url: '/api/approval/live-1', payload: { approved: true } });
    expect(second.statusCode).toBe(404);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('POST approve is idempotent — re-approving an executed held id is 409 (already decided)', async () => {
    hold();
    await server.inject({ method: 'POST', url: '/api/approval/pa-1', payload: { approved: true } });
    const second = await server.inject({ method: 'POST', url: '/api/approval/pa-1', payload: { approved: true } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'already_decided', status: 'executed' });
    expect(execSpy).toHaveBeenCalledTimes(1);
  });
});
