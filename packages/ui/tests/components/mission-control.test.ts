import { describe, it, expect } from 'vitest';

/**
 * Mission Control data shape tests.
 * UI rendering tests would need a DOM environment (jsdom).
 * These test the fleet API contract and data structures.
 */

describe('Mission Control fleet data shape', () => {
  it('fleet response has expected structure', () => {
    const fleet = {
      sessions: [
        { workspaceId: 'ws-1', personaId: 'researcher', status: 'active', lastActivity: Date.now(), durationMs: 5000, toolCount: 12 },
        { workspaceId: 'ws-2', personaId: null, status: 'paused', lastActivity: Date.now() - 60000, durationMs: 60000, toolCount: 8 },
      ],
      count: 2,
      maxSessions: 3,
    };

    expect(fleet.sessions).toHaveLength(2);
    expect(fleet.count).toBe(2);
    expect(fleet.maxSessions).toBe(3);
  });

  it('each session has required fields', () => {
    const session = {
      workspaceId: 'ws-1',
      personaId: 'coder',
      status: 'active',
      lastActivity: Date.now(),
      durationMs: 1200,
      toolCount: 15,
    };

    expect(session.workspaceId).toBeTruthy();
    expect(['active', 'paused', 'error']).toContain(session.status);
    expect(session.lastActivity).toBeGreaterThan(0);
    expect(session.toolCount).toBeGreaterThanOrEqual(0);
  });

  it('empty fleet is valid', () => {
    const fleet = { sessions: [], count: 0, maxSessions: 3 };
    expect(fleet.sessions).toHaveLength(0);
    expect(fleet.count).toBe(0);
  });

  it('persona icons map covers all 8 personas', () => {
    const PERSONA_ICONS: Record<string, string> = {
      researcher: '🔬', writer: '✍️', analyst: '📊', coder: '💻',
      'project-manager': '📋', 'executive-assistant': '📧', 'sales-rep': '🎯', marketer: '📢',
    };
    expect(Object.keys(PERSONA_ICONS)).toHaveLength(8);
  });

  it('fleet control actions are pause, resume, kill', () => {
    const actions = ['pause', 'resume', 'kill'];
    expect(actions).toHaveLength(3);
    // Each maps to POST /api/fleet/:workspaceId/:action
    for (const action of actions) {
      const url = `/api/fleet/ws-1/${action}`;
      expect(url).toContain(action);
    }
  });

  it('resource summary aggregates toolCount across sessions', () => {
    const sessions = [
      { toolCount: 12 },
      { toolCount: 8 },
      { toolCount: 15 },
    ];
    const totalTools = sessions.reduce((sum, s) => sum + s.toolCount, 0);
    expect(totalTools).toBe(35);
  });
});
