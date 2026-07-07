/**
 * Lane SR — home day-story scroll-reveal (Path-to-9 Pillar 1.1 entrance).
 *
 * Locks the reveal contract:
 *  - Motion allowed + IntersectionObserver present: a section starts hidden
 *    (opacity 0, data-reveal="pending") and, on entering the viewport, plays the
 *    shared `card-enter` rise/fade (data-reveal="in") exactly once per visit —
 *    the observer disconnects on first intersection and scrolling back up (a
 *    later non-intersecting callback) never re-hides it.
 *  - Reduced motion: visible from first paint, no hidden state, no animation,
 *    and NO observer is ever created (REDUCED: rise/fade off).
 *  - No IntersectionObserver (jsdom default / very old engines): the same
 *    visible-always passthrough — content is never gated behind an observer that
 *    can't fire.
 *
 * framer-motion's `useReducedMotion` caches globally, so it's mocked to a
 * hoisted toggle (the real `motion` primitives are untouched here anyway).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ reduce: false }));
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => h.reduce };
});

import { RevealSection } from './HomeReveal';

// ── Mock IntersectionObserver — records instances so a test can fire entries ──
class MockIO {
  static instances: MockIO[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnected = false;
  root: Element | null = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIO.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  fire(isIntersecting: boolean) {
    act(() => {
      this.callback(
        [{ isIntersecting, target: this.observed[0] } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    });
  }
}

const ORIGINAL_IO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
function setIO(ctor: unknown) {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = ctor;
}

beforeEach(() => {
  h.reduce = false;
  MockIO.instances = [];
  setIO(MockIO);
});
afterEach(() => {
  cleanup();
  setIO(ORIGINAL_IO);
});

function wrapper() {
  return screen.getByTestId('reveal-child').parentElement as HTMLElement;
}

describe('RevealSection (Lane SR)', () => {
  it('always renders its children', () => {
    render(<RevealSection><p data-testid="reveal-child">Day story</p></RevealSection>);
    expect(screen.getByText('Day story')).toBeInTheDocument();
  });

  it('starts hidden and rises/fades in on first intersection — card-enter, once per visit', () => {
    render(<RevealSection><p data-testid="reveal-child">Start here</p></RevealSection>);

    // Pending: invisible, marked, and an observer is watching the wrapper.
    const el = wrapper();
    expect(el.getAttribute('data-reveal')).toBe('pending');
    expect(el.style.opacity).toBe('0');
    expect(MockIO.instances).toHaveLength(1);
    const io = MockIO.instances[0];
    expect(io.observed[0]).toBe(el);

    // Enters the viewport → reveals with the shared card-enter rise/fade.
    io.fire(true);
    expect(el.getAttribute('data-reveal')).toBe('in');
    expect(el.style.animation).toContain('card-enter');
    expect(el.style.opacity).not.toBe('0');
    // Once per visit: the observer is torn down on first intersection.
    expect(io.disconnected).toBe(true);
  });

  it('does NOT re-hide when scrolled back up (a later non-intersecting entry)', () => {
    render(<RevealSection><p data-testid="reveal-child">Pick up</p></RevealSection>);
    const io = MockIO.instances[0];
    io.fire(true);
    expect(wrapper().getAttribute('data-reveal')).toBe('in');

    // Scroll-up: the observer would report isIntersecting=false — reveal holds.
    io.fire(false);
    expect(wrapper().getAttribute('data-reveal')).toBe('in');
    expect(wrapper().style.animation).toContain('card-enter');
  });

  it('reduced motion → visible immediately, no animation, no observer created', () => {
    h.reduce = true;
    render(<RevealSection><p data-testid="reveal-child">While you slept</p></RevealSection>);
    const el = wrapper();
    expect(el.getAttribute('data-reveal')).toBeNull();
    expect(el.style.opacity).toBe('');
    expect(el.style.animation).toBe('');
    expect(MockIO.instances).toHaveLength(0);
  });

  it('no IntersectionObserver → visible immediately (passthrough, no observer)', () => {
    setIO(undefined);
    render(<RevealSection><p data-testid="reveal-child">Up next</p></RevealSection>);
    const el = wrapper();
    expect(el.getAttribute('data-reveal')).toBeNull();
    expect(el.style.opacity).toBe('');
    expect(screen.getByText('Up next')).toBeInTheDocument();
  });
});
