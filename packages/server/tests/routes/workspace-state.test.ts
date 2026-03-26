import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import {
  buildWorkspaceState,
  formatWorkspaceStatePrompt,
  computeFreshness,
  type WorkspaceState,
} from '../../src/local/workspace-state.js';

describe('workspace-state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-state-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  function setupWorkspace(id: string, opts?: {
    frames?: Array<{ content: string; importance: string; created_at?: string }>;
    sessions?: Array<{
      title: string;
      messages: Array<{ role: string; content: string }>;
      ageMs?: number;
    }>;
    awareness?: Array<{ category: string; content: string; priority: number }>;
  }) {
    const wsDir = path.join(tmpDir, 'workspaces', id);
    fs.mkdirSync(wsDir, { recursive: true });

    const mindPath = path.join(wsDir, 'workspace.mind');
    if (opts?.frames && opts.frames.length > 0) {
      const db = new MindDB(mindPath);
      const raw = db.getDatabase();
      raw.prepare(
        `INSERT INTO sessions (gop_id, status, started_at)
         VALUES ('session:test', 'active', datetime('now'))`,
      ).run();

      for (const frame of opts.frames) {
        const createdAt = frame.created_at ?? new Date().toISOString();
        raw.prepare(
          `INSERT INTO memory_frames (gop_id, frame_type, content, importance, created_at)
           VALUES ('session:test', 'I', ?, ?, ?)`,
        ).run(frame.content, frame.importance, createdAt);
      }

      if (opts?.awareness) {
        for (const item of opts.awareness) {
          raw.prepare(
            `INSERT INTO awareness (category, content, priority, created_at)
             VALUES (?, ?, ?, datetime('now'))`,
          ).run(item.category, item.content, item.priority);
        }
      }

      db.close();
    }

    if (opts?.sessions) {
      const sessDir = path.join(wsDir, 'sessions');
      fs.mkdirSync(sessDir, { recursive: true });

      for (let i = 0; i < opts.sessions.length; i++) {
        const sess = opts.sessions[i];
        const sessionId = `session-${i}`;
        const created = new Date(Date.now() - (sess.ageMs ?? 0)).toISOString();
        const lines: string[] = [
          JSON.stringify({ type: 'meta', title: sess.title, created }),
        ];
        for (const msg of sess.messages) {
          lines.push(JSON.stringify({ role: msg.role, content: msg.content }));
        }
        const filePath = path.join(sessDir, `${sessionId}.jsonl`);
        fs.writeFileSync(filePath, lines.join('\n') + '\n');
        if (sess.ageMs) {
          const pastTime = new Date(Date.now() - sess.ageMs);
          fs.utimesSync(filePath, pastTime, pastTime);
        }
      }
    }

    return { mindPath, wsDir };
  }

  function makeManager(workspaces: Map<string, { id: string; name: string }>) {
    return {
      get: (id: string) => workspaces.get(id) ?? null,
      getMindPath: (id: string) => path.join(tmpDir, 'workspaces', id, 'workspace.mind'),
    };
  }

  const noopActivate = (_id: string) => true;

  // ── computeFreshness ──────────────────────────────────────────

  describe('computeFreshness', () => {
    it('returns fresh for today', () => {
      expect(computeFreshness(new Date().toISOString())).toBe('fresh');
    });

    it('returns fresh for 1 day ago', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(computeFreshness(yesterday)).toBe('fresh');
    });

    it('returns aging for 3 days ago', () => {
      const threeDays = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeFreshness(threeDays)).toBe('aging');
    });

    it('returns stale for 10 days ago', () => {
      const tenDays = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeFreshness(tenDays)).toBe('stale');
    });
  });

  // ── buildWorkspaceState ───────────────────────────────────────

  describe('buildWorkspaceState', () => {
    it('returns null for non-existent workspace', () => {
      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'nonexistent',
        wsManager: makeManager(new Map()),
        activateWorkspaceMind: noopActivate,
      });
      expect(result).toBeNull();
    });

    it('returns null for workspace with no mind file', () => {
      const wsDir = path.join(tmpDir, 'workspaces', 'empty');
      fs.mkdirSync(wsDir, { recursive: true });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'empty',
        wsManager: makeManager(new Map([['empty', { id: 'empty', name: 'Empty' }]])),
        activateWorkspaceMind: noopActivate,
      });
      expect(result).toBeNull();
    });

    it('returns null for workspace with zero memory frames', () => {
      fs.mkdirSync(path.join(tmpDir, 'workspaces', 'noframes'), { recursive: true });
      const db = new MindDB(path.join(tmpDir, 'workspaces', 'noframes', 'workspace.mind'));
      db.close();

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'noframes',
        wsManager: makeManager(new Map([['noframes', { id: 'noframes', name: 'No Frames' }]])),
        activateWorkspaceMind: noopActivate,
      });
      expect(result).toBeNull();
    });

    it('returns state with decisions from memory frames', () => {
      setupWorkspace('ws1', {
        frames: [
          { content: 'Decision: Use SQLite for local storage', importance: 'critical' },
          { content: 'Working on the authentication module', importance: 'normal' },
        ],
      });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'ws1',
        wsManager: makeManager(new Map([['ws1', { id: 'ws1', name: 'Project Alpha' }]])),
        activateWorkspaceMind: noopActivate,
      });

      expect(result).not.toBeNull();
      expect(result!.recentDecisions.length).toBeGreaterThanOrEqual(1);
      expect(result!.recentDecisions[0].content).toContain('SQLite');
      expect(result!.recentDecisions[0].source).toBe('memory');
    });

    it('extracts pending tasks from sessions', () => {
      setupWorkspace('ws2', {
        frames: [{ content: 'Project context established', importance: 'normal' }],
        sessions: [{
          title: 'Planning',
          messages: [
            { role: 'user', content: 'We need to implement the rate limiting middleware for the API' },
            { role: 'assistant', content: 'I will add that to the plan.' },
            { role: 'user', content: 'Also, we should add comprehensive error handling to the service layer' },
          ],
        }],
      });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'ws2',
        wsManager: makeManager(new Map([['ws2', { id: 'ws2', name: 'API Project' }]])),
        activateWorkspaceMind: noopActivate,
      });

      expect(result).not.toBeNull();
      // pending items come from TASK_PATTERNS in extractProgressItems
      // "need to" triggers task pattern
      expect(result!.pending.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts open questions from sessions', () => {
      setupWorkspace('ws3', {
        frames: [{ content: 'Working on infrastructure', importance: 'normal' }],
        sessions: [{
          title: 'Infra discussion',
          messages: [
            { role: 'user', content: 'Should we use containers or bare metal for the deployment?' },
            { role: 'assistant', content: 'Both have tradeoffs.' },
            { role: 'user', content: 'We still need to decide on the hosting provider strategy.' },
          ],
        }],
      });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'ws3',
        wsManager: makeManager(new Map([['ws3', { id: 'ws3', name: 'Infra' }]])),
        activateWorkspaceMind: noopActivate,
      });

      expect(result).not.toBeNull();
      expect(result!.openQuestions.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies fresh and stale threads', () => {
      const tenDays = 10 * 24 * 60 * 60 * 1000;
      setupWorkspace('ws4', {
        frames: [{ content: 'Multi-thread workspace', importance: 'normal' }],
        sessions: [
          {
            title: 'Fresh thread',
            messages: [
              { role: 'user', content: 'Working on fresh stuff right now.' },
              { role: 'assistant', content: 'On it.' },
            ],
          },
          {
            title: 'Old thread',
            messages: [
              { role: 'user', content: 'This was from ten days ago.' },
              { role: 'assistant', content: 'Noted.' },
            ],
            ageMs: tenDays,
          },
        ],
      });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'ws4',
        wsManager: makeManager(new Map([['ws4', { id: 'ws4', name: 'Multi' }]])),
        activateWorkspaceMind: noopActivate,
      });

      expect(result).not.toBeNull();
      // Fresh session should appear in active
      expect(result!.active.some(a => a.content === 'Fresh thread')).toBe(true);
      // Stale session should appear in stale
      expect(result!.stale.some(s => s.content === 'Old thread')).toBe(true);
    });

    it('derives nextActions from blockers and pending items', () => {
      setupWorkspace('ws5', {
        frames: [{ content: 'Active project', importance: 'normal' }],
        sessions: [{
          title: 'Work session',
          messages: [
            { role: 'user', content: 'We are blocked by the missing SSL certificate for the staging server' },
            { role: 'assistant', content: 'That is a critical blocker.' },
            { role: 'user', content: 'We need to update the CI pipeline configuration as well' },
          ],
        }],
      });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'ws5',
        wsManager: makeManager(new Map([['ws5', { id: 'ws5', name: 'Blocked' }]])),
        activateWorkspaceMind: noopActivate,
      });

      expect(result).not.toBeNull();
      expect(result!.nextActions.length).toBeGreaterThanOrEqual(1);
      // Blockers should appear first in nextActions
      if (result!.blocked.length > 0) {
        expect(result!.nextActions[0]).toContain('Resolve:');
      }
    });

    it('returns all expected fields', () => {
      setupWorkspace('ws6', {
        frames: [
          { content: 'Decision: Use React for frontend', importance: 'critical' },
          { content: 'Project initialized', importance: 'normal' },
        ],
        sessions: [{
          title: 'Setup session',
          messages: [
            { role: 'user', content: 'Let us set up the project structure.' },
            { role: 'assistant', content: 'I will create the scaffold.' },
          ],
        }],
      });

      const result = buildWorkspaceState({
        dataDir: tmpDir,
        workspaceId: 'ws6',
        wsManager: makeManager(new Map([['ws6', { id: 'ws6', name: 'Full' }]])),
        activateWorkspaceMind: noopActivate,
      });

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('active');
      expect(result).toHaveProperty('openQuestions');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('blocked');
      expect(result).toHaveProperty('completed');
      expect(result).toHaveProperty('stale');
      expect(result).toHaveProperty('recentDecisions');
      expect(result).toHaveProperty('nextActions');
      expect(Array.isArray(result!.active)).toBe(true);
      expect(Array.isArray(result!.nextActions)).toBe(true);
    });
  });

  // ── formatWorkspaceStatePrompt ────────────────────────────────

  describe('formatWorkspaceStatePrompt', () => {
    it('formats empty state with just the header', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: [],
      };
      const result = formatWorkspaceStatePrompt(state, 'Test Workspace');
      expect(result).toContain('# Workspace Now — Test Workspace');
      expect(result).not.toContain('## Active');
    });

    it('includes Active section when there are active items', () => {
      const state: WorkspaceState = {
        active: [{
          content: 'Working on auth',
          freshness: 'fresh',
          source: 'session',
          dateLastTouched: '2026-03-14',
        }],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: [],
      };
      const result = formatWorkspaceStatePrompt(state, 'Auth Project');
      expect(result).toContain('## Active');
      expect(result).toContain('Working on auth');
    });

    it('annotates aging items', () => {
      const state: WorkspaceState = {
        active: [{
          content: 'Database migration',
          freshness: 'aging',
          source: 'session',
          dateLastTouched: '2026-03-10',
        }],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: [],
      };
      const result = formatWorkspaceStatePrompt(state, 'DB');
      expect(result).toContain('(aging)');
    });

    it('includes all populated sections', () => {
      const state: WorkspaceState = {
        active: [{ content: 'Thread A', freshness: 'fresh', source: 'session', dateLastTouched: '2026-03-14' }],
        openQuestions: [{ content: 'Which DB?', freshness: 'fresh', source: 'session', dateLastTouched: '2026-03-14' }],
        pending: [{ content: 'Add tests', freshness: 'fresh', source: 'session', dateLastTouched: '2026-03-14' }],
        blocked: [{ content: 'Missing API key', freshness: 'fresh', source: 'session', dateLastTouched: '2026-03-14' }],
        completed: [{ content: 'Setup done', freshness: 'fresh', source: 'session', dateLastTouched: '2026-03-14' }],
        stale: [{ content: 'Old thread', freshness: 'stale', source: 'session', dateLastTouched: '2026-03-01' }],
        recentDecisions: [{ content: 'Use React', freshness: 'fresh', source: 'memory', dateLastTouched: '2026-03-14' }],
        nextActions: ['Resolve: Missing API key', 'Add tests'],
      };
      const result = formatWorkspaceStatePrompt(state, 'Full');
      expect(result).toContain('## Active');
      expect(result).toContain('## Open Questions');
      expect(result).toContain('## Blocked');
      expect(result).toContain('## Pending');
      expect(result).toContain('## Completed');
      expect(result).toContain('## Needs Attention (stale)');
      expect(result).toContain('## Recent Decisions');
      expect(result).toContain('## Likely Next Actions');
    });

    it('marks stale items as not touched recently', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [{ content: 'Forgotten thread', freshness: 'stale', source: 'session', dateLastTouched: '2026-02-01' }],
        recentDecisions: [],
        nextActions: [],
      };
      const result = formatWorkspaceStatePrompt(state, 'Stale');
      expect(result).toContain('not touched recently');
    });
  });
});
