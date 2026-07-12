/**
 * R20 Lane CL (item 1) — the boot screen carries ZERO lingering animation under
 * prefers-reduced-motion.
 *
 * The two repeating keyframe loops on the boot surface are (a) the logo glow
 * `boxShadow` breath (gated in A2) and (b) the active phase-dot `scale` pulse
 * (gated here). Both are expressed as ARRAY-valued `animate` props — a keyframe
 * sequence. The background radial (`bg-primary/5 blur`) is a static <div>, not a
 * motion element, so it needs no gating.
 *
 * framer-motion is stubbed to plain DOM and surfaces each element's `animate`
 * prop as `data-animate`, so the reduced-motion contract is assertable: under
 * reduce, no element may carry an array-valued (keyframe-loop) animate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

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
      // Surface `animate` so the reduced-motion keyframe-loop contract is testable.
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

import BootScreen from '@/components/os/BootScreen';

/** Count elements whose `animate` prop contains an array value — i.e. a
 *  keyframe sequence / lingering loop (glow breath, dot pulse). One-shot
 *  entrances use single values and are not counted. */
function keyframeLoopCount(container: HTMLElement): number {
  let count = 0;
  container.querySelectorAll('[data-animate]').forEach((el) => {
    try {
      const a = JSON.parse(el.getAttribute('data-animate') ?? 'null');
      if (a && typeof a === 'object' && Object.values(a).some((v) => Array.isArray(v))) count++;
    } catch { /* non-JSON animate — ignore */ }
  });
  return count;
}

describe('BootScreen — reduced-motion glow/pulse freeze (R20 Lane CL item 1)', () => {
  beforeEach(() => { h.reduce = false; vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

  it('runs keyframe-loop animation (logo glow + active dot pulse) with motion enabled', () => {
    const { container } = render(<BootScreen onComplete={vi.fn()} ready />);
    // At least the logo glow breath and the active phase-dot scale pulse loop.
    expect(keyframeLoopCount(container)).toBeGreaterThanOrEqual(1);
  });

  it('renders the boot logo with stable intrinsic dimensions', () => {
    render(<BootScreen onComplete={vi.fn()} ready />);
    const logo = screen.getByAltText('Waggle AI');
    expect(logo).toHaveAttribute('width', '80');
    expect(logo).toHaveAttribute('height', '80');
  });

  it('freezes ALL keyframe loops under prefers-reduced-motion — zero lingering animation', () => {
    h.reduce = true;
    const { container } = render(<BootScreen onComplete={vi.fn()} ready />);
    // No element may carry an array-valued (keyframe) animate: the logo glow is
    // undefined and every phase dot resolves to an empty {} under reduce.
    expect(keyframeLoopCount(container)).toBe(0);
  });
});
