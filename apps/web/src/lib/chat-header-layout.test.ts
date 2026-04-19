/**
 * M-21 / UX-6 — chat-header layout decision regression.
 *
 * Pins the threshold and classification so a future width tweak or
 * "let's move autonomy into the overflow too" refactor surfaces as a
 * failing test rather than a silent UX regression.
 */
import { describe, it, expect } from 'vitest';
import {
  CHAT_HEADER_COMPACT_THRESHOLD_PX,
  CHAT_HEADER_OVERFLOW_CONTROLS,
  CHAT_HEADER_PRIMARY_CONTROLS,
  shouldCollapseChatHeader,
} from './chat-header-layout';

describe('shouldCollapseChatHeader', () => {
  it('returns false when width is unknown (first render)', () => {
    expect(shouldCollapseChatHeader(null)).toBe(false);
    expect(shouldCollapseChatHeader(undefined)).toBe(false);
  });

  it('returns false for non-finite values (defensive against 0-sized containers)', () => {
    expect(shouldCollapseChatHeader(Number.NaN)).toBe(false);
    expect(shouldCollapseChatHeader(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('returns false at and above the threshold', () => {
    expect(shouldCollapseChatHeader(CHAT_HEADER_COMPACT_THRESHOLD_PX)).toBe(false);
    expect(shouldCollapseChatHeader(CHAT_HEADER_COMPACT_THRESHOLD_PX + 1)).toBe(false);
    expect(shouldCollapseChatHeader(1200)).toBe(false);
  });

  it('returns true below the threshold', () => {
    expect(shouldCollapseChatHeader(CHAT_HEADER_COMPACT_THRESHOLD_PX - 1)).toBe(true);
    expect(shouldCollapseChatHeader(320)).toBe(true);
    expect(shouldCollapseChatHeader(0)).toBe(true);
  });
});

describe('chat header control classification', () => {
  it('threshold is 480 px', () => {
    expect(CHAT_HEADER_COMPACT_THRESHOLD_PX).toBe(480);
  });

  it('overflow set is the informational chips only', () => {
    expect([...CHAT_HEADER_OVERFLOW_CONTROLS].sort()).toEqual(
      ['storage-type', 'team-presence'].sort(),
    );
  });

  it('primary set is the interactive controls that must not nest in a popover', () => {
    expect([...CHAT_HEADER_PRIMARY_CONTROLS].sort()).toEqual(
      ['persona-picker', 'autonomy-toggle', 'model-picker'].sort(),
    );
  });

  it('primary and overflow sets are disjoint', () => {
    const overflow = new Set(CHAT_HEADER_OVERFLOW_CONTROLS as readonly string[]);
    for (const primary of CHAT_HEADER_PRIMARY_CONTROLS) {
      expect(overflow.has(primary as string)).toBe(false);
    }
  });
});
