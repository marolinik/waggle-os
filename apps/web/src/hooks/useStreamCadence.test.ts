/**
 * Pillar 3.1 — render-side streaming cadence buffer.
 *
 * Locks the four contract points from the lane spec:
 *  1. Not-streaming / history text is whole on first paint (no cadence).
 *  2. Zero added latency: the first chunk's first chars reveal within one rAF,
 *     and a live stream drains fully within ≤1 frame of stream end.
 *  3. Reduced-motion snaps to full text (REDUCED.streamingCaret = static).
 *  4. A chunked code-block + list reveals monotonically as an escaped prefix —
 *     no whole-block pop, never chars beyond the accumulated raw.
 *
 * rAF is stubbed with a manual queue so the reveal is deterministic frame-by-frame.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const motionMock = vi.hoisted(() => ({ reduce: false }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => motionMock.reduce }));

import { useStreamCadence, MIN_CHARS_PER_FRAME } from './useStreamCadence';

let rafQueue: Map<number, FrameRequestCallback>;
let rafId: number;
let vt: number;

beforeEach(() => {
  motionMock.reduce = false;
  rafQueue = new Map();
  rafId = 0;
  vt = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Advance `n` animation frames, running each pending callback inside act(). */
function flushFrames(n = 1) {
  for (let i = 0; i < n; i++) {
    vt += 16;
    const pending = [...rafQueue.entries()];
    rafQueue.clear();
    act(() => {
      for (const [, cb] of pending) cb(vt);
    });
  }
}

describe('useStreamCadence', () => {
  it('renders settled / history text whole on the first paint (no cadence when not streaming)', () => {
    const { result } = renderHook(() => useStreamCadence('A finished reply.', false));
    expect(result.current.shown).toBe('A finished reply.');
    expect(result.current.caretVisible).toBe(false);
  });

  it('shows the first chars within a single rAF — zero buffering before first paint', () => {
    const { result } = renderHook(() => useStreamCadence('Hello', true));
    // Nothing buffered on mount; the reveal begins on the first frame, not before.
    expect(result.current.shown).toBe('');
    expect(result.current.caretVisible).toBe(false);
    flushFrames(1);
    expect(result.current.shown.length).toBeGreaterThanOrEqual(MIN_CHARS_PER_FRAME);
    expect('Hello'.startsWith(result.current.shown)).toBe(true);
    expect(result.current.caretVisible).toBe(true);
  });

  it('reduced-motion snaps to full text with a (static) caret while streaming', () => {
    motionMock.reduce = true;
    const { result } = renderHook(() => useStreamCadence('Reduced stream', true));
    // No frame flush needed — reduced motion reveals everything at once.
    expect(result.current.shown).toBe('Reduced stream');
    expect(result.current.caretVisible).toBe(true);
  });

  it('backlog scales the per-frame reveal so a whole-block dump accretes (never pops)', () => {
    const dump = 'x'.repeat(600); // an echo-provider whole-block arrival
    const { result } = renderHook(() => useStreamCadence(dump, true));
    flushFrames(1);
    const afterOne = result.current.shown.length;
    // First frame reveals far more than the per-char floor (backlog / CATCHUP),
    // yet never the whole block at once — a smooth accretion, not a pop.
    expect(afterOne).toBeGreaterThan(MIN_CHARS_PER_FRAME);
    expect(afterOne).toBeLessThan(dump.length);
  });

  it('reveals a chunked code block + list monotonically as an escaped prefix', () => {
    const chunks = [
      'Here is a snippet:\n',
      '```\nconst x = 1;\n',
      'console.log(x);\n```\n',
      '- first item\n',
      '- second item',
    ];
    let acc = '';
    const { result, rerender } = renderHook(
      ({ r, s }: { r: string; s: boolean }) => useStreamCadence(r, s),
      { initialProps: { r: '', s: true } },
    );
    const lengths: number[] = [result.current.shown.length];
    for (const c of chunks) {
      acc += c;
      rerender({ r: acc, s: true });
      for (let f = 0; f < 8; f++) {
        flushFrames(1);
        // `shown` is always a prefix of the accumulated raw — the cadence never
        // reveals unbuffered chars, so partial markdown can only form as text.
        expect(acc.startsWith(result.current.shown)).toBe(true);
        lengths.push(result.current.shown.length);
      }
    }
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }
    // Stream end snaps to the whole text within ≤1 frame; caret clears.
    rerender({ r: acc, s: false });
    expect(result.current.shown).toBe(acc);
    expect(result.current.caretVisible).toBe(false);
  });

  it('drains to the whole text within ≤1 frame of stream end', () => {
    const full = 'partial reveal that is still in progress here';
    const { result, rerender } = renderHook(
      ({ r, s }: { r: string; s: boolean }) => useStreamCadence(r, s),
      { initialProps: { r: full, s: true } },
    );
    flushFrames(1); // only a small prefix revealed so far
    expect(result.current.shown.length).toBeLessThan(full.length);
    rerender({ r: full, s: false }); // stream ends
    expect(result.current.shown).toBe(full);
  });

  it('never reveals past a shrunk target (defensive prefix clamp on reset)', () => {
    const { result, rerender } = renderHook(
      ({ r, s }: { r: string; s: boolean }) => useStreamCadence(r, s),
      { initialProps: { r: 'a long streaming string here', s: true } },
    );
    flushFrames(30); // caught up to the long target
    rerender({ r: 'short', s: true }); // target shrank underneath us
    expect(result.current.shown.length).toBeLessThanOrEqual('short'.length);
    expect('short'.startsWith(result.current.shown)).toBe(true);
  });
});
