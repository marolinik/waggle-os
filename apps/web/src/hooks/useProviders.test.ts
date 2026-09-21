import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProviders: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({
  adapter: { getProviders: mocks.getProviders },
}));

import { useProviders } from './useProviders';

function catalog(modelId: string) {
  return {
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasKey: true,
      badge: null,
      keyUrl: null,
      requiresKey: true,
      models: [{ id: modelId, name: modelId, cost: '$$', speed: 'medium' }],
      modelsSource: 'provider-api' as const,
    }],
    search: [],
    activeSearch: 'duckduckgo',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.getProviders.mockResolvedValue(catalog('openai/existing-model'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useProviders live catalog refresh', () => {
  it('makes a discovered keyless compatible endpoint routable without pretending it has a key', async () => {
    mocks.getProviders.mockResolvedValue({
      providers: [{
        id: 'openai-compatible',
        name: 'OpenAI-compatible',
        hasKey: false,
        badge: 'Custom endpoint',
        keyUrl: null,
        requiresKey: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api' as const,
      }],
      search: [],
      activeSearch: 'duckduckgo',
    });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeProviders.map((provider) => provider.id))
      .toEqual(['openai-compatible']);
    expect(result.current.availableModels.map((model) => model.id))
      .toEqual(['openai-compatible/qwen3.8-flash-next']);
    expect(result.current.availableModels[0]?.hasKey).toBe(false);
  });

  it('keeps an unconfigured compatible endpoint out of active providers and available models', async () => {
    mocks.getProviders.mockResolvedValue({
      providers: [{
        id: 'openai-compatible',
        name: 'OpenAI-compatible',
        hasKey: false,
        badge: 'Custom endpoint',
        keyUrl: null,
        requiresKey: false,
        models: [],
        modelsSource: 'requires-endpoint' as const,
      }],
      search: [],
      activeSearch: 'duckduckgo',
    });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeProviders).toEqual([]);
    expect(result.current.availableModels).toEqual([]);
  });

  it('requires a fresh compatible catalog before exposing its models', async () => {
    mocks.getProviders.mockResolvedValue({
      providers: [{
        id: 'openai-compatible',
        name: 'OpenAI-compatible',
        hasKey: false,
        badge: 'Custom endpoint',
        keyUrl: null,
        requiresKey: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'stale-provider-api' as const,
      }],
      search: [],
      activeSearch: 'duckduckgo',
    });

    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeProviders).toEqual([]);
    expect(result.current.availableModels).toEqual([]);
  });

  it('ignores an older refresh that finishes after a newer provider response', async () => {
    const older = deferred<ReturnType<typeof catalog>>();
    const newer = deferred<ReturnType<typeof catalog>>();
    mocks.getProviders
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = renderHook(() => useProviders());
    await waitFor(() => expect(mocks.getProviders).toHaveBeenCalledTimes(1));

    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(mocks.getProviders).toHaveBeenCalledTimes(2));
    await act(async () => { newer.resolve(catalog('openai/newest-model')); });
    await waitFor(() => expect(result.current.availableModels[0]?.id).toBe('openai/newest-model'));

    await act(async () => { older.resolve(catalog('openai/obsolete-model')); });
    expect(result.current.availableModels[0]?.id).toBe('openai/newest-model');
  });

  it('pulls the provider API again when Waggle regains focus', async () => {
    mocks.getProviders
      .mockResolvedValueOnce(catalog('openai/existing-model'))
      .mockResolvedValueOnce(catalog('openai/model-released-while-open'));

    const { result, unmount } = renderHook(() => useProviders());
    await waitFor(() => expect(result.current.availableModels[0]?.id)
      .toBe('openai/existing-model'));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.availableModels[0]?.id)
      .toBe('openai/model-released-while-open'));
    expect(mocks.getProviders).toHaveBeenCalledTimes(2);

    unmount();
    window.dispatchEvent(new Event('focus'));
    expect(mocks.getProviders).toHaveBeenCalledTimes(2);
  });
});
