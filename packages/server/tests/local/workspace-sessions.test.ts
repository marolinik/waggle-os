import { describe, it, expect, vi } from 'vitest';
import { WorkspaceSessionManager, type WorkspaceSession } from '../../src/local/workspace-sessions.js';
import type { MindDB } from '@waggle/core';

function createMockMind(): MindDB {
  return {
    close: vi.fn(),
  } as unknown as MindDB;
}

function createMockTools() {
  return [{ name: 'mock_tool', description: 'mock', parameters: {}, execute: async () => 'ok' }];
}

describe('WorkspaceSessionManager', () => {
  it('creates a session for a workspace', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    const session = manager.create('ws-1', mind, createMockTools());

    expect(session.workspaceId).toBe('ws-1');
    expect(session.mind).toBe(mind);
    expect(session.status).toBe('active');
    expect(session.personaId).toBeNull();
    expect(manager.size).toBe(1);
  });

  it('returns existing session on getOrCreate', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    const session1 = manager.create('ws-1', mind, createMockTools());

    const mindFactory = vi.fn(() => createMockMind());
    const toolsFactory = vi.fn(() => createMockTools());
    const session2 = manager.getOrCreate('ws-1', mindFactory, toolsFactory);

    expect(session2).toBe(session1);
    // Factories should NOT have been called (existing session returned)
    expect(mindFactory).not.toHaveBeenCalled();
    expect(toolsFactory).not.toHaveBeenCalled();
  });

  it('limits to maxSessions (default 3)', () => {
    const manager = new WorkspaceSessionManager(2);
    manager.create('ws-1', createMockMind(), createMockTools());
    manager.create('ws-2', createMockMind(), createMockTools());

    expect(() => manager.create('ws-3', createMockMind(), createMockTools()))
      .toThrow('Max concurrent sessions reached (2)');
  });

  it('closes session and releases resources', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    manager.create('ws-1', mind, createMockTools());

    expect(manager.has('ws-1')).toBe(true);
    const closed = manager.close('ws-1');

    expect(closed).toBe(true);
    expect(manager.has('ws-1')).toBe(false);
    expect(manager.size).toBe(0);
    expect(mind.close).toHaveBeenCalled();
  });

  it('closes idle sessions past threshold', () => {
    const manager = new WorkspaceSessionManager(3);
    const s1 = manager.create('ws-1', createMockMind(), createMockTools());
    const s2 = manager.create('ws-2', createMockMind(), createMockTools());

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
    const s1 = manager.create('ws-1', createMockMind(), createMockTools());
    const s2 = manager.create('ws-2', createMockMind(), createMockTools());

    expect(s1.abortController).not.toBe(s2.abortController);

    // Aborting one should not affect the other
    s1.abortController.abort();
    expect(s1.abortController.signal.aborted).toBe(true);
    expect(s2.abortController.signal.aborted).toBe(false);
  });

  it('getActive() returns only open sessions', () => {
    const manager = new WorkspaceSessionManager(3);
    manager.create('ws-1', createMockMind(), createMockTools());
    manager.create('ws-2', createMockMind(), createMockTools());

    const active = manager.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(s => s.workspaceId)).toEqual(['ws-1', 'ws-2']);
  });

  it('pause/resume cycle works', () => {
    const manager = new WorkspaceSessionManager(3);
    const session = manager.create('ws-1', createMockMind(), createMockTools());

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
    manager.create('ws-1', m1, createMockTools());
    manager.create('ws-2', m2, createMockTools());

    manager.closeAll();
    expect(manager.size).toBe(0);
    expect(m1.close).toHaveBeenCalled();
    expect(m2.close).toHaveBeenCalled();
  });

  it('supports persona assignment', () => {
    const manager = new WorkspaceSessionManager(3);
    const session = manager.create('ws-1', createMockMind(), createMockTools(), 'researcher');

    expect(session.personaId).toBe('researcher');
  });

  it('close returns false for non-existent session', () => {
    const manager = new WorkspaceSessionManager(3);
    expect(manager.close('nonexistent')).toBe(false);
  });
});
