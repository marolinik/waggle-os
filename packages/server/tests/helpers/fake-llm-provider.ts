/**
 * Fake OpenAI-compatible model provider for route tests (TD-CHAT-16).
 *
 * `installFakeLlmProvider` replaces `globalThis.fetch` so the REAL
 * `runAgentLoop` runs and only the model call is scripted. That is the narrowed
 * test seam: unlike an injected `server.agentRunner`, it leaves every branch of
 * `POST /api/chat` running — runtime acquisition, the approval hook, recall,
 * the model-health gate, in-loop spend accounting and post-turn enrichment.
 *
 * The server's `llmFetch` circuit breaker resolves `globalThis.fetch` per call,
 * so installing after `buildLocalServer` is fine. A 5xx reply still counts
 * against that breaker, keyed by origin, exactly as in production.
 *
 * Requests whose path ends in `/chat/completions` are answered from the script.
 * Direct calls to `api.anthropic.com` (the GEPA prompt optimizer, enabled by
 * the vault key `markFakeProviderHealthy` sets) are answered 404 and recorded in
 * `unexpectedRequests`, always: the optimizer then fails soft at once, where a
 * suite stub's 503 would send it into its retry backoff for minutes.
 * `/api/tags` (the Ollama model listing) returns `ollamaModels`, `/health/*`
 * returns 200, and anything else goes to `otherRequest` when given, or is
 * answered 404 and recorded in `unexpectedRequests` so a test can assert the
 * turn stayed hermetic.
 */
import type { FastifyInstance } from 'fastify';

export interface FakeLlmUsage {
  inputTokens: number;
  outputTokens: number;
}

/** One scripted provider reply. */
export type FakeLlmReply =
  /**
   * Assistant text. `chunks` sets the streamed deltas; default is one delta.
   * `finishReason` replaces the default `stop`.
   */
  | { type: 'text'; content: string; chunks?: readonly string[]; usage?: FakeLlmUsage; finishReason?: string }
  /** One assistant turn that calls these tools. */
  | {
    type: 'tool_calls';
    calls: ReadonlyArray<{ name: string; args?: Record<string, unknown>; id?: string }>;
    usage?: FakeLlmUsage;
  }
  /** A non-2xx provider answer with an OpenAI-style error body. */
  | { type: 'http_error'; status: number; message?: string; headers?: Record<string, string> }
  /** fetch itself rejects, as it does for ECONNREFUSED. */
  | { type: 'network_error'; message?: string }
  /** Streams `content`, then ends without a finish frame or `data: [DONE]`. */
  | { type: 'truncated_stream'; content: string; usage?: FakeLlmUsage }
  /** Never answers; rejects with an AbortError once the request is aborted. */
  | { type: 'hang' }
  /**
   * A stream scripted part by part, which can hold open mid-answer. It keeps
   * going after the request aborts, as a provider that ignores the disconnect
   * would; parts past a cancelled read are dropped. `truncated` ends it the
   * way `truncated_stream` does. A non-streaming request gets the joined
   * content as one JSON completion.
   */
  | { type: 'stream'; parts: readonly FakeLlmStreamPart[]; usage?: FakeLlmUsage; truncated?: boolean };

export type FakeLlmStreamPart =
  /** One content delta. */
  | { content: string }
  /** One private reasoning delta, sent as `reasoning_content`. */
  | { reasoning: string }
  /** Called when the stream reaches it; the stream resumes once its result settles. */
  | { pause: () => unknown };

/** What the fake saw of one `/chat/completions` request. */
export interface FakeLlmRequest {
  index: number;
  url: string;
  authorization: string | null;
  model: string;
  stream: boolean;
  toolChoice: unknown;
  toolNames: string[];
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  body: Record<string, unknown>;
  signal: AbortSignal | undefined;
}

/**
 * A single reply for every request, a list consumed in order (a request past
 * the end is answered 500 and recorded as unexpected), or a function that may
 * await — which is how a test holds a turn open.
 */
export type FakeLlmResponder =
  | FakeLlmReply
  | readonly FakeLlmReply[]
  | ((request: FakeLlmRequest) => FakeLlmReply | Promise<FakeLlmReply>);

export interface FakeLlmProviderOptions {
  respond: FakeLlmResponder;
  /** Model names `/api/tags` reports. Default: none. */
  ollamaModels?: readonly string[];
  /**
   * Handles non-model URLs instead of the built-in answers: a handler, or
   * `'previous'` to delegate to the fetch installed before this one (a suite's
   * own egress stub or spy).
   */
  otherRequest?: 'previous' | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>);
}

