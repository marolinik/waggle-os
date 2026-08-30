/**
 * anthropic-proxy.ts — Built-in OpenAI-compatible provider proxy.
 *
 * Translates Claude requests to Anthropic Messages and directly forwards other
 * discovered OpenAI-compatible providers. This is the no-Python Solo route.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { validateOrigin } from '../cors-config.js';
import { applyProviderKeyToEnv, getProviderApiKeys } from '../provider-env.js';
import { isRemoteOllamaAlias, PROVIDER_MODEL_CATALOGS } from '../provider-model-catalog.js';
import { fetchOllamaRoutingModels } from '../model-availability.js';
import { getAuthenticatedRunToken } from '../security-middleware.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface OpenAIContentPart {
  type: string;
  [key: string]: unknown;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

type OpenAIToolChoice = 'auto' | 'none' | 'required' | {
  type: 'function';
  function: { name: string };
};

interface ChatCompletionBody {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  tool_choice?: OpenAIToolChoice;
  parallel_tool_calls?: boolean;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  max_tokens?: number;
  temperature?: number;
  chat_template_kwargs?: { enable_thinking?: boolean };
  extra_body?: Record<string, unknown> & { enable_thinking?: boolean };
}

const MODEL_SPEND_RESERVATION_HEADER = 'x-waggle-model-spend-reservation';
const DEFINITE_PRE_INFERENCE_REJECTION_STATUSES = new Set([
  400, 401, 403, 404, 405, 413, 415, 422, 429,
]);
type ProxyModelSpendBudget = FastifyInstance['agentState']['costTracker'];
type ProxyModelSpendReservation = ReturnType<ProxyModelSpendBudget['reserveModelSpend']>;
type ProxyModelSpendRequest = Parameters<ProxyModelSpendBudget['reserveModelSpend']>[0];

interface ProxySpendReservation {
  reservation: ProxyModelSpendReservation;
  owner: 'caller' | 'proxy';
  request: ProxyModelSpendRequest;
  estimatedCostUsd?: number;
  durableTraceId?: number;
  handoffToken?: string;
  traceId?: number;
  traceCostReservationId?: number;
}

class ProxySpendLedgerUnavailableError extends Error {
  public readonly code = 'DAILY_MODEL_BUDGET_LEDGER_UNAVAILABLE';

  constructor(cause?: unknown) {
    super('Hard daily model budget cannot continue without a durable spend ledger', { cause });
    this.name = 'ProxySpendLedgerUnavailableError';
  }
}

function estimateProxyInputTokens(body: ChatCompletionBody): number {
  const serialized = JSON.stringify({
    messages: body.messages,
    tools: body.tools ?? [],
  });
  let tokens = 0;
  for (const character of serialized) {
    const code = character.codePointAt(0) ?? 0;
    tokens += code >= 0x10000
      ? 2
      : ((code >= 0x3000 && code <= 0x9fff)
          || (code >= 0xac00 && code <= 0xd7af)
          || (code >= 0xf900 && code <= 0xfaff)
        ? 1
        : 0.25);
  }
  return Math.max(1, Math.ceil(tokens));
}

function isValidChatCompletionBody(body: unknown): body is ChatCompletionBody {
  if (!body || typeof body !== 'object') return false;
  const value = body as Partial<ChatCompletionBody>;
  if (typeof value.model !== 'string' || value.model.trim().length === 0) return false;
  if (!Array.isArray(value.messages) || value.messages.length === 0) return false;
  if (value.tools !== undefined && (
    !Array.isArray(value.tools)
    || !value.tools.every(isValidOpenAITool)
  )) return false;
  if (!isValidOpenAIToolChoice(value.tool_choice, value.tools)) return false;
  if (value.parallel_tool_calls !== undefined && typeof value.parallel_tool_calls !== 'boolean') {
    return false;
  }
  return value.messages.every((message) => (
    message !== null
    && typeof message === 'object'
    && ['system', 'user', 'assistant', 'tool'].includes(message.role)
    && isValidOpenAIContent(message.content)
    && (message.tool_calls === undefined || (
      message.role === 'assistant'
      && Array.isArray(message.tool_calls)
      && message.tool_calls.every(isValidOpenAIToolCall)
    ))
    && (message.tool_call_id === undefined || typeof message.tool_call_id === 'string')
  ));
}

function isValidOpenAIToolChoice(
  choice: unknown,
  tools: readonly OpenAITool[] | undefined,
): choice is OpenAIToolChoice | undefined {
  if (choice === undefined) return true;
  if (choice === 'auto' || choice === 'none' || choice === 'required') return true;
  if (!choice || typeof choice !== 'object') return false;
  const value = choice as { type?: unknown; function?: { name?: unknown } };
  if (value.type !== 'function' || typeof value.function?.name !== 'string') return false;
  const name = value.function.name.trim();
  return name.length > 0 && !!tools?.some(tool => tool.function.name === name);
}

function toAnthropicToolChoice(
  choice: OpenAIToolChoice | undefined,
  parallelToolCalls: boolean | undefined,
): Record<string, string | boolean> | undefined {
  if (choice === undefined) return undefined;
  const parallelPolicy: Record<string, boolean> = parallelToolCalls === false
    ? { disable_parallel_tool_use: true }
    : {};
  if (choice === 'auto') return { type: 'auto', ...parallelPolicy };
  if (choice === 'none') return { type: 'none' };
  if (choice === 'required') return { type: 'any', ...parallelPolicy };
  return {
    type: 'tool',
    name: choice.function.name.trim(),
    ...parallelPolicy,
  };
}

function isValidOpenAIContent(content: unknown): boolean {
  return typeof content === 'string'
    || content === null
    || (Array.isArray(content) && content.every((part) => (
      part !== null
      && typeof part === 'object'
      && typeof (part as { type?: unknown }).type === 'string'
    )));
}

function isValidOpenAIToolCall(toolCall: unknown): boolean {
  if (!toolCall || typeof toolCall !== 'object') return false;
  const value = toolCall as NonNullable<OpenAIMessage['tool_calls']>[number];
  return typeof value.id === 'string'
    && typeof value.type === 'string'
    && value.function !== null
    && typeof value.function === 'object'
    && typeof value.function.name === 'string'
    && typeof value.function.arguments === 'string';
}

function isValidOpenAITool(tool: unknown): boolean {
  if (!tool || typeof tool !== 'object') return false;
  const value = tool as OpenAITool;
  return value.type === 'function'
    && value.function !== null
    && typeof value.function === 'object'
    && typeof value.function.name === 'string'
    && (value.function.description === undefined || typeof value.function.description === 'string')
    && (value.function.parameters === undefined || (
      value.function.parameters !== null
      && typeof value.function.parameters === 'object'
      && !Array.isArray(value.function.parameters)
    ));
}

function reserveProxySpend(
  server: FastifyInstance,
  request: FastifyRequest,
  body: ChatCompletionBody,
): ProxySpendReservation | undefined {
  const budget = server.agentState?.costTracker;
  if (!budget) return undefined;
  const spendRequest = proxySpendRequest(body);
  const claimed = claimProxySpendHandoff(server, request, body, spendRequest);
  if (claimed) {
    const { dailyBudgetUsd, mode } = budget.getBudget();
    const hardBudgetEnabled = mode === 'hard' && dailyBudgetUsd !== null;
    const estimatedCostUsd = claimed.estimatedCostUsd;
    if (estimatedCostUsd === undefined || claimed.durableTraceId === undefined || !server.traceStore) {
      if (!hardBudgetEnabled) return claimed;
      const error = new ProxySpendLedgerUnavailableError();
      budget.setModelSpendReservationHandoffDisposition?.(claimed.handoffToken!, 'release');
      throw error;
    }
    if (estimatedCostUsd <= 0) return claimed;
    try {
      const traceCostReservationId = server.traceStore.reserveCost(
        claimed.durableTraceId,
        estimatedCostUsd,
      );
      budget.setModelSpendReservationHandoffDisposition?.(claimed.handoffToken!, 'commit');
      return {
        ...claimed,
        traceId: claimed.durableTraceId,
        traceCostReservationId,
      };
    } catch (error) {
      budget.markModelSpendPersistenceUnavailable(error);
      if (hardBudgetEnabled) {
        budget.setModelSpendReservationHandoffDisposition?.(claimed.handoffToken!, 'release');
        throw new ProxySpendLedgerUnavailableError(error);
      }
      return claimed;
    }
  }

  const reservation = budget.reserveModelSpend(spendRequest);
  let traceId: number | undefined;
  let traceCostReservationId: number | undefined;
  try {
    if (!server.traceStore) {
      const { dailyBudgetUsd, mode } = budget.getBudget();
      if (mode === 'hard' && dailyBudgetUsd !== null) {
        throw new ProxySpendLedgerUnavailableError();
      }
    } else {
      traceId = server.traceStore.start({
        sessionId: 'provider-proxy',
        model: body.model,
        taskShape: 'provider-proxy',
        input: 'Direct built-in provider proxy request',
        tags: ['model-spend:proxy'],
      });
      const estimatedCostUsd = proxySpendCost(
        budget,
        spendRequest,
        spendRequest.inputTokens,
        spendRequest.maxOutputTokens,
      );
      if (estimatedCostUsd > 0) {
        traceCostReservationId = server.traceStore.reserveCost(traceId, estimatedCostUsd);
      }
    }
  } catch (error) {
    budget.markModelSpendPersistenceUnavailable(error);
    const { dailyBudgetUsd, mode } = budget.getBudget();
    if (mode === 'hard' && dailyBudgetUsd !== null) {
      budget.releaseReservedModelSpend(reservation);
      throw error instanceof ProxySpendLedgerUnavailableError
        ? error
        : new ProxySpendLedgerUnavailableError(error);
    }
    traceId = undefined;
    traceCostReservationId = undefined;
  }
  return {
    reservation,
    owner: 'proxy',
    request: spendRequest,
    traceId,
    traceCostReservationId,
  };
}

function proxySpendRequest(body: ChatCompletionBody): ProxyModelSpendRequest {
  return {
    model: body.model,
    inputTokens: estimateProxyInputTokens(body),
    maxOutputTokens: body.max_tokens ?? 4096,
    billingClass: 'priced',
  };
}

function claimProxySpendHandoff(
  server: FastifyInstance,
  request: FastifyRequest,
  body: ChatCompletionBody,
  spendRequest = proxySpendRequest(body),
): ProxySpendReservation | undefined {
  const budget = server.agentState?.costTracker;
  if (!budget) return undefined;
  const header = request.headers[MODEL_SPEND_RESERVATION_HEADER];
  const handoffToken = typeof header === 'string' ? header : undefined;
  const handoff = handoffToken
    ? budget.claimModelSpendReservationHandoff?.(handoffToken, JSON.stringify(body))
    : undefined;
  return handoff ? {
    ...handoff,
    owner: 'caller',
    request: spendRequest,
    handoffToken,
  } : undefined;
}

function proxySpendCost(
  budget: ProxyModelSpendBudget,
  request: ProxyModelSpendRequest,
  inputTokens: number,
  outputTokens: number,
): number {
  const rawCost = budget.calculateCost(inputTokens, outputTokens, request.model);
  return Math.ceil((Math.max(0, rawCost) * 1_000_000) - 1e-9) / 1_000_000;
}

function modelSpendFailureCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && [
    'DAILY_MODEL_BUDGET_EXCEEDED',
    'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE',
    'DAILY_MODEL_BUDGET_LEDGER_UNAVAILABLE',
  ].includes(code) ? code : undefined;
}

function sendProxyBudgetFailure(reply: FastifyReply, error: unknown, code: string): unknown {
  return reply.status(code === 'DAILY_MODEL_BUDGET_LEDGER_UNAVAILABLE' ? 503 : 429).send({
    error: {
      code,
      message: error instanceof Error ? error.message : 'Daily model budget unavailable.',
    },
  });
}

function settleProxySpend(
  server: FastifyInstance,
  spend: ProxySpendReservation | undefined,
  usage?: { inputTokens: number; outputTokens: number },
): void {
  if (!spend) return;
  const budget = server.agentState.costTracker;
  const hasAuthoritativeUsage = usage !== undefined
    && Number.isFinite(usage.inputTokens)
    && usage.inputTokens > 0
    && Number.isFinite(usage.outputTokens)
    && usage.outputTokens > 0;
  const tokens = hasAuthoritativeUsage
    ? usage
    : { inputTokens: spend.request.inputTokens, outputTokens: spend.request.maxOutputTokens };
  const costUsd = proxySpendCost(
    budget,
    spend.request,
    tokens.inputTokens,
    tokens.outputTokens,
  );
  if (spend.owner === 'caller') {
    if (spend.traceCostReservationId === undefined) return;
    const durableCostUsd = hasAuthoritativeUsage
      ? costUsd
      : (spend.estimatedCostUsd ?? costUsd);
    try {
      server.traceStore.settleReservedCost(spend.traceCostReservationId, durableCostUsd);
    } catch (error) {
      budget.markModelSpendPersistenceUnavailable(error);
      server.log.error({ err: error }, 'Failed to settle caller-owned provider proxy spend');
    }
    return;
  }
  const settled = hasAuthoritativeUsage
    ? budget.reconcileModelSpend(spend.reservation, usage)
    : budget.commitReservedModelSpend(spend.reservation);
  if (!settled || spend.traceId === undefined) return;

  try {
    if (spend.traceCostReservationId !== undefined) {
      server.traceStore.settleReservedCost(spend.traceCostReservationId, costUsd);
    } else if (costUsd > 0) {
      server.traceStore.recordCost(spend.traceId, costUsd);
    }
    server.traceStore.finalize(spend.traceId, {
      outcome: 'success',
      output: 'Built-in provider proxy request settled',
      model: spend.request.model,
      tokens: { input: tokens.inputTokens, output: tokens.outputTokens },
      costUsd,
    });
  } catch (error) {
    budget.markModelSpendPersistenceUnavailable(error);
    server.log.error({ err: error }, 'Failed to persist built-in provider proxy spend');
  }
}

function releaseProxySpend(server: FastifyInstance, spend: ProxySpendReservation | undefined): void {
  if (!spend) return;
  if (spend.owner === 'caller') {
    if (spend.traceCostReservationId !== undefined) {
      try {
        server.traceStore.releaseReservedCost(spend.traceCostReservationId);
      } catch (error) {
        server.agentState.costTracker.markModelSpendPersistenceUnavailable(error);
        server.log.warn({ err: error }, 'Failed to release caller-owned provider proxy spend');
      }
    }
    if (spend.handoffToken) {
      server.agentState.costTracker.setModelSpendReservationHandoffDisposition(
        spend.handoffToken,
        'release',
      );
    }
    return;
  }
  server.agentState.costTracker.releaseReservedModelSpend(spend.reservation);
  if (spend.traceId !== undefined) {
    try {
      if (spend.traceCostReservationId !== undefined) {
        server.traceStore.releaseReservedCost(spend.traceCostReservationId);
      }
      server.traceStore.finalize(spend.traceId, {
        outcome: 'abandoned',
        output: 'Provider rejected request before inference',
        model: spend.request.model,
        tokens: { input: 0, output: 0 },
        costUsd: 0,
      });
    } catch (error) {
      server.agentState.costTracker.markModelSpendPersistenceUnavailable(error);
      server.log.warn({ err: error }, 'Failed to finalize rejected provider proxy trace');
    }
  }
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

const RUN_PROXY_ACTIVE_STATUSES = new Set(['queued', 'starting', 'running', 'waiting_for_approval', 'paused', 'cancelling']);

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
  request: FastifyRequest,
  requestedModel: string,
  requestedRoute: ProviderRoute,
): { statusCode: number; message: string } | null {
  const activeRunProxy = hasActiveRunCompletionScope(server);
  const token = parseBearerToken(request.headers.authorization);
  if (!token) {
    return activeRunProxy
      ? { statusCode: 401, message: 'A Bearer credential is required while scoped agent runs are active.' }
      : null;
  }
  const authenticatedRun = getAuthenticatedRunToken(request);
  if (authenticatedRun) {
    const currentRun = server.agentRunRegistry?.authenticateCredential(token);
    if (!currentRun) {
      return { statusCode: 401, message: 'The authenticated run credential is no longer active.' };
    }
    if (authenticatedRun.runId && authenticatedRun.runId !== currentRun.id) {
      return { statusCode: 401, message: 'The authenticated run credential no longer matches the active run.' };
    }
    return validateAssignedRunModel(
      currentRun.executor.model?.trim(),
      requestedModel,
      requestedRoute,
    );
  }
  const run = server.agentRunRegistry?.authenticateCredential(token);
  if (!run) {
    if (isSessionBearer(server, token)) return null;
    return activeRunProxy
      ? { statusCode: 401, message: 'The supplied bearer token is not an active run credential.' }
      : null;
  }

  const assignedModel = run.executor.model?.trim();
  return validateAssignedRunModel(assignedModel, requestedModel, requestedRoute);
}

function validateAssignedRunModel(
  assignedModel: string | undefined,
  requestedModel: string,
  requestedRoute: ProviderRoute,
): { statusCode: number; message: string } | null {
  const assignedRoute = assignedModel ? resolveProviderRoute(assignedModel) : null;
  if (!assignedRoute) {
    return {
      statusCode: 403,
      message: 'This run token cannot use the model proxy because the run has no assigned completion model.',
    };
  }
  if (!providerRoutesMatch(assignedRoute, requestedRoute)) {
    return {
      statusCode: 403,
      message: `Requested model "${requestedModel}" is outside the assigned run model "${assignedModel}".`,
    };
  }
  return null;
}

function parseBearerToken(authHeader: string | undefined): string | undefined {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function hasActiveRunCompletionScope(server: FastifyInstance): boolean {
  return server.agentRunRegistry?.list({ limit: 1_000 }).some((run) =>
    run.kind === 'worker'
      && typeof run.executor.model === 'string'
      && run.executor.model.trim().length > 0
      && RUN_PROXY_ACTIVE_STATUSES.has(run.status)) ?? false;
}

function isSessionBearer(server: FastifyInstance, token: string): boolean {
  const agentState = server.agentState as { wsSessionToken?: unknown; litellmApiKey?: unknown } | undefined;
  return [agentState?.wsSessionToken, agentState?.litellmApiKey]
    .some((candidate) => typeof candidate === 'string' && candidate === token);
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

function configuredProviderBaseUrl(server: FastifyInstance, providerId: string): string {
  const entry = server.vault?.get(providerId);
  const customBaseUrl = typeof entry?.metadata?.baseUrl === 'string'
    ? entry.metadata.baseUrl.trim()
    : '';
  if (customBaseUrl) return customBaseUrl;
  try {
    return new WaggleConfig(server.localConfig.dataDir).getProviders()[providerId]?.baseUrl?.trim() ?? '';
  } catch {
    return '';
  }
}

function directProviderBaseUrl(server: FastifyInstance, providerId: string): string {
  const customBaseUrl = configuredProviderBaseUrl(server, providerId);
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
    reply.code(upstream.status);
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

async function isVerifiedLocalOllamaRoute(route: ProviderRoute): Promise<boolean> {
  if (!ollamaBaseUrl()) return false;
  if (isRemoteOllamaAlias(route.model)) return false;
  return (await fetchOllamaRoutingModels()).some((model) => (
    model.id === `ollama/${route.model}` && model.source === 'local'
  ));
}

async function forwardCompatibleProvider(
  server: FastifyInstance,
  route: ProviderRoute,
  body: ChatCompletionBody,
  origin: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const apiKeys = getProviderApiKeys(route.providerId, server.vault);
  const keylessCompatible = route.providerId === 'openai-compatible'
    && apiKeys.length === 0
    && Boolean(configuredProviderBaseUrl(server, route.providerId));
  if (apiKeys.length === 0 && !keylessCompatible) {
    return reply.status(500).send({
      error: {
        message: `No ${route.providerId} API key configured. Add one in Settings > API Keys.`,
      },
    });
  }

  const baseUrl = directProviderBaseUrl(server, route.providerId);
  if (!baseUrl) {
    return reply.status(500).send({
      error: { message: `No ${route.providerId} endpoint configured. Add one in Settings.` },
    });
  }
  const requestAbort = createCloudProviderAbort(reply);
  const url = completionEndpoint(baseUrl);
  const outboundBody: Record<string, unknown> = { ...body, model: route.model };
  if (
    route.providerId === 'openai-compatible'
    && /(?:^|[/._-])qwen(?:$|[/_.:-]|\d)/i.test(route.model)
  ) {
    // Qwen-compatible servers commonly default to long hidden reasoning. Keep
    // interactive Waggle chat responsive while honoring an explicit one-shot
    // agent shape selection and leaving every other provider unchanged.
    const templateKwargs = body.chat_template_kwargs
      && typeof body.chat_template_kwargs === 'object'
      && !Array.isArray(body.chat_template_kwargs)
      ? body.chat_template_kwargs
      : {};
    const extraBody = body.extra_body
      && typeof body.extra_body === 'object'
      && !Array.isArray(body.extra_body)
      ? body.extra_body
      : {};
    const requestedThinking = typeof templateKwargs.enable_thinking === 'boolean'
      ? templateKwargs.enable_thinking
      : typeof extraBody.enable_thinking === 'boolean'
        ? extraBody.enable_thinking
        : false;
    outboundBody.chat_template_kwargs = {
      enable_thinking: requestedThinking,
    };
    if ('enable_thinking' in extraBody) {
      const { enable_thinking: _ignored, ...remainingExtraBody } = extraBody;
      if (Object.keys(remainingExtraBody).length > 0) {
        outboundBody.extra_body = remainingExtraBody;
      } else {
        delete outboundBody.extra_body;
      }
    }
  }
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
  const credentials: Array<string | undefined> = apiKeys.length > 0 ? apiKeys : [undefined];
  for (let index = 0; index < credentials.length; index += 1) {
    const apiKey = credentials[index];
    try {
      upstream = await fetch(url, {
        method: 'POST',
        signal: requestAbort.signal,
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
      if (apiKey) applyProviderKeyToEnv(route.providerId, apiKey, true);
      if (server.agentState?.llmProvider?.provider === 'anthropic-proxy') {
        server.agentState.llmProvider = {
          provider: 'anthropic-proxy',
          health: 'healthy',
          detail: `Built-in provider proxy (${route.providerId} ${apiKey ? 'credential' : 'endpoint'} verified)`,
          checkedAt: new Date().toISOString(),
        };
      }
      break;
    }
    if (index < credentials.length - 1) {
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
  let registeredSpendTarget: string | undefined;
  let registeredSpendBudget: ProxyModelSpendBudget | undefined;

  server.addHook('onListen', async () => {
    const address = server.server.address();
    if (!address || typeof address === 'string') return;
    const targetUrl = `http://127.0.0.1:${address.port}/v1`;
    const budget = server.agentState?.costTracker;
    if (budget?.registerModelSpendReservationTarget?.(targetUrl)) {
      registeredSpendTarget = targetUrl;
      registeredSpendBudget = budget;
    }
  });
  server.addHook('onClose', async () => {
    if (registeredSpendTarget && registeredSpendBudget) {
      registeredSpendBudget.unregisterModelSpendReservationTarget?.(registeredSpendTarget);
      registeredSpendTarget = undefined;
      registeredSpendBudget = undefined;
    }
  });

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
        .some((providerId) => providerId !== 'openai-compatible'
          && getProviderApiKeys(providerId, server.vault).length > 0)
      || Boolean(configuredProviderBaseUrl(server, 'openai-compatible'));
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
    if (!isValidChatCompletionBody(request.body)) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_CHAT_COMPLETION_BODY',
          message: 'A model and non-empty messages array are required.',
        },
      });
    }
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
      request,
      body.model,
      route,
    );
    if (runScopeViolation) {
      return reply.status(runScopeViolation.statusCode).send({
        error: { message: runScopeViolation.message },
      });
    }
    if (route.providerId === 'ollama') {
      const callerSpend = claimProxySpendHandoff(server, request, body);
      if (!await isVerifiedLocalOllamaRoute(route)) {
        releaseProxySpend(server, callerSpend);
        return reply.status(409).send({
          error: {
            code: 'OLLAMA_MODEL_NOT_LOCAL',
            message: `Ollama model "ollama/${route.model}" is not a verified installed local model.`,
          },
        });
      }
      releaseProxySpend(server, callerSpend);
      return forwardOllamaProvider(
        route,
        body,
        request.headers.origin as string | undefined,
        reply,
      );
    }
    if (route.providerId === 'anthropic' && !getAnthropicKey(server)) {
      releaseProxySpend(server, claimProxySpendHandoff(server, request, body));
      return reply.status(500).send({
        error: { message: 'No Anthropic API key configured. Add one in Settings > API Keys.' },
      });
    }
    const keylessCompatible = route.providerId === 'openai-compatible'
      && Boolean(configuredProviderBaseUrl(server, route.providerId));
    if (
      route.providerId !== 'anthropic'
      && getProviderApiKeys(route.providerId, server.vault).length === 0
      && !keylessCompatible
    ) {
      releaseProxySpend(server, claimProxySpendHandoff(server, request, body));
      return reply.status(500).send({
        error: {
          message: `No ${route.providerId} API key configured. Add one in Settings > API Keys.`,
        },
      });
    }
    let spend: ProxySpendReservation | undefined;
    try {
      spend = reserveProxySpend(server, request, body);
    } catch (error) {
      const code = modelSpendFailureCode(error);
      if (code) return sendProxyBudgetFailure(reply, error, code);
      throw error;
    }
    if (route.providerId !== 'anthropic') {
      const compatibleResult = await forwardCompatibleProvider(
        server,
        route,
        body,
        request.headers.origin as string | undefined,
        reply,
      );
      if (DEFINITE_PRE_INFERENCE_REJECTION_STATUSES.has(reply.statusCode)) {
        releaseProxySpend(server, spend);
      }
      else settleProxySpend(server, spend);
      return compatibleResult;
    }

    const apiKey = getAnthropicKey(server)!;

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
      description: t.function.description ?? '',
      input_schema: t.function.parameters ?? { type: 'object', properties: {} },
    }));
    const toolChoice = toAnthropicToolChoice(body.tool_choice, body.parallel_tool_calls);

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
    if (toolChoice) anthropicBody.tool_choice = toolChoice;

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
      settleProxySpend(server, spend);
      return sendCloudProviderFailure(reply, 'Anthropic', requestAbort, error);
    }

    if (!anthropicRes.ok) {
      let errText: string;
      try {
        errText = await anthropicRes.text();
      } catch (error) {
        settleProxySpend(server, spend);
        return sendCloudProviderFailure(reply, 'Anthropic', requestAbort, error);
      }
      if (DEFINITE_PRE_INFERENCE_REJECTION_STATUSES.has(anthropicRes.status)) {
        releaseProxySpend(server, spend);
      } else {
        settleProxySpend(server, spend);
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
      let messageStopObserved = false;

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
              messageStopObserved = true;
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
      const translatedUsage = translateAnthropicUsage(usage);
      settleProxySpend(server, spend, messageStopObserved ? {
          inputTokens: Number(translatedUsage.prompt_tokens ?? 0),
          outputTokens: Number(translatedUsage.completion_tokens ?? 0),
        } : undefined);
      if (!raw.destroyed && !raw.writableEnded) raw.end();
    } else {
      // Non-streaming — translate Anthropic response to OpenAI format
      let data: AnthropicMessageResponse;
      try {
        data = await anthropicRes.json() as AnthropicMessageResponse;
      } catch (error) {
        settleProxySpend(server, spend);
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

      const translatedUsage = translateAnthropicUsage(data.usage);
      settleProxySpend(server, spend, {
        inputTokens: Number(translatedUsage.prompt_tokens ?? 0),
        outputTokens: Number(translatedUsage.completion_tokens ?? 0),
      });
      return reply.send({
        choices: [choice],
        usage: translatedUsage,
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
