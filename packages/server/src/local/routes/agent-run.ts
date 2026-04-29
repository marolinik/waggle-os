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
import { HybridSearch } from '@waggle/core';
import {
  runRetrievalAgentLoop,
  listShapes,
  type LlmCallFn,
  type LlmCallInput,
  type LlmCallResult,
  type RetrievalSearchFn,
} from '@waggle/agent';

const DEFAULT_LITELLM_URL = process.env.WAGGLE_LITELLM_URL ?? 'http://localhost:4000';
const LITELLM_KEY =
  process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_PERSONA = 'general-purpose';
const DEFAULT_MAX_STEPS = 5;

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
      const isQwen = input.model.includes('qwen');
      const payload: Record<string, unknown> = {
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens ?? (isQwen ? 16384 : 4096),
      };
      if (input.model.startsWith('claude-opus')) {
        payload.temperature = 1.0;
      } else if (input.model === 'gpt-5.4' || input.model === 'minimax-m27-via-openrouter') {
        // omit temperature (model rejects it)
      } else {
        payload.temperature = input.temperature ?? 0.3;
      }
      if (isQwen && input.thinking !== undefined) {
        payload.extra_body = { enable_thinking: input.thinking };
      }

      try {
        const resp = await fetch(`${DEFAULT_LITELLM_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LITELLM_KEY}`,
          },
          body: JSON.stringify(payload),
        });
        const data = (await resp.json()) as {
          error?: { message?: string };
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_cost?: number };
        };
        if (data.error) {
          return {
            content: '',
            inTokens: 0,
            outTokens: 0,
            costUsd: 0,
            latencyMs: Date.now() - started,
            error: data.error.message ?? 'LiteLLM error',
          };
        }
        const content = data.choices?.[0]?.message?.content ?? '';
        return {
          content,
          inTokens: data.usage?.prompt_tokens ?? 0,
          outTokens: data.usage?.completion_tokens ?? 0,
          costUsd: data.usage?.total_cost ?? 0,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
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
      model: model ?? DEFAULT_MODEL,
    });

    try {
      const result = await runRetrievalAgentLoop({
        modelAlias: model ?? DEFAULT_MODEL,
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
      });
    } catch (err) {
      sendEvent('error', {
        error: err instanceof Error ? err.message : 'agent run failed',
      });
    } finally {
      sendEvent('done', { ok: true });
      try {
        raw.end();
      } catch {
        // already closed
      }
    }
  });
};
