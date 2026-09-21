import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSystemHealth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/adapter', () => ({
  adapter: { getSystemHealth },
}));

import { useOfflineStatus } from './useOfflineStatus';

describe('useOfflineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getSystemHealth.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps a transient health miss quiet and warns only once when offline is confirmed', async () => {
    getSystemHealth
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ status: 'ok' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOfflineStatus());

    await act(async () => { await Promise.resolve(); });
    expect(getSystemHealth).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(getSystemHealth).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(getSystemHealth).toHaveBeenCalledTimes(3);
    expect(result.current).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('counts one failed check when overlapping event probes share an in-flight request', async () => {
    let rejectHealth!: (reason: Error) => void;
    const pendingHealth = new Promise<never>((_resolve, reject) => {
      rejectHealth = reject;
    });
    getSystemHealth
      .mockReturnValueOnce(pendingHealth)
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOfflineStatus());

    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    expect(getSystemHealth).toHaveBeenCalledTimes(1);

    await act(async () => { rejectHealth(new TypeError('Failed to fetch')); });
    expect(result.current).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(getSystemHealth).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
