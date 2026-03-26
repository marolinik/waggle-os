import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, WorkspaceManager, AwarenessLayer } from '@waggle/core';
import {
  generateMorningBriefing,
  checkStaleWorkspaces,
  checkPendingTasks,
  suggestCapabilities,
  type ProactiveContext,
} from '../src/local/proactive-handlers.js';

describe('Proactive Handlers', () => {
  let tmpDir: string;
  let wsManager: WorkspaceManager;
  const mindDbs = new Map<string, MindDB>();

  function makeContext(): ProactiveContext {
    return {
      dataDir: tmpDir,
      workspaceManager: wsManager,
      getWorkspaceMindDb: (workspaceId: string) => {
        const existing = mindDbs.get(workspaceId);
        if (existing) return existing;
        const mindPath = path.join(tmpDir, 'workspaces', workspaceId, 'workspace.mind');
        if (!fs.existsSync(mindPath)) return null;
        try {
          const db = new MindDB(mindPath);
          mindDbs.set(workspaceId, db);
          return db;
        } catch {
          return null;
        }
      },
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-proactive-'));
    wsManager = new WorkspaceManager(tmpDir);
  });

  afterEach(() => {
    for (const [, db] of mindDbs) {
      try { db.close(); } catch { /* already closed */ }
    }
    mindDbs.clear();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Morning Briefing ─────────────────────────────────────────────

  describe('generateMorningBriefing', () => {
    it('returns null when no workspaces exist', () => {
      const ctx = makeContext();
      const result = generateMorningBriefing(ctx);
      expect(result).toBeNull();
    });

    it('returns null when no pending items and no stale workspaces', () => {
      // Create a workspace with a recent session file
      const ws = wsManager.create({ name: 'Active Project', group: 'Work' });
      const sessionsDir = path.join(tmpDir, 'workspaces', ws.id, 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(path.join(sessionsDir, '2026-03-19.jsonl'), '{"role":"user","content":"hello"}\n');

      const ctx = makeContext();
      const result = generateMorningBriefing(ctx);
      expect(result).toBeNull();
    });

    it('includes workspace summaries when pending items exist', () => {
      const ws = wsManager.create({ name: 'My Research', group: 'Work' });

      // Initialize the mind DB (write actual data so MindDB opens it properly)
      const mindPath = path.join(tmpDir, 'workspaces', ws.id, 'workspace.mind');
      const db = new MindDB(mindPath);
      const awareness = new AwarenessLayer(db);
      awareness.add('task', 'Review paper draft', 1);
      awareness.add('pending', 'Waiting for feedback', 0);
      mindDbs.set(ws.id, db);

      const ctx = makeContext();
      const result = generateMorningBriefing(ctx);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('morning_briefing');
      expect(result!.title).toContain('morning');
      expect(result!.body).toContain('2 pending');
      expect(result!.body).toContain('My Research');
    });

    it('reports stale workspaces in briefing', () => {
      const ws = wsManager.create({ name: 'Old Project', group: 'Archive' });

      // Create a session file with old modification time
      const sessionsDir = path.join(tmpDir, 'workspaces', ws.id, 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      const sessionFile = path.join(sessionsDir, '2026-02-01.jsonl');
      fs.writeFileSync(sessionFile, '{"role":"user","content":"test"}\n');
      // Set mtime to 30 days ago
      const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      fs.utimesSync(sessionFile, oldTime, oldTime);

      const ctx = makeContext();
      const result = generateMorningBriefing(ctx);

      expect(result).not.toBeNull();
      expect(result!.body).toContain('not visited in 14+ days');
    });
  });

  // ── Stale Workspace Check ────────────────────────────────────────

  describe('checkStaleWorkspaces', () => {
    it('returns empty array when no workspaces', () => {
      const ctx = makeContext();
      const result = checkStaleWorkspaces(ctx);
      expect(result).toEqual([]);
    });

    it('detects stale workspaces based on session activity', () => {
      const ws = wsManager.create({ name: 'Forgotten Project', group: 'Old' });

      // Create a session file with old modification time
      const sessionsDir = path.join(tmpDir, 'workspaces', ws.id, 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      const sessionFile = path.join(sessionsDir, '2026-01-15.jsonl');
      fs.writeFileSync(sessionFile, '{"role":"user","content":"test"}\n');
      const oldTime = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      fs.utimesSync(sessionFile, oldTime, oldTime);

      const ctx = makeContext();
      const result = checkStaleWorkspaces(ctx);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('stale_workspace');
      expect(result[0].title).toContain('Forgotten Project');
      expect(result[0].workspaceId).toBe(ws.id);
    });

    it('skips recently active workspaces', () => {
      const ws = wsManager.create({ name: 'Active Project', group: 'Work' });
      const sessionsDir = path.join(tmpDir, 'workspaces', ws.id, 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(path.join(sessionsDir, '2026-03-19.jsonl'), '{"role":"user","content":"hello"}\n');

      const ctx = makeContext();
      const result = checkStaleWorkspaces(ctx);
      expect(result).toEqual([]);
    });

    it('uses creation date when no sessions exist', () => {
      // Create workspace with backdated creation
      const ws = wsManager.create({ name: 'Empty Old Workspace', group: 'Test' });
      // Backdate the workspace config
      const configPath = path.join(tmpDir, 'workspaces', ws.id, 'workspace.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.created = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const ctx = makeContext();
      const result = checkStaleWorkspaces(ctx);

      expect(result.length).toBe(1);
      expect(result[0].title).toContain('Empty Old Workspace');
    });
  });

  // ── Task Reminder ────────────────────────────────────────────────

  describe('checkPendingTasks', () => {
    it('returns empty array when no workspaces', () => {
      const ctx = makeContext();
      const result = checkPendingTasks(ctx);
      expect(result).toEqual([]);
    });

    it('aggregates pending tasks across workspaces', () => {
      const ws1 = wsManager.create({ name: 'Project A', group: 'Work' });
      const ws2 = wsManager.create({ name: 'Project B', group: 'Work' });

      // Add awareness items to ws1
      const mindPath1 = path.join(tmpDir, 'workspaces', ws1.id, 'workspace.mind');
      const db1 = new MindDB(mindPath1);
      const awareness1 = new AwarenessLayer(db1);
      awareness1.add('task', 'Fix bug #123', 1);
      awareness1.add('task', 'Write tests', 0);
      mindDbs.set(ws1.id, db1);

      // Add awareness items to ws2
      const mindPath2 = path.join(tmpDir, 'workspaces', ws2.id, 'workspace.mind');
      const db2 = new MindDB(mindPath2);
      const awareness2 = new AwarenessLayer(db2);
      awareness2.add('pending', 'Waiting for review', 0);
      mindDbs.set(ws2.id, db2);

      const ctx = makeContext();
      const result = checkPendingTasks(ctx);

      expect(result.length).toBe(2);
      const projectA = result.find(r => r.workspaceId === ws1.id);
      const projectB = result.find(r => r.workspaceId === ws2.id);
      expect(projectA).toBeDefined();
      expect(projectA!.title).toContain('2 pending');
      expect(projectB).toBeDefined();
      expect(projectB!.title).toContain('1 pending');
    });

    it('skips workspaces with no pending items', () => {
      wsManager.create({ name: 'Clean Workspace', group: 'Work' });

      const ctx = makeContext();
      const result = checkPendingTasks(ctx);
      expect(result).toEqual([]);
    });

    it('sets high priority when many pending items', () => {
      const ws = wsManager.create({ name: 'Busy Project', group: 'Work' });
      const mindPath = path.join(tmpDir, 'workspaces', ws.id, 'workspace.mind');
      const db = new MindDB(mindPath);
      const awareness = new AwarenessLayer(db);
      for (let i = 0; i < 5; i++) {
        awareness.add('task', `Task ${i}`, 1);
      }
      mindDbs.set(ws.id, db);

      const ctx = makeContext();
      const result = checkPendingTasks(ctx);

      expect(result.length).toBe(1);
      expect(result[0].priority).toBe('high');
    });
  });

  // ── Capability Suggestion ────────────────────────────────────────

  describe('suggestCapabilities', () => {
    it('returns null when no workspaces and capabilities installed', () => {
      // Create a fake skills directory to simulate installed capabilities
      fs.mkdirSync(path.join(tmpDir, 'skills', 'some-skill'), { recursive: true });
      const ctx = makeContext();
      const result = suggestCapabilities(ctx);
      expect(result).toBeNull();
    });

    it('suggests capability packs when none are installed', () => {
      const ctx = makeContext();
      const result = suggestCapabilities(ctx);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('capability_suggestion');
      expect(result!.title).toContain('capability packs');
      expect(result!.actionUrl).toBe('/capabilities');
    });

    it('returns null when capabilities installed and low memory count', () => {
      // Create skills dir (simulates installed capabilities)
      fs.mkdirSync(path.join(tmpDir, 'skills', 'research-skill'), { recursive: true });
      // Create a workspace with few frames
      const ws = wsManager.create({ name: 'Small Project', group: 'Test' });
      const mindPath = path.join(tmpDir, 'workspaces', ws.id, 'workspace.mind');
      const db = new MindDB(mindPath);
      mindDbs.set(ws.id, db);

      const ctx = makeContext();
      const result = suggestCapabilities(ctx);
      expect(result).toBeNull();
    });
  });
});
