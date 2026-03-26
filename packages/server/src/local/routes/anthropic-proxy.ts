/**
 * anthropic-proxy.ts — Built-in OpenAI-compatible proxy backed by Anthropic API.
 *
 * Translates OpenAI /chat/completions format to Anthropic Messages API.
 * This replaces the need for LiteLLM when using Anthropic models directly.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { validateOrigin } from '../cors-config.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface ChatCompletionBody {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  max_tokens?: number;
  temperature?: number;
}

/** Map OpenAI model names to Anthropic model IDs */
function mapModel(model: string): string {
  const mapping: Record<string, string> = {
    'claude-sonnet-4-6': 'claude-sonnet-4-20250514',
    'claude-opus-4-6': 'claude-opus-4-20250514',
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  };
  return mapping[model] ?? model;
}

export const anthropicProxyRoutes: FastifyPluginAsync = async (server) => {
  // Health check — always "OK" since we're built-in
  server.get('/v1/health/liveliness', async () => ({ status: 'healthy' }));

  // POST /v1/chat/completions — translate to Anthropic Messages API
  server.post<{ Body: ChatCompletionBody }>('/v1/chat/completions', async (request, reply) => {
    const body = request.body;
    const apiKey = getAnthropicKey(server);

    if (!apiKey) {
      return reply.status(500).send({
        error: { message: 'No Anthropic API key configured. Add one in Settings > API Keys.' },
      });
    }

    // Extract system prompt from messages
    let system = '';
    const messages: Array<{ role: string; content: unknown }> = [];

    for (const msg of body.messages) {
      if (msg.role === 'system') {
        system += (system ? '\n\n' : '') + (msg.content ?? '');
        continue;
      }

      if (msg.role === 'tool' && msg.tool_call_id) {
        // Tool result — Anthropic format
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content ?? '' }],
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Assistant with tool calls
        const content: unknown[] = [];
        if (msg.content) content.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        }
        messages.push({ role: 'assistant', content });
        continue;
      }

      messages.push({ role: msg.role, content: msg.content ?? '' });
    }

    // Merge consecutive same-role messages (Anthropic requires alternating roles)
    const merged = mergeConsecutiveMessages(messages);

    // Convert tools
    const tools = body.tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const anthropicBody: Record<string, unknown> = {
      model: mapModel(body.model),
      max_tokens: body.max_tokens ?? 4096,
      system,
      messages: merged,
      stream: body.stream ?? false,
    };
    if (body.temperature !== undefined) anthropicBody.temperature = body.temperature;
    if (tools && tools.length > 0) anthropicBody.tools = tools;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => 'Unknown error');
      return reply.status(anthropicRes.status).send({
        error: { message: `Anthropic API error: ${errText}` },
      });
    }

    if (body.stream) {
      // Stream SSE — translate Anthropic stream to OpenAI stream format
      await reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': validateOrigin(request.headers.origin as string | undefined),
      });

      const reader = anthropicRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let currentToolId = '';
      let currentToolName = '';
      let toolCallIndex = -1;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop()!;

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === '[DONE]') continue;

              let event: any;
              try { event = JSON.parse(payload); } catch { continue; }

              // Translate Anthropic stream events to OpenAI format
              if (event.type === 'message_start') {
                inputTokens = event.message?.usage?.input_tokens ?? 0;
              } else if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'text') {
                  // Text block start — nothing to emit yet
                } else if (event.content_block?.type === 'tool_use') {
                  toolCallIndex++;
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  raw.write(`data: ${JSON.stringify({
                    choices: [{
                      delta: {
                        tool_calls: [{
                          index: toolCallIndex,
                          id: currentToolId,
                          type: 'function',
                          function: { name: currentToolName, arguments: '' },
                        }],
                      },
                    }],
                  })}\n\n`);
                }
              } else if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta') {
                  raw.write(`data: ${JSON.stringify({
                    choices: [{ delta: { content: event.delta.text } }],
                  })}\n\n`);
                } else if (event.delta?.type === 'input_json_delta') {
                  raw.write(`data: ${JSON.stringify({
                    choices: [{
                      delta: {
                        tool_calls: [{
                          index: toolCallIndex,
                          function: { arguments: event.delta.partial_json },
                        }],
                      },
                    }],
                  })}\n\n`);
                }
              } else if (event.type === 'message_delta') {
                outputTokens = event.usage?.output_tokens ?? outputTokens;
              } else if (event.type === 'message_stop') {
                // Send usage chunk if requested
                if (body.stream_options?.include_usage) {
                  raw.write(`data: ${JSON.stringify({
                    choices: [],
                    usage: {
                      prompt_tokens: inputTokens,
                      completion_tokens: outputTokens,
                      total_tokens: inputTokens + outputTokens,
                    },
                  })}\n\n`);
                }
              }
            }
          }
        }
      } catch {
        // Stream ended
      }

      raw.write('data: [DONE]\n\n');
      raw.end();
    } else {
      // Non-streaming — translate Anthropic response to OpenAI format
      const data = await anthropicRes.json() as any;

      let textContent = '';
      const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];

      for (const block of data.content ?? []) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          });
        }
      }

      const choice: Record<string, unknown> = {
        message: {
          role: 'assistant',
          content: textContent || null,
        },
        finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      };
      if (toolCalls.length > 0) {
        (choice.message as any).tool_calls = toolCalls;
      }

      return reply.send({
        choices: [choice],
        usage: {
          prompt_tokens: data.usage?.input_tokens ?? 0,
          completion_tokens: data.usage?.output_tokens ?? 0,
          total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
        model: data.model,
      });
    }
  });
};

/** Read Anthropic API key from env, vault, or config (legacy fallback) */
function getAnthropicKey(server: any): string | null {
  // Env var takes priority — explicit runtime config always wins
  // (matches hasAnthropicKey() in service.ts which also checks env first)
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  // Try vault (encrypted storage from Settings UI)
  if (server.vault) {
    try {
      const entry = server.vault.get('anthropic');
      if (entry) return entry.value;
    } catch {
      // Vault read failed — fall through
    }
  }

  // Try reading from ~/.waggle/config.json directly (legacy fallback)
  try {
    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    if (config?.providers?.anthropic?.apiKey) return config.providers.anthropic.apiKey;
  } catch {
    // Config not available
  }

  return null;
}

/** Merge consecutive same-role messages (Anthropic requires alternating roles) */
function mergeConsecutiveMessages(messages: Array<{ role: string; content: unknown }>): Array<{ role: string; content: unknown }> {
  if (messages.length === 0) return [];

  const result: Array<{ role: string; content: unknown }> = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];

    if (prev.role === curr.role && typeof prev.content === 'string' && typeof curr.content === 'string') {
      prev.content = prev.content + '\n\n' + curr.content;
    } else {
      result.push(curr);
    }
  }

  return result;
}
