/**
 * anthropic-proxy.ts — Built-in OpenAI-compatible provider proxy.
 *
 * Translates Claude requests to Anthropic Messages and directly forwards other
 * discovered OpenAI-compatible providers. This is the no-Python Solo route.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyInstance, FastifyReply } from 'fastify';
import { validateOrigin } from '../cors-config.js';
import { applyProviderKeyToEnv, getProviderApiKeys } from '../provider-env.js';
import { PROVIDER_MODEL_CATALOGS } from '../provider-model-catalog.js';

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

/** Shape of a parsed Anthropic Messages API streaming (SSE) event. */
interface AnthropicStreamEvent {
  type: string;
  message?: { usage?: { input_tokens?: number } };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
  usage?: { output_tokens?: number };
}

/** Shape of a non-streaming Anthropic Messages API response. */
interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

interface ProviderRoute {
  providerId: string;
  model: string;
}

const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  gemini: 'google',
};

function inferProvider(model: string): string | null {
  const normalized = model.toLowerCase();
  if (normalized.startsWith('claude-')) return 'anthropic';
  if (normalized.startsWith('gpt-') || /^o\d/.test(normalized)) return 'openai';
  if (normalized.startsWith('gemini-')) return 'google';
  if (normalized.startsWith('deepseek-')) return 'deepseek';
  if (normalized.startsWith('grok-')) return 'xai';
  if (normalized.startsWith('mistral-') || normalized.startsWith('codestral-')) return 'mistral';
  if (normalized.startsWith('qwen')) return 'alibaba';
  if (normalized.startsWith('minimax-')) return 'minimax';
  if (normalized.startsWith('glm-')) return 'zhipu';
  if (normalized.startsWith('kimi-')) return 'moonshot';
  if (normalized.startsWith('sonar')) return 'perplexity';
  return null;
}

/** Resolve exactly one routing prefix; nested ids (OpenRouter) stay intact. */
function resolveProviderRoute(model: string): ProviderRoute | null {
  const trimmed = model.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf('/');
  if (slash > 0) {
    const prefix = trimmed.slice(0, slash).toLowerCase();
    const providerId = PROVIDER_ALIASES[prefix] ?? prefix;
    if (!PROVIDER_MODEL_CATALOGS[providerId]) return null;
    const upstreamModel = trimmed.slice(slash + 1);
    return upstreamModel ? { providerId, model: upstreamModel } : null;
  }
  const providerId = inferProvider(trimmed);
  return providerId ? { providerId, model: trimmed } : null;
}

function completionEndpoint(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (normalized.endsWith('/models')) normalized = normalized.slice(0, -'/models'.length);
  return `${normalized}/chat/completions`;
}

