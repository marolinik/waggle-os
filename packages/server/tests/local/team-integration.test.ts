/**
 * Team Integration Tests — GAP-028 / GAP-029
 *
 * Tests fire-and-forget team server pushes:
 *   - emitAuditEvent with team workspace → fetch called to team server
 *   - emitAuditEvent with personal workspace → no fetch called
 *   - POST /api/workspaces with teamId → fetch called to register
 *   - POST /api/workspaces without teamId → no fetch called
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore, type TeamSync } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { emitAuditEvent, closeAuditDb } from '../../src/local/routes/events.js';
import { injectWithAuth } from '../test-utils.js';

// ── Mock global fetch ───────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue({ ok: true });

/**
 * Helper: write config.json with team server credentials into dataDir.
 * The real WaggleConfig will read this file.
 */
function writeTeamConfig(dataDir: string, token?: string, url = 'https://93.184.216.34') {
  const config: Record<string, unknown> = {
    defaultModel: 'claude-sonnet-4-6',
    providers: {},
  };
  if (token) {
    config.teamServer = { url, token };
  }
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config));
}

describe('Team Integration — Audit Event Push (GAP-028)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-team-audit-'));
    writeTeamConfig(tmpDir, 'test-token-123');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
  });

  afterEach(() => {
    closeAuditDb();
    vi.unstubAllGlobals();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore EBUSY on Windows */ }
  });

  it('pushes audit event to team server for team workspace', async () => {
    const fakeServer = {
      localConfig: { dataDir: tmpDir },
      workspaceManager: {
        get: vi.fn().mockReturnValue({
          id: 'ws-team-1',
          name: 'Team WS',
          teamId: 'team-abc',
          teamServerUrl: 'https://93.184.216.34',
        }),
      },
      eventBus: { emit: vi.fn() },
    } as unknown as FastifyInstance;

    emitAuditEvent(fakeServer, {
      workspaceId: 'ws-team-1',
      eventType: 'tool_call',
      toolName: 'memory_write',
    });

    // The team push is inside an async IIFE — wait for it to resolve
    await new Promise(resolve => setTimeout(resolve, 300));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://93.184.216.34/api/teams/team-abc/audit');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer test-token-123');
    const body = JSON.parse(opts.body);
    expect(body.workspaceId).toBe('ws-team-1');
    expect(body.eventType).toBe('tool_call');
    expect(body.source).toBe('local-agent');
    expect(body.timestamp).toBeDefined();
  });

  it('does NOT push for personal workspace (no teamId)', async () => {
    const fakeServer = {
      localConfig: { dataDir: tmpDir },
      workspaceManager: {
        get: vi.fn().mockReturnValue({
          id: 'ws-personal',
          name: 'Personal WS',
          // no teamId, no teamServerUrl
        }),
      },
      eventBus: { emit: vi.fn() },
    } as unknown as FastifyInstance;

    emitAuditEvent(fakeServer, {
      workspaceId: 'ws-personal',
      eventType: 'memory_write',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does NOT push if team server has no token', async () => {
    // Overwrite config without token
    writeTeamConfig(tmpDir); // no token

    const fakeServer = {
      localConfig: { dataDir: tmpDir },
      workspaceManager: {
        get: vi.fn().mockReturnValue({
          id: 'ws-team-2',
          name: 'Team WS 2',
          teamId: 'team-xyz',
          teamServerUrl: 'https://team.example.com',
        }),
      },
      eventBus: { emit: vi.fn() },
    } as unknown as FastifyInstance;

    emitAuditEvent(fakeServer, {
      workspaceId: 'ws-team-2',
      eventType: 'session_start',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks a metadata-bound audit target before sending the Team token', async () => {
    writeTeamConfig(tmpDir, 'metadata-token', 'https://169.254.169.254/latest/meta-data');
    const fakeServer = {
      localConfig: { dataDir: tmpDir },
      workspaceManager: {
        get: vi.fn().mockReturnValue({
          id: 'ws-metadata',
          name: 'Metadata Workspace',
          teamId: 'team-metadata',
          teamServerUrl: 'https://169.254.169.254/latest/meta-data',
        }),
      },
      eventBus: { emit: vi.fn() },
    } as unknown as FastifyInstance;

    emitAuditEvent(fakeServer, {
      workspaceId: 'ws-metadata',
      eventType: 'tool_call',
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not send a newly configured Team token to a workspace bound to the previous server', async () => {
    writeTeamConfig(tmpDir, 'server-b-token', 'https://team-b.example.com');
    const fakeServer = {
      localConfig: { dataDir: tmpDir },
      workspaceManager: {
        get: vi.fn().mockReturnValue({
          id: 'ws-server-a',
          name: 'Old Team Workspace',
          teamId: 'team-a',
          teamServerUrl: 'https://team-a.example.com',
        }),
      },
      eventBus: { emit: vi.fn() },
    } as unknown as FastifyInstance;

    emitAuditEvent(fakeServer, {
      workspaceId: 'ws-server-a',
      eventType: 'tool_call',
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('Team Integration — Workspace Registration (GAP-029)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-team-ws-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('team-test');
    frames.createIFrame(s1.gop_id, 'Team test frame', 'normal');
    mind.close();

    // Create config.json with team server config
    writeTeamConfig(tmpDir, 'ws-reg-token');

    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await server.close();
    vi.unstubAllGlobals();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('registers workspace on team server when teamId is provided', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Team Project',
        group: 'work',
        teamId: 'team-abc',
        teamServerUrl: 'https://93.184.216.34/',
        teamUserId: 'user-42',
      },
    });

    expect(res.statusCode).toBe(201);
    const ws = res.json();
    expect(ws.name).toBe('Team Project');
    expect(ws.teamServerUrl).toBe('https://93.184.216.34');

    // Wait for fire-and-forget fetch to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Find the registration call (not audit event calls or health checks)
    const registrationCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === 'string' && url.includes('/entities'),
    );

    expect(registrationCalls.length).toBeGreaterThanOrEqual(1);
    const [url, opts] = registrationCalls[0];
    expect(url).toBe('https://93.184.216.34/api/teams/team-abc/entities');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer ws-reg-token');
    const body = JSON.parse(opts.body);
    expect(body.entityType).toBe('workspace');
    expect(body.properties.displayName).toBe('Team Project');
    expect(body.properties.group).toBe('work');
    expect(body.properties.createdBy).toBe('user-42');
  });

  it('blocks a metadata-bound workspace registration before sending the Team token', async () => {
    writeTeamConfig(tmpDir, 'metadata-token', 'https://169.254.169.254/latest/meta-data');
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Metadata Team Project',
        group: 'work',
        teamId: 'team-metadata',
        teamServerUrl: 'https://169.254.169.254/latest/meta-data',
      },
    });

    expect(res.statusCode).toBe(201);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockFetch.mock.calls.filter(([url, options]) =>
      String(url).startsWith('https://169.254.169.254/')
      || options?.headers?.Authorization === 'Bearer metadata-token',
    )).toHaveLength(0);
  });

  it('rejects a cleartext public configured Team destination without creating a workspace', async () => {
    const previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
    process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
    writeTeamConfig(tmpDir, 'cleartext-token', 'http://93.184.216.34');
    const workspaceCount = server.workspaceManager.list().length;
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: {
          name: 'Cleartext Team Project',
          group: 'work',
          teamId: 'team-cleartext',
          teamServerUrl: 'http://93.184.216.34',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(server.workspaceManager.list()).toHaveLength(workspaceCount);
      expect(mockFetch.mock.calls.filter(([url, options]) =>
        String(url).startsWith('http://93.184.216.34/')
        || options?.headers?.Authorization === 'Bearer cleartext-token',
      )).toHaveLength(0);
    } finally {
      if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
      else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
    }
  });

  it('rejects a team workspace URL that does not match the configured destination', async () => {
    const workspaceCount = server.workspaceManager.list().length;
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Redirected Team Project',
        group: 'work',
        teamId: 'team-abc',
        teamServerUrl: 'https://attacker.example',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/configured team server/i);
    expect(server.workspaceManager.list()).toHaveLength(workspaceCount);
    expect(mockFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === 'string' && url.includes('/entities'),
    )).toHaveLength(0);
  });

  it('rejects a team workspace when no Team server destination is configured', async () => {
    writeTeamConfig(tmpDir);
    const workspaceCount = server.workspaceManager.list().length;
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Unbound Team Project',
        group: 'work',
        teamId: 'team-abc',
        teamServerUrl: 'https://team.example.com',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/configured team server/i);
    expect(server.workspaceManager.list()).toHaveLength(workspaceCount);
  });

  it.each([
    ['teamId', { teamId: 'team-abc' }],
    ['teamServerUrl', { teamServerUrl: 'https://team.example.com' }],
  ])('rejects a team workspace with only %s', async (_field, teamFields) => {
    const workspaceCount = server.workspaceManager.list().length;
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Partial Team Project',
        group: 'work',
        ...teamFields,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/teamId and teamServerUrl/i);
    expect(server.workspaceManager.list()).toHaveLength(workspaceCount);
  });

  it('does NOT register when no teamId is provided', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Personal Project',
        group: 'personal',
      },
    });

    expect(res.statusCode).toBe(201);

    await new Promise(resolve => setTimeout(resolve, 100));

    // No calls to /entities endpoint
    const registrationCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === 'string' && url.includes('/entities'),
    );
    expect(registrationCalls).toHaveLength(0);
  });

  it('does not push save_memory with a Team token bound to another server', async () => {
    const workspace = server.workspaceManager.create({
      name: 'Server A Workspace',
      group: 'work',
      teamId: 'team-a',
      teamServerUrl: 'https://team-a.example.com',
    });
    writeTeamConfig(tmpDir, 'server-b-token', 'https://team-b.example.com');
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'remote-frame' }) });
    const originalRunner = server.agentRunner;
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      config.onToolResult?.('save_memory', {}, 'saved memory');
      return { content: 'saved', toolsUsed: ['save_memory'], usage: { inputTokens: 1, outputTokens: 1 } };
    };

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Remember this', workspace: workspace.id },
      });
      expect(res.statusCode).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch.mock.calls.filter(([url, options]) =>
        String(url).startsWith('https://team-a.example.com')
        && options?.headers?.Authorization === 'Bearer server-b-token',
      )).toHaveLength(0);
    } finally {
      server.agentRunner = originalRunner;
      mockFetch.mockResolvedValue({ ok: true });
    }
  });

  it('routes save_memory TeamSync pushes through the guarded Team transport', async () => {
    const teamServerUrl = 'https://93.184.216.34';
    const workspace = server.workspaceManager.create({
      name: 'Guarded Team Workspace',
      group: 'work',
      teamId: 'team-guarded',
      teamServerUrl,
    });
    writeTeamConfig(tmpDir, 'guarded-team-token', teamServerUrl);
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'remote-frame' }) });
    const originalRunner = server.agentRunner;
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      config.onToolResult?.('save_memory', {}, 'saved memory');
      return { content: 'saved', toolsUsed: ['save_memory'], usage: { inputTokens: 1, outputTokens: 1 } };
    };

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Remember this safely', workspace: workspace.id },
      });
      expect(res.statusCode).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 100));

      const guardedPush = mockFetch.mock.calls.find(([url, options]) =>
        String(url) === `${teamServerUrl}/api/teams/team-guarded/entities`
        && options?.method === 'POST',
      );
      expect(guardedPush?.[1]?.headers?.Authorization).toBe('Bearer guarded-team-token');
      expect(guardedPush?.[1]?.redirect).toBe('manual');
      expect(guardedPush?.[1]?.dispatcher).toBeDefined();
    } finally {
      server.agentRunner = originalRunner;
      mockFetch.mockResolvedValue({ ok: true });
    }
  });

  it('rebinds the TeamSync cache on token rotation and rejects a server change', async () => {
    const teamServerUrl = 'https://93.184.216.34';
    writeTeamConfig(tmpDir, 'server-a-token', teamServerUrl);
    const workspace = server.workspaceManager.create({
      name: 'Cached Server A Workspace',
      group: 'work',
      teamId: 'team-a',
      teamServerUrl,
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

    try {
      server.agentState.activateWorkspaceMind(workspace.id);
      await new Promise(resolve => setTimeout(resolve, 100));

      writeTeamConfig(tmpDir, 'rotated-a-token', teamServerUrl);
      mockFetch.mockClear();
      await server.agentState.orchestrator.autoSaveFromExchange(
        'We decided to use the rotated credential guard for this workspace architecture.',
        'Acknowledged.',
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      const rotatedPush = mockFetch.mock.calls.find(([, options]) => options?.method === 'POST');
      expect(rotatedPush?.[1]?.headers?.Authorization).toBe('Bearer rotated-a-token');
      expect(rotatedPush?.[1]?.redirect).toBe('manual');
      expect(rotatedPush?.[1]?.dispatcher).toBeDefined();

      mockFetch.mockClear();
      server.agentState.activateWorkspaceMind(workspace.id);
      await new Promise(resolve => setTimeout(resolve, 100));
      const rotatedPull = mockFetch.mock.calls.find(([url]) => String(url).includes('/entities?type=memory_frame'));
      expect(rotatedPull?.[1]?.headers?.Authorization).toBe('Bearer rotated-a-token');
      expect(rotatedPull?.[1]?.redirect).toBe('manual');
      expect(rotatedPull?.[1]?.dispatcher).toBeDefined();

      writeTeamConfig(tmpDir, 'server-b-token', 'https://team-b.example.com');
      mockFetch.mockClear();
      server.agentState.activateWorkspaceMind(workspace.id);
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockFetch.mock.calls.filter(([url]) => String(url).includes('/entities?type=memory_frame'))).toHaveLength(0);
    } finally {
      mockFetch.mockResolvedValue({ ok: true });
    }
  });

  it('does not push through an already-bound orchestrator after Team disconnect', async () => {
    writeTeamConfig(tmpDir, 'server-a-token', 'https://team-a.example.com');
    const workspace = server.workspaceManager.create({
      name: 'Disconnected Server A Workspace',
      group: 'work',
      teamId: 'team-a',
      teamServerUrl: 'https://team-a.example.com',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

    try {
      server.agentState.activateWorkspaceMind(workspace.id);
      await new Promise(resolve => setTimeout(resolve, 100));

      writeTeamConfig(tmpDir);
      mockFetch.mockClear();
      await server.agentState.orchestrator.autoSaveFromExchange(
        'We decided to use the disconnect guard for this workspace architecture.',
        'Acknowledged.',
      );
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch.mock.calls.filter(([url, options]) =>
        String(url).includes('/entities') && options?.method === 'POST',
      )).toHaveLength(0);
    } finally {
      mockFetch.mockResolvedValue({ ok: true });
    }
  });

  it('clears the active TeamSync when a team workspace mind is closed', async () => {
    writeTeamConfig(tmpDir, 'server-a-token', 'https://team-a.example.com');
    const workspace = server.workspaceManager.create({
      name: 'Deleted Server A Workspace',
      group: 'work',
      teamId: 'team-a',
      teamServerUrl: 'https://team-a.example.com',
    });
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

    server.agentState.activateWorkspaceMind(workspace.id);
    await new Promise(resolve => setTimeout(resolve, 100));
    const sharedOrchestrator = server.agentState.orchestrator as unknown as { teamSync: TeamSync | null };
    expect(sharedOrchestrator.teamSync).not.toBeNull();
    const capturedTeamSync = sharedOrchestrator.teamSync!;

    server.agentState.closeWorkspaceMind(workspace.id);

    expect(sharedOrchestrator.teamSync).toBeNull();
    mockFetch.mockClear();
    await capturedTeamSync.pushFrame({
      id: 99,
      gop_id: 'closed-workspace',
      t: 0,
      frame_type: 'I',
      base_frame_id: null,
      content: 'must remain local after workspace close',
      importance: 'normal',
      source: 'agent_inferred',
      access_count: 0,
      created_at: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
