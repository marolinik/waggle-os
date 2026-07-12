import { beforeEach, describe, expect, it, vi } from 'vitest';
import LocalAdapter from './adapter';

describe('model router request deadlines', () => {
  let client: LocalAdapter;

  beforeEach(() => {
    client = new LocalAdapter('http://127.0.0.1:3333');
  });

  it('allows provider discovery and managed router startup to finish', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      ok: true,
      model: 'openai/new-model',
      configured: true,
      verified: true,
      running: true,
      models: ['openai/new-model'],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await client.setModel('openai/new-model');
    await client.probeModel('openai/new-model');
    await client.setProviderKey('openai', 'secret');
    await client.restartModelRouter();

    expect(fetchSpy.mock.calls.map((call) => call[2])).toEqual([
      45_000,
      45_000,
      45_000,
      45_000,
    ]);
  });
});
