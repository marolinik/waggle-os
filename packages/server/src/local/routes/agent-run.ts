// CC Sesija A A3.1 follow-up — /api/agent/run sidecar route.
//
// Backs the Tauri run_agent_query command for the structured-action retrieval
// loop (runRetrievalAgentLoop), which is shape-aware. Distinct from /api/chat
// (runAgentLoop, conversational, multi-turn message history) because shapes
// are designed for one-shot Q→A retrieval flows — not for conversational
// chat. Two coexisting paths matches actual two-product reality:
//   /api/chat       → runAgentLoop          (conversation, no shapes)
//   /api/agent/run  → runRetrievalAgentLoop (research / one-shot, shape-driven)
//
// Streaming via SSE matches /api/chat pattern (reply.hijack + writeHead +
// raw.write event blocks). Per-step progress events come from the agent
// loop's onProgress callback (Phase 3.4 — AgentRunProgressEvent).

import type { FastifyPluginAsync } from 'fastify';
import { HybridSearch, WaggleConfig } from '@waggle/core';
import {
  runRetrievalAgentLoop,
  listShapes,
  registerShape,
  claudeGen1V1Shape,
  qwenThinkingGen1V1Shape,
  type LlmCallFn,
  type LlmCallInput,
  type LlmCallResult,
  type RetrievalSearchFn,
  parseOpenAiTextCompletion,
  isIncompleteCompletionError,
  resolveModelForClass,
  LIGHTWEIGHT_MODEL,
} from '@waggle/agent';

// CC Sesija A A3.2 (2026-04-30): register Faza 1 GEPA-evolved variants into
// the prompt-shape REGISTRY at module-load. Phase 5 LOCKED scope is just two
// shapes (claude-gen1-v1 + qwen-thinking-gen1-v1) — gen1-v2 variants stay
// out per decisions/2026-04-29-phase-5-scope-LOCKED.md (Faza 2 OVERFIT
// exposed in Checkpoint C). Registration is idempotent: registerShape()
// overwrites by name, so duplicate route loads (HMR, tests) are safe.
registerShape('claude-gen1-v1', claudeGen1V1Shape);
registerShape('qwen-thinking-gen1-v1', qwenThinkingGen1V1Shape);

// Module-load defaults are LAST-RESORT only. The live values come from server
// state at REQUEST time (see resolveLlmEndpoint): when LiteLLM is unavailable,
// service.ts falls back to the built-in Anthropic proxy and writes the real
// URL/key into server.localConfig.litellmUrl + server.agentState.litellmApiKey
// at runtime. Reading the snapshot here would route /api/agent/run at the dead
// LiteLLM default — broken for the common no-LiteLLM (Anthropic-only) case.
const DEFAULT_LITELLM_URL = process.env.WAGGLE_LITELLM_URL ?? 'http://localhost:4000';
const LITELLM_KEY =
  process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_PERSONA = 'general-purpose';
const DEFAULT_MAX_STEPS = 5;

/**
 * Resolve the LiteLLM endpoint URL + API key from LIVE server state at request
 * time. service.ts mutates these at runtime when it falls back from LiteLLM to
 * the built-in Anthropic proxy (server.localConfig.litellmUrl = self-proxy URL,
 * server.agentState.litellmApiKey = wsSessionToken), so a module-load snapshot
 * would miss the fallback. Falls back to the module defaults only when state is
 * absent (e.g. very early boot) so callers never get an empty endpoint.
 */
export function resolveLlmEndpoint(server: {
  localConfig?: { litellmUrl?: string };
  agentState?: { litellmApiKey?: string };
}): { url: string; apiKey: string } {
  return {
    url: server.localConfig?.litellmUrl ?? DEFAULT_LITELLM_URL,
    apiKey: server.agentState?.litellmApiKey ?? LITELLM_KEY,
  };
}

interface AgentRunBody {
  question: string;
  shape?: string;
  model?: string;
  persona?: string;
  workspace?: string;
  workspaceId?: string;
  maxSteps?: number;
  maxRetrievalsPerStep?: number;
}

export function parseAgentRunCompletion(data: unknown, latencyMs: number): LlmCallResult {
  const parsed = parseOpenAiTextCompletion(data);
  return {
    content: parsed.content,
    inTokens: parsed.usage.inputTokens,
    outTokens: parsed.usage.outputTokens,
    costUsd: parsed.usage.totalCostUsd,
    latencyMs,
  };
}