function directProviderBaseUrl(server: FastifyInstance, providerId: string): string {
  const entry = server.vault?.get(providerId);
  const customBaseUrl = typeof entry?.metadata?.baseUrl === 'string'
    ? entry.metadata.baseUrl.trim()
    : '';
  if (customBaseUrl) return customBaseUrl;
  // Google's native catalog is not under its OpenAI-compatibility namespace.
  if (providerId === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai';
  return PROVIDER_MODEL_CATALOGS[providerId].endpoint;
}

async function forwardCompatibleProvider(
  server: FastifyInstance,
  route: ProviderRoute,
  body: ChatCompletionBody,
  origin: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const apiKeys = getProviderApiKeys(route.providerId, server.vault);
  if (apiKeys.length === 0) {
    return reply.status(500).send({
      error: {
        message: `No ${route.providerId} API key configured. Add one in Settings > API Keys.`,
      },
    });
  }

  const url = completionEndpoint(directProviderBaseUrl(server, route.providerId));
  const outboundBody: Record<string, unknown> = { ...body, model: route.model };
  if (
    route.providerId === 'openai'
    && body.max_tokens !== undefined
    && /^(?:gpt-5|o\d|codex-mini-)/i.test(route.model)
  ) {
    outboundBody.max_completion_tokens = body.max_tokens;
    delete outboundBody.max_tokens;
  }
  let upstream: Response | null = null;
  let credentialRejected = false;
  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index];
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(body.stream ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify(outboundBody),
      });
    } catch (error) {
      return reply.status(502).send({
        error: {
          message: `${route.providerId} API request failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
    }

    credentialRejected = upstream.status === 401 || upstream.status === 403;
    if (!credentialRejected && upstream.status === 400) {
      const detail = await upstream.clone().text().catch(() => '');
      credentialRejected = /please pass a valid api key|api key (?:is )?(?:invalid|not valid|expired)/i.test(detail);
    }
    if (!credentialRejected) {
      applyProviderKeyToEnv(route.providerId, apiKey, true);
      if (server.agentState?.llmProvider?.provider === 'anthropic-proxy') {
        server.agentState.llmProvider = {
          provider: 'anthropic-proxy',
          health: 'healthy',
          detail: `Built-in provider proxy (${route.providerId} credential verified)`,
          checkedAt: new Date().toISOString(),
        };
      }
      break;
    }
    if (index < apiKeys.length - 1) {
      await upstream.body?.cancel().catch(() => undefined);
      upstream = null;
    }
  }

  if (!upstream) {
    return reply.status(502).send({
      error: { message: `${route.providerId} rejected every configured API key.` },
    });
  }
  if (credentialRejected && server.agentState?.llmProvider?.provider === 'anthropic-proxy') {
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: `Built-in provider proxy (${route.providerId} API key invalid or expired)`,
      checkedAt: new Date().toISOString(),
    };
  }

  const contentType = upstream.headers.get('content-type')
    ?? (body.stream ? 'text/event-stream' : 'application/json');
  if (body.stream && upstream.body) {
    await reply.hijack();
    reply.raw.writeHead(upstream.status, {
      'Content-Type': contentType,
      'Cache-Control': upstream.headers.get('cache-control') ?? 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': validateOrigin(origin),
    });
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(Buffer.from(value));
      }
    } catch {
      // Upstream or client closed the stream; the finally block terminates it.
    } finally {
      reply.raw.end();
    }
    return;
  }

  const payload = Buffer.from(await upstream.arrayBuffer());
  reply.code(upstream.status).header('Content-Type', contentType);
  return reply.send(payload);
}

/** Map model names (from various formats) to Anthropic model IDs */
function mapModel(model: string): string {
  // Strip provider prefix (e.g., "anthropic/claude-sonnet-4.6" → "claude-sonnet-4.6")
  let clean = model.includes('/') ? model.split('/').pop()! : model;
  // Normalize dots to dashes in version (e.g., "claude-sonnet-4.6" → "claude-sonnet-4-6")
  clean = clean.replace(/(\d)\.(\d)/g, '$1-$2');

  // B3 cleanup (2026-04-22) per decisions/2026-04-22-model-route-naming-locked.md
  // §3 HIGH — drop the Sonnet/Opus 4.6 → -20250514 entries. `-20250514` was
  // never a valid Claude 4.6-family snapshot ID; sending it produced
  // `404 model_not_found` on Anthropic. Anthropic resolves the floating
  // alias `claude-sonnet-4-6` / `claude-opus-4-6` server-side to the current
  // canonical snapshot — pass-through is the correct behavior.
  const mapping: Record<string, string> = {
    // Haiku 4.5 passes through verbatim to the canonical dated snapshot.
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
    // Common misnames — Haiku 4.6 doesn't exist, map to actual latest Haiku.
    // Kept as defensive typo guards; all target the valid Haiku 4.5 snapshot.
    'claude-haiku-4-6': 'claude-haiku-4-5-20251001',
    'claude-haiku-4.6': 'claude-haiku-4-5-20251001',
    'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  };
  return mapping[clean] ?? clean;
}

export const anthropicProxyRoutes: FastifyPluginAsync = async (server) => {
  // Health check — always "OK" since we're built-in
  server.get('/v1/health/liveliness', async () => ({ status: 'healthy' }));

  // POST /v1/chat/completions — translate to Anthropic Messages API
  server.post<{ Body: ChatCompletionBody }>('/v1/chat/completions', async (request, reply) => {
    const body = request.body;
    const route = resolveProviderRoute(body.model);
    if (!route) {
      return reply.status(400).send({
        error: {
          message: `Model "${body.model}" does not identify a supported provider. Select a discovered provider/model id.`,
        },
      });
    }
    if (route.providerId !== 'anthropic') {
      return forwardCompatibleProvider(
        server,
        route,
        body,
        request.headers.origin as string | undefined,
        reply,
      );
    }

    const apiKey = getAnthropicKey(server);

    if (!apiKey) {
      return reply.status(500).send({
        error: { message: 'No Anthropic API key configured. Add one in Settings > API Keys.' },
      });
    }

    const mappedModel = mapModel(route.model);

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
          let input: unknown = {};
          try {
            input = JSON.parse(tc.function.arguments || '{}');
          } catch {
            // Malformed tool call arguments from chat history — use empty object
            input = {};
          }
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input,
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

    // Apply Anthropic prompt caching — cache system prompt for multi-turn efficiency
    // See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
    const systemWithCache = system
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;

    // Mark last 3 non-system messages for caching (rolling window)
    // Anthropic allows max 4 cache breakpoints — 1 for system + 3 for messages
    const cachedMessages = merged.map((msg, i) => {
      const isInCacheWindow = i >= merged.length - 3;
      if (!isInCacheWindow) return msg;

      const content = msg.content;
      if (typeof content === 'string') {
        return { ...msg, content: [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }] };
      }
      if (Array.isArray(content) && content.length > 0) {
        const lastBlock = content[content.length - 1];
        const taggedBlock = { ...lastBlock, cache_control: { type: 'ephemeral' } };
        return { ...msg, content: [...content.slice(0, -1), taggedBlock] };
      }
      return msg;
    });

    const anthropicBody: Record<string, unknown> = {
      model: mappedModel,
      max_tokens: body.max_tokens ?? 4096,
      system: systemWithCache ?? system,
      messages: cachedMessages,
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

              let event: AnthropicStreamEvent;
              try { event = JSON.parse(payload) as AnthropicStreamEvent; } catch { continue; }

              // Translate Anthropic stream events to OpenAI format
              if (event.type === 'message_start') {
                inputTokens = event.message?.usage?.input_tokens ?? 0;
              } else if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'text') {
                  // Text block start — nothing to emit yet
                } else if (event.content_block?.type === 'tool_use') {
                  toolCallIndex++;
                  currentToolId = event.content_block.id ?? '';
                  currentToolName = event.content_block.name ?? '';
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
      const data = await anthropicRes.json() as AnthropicMessageResponse;

      let textContent = '';
      type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
      const toolCalls: ToolCall[] = [];

      for (const block of data.content ?? []) {
        if (block.type === 'text') {
          textContent += block.text ?? '';
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id ?? '',
            type: 'function',
            function: { name: block.name ?? '', arguments: JSON.stringify(block.input) },
          });
        }
      }

      const message: { role: string; content: string | null; tool_calls?: ToolCall[] } = {
        role: 'assistant',
        content: textContent || null,
      };
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
      const choice = {
        message,
        finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      };

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

/** Read Anthropic API key. Vault is the primary source; env and config are legacy fallbacks. */
function getAnthropicKey(server: FastifyInstance): string | null {
  // Vault first — encrypted storage is the canonical secret store
  if (server.vault) {
    try {
      const entry = server.vault.get('anthropic');
      if (entry) return entry.value;
    } catch {
      // Vault read failed — fall through
    }
  }

  // Legacy fallback: env var (for test harnesses / dev loops)
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  // Legacy fallback: ~/.waggle/config.json
  try {
    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as { providers?: { anthropic?: { apiKey?: string } } };
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
