/**
 * Session component tests.
 *
 * Tests utility/logic functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  groupSessionsByTime,
  getTimeGroup,
  TIME_GROUPS,
  formatLastActive,
  generateSessionTitle,
  sortSessions,
  filterSessionsByWorkspace,
  SessionList,
  SessionCard,
  useSessions,
} from '../../src/index.js';
import type { Session } from '../../src/index.js';

// ── Test helpers ────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    workspaceId: 'ws-1',
    title: 'Test Session',
    messageCount: 5,
    lastActive: '2026-03-09T12:00:00Z',
    created: '2026-03-09T10:00:00Z',
    ...overrides,
  };
}

// ── getTimeGroup ──────────────────────────────────────────────────

describe('getTimeGroup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set "now" to 2026-03-09 15:00:00 UTC (Monday)
    vi.setSystemTime(new Date('2026-03-09T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for today\'s date', () => {
    expect(getTimeGroup('2026-03-09T10:00:00Z')).toBe('Today');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    expect(getTimeGroup('2026-03-08T18:00:00Z')).toBe('Yesterday');
  });

  it('returns "This Week" for a date within the last 7 days', () => {
    // 2026-03-05 is Thursday, 4 days ago
    expect(getTimeGroup('2026-03-05T12:00:00Z')).toBe('This Week');
  });

  it('returns "Older" for dates beyond 7 days', () => {
    expect(getTimeGroup('2026-02-20T12:00:00Z')).toBe('Older');
  });

  it('returns "Older" for very old dates', () => {
    expect(getTimeGroup('2025-01-01T00:00:00Z')).toBe('Older');
  });

  it('handles edge of yesterday boundary', () => {
    // Just after midnight yesterday
    expect(getTimeGroup('2026-03-08T00:01:00Z')).toBe('Yesterday');
  });
});

// ── groupSessionsByTime ──────────────────────────────────────────

describe('groupSessionsByTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty object for empty array', () => {
    expect(groupSessionsByTime([])).toEqual({});
  });

  it('groups sessions by time period', () => {
    const sessions = [
      makeSession({ id: '1', lastActive: '2026-03-09T14:00:00Z' }),
      makeSession({ id: '2', lastActive: '2026-03-08T14:00:00Z' }),
      makeSession({ id: '3', lastActive: '2026-03-09T10:00:00Z' }),
      makeSession({ id: '4', lastActive: '2026-02-01T10:00:00Z' }),
    ];
    const result = groupSessionsByTime(sessions);
    expect(result['Today']).toHaveLength(2);
    expect(result['Yesterday']).toHaveLength(1);
    expect(result['Older']).toHaveLength(1);
  });

  it('omits empty groups', () => {
    const sessions = [
      makeSession({ id: '1', lastActive: '2026-03-09T14:00:00Z' }),
    ];
    const result = groupSessionsByTime(sessions);
    expect(Object.keys(result)).toEqual(['Today']);
  });
});

// ── TIME_GROUPS ────────────────────────────────────────────────────

describe('TIME_GROUPS', () => {
  it('contains all expected groups in order', () => {
    expect(TIME_GROUPS).toEqual(['Today', 'Yesterday', 'This Week', 'Older']);
  });
});

// ── formatLastActive ──────────────────────────────────────────────

describe('formatLastActive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for less than a minute ago', () => {
    expect(formatLastActive('2026-03-09T14:59:30Z')).toBe('just now');
  });

  it('returns minutes for recent times', () => {
    expect(formatLastActive('2026-03-09T14:58:00Z')).toBe('2 min ago');
  });

  it('returns "1 min ago" for one minute', () => {
    expect(formatLastActive('2026-03-09T14:59:00Z')).toBe('1 min ago');
  });

  it('returns hours for same-day times', () => {
    expect(formatLastActive('2026-03-09T12:00:00Z')).toBe('3 hr ago');
  });

  it('returns "1 hr ago" for one hour', () => {
    expect(formatLastActive('2026-03-09T14:00:00Z')).toBe('1 hr ago');
  });

  it('returns date string for older dates', () => {
    const result = formatLastActive('2026-03-05T12:00:00Z');
    // Should be a short date like "Mar 5"
    expect(result).toMatch(/Mar\s+5/);
  });
});

// ── generateSessionTitle ──────────────────────────────────────────

describe('generateSessionTitle', () => {
  it('returns "New Session" with no messages', () => {
    expect(generateSessionTitle()).toBe('New Session');
  });

  it('returns "New Session" with empty array', () => {
    expect(generateSessionTitle([])).toBe('New Session');
  });

  it('uses first 50 chars of first message', () => {
    expect(generateSessionTitle(['Hello, how are you?'])).toBe('Hello, how are you?');
  });

  it('truncates long messages to 50 chars', () => {
    const long = 'A'.repeat(100);
    const result = generateSessionTitle([long]);
    expect(result).toHaveLength(53); // 50 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('uses first message only', () => {
    expect(generateSessionTitle(['First', 'Second', 'Third'])).toBe('First');
  });

  it('returns "New Session" for empty string message', () => {
    expect(generateSessionTitle([''])).toBe('New Session');
  });

  it('trims whitespace from first message', () => {
    expect(generateSessionTitle(['  Hello  '])).toBe('Hello');
  });

  it('truncates at word boundary for messages with spaces', () => {
    // "Help me understand how to implement a workspace switcher component in React" is 75 chars
    const msg = 'Help me understand how to implement a workspace switcher component in React';
    const result = generateSessionTitle([msg]);
    expect(result.endsWith('...')).toBe(true);
    // Should cut at "implement" (word boundary near 50 chars), not mid-word
    expect(result).toBe('Help me understand how to implement a workspace...');
  });
});

// ── sortSessions ──────────────────────────────────────────────────

describe('sortSessions', () => {
  it('returns empty array for empty input', () => {
    expect(sortSessions([])).toEqual([]);
  });

  it('sorts by lastActive descending (newest first)', () => {
    const sessions = [
      makeSession({ id: '1', lastActive: '2026-03-07T10:00:00Z' }),
      makeSession({ id: '2', lastActive: '2026-03-09T10:00:00Z' }),
      makeSession({ id: '3', lastActive: '2026-03-08T10:00:00Z' }),
    ];
    const result = sortSessions(sessions);
    expect(result.map((s) => s.id)).toEqual(['2', '3', '1']);
  });

  it('does not mutate original array', () => {
    const sessions = [
      makeSession({ id: '1', lastActive: '2026-03-07T10:00:00Z' }),
      makeSession({ id: '2', lastActive: '2026-03-09T10:00:00Z' }),
    ];
    const original = [...sessions];
    sortSessions(sessions);
    expect(sessions.map((s) => s.id)).toEqual(original.map((s) => s.id));
  });
});

// ── filterSessionsByWorkspace ─────────────────────────────────────

describe('filterSessionsByWorkspace', () => {
  it('returns empty array for empty input', () => {
    expect(filterSessionsByWorkspace([], 'ws-1')).toEqual([]);
  });

  it('filters by workspaceId', () => {
    const sessions = [
      makeSession({ id: '1', workspaceId: 'ws-1' }),
      makeSession({ id: '2', workspaceId: 'ws-2' }),
      makeSession({ id: '3', workspaceId: 'ws-1' }),
    ];
    const result = filterSessionsByWorkspace(sessions, 'ws-1');
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['1', '3']);
  });

  it('returns empty when no matches', () => {
    const sessions = [makeSession({ id: '1', workspaceId: 'ws-2' })];
    expect(filterSessionsByWorkspace(sessions, 'ws-1')).toEqual([]);
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('session component exports', () => {
  it('exports SessionList as a function', () => {
    expect(typeof SessionList).toBe('function');
  });

  it('exports SessionCard as a function', () => {
    expect(typeof SessionCard).toBe('function');
  });

  it('exports useSessions as a function', () => {
    expect(typeof useSessions).toBe('function');
  });
});