export interface FakeLlmProvider {
  readonly requests: readonly FakeLlmRequest[];
  readonly unexpectedRequests: readonly string[];
  /** Replaces the script; request numbering continues. */
  respondWith(responder: FakeLlmResponder): void;
  /** Puts back the `globalThis.fetch` that was there at install time. */
  restore(): void;
}

const DEFAULT_USAGE: FakeLlmUsage = { inputTokens: 10, outputTokens: 2 };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function sseResponse(frames: readonly unknown[], done = true): Response {
  const payload = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function usageFrame(usage: FakeLlmUsage | undefined) {
  const { inputTokens, outputTokens } = usage ?? DEFAULT_USAGE;
  return { prompt_tokens: inputTokens, completion_tokens: outputTokens };
}

function wireToolCalls(reply: Extract<FakeLlmReply, { type: 'tool_calls' }>) {
  return reply.calls.map((call, index) => ({
    id: call.id ?? `call-${index}-${call.name}`,
    type: 'function' as const,
    function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
  }));
}

function encodeText(reply: Extract<FakeLlmReply, { type: 'text' }>, stream: boolean): Response {
  if (!stream) {
    return jsonResponse({
      choices: [{ message: { role: 'assistant', content: reply.content }, finish_reason: reply.finishReason ?? 'stop' }],
      usage: usageFrame(reply.usage),
    });
  }
  const chunks = reply.chunks ?? [reply.content];
  return sseResponse([
    ...chunks.map(content => ({ choices: [{ delta: { content }, finish_reason: null }] })),
    { choices: [{ delta: {}, finish_reason: reply.finishReason ?? 'stop' }], usage: usageFrame(reply.usage) },
  ]);
}

function encodeToolCalls(reply: Extract<FakeLlmReply, { type: 'tool_calls' }>, stream: boolean): Response {
  const toolCalls = wireToolCalls(reply);
  if (!stream) {
    return jsonResponse({
      choices: [{
        message: { role: 'assistant', content: null, tool_calls: toolCalls },
        finish_reason: 'tool_calls',
      }],
      usage: usageFrame(reply.usage),
    });
  }
  return sseResponse([
    {
      choices: [{
        delta: { tool_calls: toolCalls.map((call, index) => ({ index, ...call })) },
        finish_reason: null,
      }],
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: usageFrame(reply.usage) },
  ]);
}

function encodeStream(reply: Extract<FakeLlmReply, { type: 'stream' }>, stream: boolean): Response {
  if (!stream) {
    const content = reply.parts.map(part => ('content' in part ? part.content : '')).join('');
    return encodeText({ type: 'text', content, usage: reply.usage }, false);
  }
  const encoder = new TextEncoder();
  const frame = (value: unknown) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
  let next = 0;
  let cancelled = false;
  let ended = false;
  let active: Promise<void> | null = null;
  // Produces one frame per pull, so a pause runs only once the reader has
  // taken every frame before it. After a cancel the remaining parts still
  // run, pauses included, but nothing more is enqueued.
  const produce = async (controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> => {
    while (next < reply.parts.length) {
      const part = reply.parts[next++];
      if ('pause' in part) {
        await part.pause();
        continue;
      }
      if (cancelled) continue;
      const delta = 'content' in part ? { content: part.content } : { reasoning_content: part.reasoning };
      controller.enqueue(frame({ choices: [{ delta, finish_reason: null }] }));
      return;
    }
    if (cancelled || ended) return;
    ended = true;
    if (reply.truncated) {
      if (reply.usage) controller.enqueue(frame({ choices: [], usage: usageFrame(reply.usage) }));
    } else {
      controller.enqueue(frame({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: usageFrame(reply.usage) }));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    }
    controller.close();
  };
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { streamController = controller; },
    pull(controller) {
      active = produce(controller).finally(() => { active = null; });
      return active;
    },
    cancel() {
      cancelled = true;
      if (!active && !ended) void produce(streamController);
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function hangUntilAborted(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

function encodeReply(reply: FakeLlmReply, request: FakeLlmRequest): Promise<Response> | Response {
  switch (reply.type) {
    case 'text': return encodeText(reply, request.stream);
    case 'tool_calls': return encodeToolCalls(reply, request.stream);
    case 'http_error':
      return jsonResponse(
        { error: { message: reply.message ?? `fake provider error ${reply.status}` } },
        reply.status,
        reply.headers,
      );
    case 'truncated_stream':
      return sseResponse([
        { choices: [{ delta: { content: reply.content }, finish_reason: null }] },
        ...(reply.usage ? [{ choices: [], usage: usageFrame(reply.usage) }] : []),
      ], false);
    case 'network_error': throw new TypeError(reply.message ?? 'fetch failed');
    case 'hang': return hangUntilAborted(request.signal);
    case 'stream': return encodeStream(reply, request.stream);
  }
}

function readRequest(index: number, url: string, init: RequestInit | undefined): FakeLlmRequest {
  const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
  const rawMessages = Array.isArray(body.messages)
    ? body.messages as Array<{ role?: unknown; content?: unknown }>
    : [];
  const messages = rawMessages.map(message => ({
    role: String(message.role ?? ''),
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
  }));
  const rawTools = Array.isArray(body.tools) ? body.tools as Array<{ function?: { name?: unknown } }> : [];
  return {
    index,
    url,
    authorization: new Headers(init?.headers).get('authorization'),
    model: String(body.model ?? ''),
    stream: body.stream === true,
    toolChoice: body.tool_choice,
    toolNames: rawTools.map(tool => String(tool.function?.name ?? '')),
    systemPrompt: messages.find(message => message.role === 'system')?.content ?? '',
    messages,
    body,
    signal: init?.signal ?? undefined,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function installFakeLlmProvider(options: FakeLlmProviderOptions): FakeLlmProvider {
  const originalFetch = globalThis.fetch;
  const requests: FakeLlmRequest[] = [];
  const unexpectedRequests: string[] = [];
  let responder = options.respond;
  let scriptStart = 0;

  const nextReply = async (request: FakeLlmRequest): Promise<FakeLlmReply | null> => {
    if (typeof responder === 'function') return responder(request);
    if (!Array.isArray(responder)) return responder as FakeLlmReply;
    const list = responder as readonly FakeLlmReply[];
    return list[request.index - scriptStart] ?? null;
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const pathname = new URL(url, 'http://fake.invalid').pathname;
    if (pathname.endsWith('/chat/completions')) {
      const request = readRequest(requests.length, url, init);
      requests.push(request);
      const reply = await nextReply(request);
      if (!reply) {
        unexpectedRequests.push(`${url} (script exhausted at request ${request.index})`);
        return jsonResponse({ error: { message: 'fake LLM script exhausted' } }, 500);
      }
      return encodeReply(reply, request);
    }
    if (new URL(url, 'http://fake.invalid').hostname === 'api.anthropic.com') {
      unexpectedRequests.push(url);
      return jsonResponse({ error: { message: 'fake LLM provider: direct Anthropic API call' } }, 404);
    }
    if (options.otherRequest === 'previous') return originalFetch(input, init);
    if (options.otherRequest) return options.otherRequest(input, init);
    if (pathname.endsWith('/api/tags')) {
      return jsonResponse({ models: (options.ollamaModels ?? []).map(name => ({ name })) });
    }
    if (pathname.includes('/health/')) return jsonResponse({ status: 'ok' });
    unexpectedRequests.push(url);
    return jsonResponse({ error: { message: `fake LLM provider: unexpected request ${url}` } }, 404);
  }) as typeof globalThis.fetch;

  return {
    requests,
    unexpectedRequests,
    respondWith(next) {
      responder = next;
      scriptStart = requests.length;
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/**
 * Makes the turn's model-health gate pass the way production does: a vault key
 * and a healthy built-in proxy. Without this the route answers with its canned
 * setup-required reply instead of calling the model.
 *
 * Returns an undo, for suites that share one server with tests that expect the
 * unconfigured provider state.
 */
export function markFakeProviderHealthy(server: FastifyInstance, apiKey = 'sk-fake-llm-provider'): () => void {
  const previousKey = server.vault.get('anthropic');
  const previousProvider = server.agentState.llmProvider;
  server.vault.set('anthropic', apiKey);
  server.agentState.llmProvider = {
    provider: 'anthropic-proxy',
    health: 'healthy',
    detail: 'fake LLM provider',
    checkedAt: new Date().toISOString(),
  };
  return () => {
    server.agentState.llmProvider = previousProvider;
    if (previousKey) server.vault.set('anthropic', previousKey.value, previousKey.metadata);
    else server.vault.delete('anthropic');
  };
}
