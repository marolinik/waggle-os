/**
 * Memory component tests.
 *
 * Tests utility functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFrameTypeIcon,
  getFrameTypeLabel,
  getImportanceBadge,
  truncateContent,
  formatTimestamp,
  FRAME_TYPES,
  filterFrames,
  sortFrames,
  MemoryBrowser,
  FrameTimeline,
  FrameDetail,
  MemorySearch,
  useMemory,
  executeMemorySearch,
} from '../../src/index.js';
import type { Frame, WaggleService } from '../../src/index.js';

// ── Test data ───────────────────────────────────────────────────────

function makeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 1,
    content: 'Test frame content',
    source: 'personal',
    frameType: 'I',
    importance: 'high',
    timestamp: '2026-03-09T12:00:00.000Z',
    ...overrides,
  };
}

// ── getFrameTypeIcon ────────────────────────────────────────────────

describe('getFrameTypeIcon', () => {
  it('returns keyframe icon for I-Frame', () => {
    expect(getFrameTypeIcon('I')).toBe('keyframe');
  });

  it('returns prediction icon for P-Frame', () => {
    expect(getFrameTypeIcon('P')).toBe('prediction');
  });

  it('returns bidirectional icon for B-Frame', () => {
    expect(getFrameTypeIcon('B')).toBe('bidirectional');
  });

  it('returns default icon for unknown type', () => {
    expect(getFrameTypeIcon('X')).toBe('frame');
  });
});

// ── getFrameTypeLabel ───────────────────────────────────────────────

describe('getFrameTypeLabel', () => {
  it('returns "Fact" for I', () => {
    expect(getFrameTypeLabel('I')).toBe('Fact');
  });

  it('returns "Prediction" for P', () => {
    expect(getFrameTypeLabel('P')).toBe('Prediction');
  });

  it('returns "Background" for B', () => {
    expect(getFrameTypeLabel('B')).toBe('Background');
  });

  it('returns raw type for unknown', () => {
    expect(getFrameTypeLabel('Z')).toBe('Z');
  });
});

// ── getImportanceBadge ──────────────────────────────────────────────

describe('getImportanceBadge', () => {
  it('returns red badge for high importance', () => {
    const badge = getImportanceBadge('high');
    expect(badge.label).toBe('High');
    expect(badge.color).toBe('red');
  });

  it('returns yellow badge for medium importance', () => {
    const badge = getImportanceBadge('medium');
    expect(badge.label).toBe('Medium');
    expect(badge.color).toBe('yellow');
  });

  it('returns gray badge for low importance', () => {
    const badge = getImportanceBadge('low');
    expect(badge.label).toBe('Low');
    expect(badge.color).toBe('gray');
  });

  it('returns blue badge for unknown importance', () => {
    const badge = getImportanceBadge('critical');
    expect(badge.label).toBe('critical');
    expect(badge.color).toBe('blue');
  });
});

// ── truncateContent ─────────────────────────────────────────────────

describe('truncateContent', () => {
  it('returns full content when fewer lines than limit', () => {
    expect(truncateContent('line one', 2)).toBe('line one');
  });

  it('returns exactly N lines when content has more', () => {
    const content = 'line one\nline two\nline three\nline four';
    expect(truncateContent(content, 2)).toBe('line one\nline two');
  });

  it('returns all lines when limit equals line count', () => {
    const content = 'a\nb\nc';
    expect(truncateContent(content, 3)).toBe('a\nb\nc');
  });

  it('handles empty content', () => {
    expect(truncateContent('', 2)).toBe('');
  });

  it('handles single line', () => {
    expect(truncateContent('hello', 1)).toBe('hello');
  });
});

// ── formatTimestamp ─────────────────────────────────────────────────

describe('formatTimestamp', () => {
  const FIXED_NOW = new Date('2026-03-09T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for recent timestamps', () => {
    const now = new Date(FIXED_NOW).toISOString();
    expect(formatTimestamp(now)).toBe('just now');
  });

  it('returns minutes ago for timestamps within the hour', () => {
    const fiveMinAgo = new Date(FIXED_NOW - 5 * 60 * 1000).toISOString();
    expect(formatTimestamp(fiveMinAgo)).toBe('5 min ago');
  });

  it('returns hours ago for timestamps within the day', () => {
    const twoHoursAgo = new Date(FIXED_NOW - 2 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(twoHoursAgo)).toBe('2 hours ago');
  });

  it('returns "1 hour ago" for singular', () => {
    const oneHourAgo = new Date(FIXED_NOW - 1 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(oneHourAgo)).toBe('1 hour ago');
  });

  it('returns "yesterday" for timestamps from yesterday', () => {
    const yesterday = new Date(FIXED_NOW - 25 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(yesterday)).toBe('yesterday');
  });

  it('returns "N days ago" for timestamps within the week', () => {
    const threeDaysAgo = new Date(FIXED_NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(threeDaysAgo)).toBe('3 days ago');
  });

  it('returns date string for older timestamps', () => {
    const old = new Date(FIXED_NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatTimestamp(old);
    // Should contain a date-like format, not "X days ago"
    expect(result).not.toContain('days ago');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── FRAME_TYPES ─────────────────────────────────────────────────────

describe('FRAME_TYPES', () => {
  it('is an array with I, P, B entries', () => {
    expect(Array.isArray(FRAME_TYPES)).toBe(true);
    expect(FRAME_TYPES.length).toBe(3);
    const values = FRAME_TYPES.map((ft) => ft.value);
    expect(values).toContain('I');
    expect(values).toContain('P');
    expect(values).toContain('B');
  });

  it('each entry has value and label', () => {
    for (const ft of FRAME_TYPES) {
      expect(ft).toHaveProperty('value');
      expect(ft).toHaveProperty('label');
      expect(typeof ft.value).toBe('string');
      expect(typeof ft.label).toBe('string');
    }
  });
});

// ── filterFrames ────────────────────────────────────────────────────

describe('filterFrames', () => {
  const frames: Frame[] = [
    makeFrame({ id: 1, frameType: 'I', importance: 'high', source: 'personal', timestamp: '2026-03-09T12:00:00.000Z' }),
    makeFrame({ id: 2, frameType: 'P', importance: 'medium', source: 'workspace', timestamp: '2026-03-08T12:00:00.000Z' }),
    makeFrame({ id: 3, frameType: 'B', importance: 'low', source: 'personal', timestamp: '2026-03-07T12:00:00.000Z' }),
    makeFrame({ id: 4, frameType: 'I', importance: 'high', source: 'workspace', timestamp: '2026-03-06T12:00:00.000Z' }),
  ];

  it('returns all frames with empty filters', () => {
    expect(filterFrames(frames, {})).toHaveLength(4);
  });

  it('filters by frame type', () => {
    const result = filterFrames(frames, { types: ['I'] });
    expect(result).toHaveLength(2);
    expect(result.every((f) => f.frameType === 'I')).toBe(true);
  });

  it('filters by multiple types', () => {
    const result = filterFrames(frames, { types: ['I', 'B'] });
    expect(result).toHaveLength(3);
  });

  it('filters by importance', () => {
    const result = filterFrames(frames, { importance: ['high'] });
    expect(result).toHaveLength(2);
  });

  it('filters by source', () => {
    const result = filterFrames(frames, { source: 'workspace' });
    expect(result).toHaveLength(2);
  });

  it('source "all" returns everything', () => {
    const result = filterFrames(frames, { source: 'all' });
    expect(result).toHaveLength(4);
  });

  it('filters by dateFrom', () => {
    const result = filterFrames(frames, { dateFrom: '2026-03-08T00:00:00.000Z' });
    expect(result).toHaveLength(2);
  });

  it('filters by dateTo', () => {
    const result = filterFrames(frames, { dateTo: '2026-03-07T23:59:59.999Z' });
    expect(result).toHaveLength(2);
  });

  it('filters by date range', () => {
    const result = filterFrames(frames, {
      dateFrom: '2026-03-07T00:00:00.000Z',
      dateTo: '2026-03-08T23:59:59.999Z',
    });
    expect(result).toHaveLength(2);
  });

  it('combines multiple filters', () => {
    const result = filterFrames(frames, { types: ['I'], source: 'personal' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

// ── sortFrames ──────────────────────────────────────────────────────

describe('sortFrames', () => {
  const frames: Frame[] = [
    makeFrame({ id: 1, timestamp: '2026-03-07T12:00:00.000Z', importance: 'low', score: 0.5 }),
    makeFrame({ id: 2, timestamp: '2026-03-09T12:00:00.000Z', importance: 'high', score: 0.9 }),
    makeFrame({ id: 3, timestamp: '2026-03-08T12:00:00.000Z', importance: 'medium', score: 0.1 }),
  ];

  it('sorts by time descending (newest first)', () => {
    const sorted = sortFrames(frames, 'time');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  it('sorts by importance (high > medium > low)', () => {
    const sorted = sortFrames(frames, 'importance');
    expect(sorted[0].importance).toBe('high');
    expect(sorted[1].importance).toBe('medium');
    expect(sorted[2].importance).toBe('low');
  });

  it('sorts by score descending', () => {
    const sorted = sortFrames(frames, 'score');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
    expect(sorted[2].id).toBe(3);
  });

  it('does not mutate the original array', () => {
    const original = [...frames];
    sortFrames(frames, 'time');
    expect(frames.map((f) => f.id)).toEqual(original.map((f) => f.id));
  });

  it('handles frames without scores gracefully', () => {
    const noScore: Frame[] = [
      makeFrame({ id: 1, score: undefined }),
      makeFrame({ id: 2, score: 0.5 }),
    ];
    const sorted = sortFrames(noScore, 'score');
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });
});

// ── I3: Frame attribution ───────────────────────────────────────────

describe('Frame attribution (I3)', () => {
  it('Frame type accepts authorId and authorName fields', () => {
    const frame = makeFrame({
      authorId: 'user-123',
      authorName: 'Marko',
    });
    expect(frame.authorId).toBe('user-123');
    expect(frame.authorName).toBe('Marko');
  });

  it('Frame without attribution has undefined author fields', () => {
    const frame = makeFrame();
    expect(frame.authorId).toBeUndefined();
    expect(frame.authorName).toBeUndefined();
  });

  it('filterFrames preserves attribution fields', () => {
    const frames: Frame[] = [
      makeFrame({ id: 1, authorName: 'Alice', frameType: 'I' }),
      makeFrame({ id: 2, authorName: 'Bob', frameType: 'P' }),
      makeFrame({ id: 3, frameType: 'I' }), // no attribution
    ];
    const filtered = filterFrames(frames, { types: ['I'] });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].authorName).toBe('Alice');
    expect(filtered[1].authorName).toBeUndefined();
  });

  it('sortFrames preserves attribution fields', () => {
    const frames: Frame[] = [
      makeFrame({ id: 1, timestamp: '2026-03-07T12:00:00Z', authorName: 'Alice' }),
      makeFrame({ id: 2, timestamp: '2026-03-09T12:00:00Z', authorName: 'Bob' }),
    ];
    const sorted = sortFrames(frames, 'time');
    expect(sorted[0].authorName).toBe('Bob');
    expect(sorted[1].authorName).toBe('Alice');
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('memory component exports', () => {
  it('exports MemoryBrowser as a function', () => {
    expect(typeof MemoryBrowser).toBe('function');
  });

  it('exports FrameTimeline as a function', () => {
    expect(typeof FrameTimeline).toBe('function');
  });

  it('exports FrameDetail as a function', () => {
    expect(typeof FrameDetail).toBe('function');
  });

  it('exports MemorySearch as a function', () => {
    expect(typeof MemorySearch).toBe('function');
  });

  it('exports useMemory as a function', () => {
    expect(typeof useMemory).toBe('function');
  });
});

// ── useMemory behavioral tests (via executeMemorySearch) ───────────

describe('useMemory', () => {
  function createMockService(overrides: Partial<WaggleService> = {}): WaggleService {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      sendMessage: vi.fn(),
      getHistory: vi.fn().mockResolvedValue([]),
      listWorkspaces: vi.fn().mockResolvedValue([]),
      createWorkspace: vi.fn().mockResolvedValue({}),
      updateWorkspace: vi.fn().mockResolvedValue(undefined),
      deleteWorkspace: vi.fn().mockResolvedValue(undefined),
      searchMemory: vi.fn().mockResolvedValue([]),
      listFrames: vi.fn().mockResolvedValue([]),
      getKnowledgeGraph: vi.fn().mockResolvedValue({ entities: [], relations: [] }),
      listSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({}),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      approveAction: vi.fn(),
      denyAction: vi.fn(),
      getAgentStatus: vi.fn().mockResolvedValue({}),
      getConfig: vi.fn().mockResolvedValue({}),
      updateConfig: vi.fn().mockResolvedValue(undefined),
      testApiKey: vi.fn().mockResolvedValue({ valid: true }),
      on: vi.fn().mockReturnValue(() => {}),
      ...overrides,
    } as unknown as WaggleService;
  }

  it('exports useMemory as a function', () => {
    expect(typeof useMemory).toBe('function');
  });

  it('exports executeMemorySearch as a function', () => {
    expect(typeof executeMemorySearch).toBe('function');
  });

  it('search calls service.searchMemory with scope "all" by default', async () => {
    const mockSearch = vi.fn().mockResolvedValue([
      makeFrame({ id: 10, content: 'found' }),
    ]);
    const mockKG = vi.fn().mockResolvedValue({ entities: ['e1'], relations: ['r1'] });
    const service = createMockService({
      searchMemory: mockSearch,
      getKnowledgeGraph: mockKG,
    });

    const result = await executeMemorySearch(service, 'test query', {}, 'ws-1');

    expect(mockSearch).toHaveBeenCalledWith('test query', 'all', 'ws-1');
    expect(result.error).toBeNull();
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe(10);
  });

  it('search passes correct scope from filters', async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    const service = createMockService({ searchMemory: mockSearch });

    await executeMemorySearch(service, 'query', { source: 'personal' }, 'ws-1');

    expect(mockSearch).toHaveBeenCalledWith('query', 'personal', 'ws-1');
  });

  it('search error sets error state', async () => {
    const mockSearch = vi.fn().mockRejectedValue(new Error('Network error'));
    const service = createMockService({ searchMemory: mockSearch });

    const result = await executeMemorySearch(service, 'fail query', {}, 'ws-1');

    expect(result.error).toBe('Network error');
    expect(result.frames).toHaveLength(0);
    expect(result.stats).toBeNull();
  });

  it('stats include entity/relation counts from knowledge graph', async () => {
    const mockSearch = vi.fn().mockResolvedValue([makeFrame(), makeFrame({ id: 2 })]);
    const mockKG = vi.fn().mockResolvedValue({
      entities: ['entity1', 'entity2', 'entity3'],
      relations: ['rel1'],
    });
    const service = createMockService({
      searchMemory: mockSearch,
      getKnowledgeGraph: mockKG,
    });

    const result = await executeMemorySearch(service, 'test', {}, 'ws-1');

    expect(result.error).toBeNull();
    expect(result.stats).not.toBeNull();
    expect(result.stats!.totalFrames).toBe(2);
    expect(result.stats!.entities).toBe(3);
    expect(result.stats!.relations).toBe(1);
  });

  it('stats include mindFileSize when provided', async () => {
    const mockSearch = vi.fn().mockResolvedValue([makeFrame()]);
    const mockKG = vi.fn().mockResolvedValue({ entities: [], relations: [] });
    const service = createMockService({
      searchMemory: mockSearch,
      getKnowledgeGraph: mockKG,
    });

    const result = await executeMemorySearch(service, 'test', {}, 'ws-1', 2048);

    expect(result.stats!.mindFileSize).toBe(2048);
  });

  it('stats default to zero entities/relations without workspaceId', async () => {
    const mockSearch = vi.fn().mockResolvedValue([makeFrame()]);
    const service = createMockService({ searchMemory: mockSearch });

    const result = await executeMemorySearch(service, 'test', {});

    expect(result.stats!.totalFrames).toBe(1);
    expect(result.stats!.entities).toBe(0);
    expect(result.stats!.relations).toBe(0);
  });

  it('stats fallback when knowledge graph fetch fails', async () => {
    const mockSearch = vi.fn().mockResolvedValue([makeFrame()]);
    const mockKG = vi.fn().mockRejectedValue(new Error('KG unavailable'));
    const service = createMockService({
      searchMemory: mockSearch,
      getKnowledgeGraph: mockKG,
    });

    const result = await executeMemorySearch(service, 'test', {}, 'ws-1');

    expect(result.error).toBeNull();
    expect(result.stats!.totalFrames).toBe(1);
    expect(result.stats!.entities).toBe(0);
    expect(result.stats!.relations).toBe(0);
  });
});
