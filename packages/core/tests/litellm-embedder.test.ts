import { describe, it, expect, vi } from 'vitest';
import { createLiteLLMEmbedder } from '../src/mind/litellm-embedder.js';

describe('createLiteLLMEmbedder', () => {
  const baseConfig = {
    litellmUrl: 'http://localhost:4000/v1',
    litellmApiKey: 'sk-test',
    model: 'text-embedding',
    dimensions: 8,
  };

  function mockFetchOk(data: unknown) {
    return vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data,
    } as unknown as Response);
  }

  it('exposes the configured dimensions', () => {
    const embedder = createLiteLLMEmbedder({ ...baseConfig, dimensions: 256, fetch: mockFetchOk({}) });
    expect(embedder.dimensions).toBe(256);
  });

  it('defaults dimensions to 1024', () => {
    const embedder = createLiteLLMEmbedder({
      litellmUrl: 'http://localhost:4000/v1',
      fetch: mockFetchOk({}),
    });
    expect(embedder.dimensions).toBe(1024);
  });

  it('embed() calls the correct endpoint with Bearer auth', async () => {
    const fakeFetch = mockFetchOk({
      data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }],
    });

    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch });
    const result = await embedder.embed('hello world');

    expect(fakeFetch).toHaveBeenCalledOnce();
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/v1/embeddings');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer sk-test');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('text-embedding');
    expect(body.input).toBe('hello world');

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(8);
    expect(result[0]).toBeCloseTo(0.1);
  });

  it('embed() strips trailing /v1 to avoid double path', async () => {
    const fakeFetch = mockFetchOk({
      data: [{ embedding: [1, 2, 3, 4, 5, 6, 7, 8] }],
    });

    const embedder = createLiteLLMEmbedder({
      ...baseConfig,
      litellmUrl: 'http://localhost:4000/v1',
      fetch: fakeFetch,
    });
    await embedder.embed('test');

    const [url] = fakeFetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/v1/embeddings');
  });

  it('embedBatch() returns multiple Float32Arrays', async () => {
    const fakeFetch = mockFetchOk({
      data: [
        { embedding: [1, 2, 3, 4, 5, 6, 7, 8] },
        { embedding: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
    });

    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch });
    const results = await embedder.embedBatch(['hello', 'world']);

    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(Float32Array);
    expect(results[1]).toBeInstanceOf(Float32Array);
    expect(results[0][0]).toBe(1);
    expect(results[1][0]).toBe(8);

    // Should send array as input
    const body = JSON.parse(fakeFetch.mock.calls[0][1].body);
    expect(body.input).toEqual(['hello', 'world']);
  });

  it('embedBatch() returns empty array for empty input', async () => {
    const fakeFetch = vi.fn();
    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch });
    const results = await embedder.embedBatch([]);

    expect(results).toEqual([]);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('throws on API error when fallbackToMock is false', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as unknown as Response);

    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch, fallbackToMock: false });
    await expect(embedder.embed('test')).rejects.toThrow('LiteLLM embeddings error (500)');
  });

  it('falls back to mock on API error when fallbackToMock is true', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'error',
    } as unknown as Response);

    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch, fallbackToMock: true });
    const result = await embedder.embed('hello');

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(8);
    // Verify it's the deterministic mock: 'h' = 104, (104 - 128) / 128 = -0.1875
    expect(result[0]).toBeCloseTo(-0.1875);
  });

  it('falls back to mock on network error when fallbackToMock is true', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch, fallbackToMock: true });
    const result = await embedder.embed('hi');

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(8);
  });

  it('throws on network error when fallbackToMock is false', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const embedder = createLiteLLMEmbedder({ ...baseConfig, fetch: fakeFetch });
    await expect(embedder.embed('test')).rejects.toThrow('ECONNREFUSED');
  });

  it('omits Authorization header when no API key is provided', async () => {
    const fakeFetch = mockFetchOk({
      data: [{ embedding: [1, 2, 3, 4, 5, 6, 7, 8] }],
    });

    const embedder = createLiteLLMEmbedder({
      litellmUrl: 'http://localhost:4000/v1',
      dimensions: 8,
      fetch: fakeFetch,
    });
    await embedder.embed('test');

    const [, options] = fakeFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });
});
