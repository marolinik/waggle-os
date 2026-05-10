import { describe, expect, it } from 'vitest';
import {
  ALL_EVENT_TYPES,
  ALL_SOURCES,
  isEventType,
  isShimSource,
} from '../src/hook-event-types.js';

describe('hook-event-types', () => {
  it('ALL_EVENT_TYPES contains the 7 canonical events', () => {
    expect([...ALL_EVENT_TYPES].sort()).toEqual([
      'post-tool-use',
      'pre-compact',
      'pre-tool-use',
      'session-end',
      'session-start',
      'stop',
      'user-prompt-submit',
    ]);
  });

  it('ALL_SOURCES contains the 6 supported IDEs', () => {
    expect([...ALL_SOURCES].sort()).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'hermes',
      'openclaw',
      'opencode',
    ]);
  });

  it('isEventType narrows known strings', () => {
    expect(isEventType('session-start')).toBe(true);
    expect(isEventType('user-prompt-submit')).toBe(true);
    expect(isEventType('pre-tool-use')).toBe(true);
  });

  it('isEventType rejects unknown / non-string values', () => {
    expect(isEventType('made-up-event')).toBe(false);
    expect(isEventType('')).toBe(false);
    expect(isEventType(null)).toBe(false);
    expect(isEventType(42)).toBe(false);
    expect(isEventType({ eventType: 'session-start' })).toBe(false);
  });

  it('isShimSource narrows known and rejects unknown', () => {
    expect(isShimSource('claude-code')).toBe(true);
    expect(isShimSource('codex')).toBe(true);
    expect(isShimSource('not-a-real-ide')).toBe(false);
    expect(isShimSource(undefined)).toBe(false);
  });
});
