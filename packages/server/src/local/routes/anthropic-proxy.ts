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
import { isRemoteOllamaAlias, PROVIDER_MODEL_CATALOGS } from '../provider-model-catalog.js';

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

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Shape of a parsed Anthropic Messages API streaming (SSE) event. */
interface AnthropicStreamEvent {
  type: string;
  message?: { usage?: AnthropicUsage };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string | null };
  usage?: AnthropicUsage;
}

/** Shape of a non-streaming Anthropic Messages API response. */
interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
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
    const upstreamModel = trimmed.slice(slash + 1);
    if (providerId === 'ollama') {
      return upstreamModel ? { providerId, model: upstreamModel } : null;
    }
    if (!PROVIDER_MODEL_CATALOGS[providerId]) return null;
    return upstreamModel ? { providerId, model: upstreamModel } : null;
  }
  const providerId = inferProvider(trimmed);
  return providerId ? { providerId, model: trimmed } : null;
}

function validateRunTokenModelScope(
  server: FastifyInstance,
  authHeader: string | undefined,
  requestedModel: string,
  requestedRoute: ProviderRoute,
): string | null {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const run = token ? server.agentRunRegistry?.authenticateCredential(token) : undefined;
  if (!run) return null;

  const assignedModel = run.executor.model?.trim();
  const assignedRoute = assignedModel ? resolveProviderRoute(assignedModel) : null;
  if (!assignedRoute) {
    return 'This run token cannot use the model proxy because the run has no assigned completion model.';
  }
  if (!providerRoutesMatch(assignedRoute, requestedRoute)) {
    return `Requested model "${requestedModel}" is outside the assigned run model "${assignedModel}".`;
  }
  return null;
}

function providerRoutesMatch(a: ProviderRoute, b: ProviderRoute): boolean {
  if (a.providerId.toLowerCase() !== b.providerId.toLowerCase()) return false;
  const normalize = (route: ProviderRoute) => (
    route.providerId === 'anthropic' ? mapModel(route.model) : route.model
  ).trim().toLowerCase();
  return normalize(a) === normalize(b);
}

function completionEndpoint(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (normalized.endsWith('/models')) normalized = normalized.slice(0, -'/models'.length);
  return `${normalized}/chat/completions`;
}

function ollamaBaseUrl(): string | null {
  const configured = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  try {
    const url = new URL(configured);
    const isLoopback = url.hostname === '127.0.0.1'
      || url.hostname === 'localhost'
      || url.hostname === '::1'
      || url.hostname === '[::1]';
    if (
      url.protocol !== 'http:'
      || !isLoopback
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '' && url.pathname !== '/')
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function ollamaCompletionEndpoint(): string | null {
  const baseUrl = ollamaBaseUrl();
  return baseUrl ? `${baseUrl}/v1/chat/completions` : null;
}

const OLLAMA_READINESS_CACHE_MS = 2_000;
const OLLAMA_READINESS_MAX_CONCURRENCY = 4;
const OLLAMA_READINESS_CALL_TIMEOUT_MS = 2_000;
const OLLAMA_READINESS_OVERALL_TIMEOUT_MS = 2_750;
const CLOUD_PROVIDER_REQUEST_TIMEOUT_MS = 120_000;

interface CloudProviderAbort {
  signal: AbortSignal;
  timedOut: () => boolean;
  clientDisconnected: () => boolean;
}

function createCloudProviderAbort(reply: FastifyReply): CloudProviderAbort {
  const controller = new AbortController();
  let timedOut = false;
  let clientDisconnected = false;
  let disposed = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Cloud provider request timed out', 'TimeoutError'));
  }, CLOUD_PROVIDER_REQUEST_TIMEOUT_MS);
  timeout.unref?.();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    reply.raw.off('close', abortForDisconnect);
    reply.raw.off('finish', dispose);
  };
  const abortForDisconnect = () => {
    if (!reply.raw.writableEnded) {
      clientDisconnected = true;
      controller.abort(new DOMException('Client disconnected', 'AbortError'));
    }
    dispose();
  };
  reply.raw.once('close', abortForDisconnect);
  reply.raw.once('finish', dispose);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clientDisconnected: () => clientDisconnected,
  };
}

