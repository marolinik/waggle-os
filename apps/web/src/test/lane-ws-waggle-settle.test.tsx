/**
 * Lane WS (path-to-9 Pillar 1.3) — the commissioned waggle-settle, judged
 * STANDALONE. This suite pins the two contracts that make it "the waggle" and
 * keep it safe:
 *
 *  1. Identity — the dancer animates a figure-eight TRANSLATION path (not a
 *     scale-pop): the `x` keyframes trace the Gerono lemniscate (two lobes,
 *     returns to origin). SPRING.expressive carries the settle.
 *  2. Reduced motion (REDUCED.settle = 'instant-state-color-pulse') — the dancer
 *     carries NO transform keyframe (static settled state); only the honey glow
 *     colour-pulses (an opacity pulse, no transform).
 *  3. Lifecycle — mounts only while `play`, calls `onDone` after the gesture.
 *  4. The SIGNATURE.full session gate — first-of-session + cooldown, idempotent.
 *
 * framer-motion is stubbed to plain DOM: each element's `animate` prop surfaces
 * as `data-animate` (JSON), so the keyframe contract is assertable without a
 * real animation engine — the same harness the BootScreen/HM lanes use.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const DROP = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants',
    'whileHover', 'whileTap', 'whileFocus', 'whileInView',
    'layout', 'layoutId', 'onAnimationComplete', 'custom',
  ]);
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: React.Ref<HTMLElement>) {
      const passed: Record<string, unknown> = {};
      for (const k of Object.keys(props)) if (!DROP.has(k)) passed[k] = props[k];
      if (props.animate !== undefined) passed['data-animate'] = JSON.stringify(props.animate);
      return React.createElement(tag, { ...passed, ref });
    });
  const motion = new Proxy({}, { get: (_t, tag: string) => make(tag) });
  return {
    __esModule: true,
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => h.reduce,
  };
});

import { WaggleSettle, WAGGLE_FIG8_X, WAGGLE_FIG8_Y, WAGGLE_TIMES, WAGGLE_WOBBLE_DEG } from '@/components/os/warm/WaggleSettle';
import {
  canFireFullSignature,
  recordFullSignature,
  claimFullSignature,
  readSignatureFullState,
  EMPTY_SIGNATURE_STATE,
  type SignatureFullState,
} from '@/components/os/warm/waggle-settle-gate';

function animateOf(el: Element | null): Record<string, unknown> | null {
  if (!el) return null;
  const raw = el.getAttribute('data-animate');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => {
  h.reduce = false;
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

// ── 1. Identity — the figure-eight path DNA ─────────────────────────────────
describe('Lane WS · figure-eight path DNA', () => {
  it('the x path is a two-lobe lemniscate that returns to origin', () => {
    expect(WAGGLE_FIG8_X).toHaveLength(9);
    expect(WAGGLE_FIG8_X[0]).toBe(0);
    expect(WAGGLE_FIG8_X[WAGGLE_FIG8_X.length - 1]).toBe(0);
    // Both lobes present: a positive AND a negative extreme (not a one-way pop).
    expect(Math.max(...WAGGLE_FIG8_X)).toBeGreaterThan(0);
    expect(Math.min(...WAGGLE_FIG8_X)).toBeLessThan(0);
  });

  it('the y path oscillates above and below the run line (the waggle crossbars)', () => {
    expect(WAGGLE_FIG8_Y).toHaveLength(9);
    expect(Math.max(...WAGGLE_FIG8_Y)).toBeGreaterThan(0);
    expect(Math.min(...WAGGLE_FIG8_Y)).toBeLessThan(0);
  });

  it('the body wobble decays and the keyframe times ascend 0→1', () => {
    expect(WAGGLE_WOBBLE_DEG[0]).toBe(0);
    expect(WAGGLE_WOBBLE_DEG[WAGGLE_WOBBLE_DEG.length - 1]).toBe(0);
    expect(WAGGLE_TIMES[0]).toBe(0);
    expect(WAGGLE_TIMES[WAGGLE_TIMES.length - 1]).toBe(1);
    for (let i = 1; i < WAGGLE_TIMES.length; i++) {
      expect(WAGGLE_TIMES[i]).toBeGreaterThan(WAGGLE_TIMES[i - 1]);
    }
  });
});

// ── 2. Component render contract ────────────────────────────────────────────
describe('Lane WS · WaggleSettle render contract', () => {
  it('renders nothing while play is false', () => {
    const { queryByTestId } = render(<WaggleSettle play={false} />);
    expect(queryByTestId('waggle-settle')).toBeNull();
  });

  it('motion: the dancer runs a figure-eight TRANSLATION (not a scale-pop)', () => {
    const { getByTestId } = render(<WaggleSettle play size={40} />);
    const dancer = animateOf(getByTestId('waggle-settle-dancer'));
    expect(dancer).toBeTruthy();
    // The identity is the translation path — x must be a keyframe array…
    expect(Array.isArray(dancer!.x)).toBe(true);
    const xs = dancer!.x as number[];
    expect(xs).toHaveLength(9);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeLessThan(0);
    // …and scale is a single settle value, NOT the driver of the gesture.
    expect(Array.isArray(dancer!.scale)).toBe(false);
    expect(dancer!.scale).toBe(1);
  });

  it('reduced motion: the dancer is static (no transform keyframe) — only the glow colour-pulses', () => {
    h.reduce = true;
    const { getByTestId } = render(<WaggleSettle play size={40} />);
    const dancer = animateOf(getByTestId('waggle-settle-dancer'));
    // Instant settled state — opacity only, and zero array-valued transforms.
    expect(dancer).toEqual({ opacity: 1 });
    const hasTransformKeyframe = Object.values(dancer!).some((v) => Array.isArray(v));
    expect(hasTransformKeyframe).toBe(false);
    // The colour pulse survives: the glow opacity-pulses (a colour pulse, no transform).
    const glow = animateOf(getByTestId('waggle-settle-glow'));
    expect(Array.isArray(glow!.opacity)).toBe(true);
    expect('scale' in glow!).toBe(false);
  });

  it('calls onDone after the gesture settles, not before', () => {
    vi.useFakeTimers();
    try {
      const onDone = vi.fn();
      render(<WaggleSettle play onDone={onDone} />);
      expect(onDone).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(300); });
      expect(onDone).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(400); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 3. The SIGNATURE.full session gate ──────────────────────────────────────
describe('Lane WS · SIGNATURE.full gate', () => {
  it('fires for the memory-saved moment on a fresh session', () => {
    expect(canFireFullSignature({ moment: 'memory-saved-first-of-session', state: EMPTY_SIGNATURE_STATE, now: 1000 })).toBe(true);
  });

  it('rejects an unrecognised (non-full-tier) moment', () => {
    expect(canFireFullSignature({ moment: 'send-arm', state: EMPTY_SIGNATURE_STATE, now: 1000 })).toBe(false);
  });

  it('spends a first-of-session moment once', () => {
    const spent: SignatureFullState = { lastFiredAt: 0, firedMoments: ['memory-saved-first-of-session'] };
    expect(canFireFullSignature({ moment: 'memory-saved-first-of-session', state: spent, now: 10_000_000 })).toBe(false);
  });

  it('blocks a different full moment while inside the cooldown, allows it after', () => {
    const state: SignatureFullState = { lastFiredAt: 1_000_000, firedMoments: ['memory-saved-first-of-session'] };
    // install-success is a different full moment; still cooling down.
    expect(canFireFullSignature({ moment: 'install-success', state, now: 1_000_000 + 30_000 })).toBe(false);
    // …past the 60s cooldown it is allowed.
    expect(canFireFullSignature({ moment: 'install-success', state, now: 1_000_000 + 61_000 })).toBe(true);
  });

  it('recordFullSignature is immutable and appends the moment', () => {
    const next = recordFullSignature(EMPTY_SIGNATURE_STATE, 'memory-saved-first-of-session', 5000);
    expect(EMPTY_SIGNATURE_STATE.firedMoments).toEqual([]); // original untouched
    expect(next.lastFiredAt).toBe(5000);
    expect(next.firedMoments).toEqual(['memory-saved-first-of-session']);
  });

  it('claimFullSignature is idempotent across the session (persists via sessionStorage)', () => {
    expect(claimFullSignature('memory-saved-first-of-session', 2000)).toBe(true);
    // A second claim in the same session (even much later) does not re-fire.
    expect(claimFullSignature('memory-saved-first-of-session', 5_000_000)).toBe(false);
    expect(readSignatureFullState().firedMoments).toEqual(['memory-saved-first-of-session']);
  });
});
