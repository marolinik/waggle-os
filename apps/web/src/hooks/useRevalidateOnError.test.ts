/**
 * P1b D3 plus-clause — useRevalidateOnError listener mechanics: fires only
 * while errored, on all four triggers (online / visibilitychange→visible /
 * focus / waggle:connect-settled), and detaches on recovery.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useRevalidateOnError, CONNECT_SETTLED_EVENT } from './useRevalidateOnError';

afterEach(cleanup);

describe('useRevalidateOnError', () => {
  it('does nothing while healthy', () => {
    const fn = vi.fn();
    renderHook(() => useRevalidateOnError(false, fn));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new CustomEvent(CONNECT_SETTLED_EVENT));
    expect(fn).not.toHaveBeenCalled();
  });

  it.each(['online', 'focus', CONNECT_SETTLED_EVENT])('fires on %s while errored', (eventName) => {
    const fn = vi.fn();
    renderHook(() => useRevalidateOnError(true, fn));
    window.dispatchEvent(new Event(eventName));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('fires on visibilitychange only when the document becomes visible', () => {
    const fn = vi.fn();
    renderHook(() => useRevalidateOnError(true, fn));
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fn).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fn).toHaveBeenCalledOnce();
    visibility.mockRestore();
  });

  it('detaches when errored flips false (recovery)', () => {
    const fn = vi.fn();
    const { rerender } = renderHook(({ errored }) => useRevalidateOnError(errored, fn), {
      initialProps: { errored: true },
    });
    rerender({ errored: false });
    window.dispatchEvent(new Event('focus'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('always invokes the LATEST callback (ref pattern survives re-renders)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useRevalidateOnError(true, fn), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    window.dispatchEvent(new Event('focus'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
