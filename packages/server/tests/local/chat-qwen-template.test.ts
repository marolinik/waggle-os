/**
 * Pins for the Qwen chat-template option on direct OpenAI-compatible
 * requests, through `runAgentLoop` with an injected fetch. No server is
 * needed (moved out of chat-api.test.ts, TD-TEST-7).
 */
import { describe, expect, it, vi } from 'vitest';
import { runAgentLoop } from '@waggle/agent';

function openAiSseResponse(content: string): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`
      + `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('Qwen chat-template options', () => {
  it('disables hidden thinking for direct OpenAI-compatible Qwen requests', async () => {
    let outboundBody: Record<string, unknown> | null = null;
    const result = await runAgentLoop({
      litellmUrl: 'http://qwen.test/v1',
      litellmApiKey: '',
      model: 'qwen3.8-flash-next',
      billingModel: 'openai-compatible/qwen3.8-flash-next',
      systemPrompt: 'Answer briefly.',
      tools: [],
      messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      maxTurns: 1,
      stream: true,
      onToken: () => {},
      fetch: vi.fn(async (_input, init) => {
        outboundBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return openAiSseResponse('OK');
      }),
    });

    expect(result.content).toBe('OK');
    expect(outboundBody).not.toBeNull();
    expect(outboundBody!.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it.each([
    ['openai-compatible/llama3.1', 'llama3.1'],
    ['ollama/qwen3.8-flash-next', 'qwen3.8-flash-next'],
  ])('does not add Qwen chat-template options for %s', async (billingModel, model) => {
    let outboundBody: Record<string, unknown> | null = null;
    const result = await runAgentLoop({
      litellmUrl: 'http://model.test/v1',
      litellmApiKey: '',
      model,
      billingModel,
      systemPrompt: 'Answer briefly.',
      tools: [],
      messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      maxTurns: 1,
      stream: true,
      onToken: () => {},
      fetch: vi.fn(async (_input, init) => {
        outboundBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return openAiSseResponse('OK');
      }),
    });

    expect(result.content).toBe('OK');
    expect(outboundBody).not.toBeNull();
    expect(outboundBody!.chat_template_kwargs).toBeUndefined();
  });
});
