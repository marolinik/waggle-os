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
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
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
function writeTeamConfig(dataDir: string, token?: string) {
  const config: Record<string, unknown> = {
    defaultModel: 'claude-sonnet-4-6',
    providers: {},
  };
  if (token) {
    config.teamServer = { url: 'https://team.example.com', token };
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
          teamServerUrl: 'https://team.example.com',
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
    expect(url).toBe('https://team.example.com/api/teams/team-abc/audit');
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
        teamServerUrl: 'https://team.example.com',
        teamUserId: 'user-42',
      },
    });

    expect(res.statusCode).toBe(201);
    const ws = res.json();
    expect(ws.name).toBe('Team Project');

    // Wait for fire-and-forget fetch to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Find the registration call (not audit event calls or health checks)
    const registrationCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === 'string' && url.includes('/entities'),
    );

    expect(registrationCalls.length).toBeGreaterThanOrEqual(1);
    const [url, opts] = registrationCalls[0];
    expect(url).toBe('https://team.example.com/api/teams/team-abc/entities');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer ws-reg-token');
    const body = JSON.parse(opts.body);
    expect(body.entityType).toBe('workspace');
    expect(body.properties.displayName).toBe('Team Project');
    expect(body.properties.group).toBe('work');
    expect(body.properties.createdBy).toBe('user-42');
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
});
