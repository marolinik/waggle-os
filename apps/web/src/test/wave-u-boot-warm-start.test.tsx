/**
 * Wave U Lane D — boot warm-start floor.
 *
 * The boot screen used a FIXED ~2.3s choreography floor before it called
 * onComplete, so returning users sat through dead air even when the shell's
 * data was already warm. It now enforces a PERCEPTUAL floor (MIN_BRAND_MS) and
 * exits the instant `ready` is true — but holds past the floor while deps are
 * genuinely unresolved (ready=false, e.g. onboarding status still probing).
 * Manual skip (click / any key) exits at any time. Item 2: the exit stays a
 * choreographed fade at the shorter floor, and collapses to an instant swap
 * under reduced motion.
 *
 * framer-motion is stubbed to plain DOM so the timer logic is deterministic
 * under fake timers, and so the exit/transition props are assertable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

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
      // Surface exit/transition so the fade / instant-swap contract is assertable.
      if (props.transition !== undefined) passed['data-motion-transition'] = JSON.stringify(props.transition);
      if (props.exit !== undefined) passed['data-motion-exit'] = JSON.stringify(props.exit);
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

const BOOT = 'boot-screen';

describe('BootScreen — perceptual warm-start floor (Wave U Lane D)', () => {
  beforeEach(() => { h.reduce = false; vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

  it('does NOT exit before the brand-moment floor even when ready', () => {
    const onComplete = vi.fn();
    render(<BootScreen onComplete={onComplete} ready />);
    act(() => { vi.advanceTimersByTime(700); }); // < MIN_BRAND_MS (850)
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('exits once (and only once) at the floor when deps are ready', () => {
    const onComplete = vi.fn();
    render(<BootScreen onComplete={onComplete} ready />);
    act(() => { vi.advanceTimersByTime(900); }); // > floor
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Advancing further must not re-fire — the old fixed-floor path chained its
    // own exit timer; the ref guard makes every later path a no-op.
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('holds past the floor while deps are unresolved (ready=false)', () => {
    const onComplete = vi.fn();
    render(<BootScreen onComplete={onComplete} ready={false} />);
    act(() => { vi.advanceTimersByTime(4000); }); // well past floor + the old ~2.3s ceiling
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('exits promptly once deps resolve after the floor', () => {
    const onComplete = vi.fn();
    const { rerender } = render(<BootScreen onComplete={onComplete} ready={false} />);
    act(() => { vi.advanceTimersByTime(1200); }); // floor elapsed, still not ready
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { rerender(<BootScreen onComplete={onComplete} ready />); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('manual skip (click) exits immediately regardless of readiness', () => {
    const onComplete = vi.fn();
    render(<BootScreen onComplete={onComplete} ready={false} />);
    act(() => { fireEvent.click(screen.getByTestId(BOOT)); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('exit stays a choreographed fade at the shorter floor', () => {
    render(<BootScreen onComplete={vi.fn()} ready />);
    const root = screen.getByTestId(BOOT);
    expect(JSON.parse(root.getAttribute('data-motion-exit') ?? '{}')).toMatchObject({ opacity: 0, scale: 1.05 });
    expect(JSON.parse(root.getAttribute('data-motion-transition') ?? '{}').duration).toBe(0.5);
  });

  it('reduced motion → instant swap on exit (no fade, no scale)', () => {
    h.reduce = true;
    render(<BootScreen onComplete={vi.fn()} ready />);
    const root = screen.getByTestId(BOOT);
    const exit = JSON.parse(root.getAttribute('data-motion-exit') ?? '{}');
    expect(exit).toEqual({ opacity: 0 });
    expect(JSON.parse(root.getAttribute('data-motion-transition') ?? '{}').duration).toBe(0);
  });

  // Lane H item 5 — a warm (cache-first) session exits at the shorter ≤500ms
  // brand flash, well before the cold 850ms floor a returning-user boot used to
  // sit through with content already waiting behind it.
  it('warm session exits at the shorter ≤500ms floor when ready', () => {
    const onComplete = vi.fn();
    render(<BootScreen onComplete={onComplete} ready warm />);
    act(() => { vi.advanceTimersByTime(450); }); // < WARM_BRAND_MS (500)
    expect(onComplete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); }); // now past 500 — a cold boot (850) would still be waiting
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