function sendCloudProviderFailure(
  reply: FastifyReply,
  providerId: string,
  abort: CloudProviderAbort,
  error: unknown,
): unknown {
  if (abort.clientDisconnected() || reply.raw.destroyed) return;
  if (abort.timedOut()) {
    return reply.status(504).send({
      error: {
        message: `${providerId} API request timed out after ${CLOUD_PROVIDER_REQUEST_TIMEOUT_MS}ms.`,
      },
    });
  }
  return reply.status(502).send({
    error: {
      message: `${providerId} API request failed: ${error instanceof Error ? error.message : String(error)}`,
    },
  });
}

async function probeReadyOllamaModel(baseUrl: string): Promise<boolean> {
  const probeController = new AbortController();
  const overallTimer = setTimeout(
    () => probeController.abort(),
    OLLAMA_READINESS_OVERALL_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      redirect: 'error',
      signal: AbortSignal.any([
        probeController.signal,
        AbortSignal.timeout(OLLAMA_READINESS_CALL_TIMEOUT_MS),
      ]),
    });
    if (!response.ok) return false;
    const payload = await response.json() as {
      models?: Array<{ name?: unknown; remote_host?: unknown }>;
    };
    if (!Array.isArray(payload.models)) return false;
    const localModels = payload.models.flatMap((model) => {
      if (typeof model.name !== 'string') return [];
      const name = model.name.trim();
      if (!name) return [];
      const remoteHost = typeof model.remote_host === 'string' ? model.remote_host : undefined;
      return isRemoteOllamaAlias(name, remoteHost) ? [] : [name];
    }).slice(0, 64);
    let nextModelIndex = 0;
    let foundCompletionModel = false;
    const workers = Array.from(
      { length: Math.min(OLLAMA_READINESS_MAX_CONCURRENCY, localModels.length) },
      async () => {
        while (!foundCompletionModel && !probeController.signal.aborted) {
          const model = localModels[nextModelIndex];
          nextModelIndex += 1;
          if (model === undefined) return;
          try {
            const detail = await fetch(`${baseUrl}/api/show`, {
              method: 'POST',
              redirect: 'error',
              signal: AbortSignal.any([
                probeController.signal,
                AbortSignal.timeout(OLLAMA_READINESS_CALL_TIMEOUT_MS),
              ]),
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model }),
            });
            if (!detail.ok) continue;
            const shown = await detail.json() as { capabilities?: unknown };
            if (
              Array.isArray(shown.capabilities)
              && shown.capabilities.some((capability) => capability === 'completion')
            ) {
              foundCompletionModel = true;
              probeController.abort();
            }
          } catch {
            if (probeController.signal.aborted) return;
          }
        }
      }
    );
    await Promise.all(workers);
    return foundCompletionModel;
  } catch {
    return false;
  } finally {
    clearTimeout(overallTimer);
    probeController.abort();
  }
}

function createOllamaReadinessChecker(): () => Promise<boolean> {
  let cached: { baseUrl: string; ready: boolean; expiresAt: number } | null = null;
  let inFlight: { baseUrl: string; promise: Promise<boolean> } | null = null;

  return async () => {
    const baseUrl = ollamaBaseUrl();
    if (!baseUrl) return false;
    const now = Date.now();
    if (cached?.baseUrl === baseUrl && cached.expiresAt > now) return cached.ready;
    if (inFlight?.baseUrl === baseUrl) return inFlight.promise;

    const promise = probeReadyOllamaModel(baseUrl).then((ready) => {
      cached = { baseUrl, ready, expiresAt: Date.now() + OLLAMA_READINESS_CACHE_MS };
      return ready;
    });
    inFlight = { baseUrl, promise };
    try {
      return await promise;
    } finally {
      if (inFlight?.promise === promise) inFlight = null;
    }
  };
}

