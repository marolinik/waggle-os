import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt, type WorkspaceNowBlock } from '../../src/local/routes/workspace-context.js';

describe('workspace-context', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ctx-test-'));
  });

  afterEach(() => {
    // On Windows, SQLite WAL files may keep handles open briefly; best-effort cleanup
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-critical — OS will clean temp dir
    }
  });

  // Helper: create a workspace directory structure with a mind DB
  function setupWorkspace(id: string, opts?: {
    frames?: Array<{ content: string; importance: string }>;
    sessions?: Array<{ title: string; messages: Array<{ role: string; content: string }> }>;
  }) {
    const wsDir = path.join(tmpDir, 'workspaces', id);
    fs.mkdirSync(wsDir, { recursive: true });

    // Write workspace.json
    fs.writeFileSync(
      path.join(wsDir, 'workspace.json'),
      JSON.stringify({ id, name: `Test Workspace ${id}`, group: 'test', created: new Date().toISOString() }),
    );

    // Create mind DB with frames
    const mindPath = path.join(wsDir, 'workspace.mind');
    if (opts?.frames && opts.frames.length > 0) {
      const db = new MindDB(mindPath);
      const raw = db.getDatabase();
      // Insert a session first (frames require a session via gop_id FK)
      raw.prepare(
        `INSERT INTO sessions (gop_id, status, started_at)
         VALUES ('session:test', 'active', datetime('now'))`
      ).run();

      for (const frame of opts.frames) {
        raw.prepare(
          `INSERT INTO memory_frames (gop_id, frame_type, content, importance, created_at)
           VALUES ('session:test', 'I', ?, ?, datetime('now'))`
        ).run(frame.content, frame.importance);
      }
      db.close();
    }

    // Create session files
    if (opts?.sessions) {
      const sessDir = path.join(wsDir, 'sessions');
      fs.mkdirSync(sessDir, { recursive: true });

      for (let i = 0; i < opts.sessions.length; i++) {
        const sess = opts.sessions[i];
        const sessionId = `session-${i}`;
        const lines: string[] = [
          JSON.stringify({ type: 'meta', title: sess.title, created: new Date().toISOString() }),
        ];
        for (const msg of sess.messages) {
          lines.push(JSON.stringify({ role: msg.role, content: msg.content }));
        }
        fs.writeFileSync(path.join(sessDir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
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

  // ── Test 1: Returns null for non-existent workspace ──────────────

  it('returns null for non-existent workspace', () => {
    const wsManager = makeManager(new Map());

    const result = buildWorkspaceNowBlock({
      dataDir: tmpDir,
      workspaceId: 'does-not-exist',
      wsManager,
      activateWorkspaceMind: noopActivate,
    });

    expect(result).toBeNull();
  });

  // ── Test 2: Returns null for workspace with no data ──────────────

  it('returns null for workspace with no mind file', () => {
    const wsDir = path.join(tmpDir, 'workspaces', 'empty-ws');
    fs.mkdirSync(wsDir, { recursive: true });

    const wsManager = makeManager(new Map([
      ['empty-ws', { id: 'empty-ws', name: 'Empty Workspace' }],
    ]));

    const result = buildWorkspaceNowBlock({
      dataDir: tmpDir,
      workspaceId: 'empty-ws',
      wsManager,
      activateWorkspaceMind: noopActivate,
    });

    expect(result).toBeNull();
  });

  it('returns null for workspace with mind file but zero frames', () => {
    const wsManager = makeManager(new Map([
      ['zero-ws', { id: 'zero-ws', name: 'Zero Frames' }],
    ]));

    // Create a mind DB with no frames
    setupWorkspace('zero-ws', { frames: [] });
    // MindDB file exists but has no frames — we need the file to exist
    const mindPath = path.join(tmpDir, 'workspaces', 'zero-ws', 'workspace.mind');
    const db = new MindDB(mindPath);
    db.close();

    const result = buildWorkspaceNowBlock({
      dataDir: tmpDir,
      workspaceId: 'zero-ws',
      wsManager,
      activateWorkspaceMind: noopActivate,
    });

    expect(result).toBeNull();
  });

  // ── Test 3: Returns correctly shaped block ───────────────────────

  it('returns correctly shaped block for workspace with data', () => {
    const wsManager = makeManager(new Map([
      ['rich-ws', { id: 'rich-ws', name: 'Rich Workspace' }],
    ]));

    setupWorkspace('rich-ws', {
      frames: [
        { content: 'Working on the Waggle project, a workspace-native AI agent platform.', importance: 'important' },
        { content: 'Decision: Use SQLite for local storage instead of PostgreSQL.', importance: 'critical' },
        { content: 'Implemented the memory frame system with FTS5 search.', importance: 'normal' },
      ],
      sessions: [
        {
          title: 'Planning session',
          messages: [
            { role: 'user', content: 'Let us plan the architecture for the next milestone' },
            { role: 'assistant', content: 'I have reviewed the current state and here is my recommendation.' },
          ],
        },
      ],
    });

    const result = buildWorkspaceNowBlock({
      dataDir: tmpDir,
      workspaceId: 'rich-ws',
      wsManager,
      activateWorkspaceMind: noopActivate,
    });

    expect(result).not.toBeNull();
    expect(result!.workspaceName).toBe('Rich Workspace');
    expect(result!.summary).toBeTruthy();
    expect(result!.summary.length).toBeGreaterThan(10);
    expect(Array.isArray(result!.recentDecisions)).toBe(true);
    expect(Array.isArray(result!.activeThreads)).toBe(true);
    expect(Array.isArray(result!.progressItems)).toBe(true);
    expect(Array.isArray(result!.nextActions)).toBe(true);
    // Should have at least one thread from the session
    expect(result!.activeThreads.length).toBeGreaterThanOrEqual(1);
    // Should have at least one decision (the critical frame)
    expect(result!.recentDecisions.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 4: Caps at correct limits ───────────────────────────────

  it('caps decisions at 3, threads at 3, progress at 5', () => {
    const wsManager = makeManager(new Map([
      ['capped-ws', { id: 'capped-ws', name: 'Capped Workspace' }],
    ]));

    // Create many decisions and sessions
    const frames = [];
    for (let i = 0; i < 10; i++) {
      frames.push({ content: `Decision: chose option ${i} for the architecture component ${i}`, importance: 'critical' as const });
    }

    const sessions = [];
    for (let i = 0; i < 8; i++) {
      sessions.push({
        title: `Thread ${i}: discussing component ${i}`,
        messages: [
          { role: 'user', content: `Tell me about component ${i}` },
          { role: 'assistant', content: `Here is info about component ${i}` },
        ],
      });
    }

    setupWorkspace('capped-ws', { frames, sessions });

    const result = buildWorkspaceNowBlock({
      dataDir: tmpDir,
      workspaceId: 'capped-ws',
      wsManager,
      activateWorkspaceMind: noopActivate,
    });

    expect(result).not.toBeNull();
    expect(result!.recentDecisions.length).toBeLessThanOrEqual(3);
    expect(result!.activeThreads.length).toBeLessThanOrEqual(3);
    expect(result!.progressItems.length).toBeLessThanOrEqual(5);
    expect(result!.nextActions.length).toBeLessThanOrEqual(3);
  });

  // ── Test 5: formatWorkspaceNowPrompt produces clean markdown ─────

  describe('formatWorkspaceNowPrompt', () => {
    it('produces clean markdown with all sections', () => {
      const block: WorkspaceNowBlock = {
        workspaceName: 'My Project',
        summary: 'Working on an AI agent platform. Active today with 42 memories across 5 sessions.',
        recentDecisions: ['Use SQLite for local storage', 'Deploy via Tauri'],
        activeThreads: ['Architecture planning (2h ago)', 'Memory model design (yesterday)'],
        progressItems: ['[blocker] Waiting for API key', '[task] Implement search', '[completed] Setup CI'],
        nextActions: ['Resolve: Waiting for API key', 'Implement search'],
      };

      const result = formatWorkspaceNowPrompt(block);

      expect(result).toContain('# Workspace Now — My Project');
      expect(result).toContain('Working on an AI agent platform');
      expect(result).toContain('## Recent Decisions');
      expect(result).toContain('- Use SQLite for local storage');
      expect(result).toContain('- Deploy via Tauri');
      expect(result).toContain('## Active Threads');
      expect(result).toContain('- Architecture planning (2h ago)');
      expect(result).toContain('## Progress');
      expect(result).toContain('- [blocker] Waiting for API key');
      expect(result).toContain('## Likely Next Actions');
      expect(result).toContain('- Resolve: Waiting for API key');
      // No trailing whitespace
      expect(result).toBe(result.trimEnd());
    });

    it('omits empty sections', () => {
      const block: WorkspaceNowBlock = {
        workspaceName: 'Minimal',
        summary: 'A minimal workspace.',
        recentDecisions: [],
        activeThreads: [],
        progressItems: [],
        nextActions: [],
      };

      const result = formatWorkspaceNowPrompt(block);

      expect(result).toContain('# Workspace Now — Minimal');
      expect(result).toContain('A minimal workspace.');
      expect(result).not.toContain('## Recent Decisions');
      expect(result).not.toContain('## Active Threads');
      expect(result).not.toContain('## Progress');
      expect(result).not.toContain('## Likely Next Actions');
    });

    it('omits summary section if empty', () => {
      const block: WorkspaceNowBlock = {
        workspaceName: 'No Summary',
        summary: '',
        recentDecisions: ['Some decision'],
        activeThreads: [],
        progressItems: [],
        nextActions: [],
      };

      const result = formatWorkspaceNowPrompt(block);

      expect(result).toContain('# Workspace Now — No Summary');
      expect(result).toContain('## Recent Decisions');
      // Should not have blank lines between heading and decisions (no empty summary block)
      const lines = result.split('\n');
      const headingIdx = lines.findIndex(l => l.startsWith('# Workspace Now'));
      const decisionsIdx = lines.findIndex(l => l === '## Recent Decisions');
      // There should be only one blank line between heading and decisions section
      expect(decisionsIdx - headingIdx).toBeLessThanOrEqual(2);
    });
  });
});
