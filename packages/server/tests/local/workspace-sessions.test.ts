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

  it('releases the cache pin instead of closing a borrowed mind', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = createMockMind();
    const release = vi.fn();
    // Session borrows a cache-owned handle: close() must drop the pin, NOT
    // close the shared MindDB (closing it would poison other borrows).
    manager.create('ws-1', mind, createMockOrchestrator(), createMockTools(), undefined, release);

    expect(manager.close('ws-1')).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(mind.close).not.toHaveBeenCalled();
  });

  it('rolls back the pin when getOrCreate fails after the mindFactory pins', () => {
    const manager = new WorkspaceSessionManager(1);
    manager.create('ws-1', createMockMind(), createMockOrchestrator(), createMockTools());

    // ws-1 fills the single slot; creating ws-2 hits the max-sessions cap in
    // create() AFTER the mindFactory ran, so getOrCreate must release the pin.
    const release = vi.fn();
    expect(() => manager.getOrCreate(
      'ws-2',
      () => createMockMind(),
      createMockOrchestrator,
      createMockTools,
      undefined,
      release,
    )).toThrow('Max concurrent sessions reached (1)');
    expect(release).toHaveBeenCalledTimes(1);
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

  it('does not close a backdated session while activity is leased', () => {
    const manager = new WorkspaceSessionManager(3);
    const session = manager.create(
      'ws-1', createMockMind(), createMockOrchestrator(), createMockTools(),
    );
    const activity = manager.acquireActivity('ws-1');
    expect(activity).toBeDefined();
    session.lastActivity = Date.now() - 60_000;

    expect(manager.closeIdleSessions(30_000)).toBe(0);
    expect(manager.has('ws-1')).toBe(true);

    activity!.release();
    session.lastActivity = Date.now() - 60_000;
    expect(manager.closeIdleSessions(30_000)).toBe(1);
    expect(manager.has('ws-1')).toBe(false);
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

  describe('resident session pressure', () => {
    it('trims sequential idle sessions to the 20-mind cache budget', () => {
      vi.useFakeTimers();
      try {
        const manager = new WorkspaceSessionManager(100);
        const releases = Array.from({ length: 21 }, () => vi.fn());

        for (let i = 0; i < 21; i += 1) {
          vi.setSystemTime(1_700_000_000_000 + i);
          manager.create(
            `ws-${i}`,
            createMockMind(),
            createMockOrchestrator(),
            createMockTools(),
            undefined,
            releases[i],
          );
        }

        expect(manager.size).toBe(20);
        expect(manager.has('ws-0')).toBe(false);
        expect(releases[0]).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('never evicts a resident session to bypass the configured session cap', () => {
      const manager = new WorkspaceSessionManager(20);
      for (let i = 0; i < 20; i += 1) {
        manager.create(`ws-${i}`, createMockMind(), createMockOrchestrator(), createMockTools());
      }

      expect(() => manager.create(
        'over-cap', createMockMind(), createMockOrchestrator(), createMockTools(),
      )).toThrow('Max concurrent sessions reached (20)');
      expect(manager.size).toBe(20);
      expect(manager.has('ws-0')).toBe(true);

      manager.setMaxSessions(10);
      expect(() => manager.create(
        'still-over-cap', createMockMind(), createMockOrchestrator(), createMockTools(),
      )).toThrow('Max concurrent sessions reached (10)');
      expect(manager.size).toBe(20);
      expect(manager.has('ws-0')).toBe(true);
    });

    it('preserves an in-flight session while trimming the oldest idle session', () => {
      vi.useFakeTimers();
      try {
        const manager = new WorkspaceSessionManager(100);
        const releaseBusyPin = vi.fn();

        vi.setSystemTime(1_700_000_000_000);
        manager.create(
          'busy',
          createMockMind(),
          createMockOrchestrator(),
          createMockTools(),
          undefined,
          releaseBusyPin,
        );
        const busyActivity = manager.acquireActivity('busy');
        expect(busyActivity).toBeDefined();

        const idleReleases = Array.from({ length: 20 }, () => vi.fn());
        for (let i = 0; i < 20; i += 1) {
          vi.setSystemTime(1_700_000_001_000 + i);
          manager.create(
            `idle-${i}`,
            createMockMind(),
            createMockOrchestrator(),
            createMockTools(),
            undefined,
            idleReleases[i],
          );
        }

        expect(manager.size).toBe(20);
        expect(manager.has('busy')).toBe(true);
        expect(releaseBusyPin).not.toHaveBeenCalled();
        expect(manager.has('idle-0')).toBe(false);
        expect(idleReleases[0]).toHaveBeenCalledTimes(1);

        busyActivity!.release();
        manager.closeAll();
        expect(releaseBusyPin).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('defers teardown until the exact retired session generation becomes idle', () => {
      const manager = new WorkspaceSessionManager(100);
      const oldRelease = vi.fn();
      const newRelease = vi.fn();
      const oldSession = manager.create(
        'same-id',
        createMockMind(),
        createMockOrchestrator(),
        createMockTools(),
        undefined,
        oldRelease,
      );
      const oldActivity = manager.acquireActivity('same-id');
      const secondOldActivity = manager.acquireActivity('same-id');
      expect(oldActivity?.session).toBe(oldSession);
      expect(secondOldActivity?.session).toBe(oldSession);

      expect(manager.close('same-id')).toBe(true);
      expect(oldSession.abortController.signal.aborted).toBe(true);
      expect(oldRelease).not.toHaveBeenCalled();

      const replacement = manager.create(
        'same-id',
        createMockMind(),
        createMockOrchestrator(),
        createMockTools(),
        undefined,
        newRelease,
      );
      const replacementActivity = manager.acquireActivity('same-id');
      expect(replacementActivity?.session).toBe(replacement);
      oldActivity!.release();
      oldActivity!.release();

      expect(oldRelease).not.toHaveBeenCalled();
      expect(manager.get('same-id')).toBe(replacement);
      expect(newRelease).not.toHaveBeenCalled();

      secondOldActivity!.release();
      expect(oldRelease).toHaveBeenCalledTimes(1);

      expect(manager.close('same-id')).toBe(true);
      expect(newRelease).not.toHaveBeenCalled();
      replacementActivity!.release();
      expect(newRelease).toHaveBeenCalledTimes(1);
    });

    it('fails closed when activity is requested for a paused session', () => {
      const manager = new WorkspaceSessionManager(100);
      manager.create('paused', createMockMind(), createMockOrchestrator(), createMockTools());
      expect(manager.pause('paused')).toBe(true);
      expect(manager.acquireActivity('paused')).toBeUndefined();
    });

    it('preserves a paused session under pressure and trims an idle active session', () => {
      vi.useFakeTimers();
      try {
        const manager = new WorkspaceSessionManager(100);
        vi.setSystemTime(1_700_000_000_000);
        manager.create('paused', createMockMind(), createMockOrchestrator(), createMockTools());
        manager.pause('paused');

        for (let i = 0; i < 20; i += 1) {
          vi.setSystemTime(1_700_000_001_000 + i);
          manager.create(`idle-${i}`, createMockMind(), createMockOrchestrator(), createMockTools());
        }

        expect(manager.size).toBe(20);
        expect(manager.has('paused')).toBe(true);
        expect(manager.has('idle-0')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('temporarily exceeds the resident budget when every session is in flight and converges on release', () => {
      vi.useFakeTimers();
      try {
        const manager = new WorkspaceSessionManager(100);
        const activities = [];

        for (let i = 0; i < 20; i += 1) {
          vi.setSystemTime(1_700_000_000_000 + i);
          manager.create(`busy-${i}`, createMockMind(), createMockOrchestrator(), createMockTools());
          activities.push(manager.acquireActivity(`busy-${i}`)!);
        }
        manager.create('overflow', createMockMind(), createMockOrchestrator(), createMockTools());
        const overflowActivity = manager.acquireActivity('overflow')!;

        expect(manager.size).toBe(21);
        activities[0].release();
        expect(manager.size).toBe(20);
        expect(manager.has('busy-0')).toBe(false);

        for (const activity of activities.slice(1)) activity.release();
        overflowActivity.release();
        manager.closeAll();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
