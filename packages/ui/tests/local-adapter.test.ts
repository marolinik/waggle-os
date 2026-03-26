import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildLocalServer } from '../../server/src/local/index.js';
import { LocalAdapter } from '../src/services/local-adapter.js';
import type { WaggleService, StreamEvent } from '../src/services/types.js';

describe('LocalAdapter', () => {
  let server: Awaited<ReturnType<typeof buildLocalServer>>;
  let adapter: LocalAdapter;
  let tmpDir: string;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ui-test-'));

    // Create required subdirectories
    fs.mkdirSync(path.join(tmpDir, 'workspaces'), { recursive: true });

    server = await buildLocalServer({
      port: 0, // Random port
      host: '127.0.0.1',
      dataDir: tmpDir,
      litellmUrl: 'http://localhost:4000',
    });

    // Inject a fake agent runner so chat tests don't need a real LLM
    (server as any).agentRunner = async () => ({
      content: 'Hello from test agent!',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      toolsUsed: [],
    });

    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    adapter = new LocalAdapter({ baseUrl, wsUrl: baseUrl.replace('http', 'ws') + '/ws' });
    await adapter.connect();
  });

  afterAll(async () => {
    adapter.disconnect();
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Connection ─────────────────────────────────────────────────────

  describe('connect()', () => {
    it('succeeds when server is running', async () => {
      // Create a fresh adapter for this test
      const a = new LocalAdapter({ baseUrl, wsUrl: baseUrl.replace('http', 'ws') + '/ws' });
      await a.connect();
      expect(a.isConnected()).toBe(true);
      a.disconnect();
    });

    it('fails when server is unreachable', async () => {
      const a = new LocalAdapter({ baseUrl: 'http://127.0.0.1:1' });
      await expect(a.connect()).rejects.toThrow();
      expect(a.isConnected()).toBe(false);
    });
  });

  describe('isConnected()', () => {
    it('returns false before connect', () => {
      const a = new LocalAdapter({ baseUrl });
      expect(a.isConnected()).toBe(false);
    });

    it('returns true after connect', async () => {
      const a = new LocalAdapter({ baseUrl });
      await a.connect();
      expect(a.isConnected()).toBe(true);
      a.disconnect();
    });

    it('returns false after disconnect', async () => {
      const a = new LocalAdapter({ baseUrl });
      await a.connect();
      a.disconnect();
      expect(a.isConnected()).toBe(false);
    });
  });

  // ── Workspaces ─────────────────────────────────────────────────────

  describe('listWorkspaces()', () => {
    it('returns an array', async () => {
      const workspaces = await adapter.listWorkspaces();
      expect(Array.isArray(workspaces)).toBe(true);
    });
  });

  describe('createWorkspace()', () => {
    it('creates and returns a workspace', async () => {
      const ws = await adapter.createWorkspace({
        name: 'Test Workspace',
        group: 'Work',
      });
      expect(ws).toBeDefined();
      expect(ws.name).toBe('Test Workspace');
      expect(ws.group).toBe('Work');
      expect(ws.id).toBeTruthy();
    });

    it('fails without required fields', async () => {
      await expect(
        adapter.createWorkspace({ name: '' } as any),
      ).rejects.toThrow();
    });
  });

  describe('updateWorkspace()', () => {
    it('updates a workspace', async () => {
      const ws = await adapter.createWorkspace({
        name: 'Update Me',
        group: 'Personal',
      });
      await adapter.updateWorkspace(ws.id, { name: 'Updated Name' });
      // Verify by listing
      const all = await adapter.listWorkspaces();
      const updated = all.find((w: any) => w.id === ws.id);
      expect(updated?.name).toBe('Updated Name');
    });
  });

  describe('deleteWorkspace()', () => {
    it('deletes a workspace', async () => {
      const ws = await adapter.createWorkspace({
        name: 'Delete Me',
        group: 'Temp',
      });
      await adapter.deleteWorkspace(ws.id);
      const all = await adapter.listWorkspaces();
      expect(all.find((w: any) => w.id === ws.id)).toBeUndefined();
    });

    it('throws for non-existent workspace', async () => {
      await expect(
        adapter.deleteWorkspace('nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  // ── Memory search ──────────────────────────────────────────────────

  describe('searchMemory()', () => {
    it('returns results array (may be empty)', async () => {
      const results = await adapter.searchMemory('test', 'all');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ── Knowledge graph ────────────────────────────────────────────────

  describe('getKnowledgeGraph()', () => {
    it('returns entities and relations', async () => {
      // Use a non-existent workspace — should return empty arrays gracefully
      const graph = await adapter.getKnowledgeGraph('nonexistent');
      expect(graph).toHaveProperty('entities');
      expect(graph).toHaveProperty('relations');
    });
  });

  // ── Sessions ───────────────────────────────────────────────────────

  describe('sessions', () => {
    let workspaceId: string;

    beforeEach(async () => {
      const ws = await adapter.createWorkspace({
        name: `Sessions Test ${Date.now()}`,
        group: 'Test',
      });
      workspaceId = ws.id;
    });

    afterEach(async () => {
      // Clean up workspace to stay within solo tier limit (5 max)
      try { await adapter.deleteWorkspace(workspaceId); } catch { /* ignore if already deleted */ }
    });

    it('listSessions returns empty array for new workspace', async () => {
      const sessions = await adapter.listSessions(workspaceId);
      expect(sessions).toEqual([]);
    });

    it('createSession creates a session', async () => {
      const session = await adapter.createSession(workspaceId, 'My Session');
      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.title).toBe('My Session');
    });

    it('listSessions returns created sessions', async () => {
      await adapter.createSession(workspaceId, 'Session A');
      await adapter.createSession(workspaceId, 'Session B');
      const sessions = await adapter.listSessions(workspaceId);
      expect(sessions.length).toBe(2);
    });

    it('deleteSession removes a session', async () => {
      const session = await adapter.createSession(workspaceId, 'To Delete');
      await adapter.deleteSession(session.id, workspaceId);
      const sessions = await adapter.listSessions(workspaceId);
      expect(sessions.find((s: any) => s.id === session.id)).toBeUndefined();
    });
  });

  // ── Settings ───────────────────────────────────────────────────────

  describe('getConfig()', () => {
    it('returns config object', async () => {
      const config = await adapter.getConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('defaultModel');
    });
  });

  describe('testApiKey()', () => {
    it('validates an OpenAI key format', async () => {
      const result = await adapter.testApiKey('openai', 'sk-1234567890abcdef12345678');
      expect(result.valid).toBe(true);
    });

    it('rejects an invalid key', async () => {
      const result = await adapter.testApiKey('openai', 'bad');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // ── Chat (SSE streaming) ──────────────────────────────────────────

  describe('sendMessage()', () => {
    it('streams events from the server', async () => {
      const events: StreamEvent[] = [];
      for await (const event of adapter.sendMessage('default', 'Hello')) {
        events.push(event);
      }
      // Should have at least a done event from the fake agent runner
      expect(events.length).toBeGreaterThan(0);
      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent).toBeDefined();
    });

    it('returns error event for empty message', async () => {
      const events: StreamEvent[] = [];
      for await (const event of adapter.sendMessage('default', '')) {
        events.push(event);
      }
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('error');
    });
  });

  // ── Events ─────────────────────────────────────────────────────────

  describe('on()', () => {
    it('registers and unregisters listeners', () => {
      const calls: unknown[] = [];
      const unsub = adapter.on('test-event', (data) => calls.push(data));
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ── disconnect ─────────────────────────────────────────────────────

  describe('disconnect()', () => {
    it('cleans up state', async () => {
      const a = new LocalAdapter({ baseUrl });
      await a.connect();
      a.disconnect();
      expect(a.isConnected()).toBe(false);
    });
  });

  // ── Type compliance ────────────────────────────────────────────────

  describe('WaggleService interface compliance', () => {
    it('implements all required methods', () => {
      const service: WaggleService = adapter;
      expect(typeof service.connect).toBe('function');
      expect(typeof service.disconnect).toBe('function');
      expect(typeof service.isConnected).toBe('function');
      expect(typeof service.sendMessage).toBe('function');
      expect(typeof service.getHistory).toBe('function');
      expect(typeof service.listWorkspaces).toBe('function');
      expect(typeof service.createWorkspace).toBe('function');
      expect(typeof service.updateWorkspace).toBe('function');
      expect(typeof service.deleteWorkspace).toBe('function');
      expect(typeof service.searchMemory).toBe('function');
      expect(typeof service.getKnowledgeGraph).toBe('function');
      expect(typeof service.listSessions).toBe('function');
      expect(typeof service.createSession).toBe('function');
      expect(typeof service.deleteSession).toBe('function');
      expect(typeof service.renameSession).toBe('function');
      expect(typeof service.approveAction).toBe('function');
      expect(typeof service.denyAction).toBe('function');
      expect(typeof service.getAgentStatus).toBe('function');
      expect(typeof service.getConfig).toBe('function');
      expect(typeof service.updateConfig).toBe('function');
      expect(typeof service.testApiKey).toBe('function');
      expect(typeof service.on).toBe('function');
    });
  });
});
