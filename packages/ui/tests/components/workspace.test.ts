/**
 * Workspace component tests.
 *
 * Tests utility/logic functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import {
  groupWorkspacesByGroup,
  validateWorkspaceForm,
  sortGroups,
  GROUP_ORDER,
  WorkspaceTree,
  WorkspaceCard,
  GroupHeader,
  CreateWorkspaceDialog,
  TeamPresence,
  getInitials,
  useWorkspaces,
  useTeamPresence,
  TaskBoard,
  getTaskStatusColor,
  groupTasksByStatus,
} from '../../src/index.js';
import type { TeamTask } from '../../src/index.js';
import type { Workspace } from '../../src/index.js';

// ── Test helpers ────────────────────────────────────────────────────

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: 'Test Workspace',
    group: 'Work',
    created: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── groupWorkspacesByGroup ──────────────────────────────────────────

describe('groupWorkspacesByGroup', () => {
  it('returns empty object for empty array', () => {
    expect(groupWorkspacesByGroup([])).toEqual({});
  });

  it('groups workspaces by group field', () => {
    const workspaces = [
      makeWorkspace({ id: '1', group: 'Work' }),
      makeWorkspace({ id: '2', group: 'Personal' }),
      makeWorkspace({ id: '3', group: 'Work' }),
    ];
    const result = groupWorkspacesByGroup(workspaces);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Work']).toHaveLength(2);
    expect(result['Personal']).toHaveLength(1);
  });

  it('puts workspaces without group into "Other"', () => {
    const ws = makeWorkspace({ id: '1', group: '' });
    const result = groupWorkspacesByGroup([ws]);
    expect(result['Other']).toHaveLength(1);
  });

  it('preserves workspace order within groups', () => {
    const workspaces = [
      makeWorkspace({ id: 'a', name: 'Alpha', group: 'Work' }),
      makeWorkspace({ id: 'b', name: 'Beta', group: 'Work' }),
      makeWorkspace({ id: 'c', name: 'Charlie', group: 'Work' }),
    ];
    const result = groupWorkspacesByGroup(workspaces);
    expect(result['Work'].map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });
});

// ── validateWorkspaceForm ───────────────────────────────────────────

describe('validateWorkspaceForm', () => {
  it('returns error for empty name', () => {
    expect(validateWorkspaceForm('')).toBe('Name is required');
  });

  it('returns error for whitespace-only name', () => {
    expect(validateWorkspaceForm('   ')).toBe('Name is required');
  });

  it('returns error for name over 50 characters', () => {
    const longName = 'A'.repeat(51);
    expect(validateWorkspaceForm(longName)).toBe('Name must be 50 characters or less');
  });

  it('returns null for valid name', () => {
    expect(validateWorkspaceForm('My Workspace')).toBeNull();
  });

  it('returns null for name at exactly 50 characters', () => {
    expect(validateWorkspaceForm('A'.repeat(50))).toBeNull();
  });

  it('returns null for single-character name', () => {
    expect(validateWorkspaceForm('X')).toBeNull();
  });
});

// ── sortGroups ──────────────────────────────────────────────────────

describe('sortGroups', () => {
  it('sorts known groups in predefined order', () => {
    const result = sortGroups(['Personal', 'Work', 'Study']);
    expect(result).toEqual(['Work', 'Personal', 'Study']);
  });

  it('puts unknown groups after known groups', () => {
    const result = sortGroups(['Zzz', 'Work', 'Aaa']);
    expect(result).toEqual(['Work', 'Aaa', 'Zzz']);
  });

  it('handles empty array', () => {
    expect(sortGroups([])).toEqual([]);
  });

  it('sorts all predefined groups correctly', () => {
    const result = sortGroups(['Other', 'Custom', 'Study', 'Personal', 'Work']);
    expect(result).toEqual(['Work', 'Personal', 'Study', 'Custom', 'Other']);
  });
});

// ── GROUP_ORDER ─────────────────────────────────────────────────────

describe('GROUP_ORDER', () => {
  it('contains expected groups', () => {
    expect(GROUP_ORDER).toContain('Work');
    expect(GROUP_ORDER).toContain('Personal');
    expect(GROUP_ORDER).toContain('Study');
    expect(GROUP_ORDER).toContain('Custom');
    expect(GROUP_ORDER).toContain('Other');
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('workspace component exports', () => {
  it('exports WorkspaceTree as a function', () => {
    expect(typeof WorkspaceTree).toBe('function');
  });

  it('exports WorkspaceCard as a function', () => {
    expect(typeof WorkspaceCard).toBe('function');
  });

  it('exports GroupHeader as a function', () => {
    expect(typeof GroupHeader).toBe('function');
  });

  it('exports CreateWorkspaceDialog as a function', () => {
    expect(typeof CreateWorkspaceDialog).toBe('function');
  });

  it('exports useWorkspaces as a function', () => {
    expect(typeof useWorkspaces).toBe('function');
  });

  it('exports TeamPresence as a function', () => {
    expect(typeof TeamPresence).toBe('function');
  });

  it('exports useTeamPresence as a function', () => {
    expect(typeof useTeamPresence).toBe('function');
  });
});

// ── getInitials ─────────────────────────────────────────────────────

describe('getInitials', () => {
  it('returns first+last initials for two-word name', () => {
    expect(getInitials('Alice Smith')).toBe('AS');
  });

  it('returns first+last initials for multi-word name', () => {
    expect(getInitials('Jean-Claude Van Damme')).toBe('JD');
  });

  it('returns first two chars for single-word name', () => {
    expect(getInitials('Admin')).toBe('AD');
  });

  it('handles leading/trailing whitespace', () => {
    expect(getInitials('  Bob Jones  ')).toBe('BJ');
  });

  it('uppercases lowercase names', () => {
    expect(getInitials('john doe')).toBe('JD');
  });
});

// ── groupTasksByStatus ──────────────────────────────────────────────

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task-1',
    title: 'Test task',
    status: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupTasksByStatus', () => {
  it('groups tasks by status', () => {
    const tasks = [
      makeTask({ id: '1', status: 'open' }),
      makeTask({ id: '2', status: 'in_progress' }),
      makeTask({ id: '3', status: 'done' }),
      makeTask({ id: '4', status: 'open' }),
    ];
    const grouped = groupTasksByStatus(tasks);
    expect(grouped.open).toHaveLength(2);
    expect(grouped.in_progress).toHaveLength(1);
    expect(grouped.done).toHaveLength(1);
  });

  it('returns empty arrays for no tasks', () => {
    const grouped = groupTasksByStatus([]);
    expect(grouped.open).toHaveLength(0);
    expect(grouped.in_progress).toHaveLength(0);
    expect(grouped.done).toHaveLength(0);
  });
});

describe('getTaskStatusColor', () => {
  it('returns blue class for open', () => {
    expect(getTaskStatusColor('open')).toBe('bg-blue-500');
  });

  it('returns amber class for in_progress', () => {
    expect(getTaskStatusColor('in_progress')).toBe('bg-amber-500');
  });

  it('returns green class for done', () => {
    expect(getTaskStatusColor('done')).toBe('bg-green-500');
  });
});

describe('TaskBoard exports', () => {
  it('exports TaskBoard as a function', () => {
    expect(typeof TaskBoard).toBe('function');
  });
});
