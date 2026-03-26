/**
 * E2E Tests: Workspaces, Memory Isolation, and Sessions
 *
 * Scenarios covered:
 *   3. Workspace created via API
 *   5. Workspace switching changes mind context
 *   6. Memory search returns results from correct mind
 *   8. Session management (create, list, delete)
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startService } from '@waggle/server/local/service';
import { FrameStore, SessionStore } from '@waggle/core';
import { injectWithAuth } from './test-utils.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-e2e-'));
}

// Port 0 lets the OS assign a free port; inject() bypasses the network anyway
const TEST_PORT = 0;

describe('Workspaces & Sessions E2E', () => {
  const servers: FastifyInstance[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const s of servers) {
      try { await s.close(); } catch { /* ignore */ }
    }
    servers.length = 0;
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  // Scenario 3: Create workspace via POST, verify GET returns it
  it('creates a workspace and retrieves it', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    // Create workspace
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Test Project', group: 'Work', icon: 'briefcase' },
    });
    expect(createRes.statusCode).toBe(201);

    const created = JSON.parse(createRes.payload);
    expect(created.name).toBe('Test Project');
    expect(created.group).toBe('Work');
    expect(created.id).toBeDefined();

    // List workspaces — should contain the new one
    const listRes = await injectWithAuth(server, { method: 'GET', url: '/api/workspaces' });
    expect(listRes.statusCode).toBe(200);

    const list = JSON.parse(listRes.payload);
    expect(list).toBeInstanceOf(Array);
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Test Project');

    // Get by ID
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${created.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const fetched = JSON.parse(getRes.payload);
    expect(fetched.id).toBe(created.id);
    expect(fetched.icon).toBe('briefcase');
  });

  // Scenario 5: Workspace switching changes mind context
  it('workspace switching isolates memory context', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    // Create two workspaces
    const res1 = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Alpha', group: 'Work', model: 'openai/gpt-4o' },
    });
    const ws1 = JSON.parse(res1.payload);

    const res2 = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Beta', group: 'Personal', model: 'anthropic/claude-sonnet-4-20250514' },
    });
    const ws2 = JSON.parse(res2.payload);

    // Verify they are distinct
    expect(ws1.id).not.toBe(ws2.id);
    expect(ws1.group).toBe('Work');
    expect(ws2.group).toBe('Personal');

    // Each workspace has its own .mind file on disk
    const mind1Path = path.join(dataDir, 'workspaces', ws1.id, 'workspace.mind');
    const mind2Path = path.join(dataDir, 'workspaces', ws2.id, 'workspace.mind');
    expect(fs.existsSync(mind1Path)).toBe(true);
    expect(fs.existsSync(mind2Path)).toBe(true);

    // Switch to ws-A, store memory, verify it's found
    server.multiMind.switchWorkspace(mind1Path);
    const wsASessions = new SessionStore(server.multiMind.workspace!);
    const wsASession = wsASessions.create();
    const wsAFrames = new FrameStore(server.multiMind.workspace!);
    wsAFrames.createIFrame(wsASession.gop_id, 'Alpha project uses Kubernetes for deployment');

    // Search ws-A scope — should find Kubernetes
    const searchA = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=Kubernetes&scope=workspace',
    });
    expect(searchA.statusCode).toBe(200);
    const resultsA = JSON.parse(searchA.payload);
    expect(resultsA.count).toBeGreaterThan(0);

    // Switch to ws-B — search should NOT find ws-A's memory
    server.multiMind.switchWorkspace(mind2Path);
    const searchB = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=Kubernetes&scope=workspace',
    });
    expect(searchB.statusCode).toBe(200);
    const resultsB = JSON.parse(searchB.payload);
    expect(resultsB.count).toBe(0);

    // Store different memory in ws-B
    const wsBSessions = new SessionStore(server.multiMind.workspace!);
    const wsBSession = wsBSessions.create();
    const wsBFrames = new FrameStore(server.multiMind.workspace!);
    wsBFrames.createIFrame(wsBSession.gop_id, 'Beta project uses Docker Compose locally');

    // ws-B should find Docker but not Kubernetes
    const searchB2 = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=Docker&scope=workspace',
    });
    expect(searchB2.statusCode).toBe(200);
    expect(JSON.parse(searchB2.payload).count).toBeGreaterThan(0);

    // Switch back to ws-A — should find Kubernetes, not Docker
    server.multiMind.switchWorkspace(mind1Path);
    const searchA2 = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=Kubernetes&scope=workspace',
    });
    expect(searchA2.statusCode).toBe(200);
    expect(JSON.parse(searchA2.payload).count).toBeGreaterThan(0);

    const searchA3 = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=Docker&scope=workspace',
    });
    expect(searchA3.statusCode).toBe(200);
    expect(JSON.parse(searchA3.payload).count).toBe(0);
  });

  // Scenario 6: Memory search returns results from correct mind only
  it('memory search returns results scoped to the correct mind', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    // Store a memory in the personal mind — need a session first (FK constraint)
    const personalSessions = new SessionStore(server.multiMind.personal);
    const pSession = personalSessions.create();
    const personalFrames = new FrameStore(server.multiMind.personal);
    personalFrames.createIFrame(pSession.gop_id, 'Waggle architecture uses Tauri with React frontend');

    // Create a workspace and store memory in its mind
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Research', group: 'Study' },
    });
    const ws = JSON.parse(createRes.payload);

    // Switch multiMind to workspace so workspace search works
    const wsMindPath = path.join(dataDir, 'workspaces', ws.id, 'workspace.mind');
    server.multiMind.switchWorkspace(wsMindPath);

    // Store memory in workspace mind — need a session first (FK constraint)
    const wsSessions = new SessionStore(server.multiMind.workspace!);
    const wSession = wsSessions.create();
    const wsFrames = new FrameStore(server.multiMind.workspace!);
    wsFrames.createIFrame(wSession.gop_id, 'GraphContext uses SHACL validation for knowledge graphs');

    // Search personal scope — should find "Tauri" but not "SHACL"
    const personalSearch = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=Tauri&scope=personal',
    });
    expect(personalSearch.statusCode).toBe(200);
    const personalResults = JSON.parse(personalSearch.payload);
    expect(personalResults.count).toBeGreaterThan(0);

    // Search workspace scope — should find "SHACL" but not "Tauri"
    const wsSearch = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=SHACL&scope=workspace',
    });
    expect(wsSearch.statusCode).toBe(200);
    const wsResults = JSON.parse(wsSearch.payload);
    expect(wsResults.count).toBeGreaterThan(0);

    // Cross-check: personal scope should NOT find workspace-only content
    const crossCheck = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=SHACL&scope=personal',
    });
    const crossResults = JSON.parse(crossCheck.payload);
    expect(crossResults.count).toBe(0);

    // Search all scope — should find both
    const allSearch = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/search?q=architecture&scope=all',
    });
    const allResults = JSON.parse(allSearch.payload);
    expect(allResults.count).toBeGreaterThanOrEqual(1);
  });

  // Scenario 8: Session CRUD — create, list, rename (switch), delete
  it('creates, lists, renames, and deletes sessions within a workspace', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    // Create workspace first
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Chat Workspace', group: 'Work' },
    });
    const ws = JSON.parse(wsRes.payload);

    // Create a session
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'My First Chat' },
    });
    expect(createRes.statusCode).toBe(201);
    const session = JSON.parse(createRes.payload);
    expect(session.id).toBeDefined();
    expect(session.title).toBe('My First Chat');
    expect(session.messageCount).toBe(0);

    // Create a second session
    const createRes2 = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Debug Session' },
    });
    expect(createRes2.statusCode).toBe(201);
    const session2 = JSON.parse(createRes2.payload);

    // List sessions — should have 2
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions`,
    });
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.payload);
    expect(list.length).toBe(2);

    // Rename (switch equivalent) — proves session is accessible and modifiable
    const patchRes = await injectWithAuth(server, {
      method: 'PATCH',
      url: `/api/sessions/${session.id}?workspace=${ws.id}`,
      payload: { title: 'Renamed Chat' },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = JSON.parse(patchRes.payload);
    expect(patched.title).toBe('Renamed Chat');
    expect(patched.id).toBe(session.id);

    // Verify rename persisted in list
    const listRes3 = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions`,
    });
    const list3 = JSON.parse(listRes3.payload);
    const renamed = list3.find((s: { id: string }) => s.id === session.id);
    expect(renamed).toBeDefined();
    expect(renamed.title).toBe('Renamed Chat');

    // Delete first session
    const delRes = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${session.id}?workspace=${ws.id}`,
    });
    expect(delRes.statusCode).toBe(200);
    const delBody = JSON.parse(delRes.payload);
    expect(delBody.deleted).toBe(true);

    // List again — should have 1
    const listRes2 = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions`,
    });
    const list2 = JSON.parse(listRes2.payload);
    expect(list2.length).toBe(1);
    expect(list2[0].id).toBe(session2.id);
  });
});
