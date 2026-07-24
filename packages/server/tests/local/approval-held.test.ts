import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, CronStore } from '@waggle/core';
import { approvalRoutes } from '../../src/local/routes/approval.js';
import { securityMiddleware } from '../../src/local/security-middleware.js';

describe('approval routes — held actions (L2 union)', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: CronStore;
  let server: ReturnType<typeof Fastify>;
  let pendingApprovals: Map<string, { toolName: string; input: Record<string, unknown>; timestamp: number; resolve: (v: boolean) => void }>;
  let execSpy: ReturnType<typeof vi.fn>;
  let literalDefaultIsViewer: boolean;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-appr-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    store = new CronStore(db);
    pendingApprovals = new Map();
    execSpy = vi.fn(async () => 'email sent');
    literalDefaultIsViewer = false;

    server = Fastify({ logger: false });
    server.decorate('cronStore', store);
    server.decorate('localConfig', { dataDir: tmpDir });
    server.decorate('workspaceManager', {
      get: (id: string) => {
        if (id === 'viewer-workspace') {
          return { id, name: 'Viewer WS', teamId: 'team-1', teamRole: 'viewer' };
        }
        if (id === 'w1') {
          return { id, name: 'Member WS', teamId: 'team-1', teamRole: 'member' };
        }
        if (id === 'default' && literalDefaultIsViewer) {
          return { id, name: 'Literal Default WS', teamId: 'team-1', teamRole: 'viewer' };
        }
        return undefined;
      },
      getDefault: () => 'w1',
      list: () => [
        { id: 'w1', name: 'Member WS', teamId: 'team-1', teamRole: 'member' },
        { id: 'viewer-workspace', name: 'Viewer WS', teamId: 'team-1', teamRole: 'viewer' },
      ],
    });
    server.decorate('agentState', {
      cronStore: store,
      pendingApprovals,
      approvalGrantStore: { grant: vi.fn() },
      buildToolsForWorkspace: () => [{ name: 'send_email', description: '', parameters: {}, execute: execSpy }],
    });
    await server.register(securityMiddleware);
    await server.register(approvalRoutes);
  });
  afterEach(async () => {
    await server.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function hold(id = 'pa-1', workspaceId: string | null = 'w1') {
    return store.savePendingAction({
      id, workspaceId, source: 'loop:1', toolName: 'send_email',
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

  it.each([
    { approved: true, sourceWorkspaceId: 'w1' },
    { approved: false, sourceWorkspaceId: 'w1' },
  ])('viewer cannot decide a held action even with member sourceWorkspaceId ($approved)', async (payload) => {
    hold('viewer-held', 'viewer-workspace');

    const res = await server.inject({
      method: 'POST',
      url: '/api/approval/viewer-held',
      payload,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(execSpy).not.toHaveBeenCalled();
    expect(store.getPendingAction('viewer-held')!.status).toBe('held');
  });

  it.each([null, '*'])('held action owned by %s blocks when its executor target is the literal default viewer workspace', async (workspaceId) => {
    literalDefaultIsViewer = true;
    hold('default-held', workspaceId);

    const res = await server.inject({
      method: 'POST',
      url: '/api/approval/default-held',
      payload: { approved: true },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(execSpy).not.toHaveBeenCalled();
    expect(store.getPendingAction('default-held')!.status).toBe('held');
  });

  it('wildcard held action does not inherit unrelated viewer workspaces outside its executor target', async () => {
    hold('wildcard-held', '*');

    const res = await server.inject({
      method: 'POST',
      url: '/api/approval/wildcard-held',
      payload: { approved: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, status: 'executed' });
    expect(execSpy).toHaveBeenCalledOnce();
    expect(store.getPendingAction('wildcard-held')!.status).toBe('executed');
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