function translateAnthropicUsage(usage: AnthropicUsage | undefined) {
  const inputTokens = usage?.input_tokens ?? 0;
  const cacheCreationTokens = usage?.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
  const promptTokens = inputTokens + cacheCreationTokens + cacheReadTokens;
  const completionTokens = usage?.output_tokens ?? 0;
  const translated: Record<string, unknown> = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
  if (usage?.cache_read_input_tokens !== undefined) {
    translated.prompt_tokens_details = { cached_tokens: cacheReadTokens };
    translated.cache_read_input_tokens = cacheReadTokens;
  }
  if (usage?.cache_creation_input_tokens !== undefined) {
    translated.cache_creation_input_tokens = cacheCreationTokens;
  }
  return translated;
}

function translateAnthropicStopReason(
  stopReason: string | null | undefined,
  hasToolCalls: boolean,
): string {
  if (!stopReason) return 'anthropic_missing_stop_reason';
  if (stopReason === 'max_tokens') return 'length';
  if (stopReason === 'tool_use') {
    return hasToolCalls ? 'tool_calls' : 'anthropic_inconsistent_tool_use';
  }
  if (hasToolCalls) return `anthropic_inconsistent_${stopReason}`;
  if (
    stopReason === 'end_turn'
    || stopReason === 'stop_sequence'
  ) return 'stop';
  // Preserve new Anthropic reasons instead of falsely claiming a normal stop.
  // The agent loop rejects unsupported explicit reasons fail-closed.
  return stopReason;
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

async function sendCompatibleResponse(
  upstream: Response,
  stream: boolean | undefined,
  origin: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const contentType = upstream.headers.get('content-type')
    ?? (stream ? 'text/event-stream' : 'application/json');
  if (stream && upstream.body) {
    await reply.hijack();
    reply.raw.writeHead(upstream.status, {
      'Content-Type': contentType,
      'Cache-Control': upstream.headers.get('cache-control') ?? 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': validateOrigin(origin),
    });
    const reader = upstream.body.getReader();
    let completed = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(Buffer.from(value));
      }
      completed = true;
    } catch {
      // Upstream or client closed the stream; the finally block terminates it.
    } finally {
      if (!completed) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
    return;
  }

  const payload = Buffer.from(await upstream.arrayBuffer());
  reply.code(upstream.status).header('Content-Type', contentType);
  return reply.send(payload);
}

