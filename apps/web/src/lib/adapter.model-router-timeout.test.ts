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

  it('tests a candidate compatible endpoint without saving it and with the model-router deadline', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      valid: true,
      verified: true,
      baseUrl: 'http://10.33.0.153:4000/v1',
      model: 'openai-compatible/qwen3.8-flash-next',
      models: [{ id: 'openai-compatible/qwen3.8-flash-next', name: 'Qwen' }],
      modelsSource: 'provider-api',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await client.testCompatibleProvider(
      'http://10.33.0.153:4000/v1',
      undefined,
      'openai-compatible/qwen3.8-flash-next',
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/settings/test-compatible',
      {
        method: 'POST',
        body: JSON.stringify({
          baseUrl: 'http://10.33.0.153:4000/v1',
          model: 'openai-compatible/qwen3.8-flash-next',
        }),
      },
      60_000,
    );
  });

  it('allows chat time-to-first-token to exceed the generic request timeout', async () => {
    const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(new Response([
      'event: done',
      'data: {"content":"ok"}',
      '',
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));

    const events = [];
    for await (const event of client.sendMessage(
      'workspace-1',
      'hello',
      'session-1',
      'writer',
      undefined,
      undefined,
      'openai/requested-model',
    )) {
      events.push(event);
    }

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[2]).toBe(45_000);
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      workspaceId: 'workspace-1',
      message: 'hello',
      sessionId: 'session-1',
      persona: 'writer',
      model: 'openai/requested-model',
    });
    expect(events).toEqual([{ type: 'done', data: { content: 'ok' } }]);
  });
});
