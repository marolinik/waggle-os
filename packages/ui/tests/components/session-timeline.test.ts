/**
 * PM-3: Session Timeline — UI tests.
 *
 * Tests utility functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionTimeline,
  getToolIcon,
  formatTimelineDuration,
  formatTimelineTimestamp,
} from '../../src/index.js';
import type { TimelineEvent } from '../../src/index.js';

// ── Test data ───────────────────────────────────────────────────────

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'tl-0',
    timestamp: '2026-03-19T10:05:00.000Z',
    toolName: 'web_search',
    status: 'success',
    durationMs: 1200,
    inputPreview: 'AI news',
    outputPreview: 'Found several results...',
    fullInput: { query: 'AI news' },
    fullOutput: { content: 'Found several results about AI' },
    ...overrides,
  };
}

// ── getToolIcon ─────────────────────────────────────────────────────

describe('getToolIcon', () => {
  it('returns magnifier for web_search', () => {
    expect(getToolIcon('web_search')).toBe('magnifier');
  });

  it('returns globe for web_fetch', () => {
    expect(getToolIcon('web_fetch')).toBe('globe');
  });

  it('returns brain for search_memory', () => {
    expect(getToolIcon('search_memory')).toBe('brain');
  });

  it('returns file for read_file', () => {
    expect(getToolIcon('read_file')).toBe('file');
  });

  it('returns agent for spawn_agent', () => {
    expect(getToolIcon('spawn_agent')).toBe('agent');
  });

  it('returns tool for unknown tool name', () => {
    expect(getToolIcon('some_unknown_tool')).toBe('tool');
  });
});

// ── formatTimelineDuration ──────────────────────────────────────────

describe('formatTimelineDuration', () => {
  it('returns empty string for null', () => {
    expect(formatTimelineDuration(null)).toBe('');
  });

  it('formats sub-second as milliseconds', () => {
    expect(formatTimelineDuration(250)).toBe('250ms');
  });

  it('formats seconds with one decimal (1.2s)', () => {
    expect(formatTimelineDuration(1200)).toBe('1.2s');
  });

  it('formats exact seconds', () => {
    expect(formatTimelineDuration(3000)).toBe('3.0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimelineDuration(150000)).toBe('2m 30s');
  });

  it('formats exactly one minute', () => {
    expect(formatTimelineDuration(60000)).toBe('1m 0s');
  });

  it('handles zero', () => {
    expect(formatTimelineDuration(0)).toBe('0ms');
  });
});

// ── formatTimelineTimestamp ──────────────────────────────────────────

describe('formatTimelineTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T10:10:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for less than 1 minute ago', () => {
    expect(formatTimelineTimestamp('2026-03-19T10:09:30.000Z')).toBe('just now');
  });

  it('returns minutes ago for recent timestamps', () => {
    expect(formatTimelineTimestamp('2026-03-19T10:05:00.000Z')).toBe('5m ago');
  });

  it('returns hours ago for timestamps within 24h', () => {
    expect(formatTimelineTimestamp('2026-03-19T07:10:00.000Z')).toBe('3h ago');
  });

  it('returns days ago for timestamps within a week', () => {
    expect(formatTimelineTimestamp('2026-03-17T10:10:00.000Z')).toBe('2d ago');
  });

  it('returns date string for older timestamps', () => {
    const result = formatTimelineTimestamp('2026-02-01T10:00:00.000Z');
    expect(result).not.toContain('ago');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('SessionTimeline exports', () => {
  it('exports SessionTimeline as a function', () => {
    expect(typeof SessionTimeline).toBe('function');
  });

  it('exports getToolIcon as a function', () => {
    expect(typeof getToolIcon).toBe('function');
  });

  it('exports formatTimelineDuration as a function', () => {
    expect(typeof formatTimelineDuration).toBe('function');
  });

  it('exports formatTimelineTimestamp as a function', () => {
    expect(typeof formatTimelineTimestamp).toBe('function');
  });
});

// ── TimelineEvent type validation ───────────────────────────────────

describe('TimelineEvent structure', () => {
  it('creates a valid event with all fields', () => {
    const event = makeEvent();
    expect(event.id).toBe('tl-0');
    expect(event.toolName).toBe('web_search');
    expect(event.status).toBe('success');
    expect(event.durationMs).toBe(1200);
    expect(event.fullInput).toEqual({ query: 'AI news' });
  });

  it('creates an error event', () => {
    const event = makeEvent({ status: 'error', toolName: 'read_file' });
    expect(event.status).toBe('error');
  });

  it('supports nested children for sub-agent events', () => {
    const child1 = makeEvent({ id: 'tl-1', toolName: 'web_search' });
    const child2 = makeEvent({ id: 'tl-2', toolName: 'save_memory' });
    const parent = makeEvent({
      id: 'tl-0',
      toolName: 'spawn_agent',
      children: [child1, child2],
    });

    expect(parent.children).toHaveLength(2);
    expect(parent.children![0].toolName).toBe('web_search');
    expect(parent.children![1].toolName).toBe('save_memory');
  });

  it('empty events array is valid', () => {
    const events: TimelineEvent[] = [];
    expect(events).toHaveLength(0);
  });
});
