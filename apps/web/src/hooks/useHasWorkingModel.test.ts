/**
 * PR5 Phase A — the shared "≥1 working model" gate signal (cloud key OR local
 * model), composed from the same /api/providers data the Settings Models tab
 * reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { useHasWorkingModel } from './useHasWorkingModel';

const providers = (...withKey: boolean[]) => ({
  providers: withKey.map((hasKey, i) => ({ id: `p${i}`, name: `P${i}`, hasKey, badge: null, keyUrl: null, requiresKey: true, models: [] })),
  search: [],
  activeSearch: 'duckduckgo',
});

const providerRows = (...rows: Array<{ id: string; hasKey: boolean; requiresKey: boolean }>) => ({
  providers: rows.map((row) => ({ ...row, name: row.id, badge: null, keyUrl: null, models: [] })),
  search: [],
  activeSearch: 'duckduckgo',
});

beforeEach(() => {
  mocks.adapter.getProviders.mockResolvedValue(providers());
  mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('useHasWorkingModel', () => {
  it('no key and no local model → not ready', async () => {
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ hasWorkingModel: false, cloudReady: false, localReady: false });
  });

  it('a keyed cloud provider → cloudReady → working', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providers(false, true));
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.hasWorkingModel).toBe(true));
    expect(result.current.cloudReady).toBe(true);
    expect(result.current.localReady).toBe(false);
  });

  it('a detected local model (no cloud key) → localReady → working', async () => {
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: true, totalLocalModels: 2 });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.hasWorkingModel).toBe(true));
    expect(result.current.cloudReady).toBe(false);
    expect(result.current.localReady).toBe(true);
  });

  it('does not count keyless local providers as cloud keys', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providerRows({ id: 'ollama', hasKey: true, requiresKey: false }));
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: true, totalLocalModels: 2 });
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.hasWorkingModel).toBe(true));
    expect(result.current.cloudReady).toBe(false);
    expect(result.current.localReady).toBe(true);
  });

  it('a local-inference probe failure degrades to no-local (cloud can still pass)', async () => {
    mocks.adapter.getLocalInferenceStatus.mockRejectedValue(new Error('ollama down'));
    mocks.adapter.getProviders.mockResolvedValue(providers(true));
    const { result } = renderHook(() => useHasWorkingModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.localReady).toBe(false);
    expect(result.current.hasWorkingModel).toBe(true); // cloud key carries it
  });
});