export const agentRunRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Build the LiteLLM-backed llmCall. Mirrors the benchmark/faza-1 caller
   * pattern (benchmarks/gepa/scripts/faza-1/run-gen-1.ts) — single retry on
   * transient failures is intentionally omitted here (sidecar callers can
   * retry at the request level if needed; agent loop runs in tokio task on
   * Tauri side and will surface error events).
   */
  function makeLlmCall(): LlmCallFn {
    return async (input: LlmCallInput): Promise<LlmCallResult> => {
      const started = Date.now();
      // Deterministic capability-aware routing: a declared-lightweight internal
      // call (compaction etc.) drops to Haiku-on-proxy (cheap, universal — works
      // for a FREE user with no local model). privacyRequired keeps the call
      // on-device and never downgrades to the cloud budget model. The agent's
      // selected model is used as the on-device candidate when it is local.
      const currentModel = server.agentState?.currentModel;
      const localModel = currentModel?.startsWith('ollama/') ? currentModel : undefined;
      // Fail closed: a privacy-required call with no on-device model must not
      // touch the cloud — return an error rather than leaking the conversation.
      if (input.privacyRequired && !localModel) {
        return {
          content: '', inTokens: 0, outTokens: 0, costUsd: 0,
          latencyMs: Date.now() - started,
          error: 'privacyRequired: no on-device model is configured',
        };
      }
      // Don't reroute a local (Ollama) session's lightweight calls to cloud
      // Haiku — keep them on-device. The lightweight→cheap-cloud override
      // applies only when the session is already cloud-backed.
      const model = resolveModelForClass(input.model, {
        class: localModel ? undefined : input.class,
        privacyRequired: input.privacyRequired,
        lightweightModel: LIGHTWEIGHT_MODEL,
        localModel,
      });
      const normalizedModel = model.toLowerCase();
      const isQwen = normalizedModel.includes('qwen');
      const payload: Record<string, unknown> = {
        model,
        messages: input.messages,
        max_tokens: input.maxTokens ?? (isQwen ? 16384 : 4096),
      };
      if (model.startsWith('claude-opus')) {
        payload.temperature = 1.0;
      } else if (model === 'gpt-5.4' || model === 'minimax-m27-via-openrouter') {
        // omit temperature (model rejects it)
      } else {
        payload.temperature = input.temperature ?? 0.3;
      }
      if (isQwen && input.thinking !== undefined) {
        if (normalizedModel.startsWith('openai-compatible/')) {
          payload.chat_template_kwargs = { enable_thinking: input.thinking };
        } else {
          payload.extra_body = { enable_thinking: input.thinking };
        }
      }

      try {
        // Read URL/key from LIVE server state per request — picks up the
        // runtime Anthropic-proxy fallback installed by service.ts.
        const { url: litellmUrl, apiKey: litellmKey } = resolveLlmEndpoint(server);
        const resp = await fetch(`${litellmUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${litellmKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60_000),
        });
        if (!resp.ok) {
          return {
            content: '',
            inTokens: 0,
            outTokens: 0,
            costUsd: 0,
            latencyMs: Date.now() - started,
            error: `LiteLLM HTTP ${resp.status}`,
          };
        }
        let data: unknown;
        try {
          data = await resp.json();
        } catch {
          // The provider returned HTTP 200 but the body ended before a valid
          // completion envelope. Classify it as terminal integrity failure so
          // the outer catch rethrows instead of force-finalizing with a replay.
          return parseAgentRunCompletion(null, Date.now() - started);
        }
        return parseAgentRunCompletion(data, Date.now() - started);
      } catch (err) {
        // A paid HTTP-200 response with missing/invalid terminal semantics is
        // not safe to force-finalize: the retrieval loop may already have
        // made progress, and another model call would replay paid work.
        if (isIncompleteCompletionError(err)) throw err;
        return {
          content: '',
          inTokens: 0,
          outTokens: 0,
          costUsd: 0,
          latencyMs: Date.now() - started,
          error: err instanceof Error ? err.message : 'LiteLLM fetch failed',
        };
      }
    };
  }

  /** Build the HybridSearch-backed search fn for the requested workspace. */
  function makeSearch(workspaceId: string | undefined): RetrievalSearchFn | null {
    const personalMindDb = server.multiMind?.personal;
    if (!personalMindDb) return null;
    const embedder = server.embeddingProvider;
    if (!embedder) return null;

    const targetMindDb =
      workspaceId && workspaceId !== 'personal'
        ? server.agentState?.getWorkspaceMindDb?.(workspaceId) ?? personalMindDb
        : personalMindDb;

    const hybrid = new HybridSearch(targetMindDb, embedder);

    return async ({ query, limit }) => {
      const hits = await hybrid.search(query, { limit: limit ?? 8 });
      return {
        formattedResults:
          hits.length === 0
            ? ''
            : hits
                .map(
                  (s, i) =>
                    `[result ${i + 1}, score ${s.finalScore.toFixed(3)}]\n${s.frame.content}`,
                )
                .join('\n\n---\n\n'),
        resultCount: hits.length,
      };
    };
  }

  // POST /api/agent/run — shape-aware structured-retrieval agent run with SSE
  // streaming. Body: { question, shape?, model?, persona?, workspace?,
  // maxSteps?, maxRetrievalsPerStep? }.
  server.post<{ Body: AgentRunBody }>('/api/agent/run', async (request, reply) => {
    const body = request.body ?? ({} as AgentRunBody);
    const { question, shape, model, persona, maxSteps, maxRetrievalsPerStep } = body;
    const workspaceId = body.workspace ?? body.workspaceId;
    const requestedModel = typeof model === 'string' ? model.trim() : '';
    const selectedModel = requestedModel
      || new WaggleConfig(server.localConfig.dataDir).getDefaultModel()
      || server.agentState?.currentModel
      || DEFAULT_MODEL;

    // Validation BEFORE hijack — once hijacked, reply.status() is a no-op.
    if (!question || typeof question !== 'string') {
      return reply.status(400).send({ error: 'question is required' });
    }

    const search = makeSearch(workspaceId);
    if (!search) {
      return reply.status(503).send({
        error: 'multi-mind or embedding provider not initialized',
      });
    }

    // Validate shape via REGISTRY membership. Unknown shapes log + fall back
    // to the model-alias-derived default (selectShape's normal behavior),
    // so a user with a stale UI cache + a removed shape still gets a working
    // run instead of a 400.
    let shapeOverride: string | undefined;
    if (shape) {
      const available = listShapes();
      if (available.includes(shape)) {
        shapeOverride = shape;
      } else {
        request.log.warn(
          { shape, available },
          '[agent-run] unknown shape requested, falling back to model-default',
        );
      }
    }

    // Hijack response for SSE.
    await reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: string, data: unknown): void => {
      try {
        raw.write(`event: ${event}\n`);
        raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Connection closed by client — agent loop will continue but events
        // are dropped. This is fine; final state still lands in the trace.
      }
    };

    sendEvent('started', {
      shape: shapeOverride ?? '(model-default)',
      shapeRequested: shape ?? null,
      shapeRecognized: shapeOverride !== undefined || shape === undefined,
      model: selectedModel,
    });

    let completed = false;
    try {
      const result = await runRetrievalAgentLoop({
        modelAlias: selectedModel,
        persona: persona ?? DEFAULT_PERSONA,
        question,
        llmCall: makeLlmCall(),
        search,
        promptShapeOverride: shapeOverride,
        maxSteps: maxSteps ?? DEFAULT_MAX_STEPS,
        maxRetrievalsPerStep: maxRetrievalsPerStep ?? 8,
        onProgress: (event) => sendEvent('progress', event),
      });

      sendEvent('finalized', {
        rawResponse: result.rawResponse,
        normalizedResponse: result.normalizedResponse,
        promptShapeName: result.promptShapeName,
        stepsTaken: result.stepsTaken,
        retrievalCalls: result.retrievalCalls,
        loopExhausted: result.loopExhausted,
        totalTokensIn: result.totalTokensIn,
        totalTokensOut: result.totalTokensOut,
        totalCostUsd: result.totalCostUsd,
        totalLatencyMs: result.totalLatencyMs,
        errors: result.errors,
      });
      completed = result.errors.length === 0;
      if (!completed) {
        sendEvent('error', {
          error: 'agent run completed with errors',
          errors: result.errors,
        });
      }
    } catch (err) {
      sendEvent('error', {
        error: err instanceof Error ? err.message : 'agent run failed',
        ...(isIncompleteCompletionError(err) ? {
          code: err.code,
          tokensIn: err.usage.inputTokens,
          tokensOut: err.usage.outputTokens,
          costUsd: err.usage.totalCostUsd,
        } : {}),
      });
    } finally {
      sendEvent('done', { ok: completed });
      try {
        raw.end();
      } catch {
        // already closed
      }
    }
  });
};
