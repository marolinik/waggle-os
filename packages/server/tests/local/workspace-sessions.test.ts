import { describe, it, expect, vi } from 'vitest';
import { WorkspaceSessionManager, type WorkspaceSession } from '../../src/local/workspace-sessions.js';
import type { MindDB } from '@waggle/core';
import type { Orchestrator } from '@waggle/agent';

function createMockMind(): MindDB {
  return {
    close: vi.fn(),
  } as unknown as MindDB;
}

function createMockTools() {
  return [{ name: 'mock_tool', description: 'mock', parameters: {}, execute: async () => 'ok' }];
}

function createMockOrchestrator(): Orchestrator {
  return {
    setWorkspaceMind: vi.fn(),
  } as unknown as Orchestrator;
}

describe('WorkspaceSessionManager', () => {
  it('creates a session for a workspace', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    const session = manager.create('ws-1', mind, createMockOrchestrator(), createMockTools());

    expect(session.workspaceId).toBe('ws-1');
    expect(session.mind).toBe(mind);
    expect(session.status).toBe('active');
    expect(session.personaId).toBeNull();
    expect(manager.size).toBe(1);
  });

  it('returns existing session on getOrCreate', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    const session1 = manager.create('ws-1', mind, createMockOrchestrator(), createMockTools());

    const mindFactory = vi.fn(() => createMockMind());
    const orchestratorFactory = vi.fn(() => createMockOrchestrator());
    const toolsFactory = vi.fn(() => createMockTools());
    const session2 = manager.getOrCreate('ws-1', mindFactory, orchestratorFactory, toolsFactory);

    expect(session2).toBe(session1);
    // Factories should NOT have been called (existing session returned)
    expect(mindFactory).not.toHaveBeenCalled();
    expect(orchestratorFactory).not.toHaveBeenCalled();
    expect(toolsFactory).not.toHaveBeenCalled();
  });

  it('limits to maxSessions (default 3)', () => {
    const manager = new WorkspaceSessionManager(2);
    manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
    manager.create('ws-2', createMockMind(), createMockOrchestrator(), createMockTools());

    expect(() => manager.create('ws-3', createMockMind(), createMockOrchestrator(), createMockTools()))
      .toThrow('Max concurrent sessions reached (2)');
  });

  it('closes session and releases resources', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    manager.create('ws-1', mind, createMockOrchestrator(), createMockTools());

    expect(manager.has('ws-1')).toBe(true);
    const closed = manager.close('ws-1');

    expect(closed).toBe(true);
    expect(manager.has('ws-1')).toBe(false);
    expect(manager.size).toBe(0);
    expect(mind.close).toHaveBeenCalled();
  });

  it('closes idle sessions past threshold', () => {
    const manager = new WorkspaceSessionManager(3);
    const s1 = manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
    const s2 = manager.create('ws-2', createMockMind(), createMockOrchestrator(), createMockTools());

    // Make ws-1 idle by backdating its activity
    s1.lastActivity = Date.now() - 60000; // 60s ago
    s2.lastActivity = Date.now(); // just now

    const closed = manager.closeIdleSessions(30000); // 30s threshold

    expect(closed).toBe(1);
    expect(manager.has('ws-1')).toBe(false);
    expect(manager.has('ws-2')).toBe(true);
  });

  it('each session has independent abortController', () => {
    const manager = new WorkspaceSessionManager(3);
    const s1 = manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
    const s2 = manager.create('ws-2', createMockMind(), createMockOrchestrator(), createMockTools());

    expect(s1.abortController).not.toBe(s2.abortController);

    // Aborting one should not affect the other
    s1.abortController.abort();
    expect(s1.abortController.signal.aborted).toBe(true);
    expect(s2.abortController.signal.aborted).toBe(false);
  });

  it('getActive() returns only open sessions', () => {
    const manager = new WorkspaceSessionManager(3);
    manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
    manager.create('ws-2', createMockMind(), createMockOrchestrator(), createMockTools());

    const active = manager.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(s => s.workspaceId)).toEqual(['ws-1', 'ws-2']);
  });

  it('pause/resume cycle works', () => {
    const manager = new WorkspaceSessionManager(3);
    const session = manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());

    expect(session.status).toBe('active');

    manager.pause('ws-1');
    expect(session.status).toBe('paused');
    // AbortController was replaced (old one aborted)
    expect(session.abortController.signal.aborted).toBe(false); // New controller

    manager.resume('ws-1');
    expect(session.status).toBe('active');
  });

  it('closeAll() cleans up everything', () => {
    const manager = new WorkspaceSessionManager(3);
    const m1 = createMockMind();
    const m2 = createMockMind();
    manager.create('ws-1', m1, createMockOrchestrator(), createMockTools());
    manager.create('ws-2', m2, createMockOrchestrator(), createMockTools());

    manager.closeAll();
    expect(manager.size).toBe(0);
    expect(m1.close).toHaveBeenCalled();
    expect(m2.close).toHaveBeenCalled();
  });

  it('supports persona assignment', () => {
    const manager = new WorkspaceSessionManager(3);
    const session = manager.create(
      'ws-1', createMockMind(), createMockOrchestrator(), createMockTools(), 'researcher',
    );

    expect(session.personaId).toBe('researcher');
  });

  it('close returns false for non-existent session', () => {
    const manager = new WorkspaceSessionManager(3);
    expect(manager.close('nonexistent')).toBe(false);
  });

  describe('addTokens (L-17 C3)', () => {
    it('initializes new sessions with tokensUsed = 0', () => {
      const manager = new WorkspaceSessionManager(3);
      const s = manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
      expect(s.tokensUsed).toBe(0);
    });

    it('accumulates tokens across multiple calls', () => {
      const manager = new WorkspaceSessionManager(3);
      manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());

      manager.addTokens('ws-1', 120);
      manager.addTokens('ws-1', 80);
      manager.addTokens('ws-1', 50);

      expect(manager.get('ws-1')!.tokensUsed).toBe(250);
    });

    it('tracks tokens per workspace independently', () => {
      const manager = new WorkspaceSessionManager(3);
      manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
      manager.create('ws-2', createMockMind(), createMockOrchestrator(), createMockTools());

      manager.addTokens('ws-1', 100);
      manager.addTokens('ws-2', 200);
      manager.addTokens('ws-1', 50);

      expect(manager.get('ws-1')!.tokensUsed).toBe(150);
      expect(manager.get('ws-2')!.tokensUsed).toBe(200);
    });

    it('no-ops silently when the session does not exist', () => {
      const manager = new WorkspaceSessionManager(3);
      expect(() => manager.addTokens('nonexistent', 500)).not.toThrow();
    });

    it('ignores zero, negative, NaN, and Infinity deltas', () => {
      const manager = new WorkspaceSessionManager(3);
      manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());

      manager.addTokens('ws-1', 0);
      manager.addTokens('ws-1', -50);
      manager.addTokens('ws-1', NaN);
      manager.addTokens('ws-1', Infinity);
      manager.addTokens('ws-1', -Infinity);

      expect(manager.get('ws-1')!.tokensUsed).toBe(0);
    });

    it('persists accumulated tokens across pause/resume', () => {
      const manager = new WorkspaceSessionManager(3);
      manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());
      manager.addTokens('ws-1', 300);

      manager.pause('ws-1');
      expect(manager.get('ws-1')!.tokensUsed).toBe(300);

      manager.resume('ws-1');
      manager.addTokens('ws-1', 200);
      expect(manager.get('ws-1')!.tokensUsed).toBe(500);
    });
  });
});
