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

beforeEach(() => {
  mocks.getProviders.mockResolvedValue(catalog('openai/existing-model'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useProviders live catalog refresh', () => {
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
