import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import {
  buildWorkspaceNowBlock,
  formatWorkspaceNowPrompt,
} from '../../src/local/routes/workspace-context.js';

/**
 * Tests for workspace context injection into the agent system prompt.
 *
 * The actual `buildSystemPrompt` function is a closure inside the chat route plugin,
 * so we test the injection logic at the boundary: buildWorkspaceNowBlock + formatWorkspaceNowPrompt
 * produce the correct content, and verify the integration contract (what gets appended to the prompt).
 *
 * The chat route code:
 *   if (workspaceId) {
 *     const nowBlock = buildWorkspaceNowBlock({ ... });
 *     if (nowBlock) prompt += '\n\n' + formatWorkspaceNowPrompt(nowBlock);
 *   }
 */
describe('Context Injection — system prompt integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ctx-inject-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-critical on Windows
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────

  function setupWorkspace(id: string, opts?: {
    frames?: Array<{ content: string; importance: string }>;
    sessions?: Array<{ title: string; messages: Array<{ role: string; content: string }> }>;
  }) {
    const wsDir = path.join(tmpDir, 'workspaces', id);
    fs.mkdirSync(wsDir, { recursive: true });

    fs.writeFileSync(
      path.join(wsDir, 'workspace.json'),
      JSON.stringify({ id, name: `Test ${id}`, group: 'test', created: new Date().toISOString() }),
    );

    const mindPath = path.join(wsDir, 'workspace.mind');
    if (opts?.frames && opts.frames.length > 0) {
      const db = new MindDB(mindPath);
      const raw = db.getDatabase();
      raw.prepare(
        `INSERT INTO sessions (gop_id, status, started_at) VALUES ('session:test', 'active', datetime('now'))`,
      ).run();

      for (const frame of opts.frames) {
        raw.prepare(
          `INSERT INTO memory_frames (gop_id, frame_type, content, importance, created_at) VALUES ('session:test', 'I', ?, ?, datetime('now'))`,
        ).run(frame.content, frame.importance);
      }
      db.close();
    }

    if (opts?.sessions) {
      const sessDir = path.join(wsDir, 'sessions');
      fs.mkdirSync(sessDir, { recursive: true });

      for (let i = 0; i < opts.sessions.length; i++) {
        const sess = opts.sessions[i];
        const lines: string[] = [
          JSON.stringify({ type: 'meta', title: sess.title, created: new Date().toISOString() }),
        ];
        for (const msg of sess.messages) {
          lines.push(JSON.stringify({ role: msg.role, content: msg.content }));
        }
        fs.writeFileSync(path.join(sessDir, `session-${i}.jsonl`), lines.join('\n') + '\n');
      }
    }
  }

  function makeManager(workspaces: Map<string, { id: string; name: string }>) {
    return {
      get: (id: string) => workspaces.get(id) ?? null,
      getMindPath: (id: string) => path.join(tmpDir, 'workspaces', id, 'workspace.mind'),
    };
  }

  const noopActivate = (_id: string) => true;

  /**
   * Simulate what buildSystemPrompt does: build a base prompt, then conditionally
   * append the workspace context. This mirrors the injection logic in chat.ts.
   */
  function simulatePromptBuild(basePrompt: string, workspaceId?: string, wsManager?: ReturnType<typeof makeManager>) {
    let prompt = basePrompt;

    if (workspaceId && wsManager) {
      try {
        const nowBlock = buildWorkspaceNowBlock({
          dataDir: tmpDir,
          workspaceId,
          wsManager,
          activateWorkspaceMind: noopActivate,
        });
        if (nowBlock) {
          prompt += '\n\n' + formatWorkspaceNowPrompt(nowBlock);
        }
      } catch {
        // Non-blocking — mirrors the try/catch in chat.ts
      }
    }

    return prompt;
  }

  // ── Test 1: No workspaceId → no "Workspace Now" section ─────────────

  it('buildSystemPrompt without workspaceId produces no "Workspace Now" section', () => {
    const basePrompt = '# Who You Are\n\nYou are Waggle.';
    const result = simulatePromptBuild(basePrompt);

    expect(result).not.toContain('# Workspace Now');
    expect(result).toBe(basePrompt);
  });

  // ── Test 2: With workspaceId + data → includes "Workspace Now" ──────

  it('buildSystemPrompt with workspaceId for workspace with data includes "Workspace Now"', () => {
    const wsManager = makeManager(new Map([
      ['rich-ws', { id: 'rich-ws', name: 'Rich Project' }],
    ]));

    setupWorkspace('rich-ws', {
      frames: [
        { content: 'Working on the Waggle platform, a workspace-native AI agent.', importance: 'important' },
        { content: 'Decision: Use SQLite for local persistence.', importance: 'critical' },
      ],
      sessions: [
        {
          title: 'Architecture Planning',
          messages: [
            { role: 'user', content: 'Plan the architecture' },
            { role: 'assistant', content: 'Here is a plan.' },
          ],
        },
      ],
    });

    const basePrompt = '# Who You Are\n\nYou are Waggle.';
    const result = simulatePromptBuild(basePrompt, 'rich-ws', wsManager);

    expect(result).toContain('# Workspace Now');
    expect(result).toContain('Rich Project');
    // Should still contain the base prompt
    expect(result).toContain('# Who You Are');
    // Workspace Now should be appended after the base prompt
    const baseEnd = result.indexOf('# Who You Are');
    const wsNowStart = result.indexOf('# Workspace Now');
    expect(wsNowStart).toBeGreaterThan(baseEnd);
  });

  // ── Test 3: With workspaceId for empty/missing workspace → graceful ─

  it('buildSystemPrompt with workspaceId for empty workspace has no "Workspace Now" (graceful)', () => {
    const wsManager = makeManager(new Map([
      ['empty-ws', { id: 'empty-ws', name: 'Empty Project' }],
    ]));

    // Create workspace dir but no mind file
    const wsDir = path.join(tmpDir, 'workspaces', 'empty-ws');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsDir, 'workspace.json'),
      JSON.stringify({ id: 'empty-ws', name: 'Empty Project', group: 'test', created: new Date().toISOString() }),
    );

    const basePrompt = '# Who You Are\n\nYou are Waggle.';
    const result = simulatePromptBuild(basePrompt, 'empty-ws', wsManager);

    expect(result).not.toContain('# Workspace Now');
    expect(result).toBe(basePrompt);
  });

  it('buildSystemPrompt with workspaceId for non-existent workspace has no "Workspace Now"', () => {
    const wsManager = makeManager(new Map());

    const basePrompt = '# Who You Are\n\nYou are Waggle.';
    const result = simulatePromptBuild(basePrompt, 'does-not-exist', wsManager);

    expect(result).not.toContain('# Workspace Now');
    expect(result).toBe(basePrompt);
  });

  // ── Test 4: Cache invalidation — different workspaceId → different prompt ─

  it('different workspaceId produces different prompt content', () => {
    const wsManager = makeManager(new Map([
      ['ws-a', { id: 'ws-a', name: 'Project Alpha' }],
      ['ws-b', { id: 'ws-b', name: 'Project Beta' }],
    ]));

    setupWorkspace('ws-a', {
      frames: [
        { content: 'Alpha is a front-end framework project.', importance: 'important' },
        { content: 'Decision: Use React for Alpha.', importance: 'critical' },
      ],
    });

    setupWorkspace('ws-b', {
      frames: [
        { content: 'Beta is a backend API project.', importance: 'important' },
        { content: 'Decision: Use Rust for Beta.', importance: 'critical' },
      ],
    });

    const basePrompt = '# Who You Are\n\nYou are Waggle.';
    const promptA = simulatePromptBuild(basePrompt, 'ws-a', wsManager);
    const promptB = simulatePromptBuild(basePrompt, 'ws-b', wsManager);

    // Both should have Workspace Now
    expect(promptA).toContain('# Workspace Now');
    expect(promptB).toContain('# Workspace Now');

    // But with different workspace names
    expect(promptA).toContain('Project Alpha');
    expect(promptA).not.toContain('Project Beta');
    expect(promptB).toContain('Project Beta');
    expect(promptB).not.toContain('Project Alpha');

    // Prompts should be different
    expect(promptA).not.toBe(promptB);
  });

  // ── Test 5: Verify the formatted block is positioned correctly ──────

  it('workspace context is appended after the base prompt, not prepended', () => {
    const wsManager = makeManager(new Map([
      ['pos-ws', { id: 'pos-ws', name: 'Position Test' }],
    ]));

    setupWorkspace('pos-ws', {
      frames: [
        { content: 'Testing prompt positioning.', importance: 'important' },
      ],
    });

    const basePrompt = 'BASE_PROMPT_START\nSome agent instructions.\nBASE_PROMPT_END';
    const result = simulatePromptBuild(basePrompt, 'pos-ws', wsManager);

    // Base prompt should appear first
    expect(result.startsWith('BASE_PROMPT_START')).toBe(true);
    // Workspace Now should come after base prompt
    const baseEndIdx = result.indexOf('BASE_PROMPT_END');
    const wsNowIdx = result.indexOf('# Workspace Now');
    expect(wsNowIdx).toBeGreaterThan(baseEndIdx);
    // Separated by double newline
    const between = result.slice(baseEndIdx + 'BASE_PROMPT_END'.length, wsNowIdx);
    expect(between).toBe('\n\n');
  });
});
