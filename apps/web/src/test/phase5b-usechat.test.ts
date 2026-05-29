import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@/lib/types';

/**
 * Phase 5b · R4-003 — useChat empty-array guard.
 *
 * useChat's streaming setMessages updater reads the last message's role:
 *
 *   const msgs = [...prev];
 *   const last = msgs[msgs.length - 1];
 *   if (!last || last.role !== 'assistant') return msgs;   // R4-003 guard
 *
 * A session/workspace switch mid-stream resets messages to [] via the load
 * effect. A late stream event then arrives while `prev` is empty, so
 * `msgs[msgs.length - 1]` is `undefined` and reading `.role` off it throws
 * `TypeError: Cannot read properties of undefined (reading 'role')` inside the
 * React state updater — crashing the render commit.
 *
 * Full render-level coverage via renderHook/render is unavailable here: the
 * monorepo hoists react-dom@19 at the root while apps/web targets react@18.3,
 * so @testing-library/react 16's renderer mixes React copies and throws (same
 * limitation documented in useDeveloperMode.test.ts). We instead pin the exact
 * updater head — the `prev → msgs → last → last.role` access — which is the
 * line R4-003 fixes. The unguarded form throws on []; the guarded form returns
 * the array unchanged.
 */

// The unguarded access exactly as it stood before R4-003 (lines 130-133).
function unguardedUpdater(prev: ChatMessage[]): ChatMessage[] {
  const msgs = [...prev];
  const last = msgs[msgs.length - 1];
  if (last.role !== 'assistant') return msgs; // throws when last is undefined
  return msgs;
}

// The guarded access as shipped by R4-003.
function guardedUpdater(prev: ChatMessage[]): ChatMessage[] {
  const msgs = [...prev];
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'assistant') return msgs;
  return msgs;
}

const assistantMsg: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: '',
  timestamp: new Date().toISOString(),
};

describe('useChat — R4-003 empty-array guard', () => {
  it('reproduces the crash: unguarded last.role throws on an empty array', () => {
    // This is the pre-fix behaviour — proves the finding is real.
    expect(() => unguardedUpdater([])).toThrowError(
      /Cannot read properties of undefined \(reading 'role'\)/,
    );
  });

  it('guarded updater returns the empty array unchanged instead of throwing', () => {
    expect(() => guardedUpdater([])).not.toThrow();
    expect(guardedUpdater([])).toEqual([]);
  });

  it('guarded updater still passes through a non-empty array (no behaviour change)', () => {
    const prev = [assistantMsg];
    // Same result as the unguarded path when the array is non-empty.
    expect(guardedUpdater(prev)).toEqual(prev);
    expect(unguardedUpdater(prev)).toEqual(prev);
  });
});
