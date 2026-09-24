import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../src/local/index.js';
import {
  chatSessionStateKey,
  isChatSessionStateKeyForWorkspace,
} from '../src/local/routes/chat-persistence.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';
import { installFakeLlmProvider, markFakeProviderHealthy } from './helpers/fake-llm-provider.js';

describe('Workspace & Session API', () => {
  let server: FastifyInstance;
  let dataDir: string;
  let workspaceId: string;

  beforeAll(async () => {
    // Create isolated temp dir for tests
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-api-'));

    // Write a minimal config.json so WaggleConfig doesn't error
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({
        defaultModel: 'test/model',
        providers: {},
        teamServer: { url: 'https://team.example.com' },
      }),
      'utf-8'
    );

    // Create personal.mind as empty file (MindDB will init schema)
    // Don't create it — let MultiMind handle it
    server = await buildLocalServer({ dataDir, port: 0 });
  });

  afterAll(async () => {
    await server.close();
    // Clean up temp dir
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // First, create a workspace to use for session tests
  it('creates a workspace for session tests', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Session Test WS', group: 'Test' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    workspaceId = body.id;
  });

  it('persists linked local storage and routes uploads to it without persisting secrets', async () => {
    const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-linked-storage-'));
    const content = 'linked workspace survives metadata reload';
    const secretSentinel = 'must-never-reach-workspace-json';
    const ownerSentinel = path.join(linkedRoot, 'owner-sentinel.txt');
    fs.writeFileSync(ownerSentinel, 'user-owned data', 'utf-8');
    let linkedWorkspaceId: string | undefined;

    try {
      const createRes = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: {
          name: 'Linked Storage Persistence',
          group: 'Test',
          storageType: 'local',
          storagePath: linkedRoot,
          storageConfig: { secretKey: secretSentinel },
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      linkedWorkspaceId = created.id as string;
      expect(created.storageType).toBe('local');
      expect(created.storagePath).toBe(fs.realpathSync.native(linkedRoot));
      expect(created.storageConfig).toBeUndefined();

      const configPath = path.join(
        dataDir,
        'workspaces',
        linkedWorkspaceId,
        'workspace.json',
      );
      const rawConfig = fs.readFileSync(configPath, 'utf-8');
      const onDisk = JSON.parse(rawConfig);
      expect(onDisk.storageType).toBe('local');
      expect(onDisk.storagePath).toBe(fs.realpathSync.native(linkedRoot));
      expect(rawConfig).not.toContain(secretSentinel);
      expect(onDisk.storageConfig).toBeUndefined();

      const { WorkspaceManager } = await import('@waggle/core');
      expect(new WorkspaceManager(dataDir).get(linkedWorkspaceId)).toMatchObject({
        storageType: 'local',
        storagePath: fs.realpathSync.native(linkedRoot),
      });

      const getRes = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/workspaces/${linkedWorkspaceId}`,
      });
      expect(getRes.statusCode).toBe(200);
      const reloaded = JSON.parse(getRes.body);
      expect(reloaded.storageType).toBe('local');
      expect(reloaded.storagePath).toBe(fs.realpathSync.native(linkedRoot));
      expect(reloaded.storageConfig).toBeUndefined();

      for (const directory of ['attachments', 'exports', 'notes']) {
        expect(fs.statSync(path.join(linkedRoot, directory)).isDirectory()).toBe(true);
      }

      const uploadRes = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/workspaces/${linkedWorkspaceId}/files/upload`,
        payload: {
          path: 'notes',
          name: 'persistence-probe.txt',
          data: Buffer.from(content, 'utf-8').toString('base64'),
        },
      });
      expect(uploadRes.statusCode).toBe(201);
      expect(
        fs.readFileSync(path.join(linkedRoot, 'notes', 'persistence-probe.txt'), 'utf-8'),
      ).toBe(content);
      expect(
        fs.existsSync(
          path.join(
            dataDir,
            'workspaces',
            linkedWorkspaceId,
            'files',
            'notes',
            'persistence-probe.txt',
          ),
        ),
      ).toBe(false);
    } finally {
      if (linkedWorkspaceId) {
        const deleteRes = await injectWithAuth(server, {
          method: 'DELETE',
          url: `/api/workspaces/${linkedWorkspaceId}`,
        });
        expect(deleteRes.statusCode).toBe(204);
        expect(fs.existsSync(linkedRoot)).toBe(true);
        expect(fs.readFileSync(ownerSentinel, 'utf-8')).toBe('user-owned data');
      }
      fs.rmSync(linkedRoot, { recursive: true, force: true });
    }
  });

  it('rejects invalid local storage bindings before writing metadata', async () => {
    const regularFile = path.join(dataDir, 'not-a-storage-directory.txt');
    fs.writeFileSync(regularFile, 'not a directory', 'utf-8');
    const collisionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-linked-collision-'));
    fs.writeFileSync(path.join(collisionRoot, 'notes'), 'blocks the standard directory', 'utf-8');
    const invalidPayloads = [
      {
        name: 'Local Storage Missing Path',
        group: 'Test',
        storageType: 'local',
      },
      {
        name: 'Local Storage Regular File',
        group: 'Test',
        storageType: 'local',
        storagePath: regularFile,
      },
      {
        name: 'Local Storage Directory Collision',
        group: 'Test',
        storageType: 'local',
        storagePath: collisionRoot,
      },
    ];
    const unexpectedlyCreated: string[] = [];

    try {
      for (const payload of invalidPayloads) {
        const res = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/workspaces',
          payload,
        });
        const body = JSON.parse(res.body);
        if (res.statusCode === 201 && typeof body.id === 'string') {
          unexpectedlyCreated.push(body.id);
        }
        expect(res.statusCode).toBe(400);
      }

      const listRes = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/workspaces',
      });
      const names = JSON.parse(listRes.body).map((workspace: { name: string }) => workspace.name);
      for (const payload of invalidPayloads) {
        expect(names).not.toContain(payload.name);
      }
      expect(fs.existsSync(path.join(collisionRoot, 'attachments'))).toBe(false);
      expect(fs.existsSync(path.join(collisionRoot, 'exports'))).toBe(false);
      expect(fs.statSync(path.join(collisionRoot, 'notes')).isFile()).toBe(true);
    } finally {
      for (const id of unexpectedlyCreated) {
        await injectWithAuth(server, {
          method: 'DELETE',
          url: `/api/workspaces/${id}`,
        });
      }
      fs.rmSync(collisionRoot, { recursive: true, force: true });
    }
  });

  it('accepts non-local storage paths without persisting them as host bindings', async () => {
    const payloads = [
      {
        name: 'Storage Path Without Type',
        group: 'Test',
        storagePath: dataDir,
      },
      {
        name: 'Virtual Storage With Retained Path',
        group: 'Test',
        storageType: 'virtual',
        storagePath: dataDir,
      },
      {
        name: 'Team Storage With Bucket Prefix',
        group: 'Test',
        storageType: 'team',
        storagePath: 'team-prefix',
      },
    ];
    const createdIds: string[] = [];

    try {
      for (const payload of payloads) {
        const res = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/workspaces',
          payload,
        });
        expect(res.statusCode).toBe(201);

        const created = JSON.parse(res.body) as {
          id: string;
          storageType?: string;
          storagePath?: string;
        };
        createdIds.push(created.id);
        expect(created.storageType).toBeUndefined();
        expect(created.storagePath).toBeUndefined();

        const onDisk = JSON.parse(fs.readFileSync(
          path.join(dataDir, 'workspaces', created.id, 'workspace.json'),
          'utf-8',
        )) as Record<string, unknown>;
        expect(onDisk).not.toHaveProperty('storageType');
        expect(onDisk).not.toHaveProperty('storagePath');
      }
    } finally {
      for (const id of createdIds) {
        await injectWithAuth(server, {
          method: 'DELETE',
          url: `/api/workspaces/${id}`,
        });
      }
    }
  });

  it('rolls back prepared local directories when metadata creation fails', async () => {
    const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-linked-rollback-'));
    const ownerSentinel = path.join(linkedRoot, 'owner-sentinel.txt');
    fs.writeFileSync(ownerSentinel, 'keep me', 'utf-8');
    const updateSpy = vi.spyOn(server.workspaceManager, 'update')
      .mockImplementationOnce(() => { throw new Error('simulated metadata failure'); });

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: {
          name: 'Metadata Failure Rollback',
          group: 'Test',
          storageType: 'local',
          storagePath: linkedRoot,
        },
      });
      expect(res.statusCode).toBe(500);
      for (const directory of ['attachments', 'exports', 'notes']) {
        expect(fs.existsSync(path.join(linkedRoot, directory))).toBe(false);
      }
      expect(fs.readFileSync(ownerSentinel, 'utf-8')).toBe('keep me');
      expect(server.workspaceManager.list().map(workspace => workspace.name))
        .not.toContain('Metadata Failure Rollback');
    } finally {
      updateSpy.mockRestore();
      fs.rmSync(linkedRoot, { recursive: true, force: true });
    }
  });

  // --- I2: Team Workspace Creation ---

  it('creates a team workspace with team fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Team Project Alpha',
        group: 'Team',
        teamId: 'team-123',
        teamServerUrl: 'https://team.example.com',
        teamRole: 'member',
        teamUserId: 'user-456',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Team Project Alpha');
    expect(body.group).toBe('Team');
    expect(body.teamId).toBe('team-123');
    expect(body.teamServerUrl).toBe('https://team.example.com');
    expect(body.teamRole).toBe('member');
    expect(body.teamUserId).toBe('user-456');

    // Verify it appears in workspace list
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces',
    });
    const list = JSON.parse(listRes.body);
    const teamWs = list.find((ws: { teamId?: string }) => ws.teamId === 'team-123');
    expect(teamWs).toBeTruthy();
    expect(teamWs.teamServerUrl).toBe('https://team.example.com');

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${body.id}` });
  });

  it('creates a regular workspace without team fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Regular WS', group: 'Personal' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.teamId).toBeUndefined();
    expect(body.teamServerUrl).toBeUndefined();

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${body.id}` });
  });

  // --- Session Tests ---

  it('lists sessions (empty initially)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  let sessionId: string;

  it('creates a session', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'My First Chat' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^session-/);
    expect(body.title).toBe('My First Chat');
    expect(body.messageCount).toBe(0);
    expect(body.lastActive).toBeTruthy();
    expect(body.created).toBeTruthy();
    sessionId = body.id;
  });

  it('creates a session without title (keeps it untitled)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBeNull();
  });

  it('lists sessions (shows created sessions)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBe(2);
    // Should find our named session
    const named = body.find((s: { title: string }) => s.title === 'My First Chat');
    expect(named).toBeTruthy();
    expect(named.messageCount).toBe(0);
  });

  it('reads session metadata including message count', async () => {
    // Append messages to the session JSONL file (meta line already exists from creation)
    const sessionPath = path.join(
      dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
    );
    // Read existing meta line
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'Hello there', timestamp: new Date().toISOString() }),
      JSON.stringify({ role: 'assistant', content: 'Hi! How can I help?', timestamp: new Date().toISOString() }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const session = body.find((s: { id: string }) => s.id === sessionId);
    expect(session).toBeTruthy();
    expect(session.messageCount).toBe(2);
    // Title should come from meta line (set during creation)
    expect(session.title).toBe('My First Chat');
  });

  it('auto-generates summary for session with 4+ messages', async () => {
    // Create a new session with enough messages to trigger summary generation
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'Summary Test Session' },
    });
    const { id: summarySessionId } = JSON.parse(createRes.body);

    // Add 6 messages (3 exchanges) to the session file
    const sessionPath = path.join(
      dataDir, 'workspaces', workspaceId, 'sessions', `${summarySessionId}.jsonl`
    );
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'Help me plan the Q2 marketing campaign', timestamp: '2026-03-09T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'I can help with that. Let me search for context about your marketing goals.', timestamp: '2026-03-09T10:01:00Z' }),
      JSON.stringify({ role: 'user', content: 'We decided to focus on social media this quarter', timestamp: '2026-03-09T10:02:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Good decision. Social media aligns well with your budget constraints.', timestamp: '2026-03-09T10:03:00Z' }),
      JSON.stringify({ role: 'user', content: 'Can you draft an outline?', timestamp: '2026-03-09T10:04:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Here is a draft marketing plan outline with 5 key initiatives.', timestamp: '2026-03-09T10:05:00Z' }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    // List sessions — this triggers lazy summary generation
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    const sessions = JSON.parse(listRes.body);
    const summarySession = sessions.find((s: { id: string }) => s.id === summarySessionId);
    expect(summarySession).toBeTruthy();
    expect(summarySession.summary).toBeTruthy();
    expect(typeof summarySession.summary).toBe('string');
    expect(summarySession.summary.length).toBeGreaterThan(5);

    // Verify summary was persisted to the JSONL meta line
    const updatedContent = fs.readFileSync(sessionPath, 'utf-8');
    const firstLine = JSON.parse(updatedContent.split('\n')[0]);
    expect(firstLine.summary).toBe(summarySession.summary);

    // Clean up
    await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${summarySessionId}?workspace=${workspaceId}`,
    });
  });

  it('does not generate summary for sessions with fewer than 4 messages', async () => {
    // The session we created earlier had only 2 messages (added in a previous test)
    // Create a session with just 2 messages
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'Short Session' },
    });
    const { id: shortSessionId } = JSON.parse(createRes.body);

    const sessionPath = path.join(
      dataDir, 'workspaces', workspaceId, 'sessions', `${shortSessionId}.jsonl`
    );
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'Quick question', timestamp: '2026-03-09T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Sure, what is it?', timestamp: '2026-03-09T10:01:00Z' }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    const sessions = JSON.parse(listRes.body);
    const shortSession = sessions.find((s: { id: string }) => s.id === shortSessionId);
    expect(shortSession).toBeTruthy();
    expect(shortSession.summary).toBeNull();

    // Clean up
    await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${shortSessionId}?workspace=${workspaceId}`,
    });
  });

  it('deletes a session', async () => {
    const stateKey = chatSessionStateKey(workspaceId, sessionId);
    server.agentState.sessionHistories.set(stateKey, [{
      role: 'user',
      content: 'deleted-session-memory-sentinel',
    }]);

    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${sessionId}?workspace=${workspaceId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    const sessions = JSON.parse(listRes.body);
    const deleted = sessions.find((s: { id: string }) => s.id === sessionId);
    expect(deleted).toBeUndefined();

    expect(server.agentState.sessionHistories.has(stateKey)).toBe(false);
    const historyRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=${workspaceId}&session=${sessionId}`,
    });
    expect(historyRes.statusCode).toBe(200);
    expect(JSON.parse(historyRes.body)).toMatchObject({
      sessionId,
      messages: [],
      count: 0,
    });
  });

  it('does not retain histories loaded only for browsing', async () => {
    const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
    const browsedSessionIds = Array.from(
      { length: 65 },
      (_, index) => `browsed-history-${index}`,
    );

    try {
      for (const browsedSessionId of browsedSessionIds) {
        fs.writeFileSync(
          path.join(sessionsDir, `${browsedSessionId}.jsonl`),
          `${JSON.stringify({ type: 'meta', title: browsedSessionId })}\n${JSON.stringify({
            role: 'user',
            content: `history-${browsedSessionId}`,
          })}\n`,
          'utf-8',
        );
        const historyRes = await injectWithAuth(server, {
          method: 'GET',
          url: `/api/history?workspace=${workspaceId}&session=${browsedSessionId}`,
        });
        expect(historyRes.statusCode).toBe(200);
        expect(JSON.parse(historyRes.body).count).toBe(1);
      }

      const retainedWorkspaceKeys = [...server.agentState.sessionHistories.keys()]
        .filter((stateKey) => isChatSessionStateKeyForWorkspace(stateKey, workspaceId));
      expect(retainedWorkspaceKeys).toEqual([]);
    } finally {
      for (const browsedSessionId of browsedSessionIds) {
        fs.rmSync(path.join(sessionsDir, `${browsedSessionId}.jsonl`), { force: true });
        server.agentState.chatStateController?.evictSession(workspaceId, browsedSessionId);
      }
    }
  });

  it('evicts an oversized idle chat history from RAM without deleting its file', async () => {
    const oversizedSessionId = 'oversized-retained-history';
    const stateKey = chatSessionStateKey(workspaceId, oversizedSessionId);
    const sessionPath = path.join(
      dataDir,
      'workspaces',
      workspaceId,
      'sessions',
      `${oversizedSessionId}.jsonl`,
    );
    fs.writeFileSync(sessionPath, `${JSON.stringify({ type: 'meta' })}\n`, 'utf-8');
    server.agentState.sessionHistories.set(stateKey, [{
      role: 'user',
      content: 'x'.repeat(2_000_001),
    }]);

    server.agentState.chatStateController?.touchSession(stateKey);

    expect(server.agentState.sessionHistories.has(stateKey)).toBe(false);
    expect(fs.existsSync(sessionPath)).toBe(true);
    fs.rmSync(sessionPath, { force: true });
  });

  it('bounds aggregate idle chat-history content retained in RAM', () => {
    const aggregateSessionIds = Array.from(
      { length: 9 },
      (_, index) => `aggregate-history-${index}`,
    );
    try {
      for (const aggregateSessionId of aggregateSessionIds) {
        const stateKey = chatSessionStateKey(workspaceId, aggregateSessionId);
        server.agentState.sessionHistories.set(stateKey, [{
          role: 'user',
          content: 'x'.repeat(1_000_000),
        }]);
        server.agentState.chatStateController?.touchSession(stateKey);
      }

      const retained = [...server.agentState.sessionHistories.entries()]
        .filter(([stateKey]) => isChatSessionStateKeyForWorkspace(stateKey, workspaceId));
      const retainedChars = retained.reduce(
        (total, [, history]) => total + history.reduce(
          (historyTotal, message) => historyTotal + message.content.length,
          0,
        ),
        0,
      );
      expect(retainedChars).toBeLessThanOrEqual(8_000_000);
      expect(server.agentState.sessionHistories.has(
        chatSessionStateKey(workspaceId, aggregateSessionIds[0]!),
      )).toBe(false);
      expect(server.agentState.sessionHistories.has(
        chatSessionStateKey(workspaceId, aggregateSessionIds.at(-1)!),
      )).toBe(true);
    } finally {
      for (const aggregateSessionId of aggregateSessionIds) {
        server.agentState.chatStateController?.evictSession(workspaceId, aggregateSessionId);
      }
    }
  });

  it('bounds the complete retained history payload including tool receipts', () => {
    const receiptSessionId = 'oversized-tool-receipts';
    const stateKey = chatSessionStateKey(workspaceId, receiptSessionId);
    server.agentState.sessionHistories.set(
      stateKey,
      Array.from({ length: 63 }, (_, index) => ({
        role: 'assistant',
        content: 'ok',
        tools: [{
          id: `capability-${index}`,
          name: 'acquire_capability' as const,
          status: 'done' as const,
          input: { need: 'one capability' },
          output: 'x'.repeat(32_000),
        }],
      })),
    );

    server.agentState.chatStateController?.touchSession(stateKey);

    expect(server.agentState.sessionHistories.has(stateKey)).toBe(false);
  });

  it('limits the number of small idle chat session states', () => {
    const boundedSessionIds = Array.from(
      { length: 65 },
      (_, index) => `bounded-state-${index}`,
    );
    try {
      for (const boundedSessionId of boundedSessionIds) {
        const stateKey = chatSessionStateKey(workspaceId, boundedSessionId);
        server.agentState.sessionHistories.set(stateKey, [{
          role: 'user',
          content: boundedSessionId,
        }]);
        server.agentState.chatStateController?.touchSession(stateKey);
      }

      const retainedWorkspaceKeys = [...server.agentState.sessionHistories.keys()]
        .filter((stateKey) => isChatSessionStateKeyForWorkspace(stateKey, workspaceId));
      expect(retainedWorkspaceKeys).toHaveLength(64);
      expect(server.agentState.sessionHistories.has(
        chatSessionStateKey(workspaceId, boundedSessionIds[0]!),
      )).toBe(false);
      expect(server.agentState.sessionHistories.has(
        chatSessionStateKey(workspaceId, boundedSessionIds.at(-1)!),
      )).toBe(true);
    } finally {
      for (const boundedSessionId of boundedSessionIds) {
        server.agentState.chatStateController?.evictSession(workspaceId, boundedSessionId);
      }
    }
  });

  it('evicts retained chat history after a workspace is deleted', async () => {
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Delete Cached Workspace', group: 'Test' },
    });
    expect(createRes.statusCode).toBe(201);
    const deletedWorkspace = JSON.parse(createRes.body) as { id: string };
    const deletedSessionId = 'cached-before-workspace-delete';
    const stateKey = chatSessionStateKey(deletedWorkspace.id, deletedSessionId);
    server.agentState.sessionHistories.set(stateKey, [{
      role: 'user',
      content: 'deleted-workspace-memory-sentinel',
    }]);

    const deleteRes = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/workspaces/${deletedWorkspace.id}`,
    });
    expect(deleteRes.statusCode).toBe(204);
    expect(server.agentState.sessionHistories.has(stateKey)).toBe(false);

    const historyRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=${deletedWorkspace.id}&session=${deletedSessionId}`,
    });
    expect(historyRes.statusCode).toBe(200);
    expect(JSON.parse(historyRes.body).messages).toEqual([]);
  });

  it('rejects deletion as active before consulting the session file', async () => {
    const activeSessionId = 'active-before-first-persist';
    const chatState = server.agentState.chatStateController;
    expect(chatState).toBeDefined();
    const originalIsSessionActive = chatState!.isSessionActive;
    chatState!.isSessionActive = (candidateWorkspaceId, candidateSessionId) => (
      candidateWorkspaceId === workspaceId && candidateSessionId === activeSessionId
        ? true
        : originalIsSessionActive(candidateWorkspaceId, candidateSessionId)
    );

    try {
      const res = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/sessions/${activeSessionId}?workspace=${workspaceId}`,
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body)).toMatchObject({
        code: 'SESSION_TURN_IN_PROGRESS',
      });
    } finally {
      chatState!.isSessionActive = originalIsSessionActive;
    }
  });

  it('rejects session deletion while a real chat turn is active', async () => {
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'Active deletion guard' },
    });
    expect(createRes.statusCode).toBe(201);
    const activeSessionId = JSON.parse(createRes.body).id as string;
    let markEntered!: () => void;
    let releaseTurn!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const released = new Promise<void>((resolve) => { releaseTurn = resolve; });
    // The real agent loop runs; the provider call holds the turn open (TD-CHAT-16).
    const undoProvider = markFakeProviderHealthy(server);
    const provider = installFakeLlmProvider({
      respond: async () => {
        markEntered();
        await released;
        return { type: 'text', content: 'completed', usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const turn = injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Hold this turn open.',
        workspace: workspaceId,
        session: activeSessionId,
      },
    });

    try {
      await entered;
      const activeDelete = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/sessions/${activeSessionId}?workspace=${workspaceId}`,
      });
      expect(activeDelete.statusCode).toBe(409);
      expect(JSON.parse(activeDelete.body)).toMatchObject({
        code: 'SESSION_TURN_IN_PROGRESS',
      });

      releaseTurn();
      expect((await turn).statusCode).toBe(200);
      const completedDelete = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/sessions/${activeSessionId}?workspace=${workspaceId}`,
      });
      expect(completedDelete.statusCode).toBe(200);
    } finally {
      releaseTurn();
      await turn.catch(() => undefined);
      provider.restore();
      undoProvider();
    }
  });

  it('returns 404 when deleting non-existent session', async () => {
    const staleSessionId = 'nonexistent-session';
    const stateKey = chatSessionStateKey(workspaceId, staleSessionId);
    server.agentState.sessionHistories.set(stateKey, [{
      role: 'user',
      content: 'stale-missing-file-sentinel',
    }]);
    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${staleSessionId}?workspace=${workspaceId}`,
    });
    expect(res.statusCode).toBe(404);
    expect(server.agentState.sessionHistories.has(stateKey)).toBe(false);

    const historyRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=${workspaceId}&session=${staleSessionId}`,
    });
    expect(JSON.parse(historyRes.body).messages).toEqual([]);
  });

  it('returns empty array for sessions of non-existent workspace (graceful degradation)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces/nonexistent-ws/sessions',
    });
    // Returns 200 with empty array — intentional graceful degradation
    // (default workspace might not be registered on first startup)
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  // --- Knowledge Graph Tests ---

  it('returns knowledge graph (empty for fresh mind)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/graph',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('nodes');
    expect(body).toHaveProperty('edges');
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  it('returns knowledge graph for workspace mind', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/memory/graph?workspace=${workspaceId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('nodes');
    expect(body).toHaveProperty('edges');
  });

  it('returns an empty graph for a non-existent workspace', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/graph?workspace=nonexistent',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ nodes: [], edges: [] });
  });

  // --- API Key Test Endpoint ---

  it('saves provider keys to the vault without persisting plaintext config secrets', async () => {
    const key = 'sk-test-openai-key-1234567890';
    const res = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings',
      payload: { providers: { openai: { apiKey: key, models: ['gpt-4o'] } } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(key);

    const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8')) as {
      providers?: Record<string, { apiKey?: string; models?: string[] }>;
    };
    expect(config.providers?.openai).toMatchObject({ apiKey: '', models: ['gpt-4o'] });
    expect(server.vault?.get('openai')?.value).toBe(key);
    server.vault?.delete('openai');
  });

  it('validates OpenAI key format (valid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'openai', apiKey: 'sk-1234567890abcdefghij' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
  });

  it('validates OpenAI key format (invalid prefix)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'openai', apiKey: 'bad-key-1234567890' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/sk-/);
  });

  it('validates Anthropic key format (valid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'anthropic', apiKey: 'sk-ant-1234567890abcdefg' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
  });

  it('validates Anthropic key format (invalid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'anthropic', apiKey: 'sk-1234567890abcdefg' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/sk-ant-/);
  });

  it('rejects test-key request without provider or apiKey', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates unknown provider key (just length check)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'some-provider', apiKey: 'abcdefghij' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
  });

  // --- F3: probe-provider (live-probe a STORED key) ---

  it('probe-provider returns configured:false when no key is stored', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/probe-provider',
      payload: { provider: 'anthropic' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ configured: false, valid: false, verified: false });
  });

  it('probe-provider rejects a body missing provider (validateBody 400)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/probe-provider',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('probe-provider reports valid:false when the provider rejects the stored key', async () => {
    const { _clearKeyProbeCache } = await import('../src/local/llm-key-probe.js');
    const configPath = path.join(dataDir, 'config.json');
    const original = fs.readFileSync(configPath, 'utf-8');
    // Stash a format-valid anthropic key in config (fallback path of the route).
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultModel: 'test/model',
        providers: { anthropic: { apiKey: 'sk-ant-1234567890abcdefg', models: [] } },
      }),
      'utf-8',
    );
    _clearKeyProbeCache(); // 60s TTL — avoid a stale verdict from another case
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-provider',
        payload: { provider: 'anthropic' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.configured).toBe(true);
      expect(body.valid).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      _clearKeyProbeCache();
      fs.writeFileSync(configPath, original, 'utf-8');
    }
  });

  // --- MODEL-GATE: probe-model (live-probe the resolved default model) ---

  const exactProbeModel = 'openrouter/openai/test-model';
  function configureExactProbeModel(): () => void {
    const priorProvider = { ...server.agentState.llmProvider };
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: 'Built-in provider proxy (verification pending)',
      checkedAt: new Date().toISOString(),
    };
    server.vault.set('openrouter', 'openrouter-probe-model-test-key');
    return () => {
      server.agentState.llmProvider = priorProvider;
      server.vault.delete('openrouter');
    };
  }

  function configureCompatibleProbeModel(model: string, models = [model]): () => void {
    const configPath = path.join(dataDir, 'config.json');
    const originalConfig = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(originalConfig) as Record<string, unknown>;
    const providers = config.providers && typeof config.providers === 'object'
      ? config.providers as Record<string, unknown>
      : {};
    config.defaultModel = model;
    config.providers = {
      ...providers,
      'openai-compatible': {
        apiKey: '',
        baseUrl: 'http://10.33.0.153:4000/v1',
        models,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
    const priorProvider = { ...server.agentState.llmProvider };
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'openai-compatible endpoint verified',
      checkedAt: new Date().toISOString(),
    };
    return () => {
      server.agentState.llmProvider = priorProvider;
      fs.writeFileSync(configPath, originalConfig, 'utf-8');
    };
  }

  it('probe-model reports verified when the model endpoint answers 200', async () => {
    const restoreModel = configureExactProbeModel();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'WAGGLE_OK' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model: exactProbeModel },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toMatchObject({ model: exactProbeModel, configured: true, verified: true });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/chat\/completions$/),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${server.agentState.wsSessionToken}`,
          }),
        }),
      );
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('uses a bounded non-thinking Qwen probe and requires a real assistant response', async () => {
    const model = 'openai-compatible/qwen3.8-flash-next';
    const restoreModel = configureCompatibleProbeModel(model);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '' } }],
      }), { status: 200 }));
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        model,
        configured: true,
        verified: true,
      });
      expect(timeoutSpy.mock.calls.some(([, milliseconds]) => milliseconds === 15_000)).toBe(true);
      const completionCall = fetchMock.mock.calls.find(([input]) => (
        String(input).endsWith('/v1/chat/completions')
      ));
      expect(JSON.parse(String(completionCall?.[1]?.body))).toMatchObject({
        model,
        max_tokens: 32,
        chat_template_kwargs: { enable_thinking: false },
      });

      for (const expected of ['malformed', 'empty']) {
        const failed = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/settings/probe-model',
          payload: { model },
        });
        expect(failed.statusCode, expected).toBe(200);
        expect(failed.json(), expected).toMatchObject({
          model,
          configured: true,
          verified: false,
        });
      }
    } finally {
      timeoutSpy.mockRestore();
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('keeps a compatible Qwen request alive before the deadline and aborts at the deadline', async () => {
    vi.useFakeTimers();
    const model = 'openai-compatible/qwen3.8-flash-next';
    const restoreModel = configureCompatibleProbeModel(model);
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => (
      new Promise<Response>((_resolve, reject) => {
        observedSignal = init?.signal as AbortSignal | undefined;
        observedSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })
    ));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const pending = injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model },
      });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(observedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const res = await pending;
      expect(observedSignal?.aborted).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ model, configured: true, verified: false });
    } finally {
      vi.useRealTimers();
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('does not send the compatible-only thinking extension to external Qwen', async () => {
    const restoreModel = configureExactProbeModel();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'WAGGLE_OK' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model: 'openrouter/qwen/qwen3.8-flash-next' },
      });
      expect(res.json()).toMatchObject({ configured: true, verified: true });
      const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(request).not.toHaveProperty('chat_template_kwargs');
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('never sends the Waggle session bearer to an Ollama probe endpoint', async () => {
    const priorOllamaHost = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = 'http://ollama.example.test';
    const fetchMock = vi.fn(async (
      input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'qwen-test' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model: 'ollama/qwen-test' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        model: 'ollama/qwen-test',
        configured: true,
        verified: true,
      });
      const completionCall = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith('/v1/chat/completions'));
      expect(completionCall).toBeDefined();
      expect(String(completionCall?.[0])).toBe(
        'http://ollama.example.test/v1/chat/completions',
      );
      const completionHeaders = new Headers(completionCall?.[1]?.headers);
      expect(completionHeaders.has('authorization')).toBe(false);
      expect(JSON.parse(String(completionCall?.[1]?.body))).not.toHaveProperty('chat_template_kwargs');
    } finally {
      if (priorOllamaHost === undefined) delete process.env.OLLAMA_HOST;
      else process.env.OLLAMA_HOST = priorOllamaHost;
      vi.unstubAllGlobals();
    }
  });

  it('probe-model reports rejected on a 401 from the model endpoint', async () => {
    const restoreModel = configureExactProbeModel();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model: exactProbeModel },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toMatchObject({ configured: true, verified: false, rejected: true });
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('probe-model reports unverified (transient) when the model endpoint times out', async () => {
    const restoreModel = configureExactProbeModel();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')));
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model: exactProbeModel },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toMatchObject({ configured: true, verified: false });
      expect(body.rejected).toBeUndefined();
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('atomically rejects a multi-lane save when any exact model fails verification', async () => {
    const primary = 'openai-compatible/qwen-primary';
    const fallback = 'openai-compatible/qwen-fallback';
    const restoreModel = configureCompatibleProbeModel(primary, [primary, fallback]);
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const runtimeBefore = server.agentState.currentModel;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('model_not_found', { status: 404 })));

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: {
          defaultModel: primary,
          fallbackModel: fallback,
          verifyModelSettings: true,
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'MODEL_VERIFICATION_FAILED',
        model: fallback,
      });
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
      expect(server.agentState.currentModel).toBe(runtimeBefore);
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('does not let a routable fallback make a broken saved default look verified', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const originalConfig = fs.readFileSync(configPath, 'utf-8');
    const priorCurrentModel = server.agentState.currentModel;
    const priorAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const priorAnthropicVault = server.vault.get('anthropic');
    const brokenDefault = 'anthropic/claude-default-unavailable';
    const restoreProbe = configureExactProbeModel();
    delete process.env.ANTHROPIC_API_KEY;
    server.vault.delete('anthropic');
    server.agentState.currentModel = exactProbeModel;
    const config = JSON.parse(originalConfig) as Record<string, unknown>;
    config.defaultModel = brokenDefault;
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'WAGGLE_OK' } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        model: brokenDefault,
        configured: true,
        verified: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fs.writeFileSync(configPath, originalConfig, 'utf-8');
      server.agentState.currentModel = priorCurrentModel;
      restoreProbe();
      if (priorAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = priorAnthropicKey;
      if (priorAnthropicVault) {
        server.vault.set('anthropic', priorAnthropicVault.value, priorAnthropicVault.metadata);
      } else {
        server.vault.delete('anthropic');
      }
      vi.unstubAllGlobals();
    }
  });

  it('fails closed on an explicitly blank Primary without touching config', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: { defaultModel: '', verifyModelSettings: true },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'PRIMARY_MODEL_REQUIRED' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    { fallbackModel: '   ' },
    { budgetModel: ' openai-compatible/qwen-budget ' },
    { defaultModel: ' openrouter/openai/test-model ' },
  ])('rejects non-canonical model lane values without probing or mutation: %j', async (payload) => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const runtimeBefore = server.agentState.currentModel;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'MODEL_ID_INVALID' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
      expect(server.agentState.currentModel).toBe(runtimeBefore);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses a settings revision so a slower stale save cannot overwrite a newer session', async () => {
    const primary = 'openai-compatible/qwen-primary';
    const fallbackA = 'openai-compatible/qwen-fallback-a';
    const fallbackB = 'openai-compatible/qwen-fallback-b';
    const restoreModel = configureCompatibleProbeModel(primary, [primary, fallbackA, fallbackB]);
    let resolveSlow!: (response: Response) => void;
    const slowResponse = new Promise<Response>((resolve) => { resolveSlow = resolve; });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => slowResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const staleSave = injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: { fallbackModel: fallbackA, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      const latestSave = injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: { fallbackModel: fallbackB, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect((await latestSave).statusCode).toBe(200);

      resolveSlow(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
      expect((await staleSave).statusCode).toBe(409);

      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
      expect(saved.fallbackModel).toBe(fallbackB);
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('always lets the newer verified request win when the older probe finishes first', async () => {
    const primary = 'openai-compatible/qwen-primary';
    const fallbackA = 'openai-compatible/qwen-fallback-a';
    const fallbackB = 'openai-compatible/qwen-fallback-b';
    const restoreModel = configureCompatibleProbeModel(primary, [primary, fallbackA, fallbackB]);
    let resolveA!: (response: Response) => void;
    let resolveB!: (response: Response) => void;
    const responseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    const responseB = new Promise<Response>((resolve) => { resolveB = resolve; });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => responseA)
      .mockImplementationOnce(() => responseB);
    vi.stubGlobal('fetch', fetchMock);

    try {
      const older = injectWithAuth(server, {
        method: 'PUT', url: '/api/settings',
        payload: { fallbackModel: fallbackA, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const newer = injectWithAuth(server, {
        method: 'PUT', url: '/api/settings',
        payload: { fallbackModel: fallbackB, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      resolveA(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
      expect((await older).statusCode).toBe(409);
      resolveB(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
      expect((await newer).statusCode).toBe(200);

      const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
      expect(saved.fallbackModel).toBe(fallbackB);
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('does not revive an older verified request after the newer request is rejected', async () => {
    const primary = 'openai-compatible/qwen-primary';
    const fallbackA = 'openai-compatible/qwen-fallback-a';
    const fallbackB = 'openai-compatible/qwen-fallback-b';
    const restoreModel = configureCompatibleProbeModel(primary, [primary, fallbackA, fallbackB]);
    let resolveA!: (response: Response) => void;
    let resolveB!: (response: Response) => void;
    const responseA = new Promise<Response>((resolve) => { resolveA = resolve; });
    const responseB = new Promise<Response>((resolve) => { resolveB = resolve; });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => responseA)
      .mockImplementationOnce(() => responseB);
    vi.stubGlobal('fetch', fetchMock);
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');

    try {
      const older = injectWithAuth(server, {
        method: 'PUT', url: '/api/settings',
        payload: { fallbackModel: fallbackA, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const newer = injectWithAuth(server, {
        method: 'PUT', url: '/api/settings',
        payload: { fallbackModel: fallbackB, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      resolveB(new Response('model_not_found', { status: 404 }));
      expect((await newer).statusCode).toBe(422);
      resolveA(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
      expect((await older).statusCode).toBe(409);
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('rejects protected keys through PATCH without touching settings', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const runtimeBefore = server.agentState.currentModel;

    const response = await injectWithAuth(server, {
      method: 'PATCH',
      url: '/api/settings',
      payload: { defaultModel: 'openai-compatible/unverified' },
    });

    expect(response.statusCode).toBe(400);
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
    expect(server.agentState.currentModel).toBe(runtimeBefore);
  });

  it('derives verification for an unflagged model write and rolls back rejection', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const runtimeBefore = server.agentState.currentModel;
    const restoreModel = configureExactProbeModel();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('model_not_found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: { defaultModel: exactProbeModel },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'MODEL_VERIFICATION_FAILED',
        model: exactProbeModel,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
      expect(server.agentState.currentModel).toBe(runtimeBefore);
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('rejects an unverified compatible provider tuple before config, Vault, or runtime mutation', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const runtimeBefore = server.agentState.currentModel;
    const priorVault = server.vault.get('openai-compatible');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('model_not_found', { status: 404 }),
    ));

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: {
          defaultModel: 'openai-compatible/qwen-new',
          providers: {
            'openai-compatible': {
              baseUrl: 'http://127.0.0.1:4010/v1',
              apiKey: 'candidate-secret',
              models: ['openai-compatible/qwen-new'],
            },
          },
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'MODEL_VERIFICATION_FAILED' });
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
      expect(server.agentState.currentModel).toBe(runtimeBefore);
      expect(server.vault.get('openai-compatible')).toEqual(priorVault);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rolls back earlier Vault writes when a later provider write fails', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const priorOpenAi = server.vault.get('openai');
    const priorAnthropic = server.vault.get('anthropic');
    server.vault.set('openai', 'old-openai-key', {
      models: ['old-openai-model'],
      baseUrl: 'https://old-openai.example.test/v1',
    });
    server.vault.set('anthropic', 'old-anthropic-key', {
      models: ['old-anthropic-model'],
      baseUrl: 'https://old-anthropic.example.test/v1',
    });
    const set = server.vault.set.bind(server.vault);
    const setSpy = vi.spyOn(server.vault, 'set').mockImplementation((name, value, metadata) => {
      if (name === 'anthropic' && value === 'new-anthropic-key') {
        throw new Error('simulated later Vault failure');
      }
      return set(name, value, metadata);
    });

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: {
          providers: {
            openai: { apiKey: 'new-openai-key', models: ['new-openai-model'] },
            anthropic: { apiKey: 'new-anthropic-key', models: ['new-anthropic-model'] },
          },
        },
      });

      expect(response.statusCode).toBe(500);
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
      expect(server.vault.get('openai')).toMatchObject({
        value: 'old-openai-key',
        metadata: {
          models: ['old-openai-model'],
          baseUrl: 'https://old-openai.example.test/v1',
        },
      });
      expect(server.vault.get('anthropic')).toMatchObject({
        value: 'old-anthropic-key',
        metadata: {
          models: ['old-anthropic-model'],
          baseUrl: 'https://old-anthropic.example.test/v1',
        },
      });
    } finally {
      setSpy.mockRestore();
      fs.writeFileSync(configPath, before, 'utf-8');
      if (priorOpenAi) server.vault.set('openai', priorOpenAi.value, priorOpenAi.metadata);
      else server.vault.delete('openai');
      if (priorAnthropic) server.vault.set('anthropic', priorAnthropic.value, priorAnthropic.metadata);
      else server.vault.delete('anthropic');
    }
  });

  it('restores Vault state when the final atomic config commit fails', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const before = fs.readFileSync(configPath, 'utf-8');
    const provider = 'transaction-new-provider';
    const priorProvider = server.vault.get(provider);
    server.vault.delete(provider);
    const setSpy = vi.spyOn(server.vault, 'set');
    const deleteSpy = vi.spyOn(server.vault, 'delete');
    const { WaggleConfig } = await import('@waggle/core');
    const saveSpy = vi.spyOn(WaggleConfig.prototype, 'save').mockImplementation(() => {
      throw new Error('simulated config publication failure');
    });

    try {
      const response = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: {
          providers: {
            [provider]: { apiKey: 'new-provider-key', models: ['new-provider-model'] },
          },
        },
      });

      expect(response.statusCode).toBe(500);
      expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
      expect(server.vault.get(provider)).toBeNull();
      expect(setSpy.mock.calls.map(([name, value]) => [name, value])).toEqual([
        [provider, 'new-provider-key'],
      ]);
      expect(deleteSpy).toHaveBeenCalledWith(provider);
    } finally {
      saveSpy.mockRestore();
      setSpy.mockRestore();
      deleteSpy.mockRestore();
      if (priorProvider) server.vault.set(provider, priorProvider.value, priorProvider.metadata);
      else server.vault.delete(provider);
    }
  });

  it('holds a settings reload until an in-flight verified save reaches a terminal state', async () => {
    const primary = 'openai-compatible/qwen-primary';
    const fallback = 'openai-compatible/qwen-fallback';
    const restoreModel = configureCompatibleProbeModel(primary, [primary, fallback]);
    let resolveProbe!: (response: Response) => void;
    const probe = new Promise<Response>((resolve) => { resolveProbe = resolve; });
    const fetchMock = vi.fn().mockImplementationOnce(() => probe);
    vi.stubGlobal('fetch', fetchMock);

    try {
      const save = injectWithAuth(server, {
        method: 'PUT', url: '/api/settings',
        payload: { fallbackModel: fallback, verifyModelSettings: true },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      let reloadSettled = false;
      const reload = injectWithAuth(server, { method: 'GET', url: '/api/settings' })
        .then((response) => { reloadSettled = true; return response; });
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(reloadSettled).toBe(false);

      resolveProbe(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
      expect((await save).statusCode).toBe(200);
      const reloaded = await reload;
      expect(reloaded.statusCode).toBe(200);
      expect(reloaded.json()).toMatchObject({ fallbackModel: fallback });
    } finally {
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  it('blocks generic Vault credential replacement during an in-flight verified model save', async () => {
    const primary = 'openai-compatible/qwen-primary';
    const fallback = 'openai-compatible/qwen-fallback';
    const restoreModel = configureCompatibleProbeModel(primary, [primary, fallback]);
    server.vault.set('openai-compatible', 'verified-key-one', {
      baseUrl: 'http://10.33.0.153:4000/v1',
      models: [primary, fallback],
    });
    let resolveProbe!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveProbe = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const save = injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: { fallbackModel: fallback },
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      const replacement = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/vault',
        payload: { name: 'openai-compatible', value: 'unverified-key-two' },
      });
      expect(replacement.statusCode).toBe(409);
      expect(server.vault.get('openai-compatible')?.value).toBe('verified-key-one');

      resolveProbe(new Response(JSON.stringify({
        choices: [{ message: { content: 'WAGGLE_OK' } }],
      }), { status: 200 }));
      expect((await save).statusCode).toBe(200);
      expect(server.vault.get('openai-compatible')?.value).toBe('verified-key-one');
    } finally {
      server.vault.delete('openai-compatible');
      restoreModel();
      vi.unstubAllGlobals();
    }
  });

  // --- E3: Progress extraction tests ---

  it('extracts progress items from session content', async () => {
    // Create a workspace and session with task/completion/blocker language
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Progress Test', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const sessRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Planning Session' },
    });
    const sess = JSON.parse(sessRes.body);

    // Write messages with progress language
    const sessionPath = path.join(
      dataDir, 'workspaces', ws.id, 'sessions', `${sess.id}.jsonl`
    );
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'We need to implement the search feature for the dashboard', timestamp: '2026-03-12T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'I can help with that. What kind of search?', timestamp: '2026-03-12T10:01:00Z' }),
      JSON.stringify({ role: 'user', content: 'Full text search. Also, we completed the user authentication module last week.', timestamp: '2026-03-12T10:02:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Great, the auth module is done. For search, we\'re blocked by the missing indexing service — it depends on the infrastructure team.', timestamp: '2026-03-12T10:03:00Z' }),
      JSON.stringify({ role: 'user', content: 'Right, we should also plan the API documentation for the new endpoints', timestamp: '2026-03-12T10:04:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Makes sense. Let me draft an outline for the API docs.', timestamp: '2026-03-12T10:05:00Z' }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    // Fetch workspace context — should include progressItems
    const ctxRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/context`,
    });
    expect(ctxRes.statusCode).toBe(200);
    const ctx = JSON.parse(ctxRes.body);

    expect(ctx.progressItems).toBeDefined();
    expect(Array.isArray(ctx.progressItems)).toBe(true);

    // Should find at least a task (need to, should) and a blocker (blocked by)
    const types = ctx.progressItems.map((p: { type: string }) => p.type);
    expect(types).toContain('task');

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  // --- F1: Session search tests ---

  it('searches sessions by content and returns matching snippets', async () => {
    // Create a workspace with sessions containing searchable content
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Search Test WS', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Create two sessions — one with matching content, one without
    const sess1Res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Database Design' },
    });
    const sess1 = JSON.parse(sess1Res.body);

    const sess2Res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Marketing Plan' },
    });
    const sess2 = JSON.parse(sess2Res.body);

    // Add content to session 1 (should match "database")
    const path1 = path.join(dataDir, 'workspaces', ws.id, 'sessions', `${sess1.id}.jsonl`);
    const existing1 = fs.readFileSync(path1, 'utf-8');
    fs.writeFileSync(path1, existing1 +
      JSON.stringify({ role: 'user', content: 'How should we design the database schema?' }) + '\n' +
      JSON.stringify({ role: 'assistant', content: 'For your use case, a PostgreSQL database with normalized tables would work well.' }) + '\n',
      'utf-8');

    // Add content to session 2 (should NOT match "database")
    const path2 = path.join(dataDir, 'workspaces', ws.id, 'sessions', `${sess2.id}.jsonl`);
    const existing2 = fs.readFileSync(path2, 'utf-8');
    fs.writeFileSync(path2, existing2 +
      JSON.stringify({ role: 'user', content: 'What social media channels should we target?' }) + '\n' +
      JSON.stringify({ role: 'assistant', content: 'Focus on LinkedIn and Twitter for B2B marketing.' }) + '\n',
      'utf-8');

    // Search for "database"
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/search?q=database`,
    });
    expect(res.statusCode).toBe(200);
    const results = JSON.parse(res.body);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe(sess1.id);
    expect(results[0].title).toBe('Database Design');
    expect(results[0].matchCount).toBeGreaterThan(0);
    expect(results[0].snippets.length).toBeGreaterThan(0);
    expect(results[0].snippets[0].text.toLowerCase()).toContain('database');

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns 400 for search query shorter than 2 characters', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Short Query WS', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/search?q=a`,
    });
    expect(res.statusCode).toBe(400);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns empty results when no sessions match', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'No Match WS', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Create a session
    const sessRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Random Session' },
    });
    const sess = JSON.parse(sessRes.body);

    const sessPath = path.join(dataDir, 'workspaces', ws.id, 'sessions', `${sess.id}.jsonl`);
    const existing = fs.readFileSync(sessPath, 'utf-8');
    fs.writeFileSync(sessPath, existing +
      JSON.stringify({ role: 'user', content: 'Hello there' }) + '\n',
      'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/search?q=quantum`,
    });
    expect(res.statusCode).toBe(200);
    const results = JSON.parse(res.body);
    expect(results).toHaveLength(0);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns empty progressItems for workspace with no sessions', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Empty Progress', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const ctxRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/context`,
    });
    const ctx = JSON.parse(ctxRes.body);
    expect(ctx.progressItems).toBeDefined();
    expect(ctx.progressItems).toHaveLength(0);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  // ── F2: File registry tests ─────────────────────────────────────

  it('returns empty file list for workspace with no ingested files', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Empty', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files).toEqual([]);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('records ingested files in registry and returns them via files endpoint', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Test', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Ingest a text file into the workspace
    const textContent = Buffer.from('Hello world, this is a test file.').toString('base64');
    const ingestRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/ingest',
      payload: {
        files: [{ name: 'readme.txt', content: textContent }],
        workspaceId: ws.id,
      },
    });
    expect(ingestRes.statusCode).toBe(200);

    // Check files endpoint returns the ingested file
    const filesRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    expect(filesRes.statusCode).toBe(200);
    const filesBody = JSON.parse(filesRes.body);
    expect(filesBody.files).toHaveLength(1);
    expect(filesBody.files[0].name).toBe('readme.txt');
    expect(filesBody.files[0].type).toBe('text');
    expect(filesBody.files[0].sizeBytes).toBeGreaterThan(0);
    expect(filesBody.files[0].ingestedAt).toBeDefined();

    // Check file count appears in workspace context
    const ctxRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/context`,
    });
    const ctx = JSON.parse(ctxRes.body);
    expect(ctx.stats.fileCount).toBe(1);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('surfaces a storage-provider file that is not in the ingest registry (union)', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Union Storage', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Write a file straight to the virtual storage root (bypasses the registry,
    // simulating an upload that lands on the provider fs).
    const filesRoot = path.join(dataDir, 'workspaces', ws.id, 'files');
    fs.mkdirSync(filesRoot, { recursive: true });
    fs.writeFileSync(path.join(filesRoot, 'uploaded.txt'), 'uploaded content', 'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const names = body.files.map((f: { name: string }) => f.name);
    expect(names).toContain('uploaded.txt');

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('unions ingested (registry) and uploaded (storage) files', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Union Both', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Registry side: ingest a file.
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/ingest',
      payload: {
        files: [{ name: 'ingested.txt', content: Buffer.from('ingested').toString('base64') }],
        workspaceId: ws.id,
      },
    });

    // Storage side: write a file to the provider fs directly.
    const filesRoot = path.join(dataDir, 'workspaces', ws.id, 'files');
    fs.mkdirSync(filesRoot, { recursive: true });
    fs.writeFileSync(path.join(filesRoot, 'stored.txt'), 'stored', 'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    const body = JSON.parse(res.body);
    const names = body.files.map((f: { name: string }) => f.name);
    expect(names).toContain('ingested.txt');
    expect(names).toContain('stored.txt');

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('dedupes union by name — registry entry wins on collision', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Union Dedup', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Same name on both sides.
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/ingest',
      payload: {
        files: [{ name: 'dup.txt', content: Buffer.from('registry copy').toString('base64') }],
        workspaceId: ws.id,
      },
    });
    const filesRoot = path.join(dataDir, 'workspaces', ws.id, 'files');
    fs.mkdirSync(filesRoot, { recursive: true });
    fs.writeFileSync(path.join(filesRoot, 'dup.txt'), 'storage copy', 'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    const body = JSON.parse(res.body);
    const dupRows = body.files.filter((f: { name: string }) => f.name === 'dup.txt');
    expect(dupRows).toHaveLength(1);
    // Registry wins — its entry carries the ingest 'text' type + a summary.
    expect(dupRows[0].type).toBe('text');
    expect(dupRows[0].summary).not.toBe('');

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  // ── F3: Session export tests ─────────────────────────────────────

  it('exports a session as markdown with title and messages', async () => {
    // Create workspace + session
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Export Test', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const sessRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'My Test Chat' },
    });
    const sess = JSON.parse(sessRes.body);

    // Add messages to the session JSONL
    const sessionsDir = path.join(dataDir, 'workspaces', ws.id, 'sessions');
    const filePath = path.join(sessionsDir, `${sess.id}.jsonl`);
    const existingContent = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, existingContent
      + JSON.stringify({ role: 'user', content: 'Hello, what can you help me with?', timestamp: '2026-03-12T10:00:00Z' }) + '\n'
      + JSON.stringify({ role: 'assistant', content: 'I can help you with many things!', timestamp: '2026-03-12T10:00:05Z' }) + '\n'
    );

    // Export
    const exportRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/${sess.id}/export`,
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/markdown');

    const md = exportRes.body;
    expect(md).toContain('# My Test Chat');
    expect(md).toContain('**You**');
    expect(md).toContain('Hello, what can you help me with?');
    expect(md).toContain('**Assistant**');
    expect(md).toContain('I can help you with many things!');

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns 404 when exporting non-existent session', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions/nonexistent-session/export`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for files of non-existent workspace', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces/nonexistent-ws-999/files',
    });
    expect(res.statusCode).toBe(404);
  });

  // J4: Team catch-up context
  it('workspace context includes teamContext for team workspaces', async () => {
    // Create a team workspace
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Team WS',
        group: 'Team',
        teamId: 'team-test-123',
        teamServerUrl: 'https://team.example.com',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const teamWsId = JSON.parse(createRes.body).id;

    // Get context
    const contextRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${teamWsId}/context`,
    });
    expect(contextRes.statusCode).toBe(200);
    const context = JSON.parse(contextRes.body);
    expect(context.teamContext).toBeDefined();
    expect(context.teamContext.isTeam).toBe(true);
    expect(context.teamContext.teamId).toBe('team-test-123');
  });

  it('workspace context omits teamContext for non-team workspaces', async () => {
    const contextRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/context`,
    });
    const context = JSON.parse(contextRes.body);
    expect(context.teamContext).toBeUndefined();
  });
});
