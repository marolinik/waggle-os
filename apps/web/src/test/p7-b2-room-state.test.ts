/**
 * P7/D15 B2 — useRoomState must expose connecting/error so RoomApp can tell a
 * broken SSE channel apart from an idle room (both rendered "No agents running"
 * before this fix). A subscribe failure → error + a reconnect affordance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: { subscribeSubagentStatus: vi.fn() },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { useRoomState } from '@/hooks/useRoomState';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('P7/B2 — useRoomState connection status', () => {
  it('settles to connected (no error) when subscribe succeeds', async () => {
    mocks.adapter.subscribeSubagentStatus.mockReturnValue(() => {});
    const { result } = renderHook(() => useRoomState());
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('exposes an error (not silent console) when subscribe throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.adapter.subscribeSubagentStatus.mockImplementation(() => { throw new Error('SSE 401'); });
    const { result } = renderHook(() => useRoomState());
    await waitFor(() => expect(result.current.error).toBe('SSE 401'));
    expect(result.current.connecting).toBe(false);
  });

  it('reconnect() re-attempts the subscription and clears the error on recovery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.adapter.subscribeSubagentStatus
      .mockImplementationOnce(() => { throw new Error('SSE 401'); })
      .mockReturnValueOnce(() => {});
    const { result } = renderHook(() => useRoomState());
    await waitFor(() => expect(result.current.error).toBe('SSE 401'));
    act(() => result.current.reconnect());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(mocks.adapter.subscribeSubagentStatus).toHaveBeenCalledTimes(2);
  });
});