async function forwardOllamaProvider(
  route: ProviderRoute,
  body: ChatCompletionBody,
  origin: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const url = ollamaCompletionEndpoint();
  if (!url) {
    return reply.status(503).send({
      error: {
        message: 'Local Ollama requires an HTTP loopback OLLAMA_HOST endpoint.',
      },
    });
  }

  const abortController = new AbortController();
  const abortUpstream = () => abortController.abort();
  reply.raw.once('close', abortUpstream);
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(body.stream ? { Accept: 'text/event-stream' } : {}),
      },
      body: JSON.stringify({ ...body, model: route.model }),
    });
    return await sendCompatibleResponse(upstream, body.stream, origin, reply);
  } catch (error) {
    if (abortController.signal.aborted) return;
    return reply.status(502).send({
      error: {
        message: `Ollama API request failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    });
  } finally {
    reply.raw.off('close', abortUpstream);
  }
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

  const requestAbort = createCloudProviderAbort(reply);
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
        signal: requestAbort.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(body.stream ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify(outboundBody),
      });
    } catch (error) {
      return sendCloudProviderFailure(reply, route.providerId, requestAbort, error);
    }

    credentialRejected = upstream.status === 401 || upstream.status === 403;
    if (!credentialRejected && upstream.status === 400) {
      const detail = await upstream.clone().text().catch(() => '');
      if (requestAbort.signal.aborted) {
        return sendCloudProviderFailure(
          reply,
          route.providerId,
          requestAbort,
          requestAbort.signal.reason,
        );
      }
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

  try {
    return await sendCompatibleResponse(upstream, body.stream, origin, reply);
  } catch (error) {
    return sendCloudProviderFailure(reply, route.providerId, requestAbort, error);
  }
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
  const hasReadyOllamaModel = createOllamaReadinessChecker();

  // Process liveness is independent from whether a completion provider is
  // configured. Installer/startup probes use this endpoint.
  server.get('/v1/health/liveliness', async () => ({ status: 'healthy' }));

  // Model readiness is stricter: the in-process proxy cannot complete a turn
  // until at least one cloud provider credential is available. Keep this
  // separate from liveness so a clean Solo install remains operational while
  // chat can truthfully ask the user to configure a model.
  server.get('/v1/health/readiness', async (_request, reply) => {
    let hasConfiguredProvider = Boolean(getAnthropicKey(server))
      || Object.keys(PROVIDER_MODEL_CATALOGS)
        .some((providerId) => getProviderApiKeys(providerId, server.vault).length > 0);
    if (!hasConfiguredProvider) hasConfiguredProvider = await hasReadyOllamaModel();
    if (!hasConfiguredProvider) {
      return reply.status(503).send({
        status: 'unavailable',
        detail: 'No provider credential configured',
      });
    }
    return { status: 'ready' };
  });

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
    const runScopeViolation = validateRunTokenModelScope(
      server,
      request.headers.authorization,
      body.model,
      route,
    );
    if (runScopeViolation) {
      return reply.status(403).send({
        error: { message: runScopeViolation },
      });
    }
    if (route.providerId === 'ollama') {
      return forwardOllamaProvider(
        route,
        body,
        request.headers.origin as string | undefined,
        reply,
      );
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

    const requestAbort = createCloudProviderAbort(reply);
    let anthropicRes: Response;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: requestAbort.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicBody),
      });
    } catch (error) {
      return sendCloudProviderFailure(reply, 'Anthropic', requestAbort, error);
    }

    if (!anthropicRes.ok) {
      let errText: string;
      try {
        errText = await anthropicRes.text();
      } catch (error) {
        return sendCloudProviderFailure(reply, 'Anthropic', requestAbort, error);
      }
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
      let usage: AnthropicUsage = {};
      let currentToolId = '';
      let currentToolName = '';
      let toolCallIndex = -1;
      let stopReason: string | undefined;

      try {
        streamRead: for (;;) {
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
                usage = { ...usage, ...event.message?.usage };
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
                usage = { ...usage, ...event.usage };
                if (typeof event.delta?.stop_reason === 'string') {
                  stopReason = event.delta.stop_reason;
                }
              } else if (event.type === 'message_stop') {
                raw.write(`data: ${JSON.stringify({
                  choices: [{
                    delta: {},
                    finish_reason: translateAnthropicStopReason(stopReason, toolCallIndex >= 0),
                  }],
                })}\n\n`);
                // Send usage chunk if requested
                if (body.stream_options?.include_usage) {
                  raw.write(`data: ${JSON.stringify({
                    choices: [],
                    usage: translateAnthropicUsage(usage),
                  })}\n\n`);
                }
                raw.write('data: [DONE]\n\n');
                break streamRead;
              }
            }
          }
        }
      } catch {
        // A read failure is not a protocol terminal event. End without [DONE]
        // so the downstream completion-integrity check rejects partial output.
      }

      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      if (!raw.destroyed && !raw.writableEnded) raw.end();
    } else {
      // Non-streaming — translate Anthropic response to OpenAI format
      let data: AnthropicMessageResponse;
      try {
        data = await anthropicRes.json() as AnthropicMessageResponse;
      } catch (error) {
        return sendCloudProviderFailure(reply, 'Anthropic', requestAbort, error);
      }

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
        finish_reason: translateAnthropicStopReason(data.stop_reason, toolCalls.length > 0),
      };

      return reply.send({
        choices: [choice],
        usage: translateAnthropicUsage(data.usage),
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
