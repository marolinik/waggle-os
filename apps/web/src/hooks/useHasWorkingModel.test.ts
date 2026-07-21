import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
    probeModel: vi.fn(),
    probeProvider: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { useHasWorkingModel } from './useHasWorkingModel';

const providerRows = (...rows: Array<{ id: string; hasKey: boolean; requiresKey: boolean }>) => ({
  providers: rows.map((row) => ({ ...row, name: row.id, badge: null, keyUrl: null, models: [] })),
  search: [],
  activeSearch: 'duckduckgo',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.adapter.getProviders.mockResolvedValue(providerRows());
  mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
  mocks.adapter.probeModel.mockResolvedValue({ model: null, configured: false, verified: false });
  mocks.adapter.probeProvider.mockResolvedValue({ configured: false, valid: false, verified: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('useHasWorkingModel', () => {
  it('no key and no local model → not ready', async () => {
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false, localReady: false });
    expect(mocks.adapter.probeModel).not.toHaveBeenCalled();
  });

  it('a verified default model is ready without provider fallback', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockResolvedValue({ model: 'p0/model', configured: true, verified: true });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: true, cloudReady: true });
    expect(mocks.adapter.probeProvider).not.toHaveBeenCalled();
  });

  it('a rejected default model blocks a keyed provider', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockResolvedValue({ model: 'p0/model', configured: true, verified: false, rejected: true });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
    expect(mocks.adapter.probeProvider).not.toHaveBeenCalled();
  });

  it('a transient default result remains usable after probing settles', async () => {
    const modelProbe = deferred<{ model: string; configured: boolean; verified: boolean }>();
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockReturnValue(modelProbe.promise);
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(1));
    expect(result.current).toMatchObject({ loading: true, cloudReady: false, hasWorkingModel: false });
    await act(async () => { modelProbe.resolve({ model: 'p0/model', configured: true, verified: false }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: true, cloudReady: true });
  });

  it('a keyed cloud provider is ready only after its fallback probe verifies it', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: true });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: true, cloudReady: true, localReady: false });
    expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(1);
    expect(mocks.adapter.probeProvider).toHaveBeenCalledWith('p0');
  });

  it('a rejected fallback provider is not ready', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: false, verified: true, error: 'rejected' });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
  });

  it('a valid but unverified fallback provider remains usable after probing settles', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: false });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: true, cloudReady: true });
  });

  it('all unconfigured probes are not ready', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
  });

  it('a pending cloud probe stays loading and non-ready', async () => {
    const modelProbe = deferred<{ model: string; configured: boolean; verified: boolean }>();
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockReturnValue(modelProbe.promise);
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(1));
    expect(result.current).toMatchObject({ loading: true, cloudReady: false, hasWorkingModel: false });
  });

  it('a detected local model overrides a rejected cloud default', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockResolvedValue({ model: 'p0/model', configured: true, verified: false, rejected: true });
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: true, totalLocalModels: 2 });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: true, cloudReady: false, localReady: true });
    expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(1);
  });

  it('an installed local runtime with zero models is not ready', async () => {
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: true, totalLocalModels: 0 });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, localReady: false });
  });

  it('does not count a keyless local provider as cloud readiness', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'ollama', hasKey: true, requiresKey: false }));
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: true, totalLocalModels: 2 });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ cloudReady: false, localReady: true, hasWorkingModel: true });
    expect(mocks.adapter.probeModel).not.toHaveBeenCalled();
  });

  it('a local-inference probe failure degrades to no local model', async () => {
    mocks.adapter.getLocalInferenceStatus.mockRejectedValue(new Error('ollama down'));
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ localReady: false, hasWorkingModel: false });
  });

  it('refresh reprobes unchanged provider ids after a key replacement', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel
      .mockResolvedValueOnce({ model: 'p0/model', configured: true, verified: true })
      .mockResolvedValueOnce({ model: 'p0/model', configured: true, verified: false, rejected: true });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.hasWorkingModel).toBe(true));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
  });

  it('a late old cloud success cannot overwrite a newer rejection', async () => {
    const oldProbe = deferred<{ model: string; configured: boolean; verified: boolean; rejected?: boolean }>();
    const newProbe = deferred<{ model: string; configured: boolean; verified: boolean; rejected?: boolean }>();
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockReturnValueOnce(oldProbe.promise).mockReturnValueOnce(newProbe.promise);
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(1));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(2));
    await act(async () => { newProbe.resolve({ model: 'p0/model', configured: true, verified: false, rejected: true }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { oldProbe.resolve({ model: 'p0/model', configured: true, verified: true }); });
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
  });

  it('a late old local positive result cannot overwrite a newer zero-model refresh', async () => {
    const oldLocal = deferred<{ servers: never[]; ollamaInstalled: boolean; totalLocalModels: number }>();
    const newLocal = deferred<{ servers: never[]; ollamaInstalled: boolean; totalLocalModels: number }>();
    mocks.adapter.getLocalInferenceStatus.mockReturnValueOnce(oldLocal.promise).mockReturnValueOnce(newLocal.promise);
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(mocks.adapter.getLocalInferenceStatus).toHaveBeenCalledTimes(1));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(mocks.adapter.getLocalInferenceStatus).toHaveBeenCalledTimes(2));
    await act(async () => { newLocal.resolve({ servers: [], ollamaInstalled: true, totalLocalModels: 0 }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { oldLocal.resolve({ servers: [], ollamaInstalled: true, totalLocalModels: 2 }); });
    expect(result.current.localReady).toBe(false);
  });

  it('reprobes a same-id provider array returned by a window-focus refresh', async () => {
    mocks.adapter.getProviders
      .mockResolvedValueOnce(providerRows({ id: 'p0', hasKey: true, requiresKey: true }))
      .mockResolvedValueOnce(providerRows({ id: 'p0', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel
      .mockResolvedValueOnce({ model: 'p0/model', configured: true, verified: true })
      .mockResolvedValueOnce({ model: 'p0/model', configured: true, verified: false, rejected: true });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.hasWorkingModel).toBe(true));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
  });

  it('treats unavailable fallback probes as transient usable readiness', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows(
      { id: 'p0', hasKey: true, requiresKey: true },
      { id: 'p1', hasKey: true, requiresKey: true },
    ));
    mocks.adapter.probeProvider.mockRejectedValue(new Error('sidecar offline'));
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: true, cloudReady: true });
  });

  it('uses only refreshed p1 results when an explicit refresh replaces p0', async () => {
    const oldP0Probe = deferred<{ configured: boolean; valid: boolean; verified: boolean }>();
    mocks.adapter.getProviders
      .mockResolvedValueOnce(providerRows({ id: 'p0', hasKey: true, requiresKey: true }))
      .mockResolvedValueOnce(providerRows({ id: 'p1', hasKey: true, requiresKey: true }));
    mocks.adapter.probeModel.mockResolvedValue({ model: null, configured: false, verified: false });
    mocks.adapter.probeProvider.mockImplementation((id: string) => id === 'p0'
      ? oldP0Probe.promise
      : Promise.resolve({ configured: true, valid: false, verified: true }));
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(mocks.adapter.probeProvider).toHaveBeenCalledWith('p0'));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(mocks.adapter.probeProvider).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(result.current).toMatchObject({ loading: false, cloudReady: false }));
    await act(async () => { oldP0Probe.resolve({ configured: true, valid: true, verified: true }); });
    expect(mocks.adapter.probeProvider.mock.calls.map(([id]) => id)).toEqual(['p0', 'p1']);
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false });
  });

  it('does no cloud work when unmounted during a deferred explicit provider refresh', async () => {
    const refreshProviders = deferred<ReturnType<typeof providerRows>>();
    mocks.adapter.getProviders
      .mockResolvedValueOnce(providerRows())
      .mockReturnValueOnce(refreshProviders.promise);
    const { result, unmount } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.refresh(); });
    unmount();
    await act(async () => { refreshProviders.resolve(providerRows({ id: 'p0', hasKey: true, requiresKey: true })); });
    expect(mocks.adapter.probeModel).not.toHaveBeenCalled();
  });
});
