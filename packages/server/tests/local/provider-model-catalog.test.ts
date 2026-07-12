import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProviderModelCache,
  discoverProviderModels,
} from '../../src/local/provider-model-catalog.js';

describe('provider model catalog discovery', () => {
  beforeEach(() => {
    clearProviderModelCache();
  });

  it('exposes newly returned provider models with stable provider/model ids', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: [{ id: 'new-model-v9', name: 'New Model v9', owned_by: 'provider' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await discoverProviderModels('openai', 'test-key', undefined, { fetchImpl });

    expect(result.status).toBe('provider-api');
    expect(result.models).toEqual([{
      id: 'openai/new-model-v9',
      name: 'New Model v9',
      cost: '$$',
      speed: 'medium',
      source: 'provider-api',
      ownedBy: 'provider',
    }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
  });

  it('normalizes Google model resource names without dropping new entries', async () => {
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({
        models: [{ name: 'models/gemini-new', displayName: 'Gemini New' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await discoverProviderModels('google', 'google-key', undefined, { fetchImpl });

    expect(result.models[0]?.id).toBe('google/gemini-new');
    expect(result.models[0]?.name).toBe('Gemini New');
    expect(requestedUrl).toContain('pageSize=1000');
    expect(requestedUrl).not.toContain('google-key');
    expect(requestedInit?.headers).toEqual({ 'x-goog-api-key': 'google-key' });
  });

  it('collects every Anthropic cursor page instead of stopping at the default first 20', async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const afterId = new URL(url).searchParams.get('after_id');
      return new Response(JSON.stringify(afterId
        ? { data: [{ id: 'model-from-page-two' }], has_more: false, last_id: 'model-from-page-two' }
        : { data: [{ id: 'model-from-page-one' }], has_more: true, last_id: 'model-from-page-one' }),
      { status: 200 });
    });

    const result = await discoverProviderModels('anthropic', 'anthropic-key', undefined, { fetchImpl });

    expect(result.models.map((model) => model.id)).toEqual([
      'anthropic/model-from-page-one',
      'anthropic/model-from-page-two',
    ]);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain('limit=1000');
    expect(requestedUrls[1]).toContain('after_id=model-from-page-one');
  });

  it('collects every Gemini page token while preserving API authentication', async () => {
    const requestedUrls: string[] = [];
    const requestedHeaders: Array<HeadersInit | undefined> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requestedUrls.push(url);
      requestedHeaders.push(init?.headers);
      const pageToken = new URL(url).searchParams.get('pageToken');
      return new Response(JSON.stringify(pageToken
        ? { models: [{ name: 'models/gemini-page-two' }] }
        : { models: [{ name: 'models/gemini-page-one' }], nextPageToken: 'next token' }),
      { status: 200 });
    });

    const result = await discoverProviderModels('google', 'google-key', undefined, { fetchImpl });

    expect(result.models.map((model) => model.id)).toEqual([
      'google/gemini-page-one',
      'google/gemini-page-two',
    ]);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain('pageToken=next+token');
    expect(requestedUrls[1]).not.toContain('google-key');
    expect(requestedHeaders[1]).toEqual({ 'x-goog-api-key': 'google-key' });
  });

  it('keeps the last-known catalog and marks it stale during a provider outage', async () => {
    let callCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ data: [{ id: 'stable-model' }] }), { status: 200 });
      }
      throw new Error('provider offline');
    });

    const first = await discoverProviderModels('deepseek', 'same-key', undefined, { fetchImpl });
    const second = await discoverProviderModels('deepseek', 'same-key', undefined, { fetchImpl });

    expect(first.status).toBe('provider-api');
    expect(second.status).toBe('stale-provider-api');
    expect(second.models.map((model) => model.id)).toEqual(['deepseek/stable-model']);
    expect(second.error).toContain('provider offline');
  });
});
