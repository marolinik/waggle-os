/**
 * TraceRecorder — agent-side facade over the core ExecutionTraceStore.
 *
 * The core store is a pure CRUD layer; this recorder adds conveniences
 * that the agent loop, workflow harness, and chat route need:
 *
 *  - In-flight state tracked in-memory per active trace (so incremental
 *    tool-call / reasoning events do not require reading + rewriting
 *    the whole JSON blob each time).
 *  - Scrubbing of obvious secrets from tool-call arguments before
 *    they hit disk.
 *  - A typed `wireAgentLoopCallbacks` helper that returns handlers ready
 *    to plug into runAgentLoop's `onToolUse` / `onToolResult` hooks.
 *  - Static `truncate` helper so large outputs don't bloat the trace store.
 *
 * All persistence goes through the store — this class owns no SQL.
 */

import type {
  ExecutionTrace,
  ExecutionTraceStore,
  StartTraceInput,
  TraceOutcome,
  TracePayload,
  TraceReasoningStep,
  TraceToolCall,
} from '@waggle/core';

export interface TraceHandle {
  /** Row id in execution_traces */
  id: number;
  /** When we started */
  startedAt: number;
}

export interface FinalizeOptions {
  outcome: TraceOutcome;
  output: string;
  tokens?: { input: number; output: number };
  costUsd?: number;
  harness?: TracePayload['harness'];
  correctionFeedback?: string;
  tags?: string[];
}

/** Keys that are almost certainly secrets and should never be persisted. */
const SECRET_ARG_KEYS = new Set([
  'password', 'passwd', 'secret', 'apiKey', 'api_key', 'token',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'authorization', 'cookie', 'bearer', 'privateKey', 'private_key',
  'clientSecret', 'client_secret', 'sessionToken', 'session_token',
]);

/** Cap a string at a given length, appending a `[... Nch truncated]` tail. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const remainder = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n[... ${remainder}ch truncated]`;
}

/** Shallow-scrub suspicious keys from an argument object. */
export function scrubSecrets(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SECRET_ARG_KEYS.has(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = scrubSecrets(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface PendingToolCall {
  tool: string;
  args: Record<string, unknown>;
  startedAt: number;
}

export class TraceRecorder {
  private store: ExecutionTraceStore;

  /** Per-trace accumulators so we can flush in batches. */
  private reasoningBuffer = new Map<number, TraceReasoningStep[]>();
  private toolCallBuffer = new Map<number, TraceToolCall[]>();
  private artifactBuffer = new Map<number, string[]>();

  /** Pending tool calls keyed by trace id + a caller-supplied correlation id. */
  private pendingTools = new Map<number, Map<string, PendingToolCall>>();

  /** Maximum characters stored per tool-call result. */
  readonly maxToolResultChars: number;

  constructor(store: ExecutionTraceStore, options: { maxToolResultChars?: number } = {}) {
    this.store = store;
    this.maxToolResultChars = options.maxToolResultChars ?? 5_000;
  }

  /** Start a trace. Returns a handle the caller uses for subsequent calls. */
  start(input: StartTraceInput): TraceHandle {
    const id = this.store.start(input);
    return { id, startedAt: Date.now() };
  }

  /** Record a reasoning step. Cheap — buffered in memory until flush(). */
  recordReasoning(handle: TraceHandle, content: string): void {
    const step: TraceReasoningStep = {
      content: truncate(content, this.maxToolResultChars),
      timestamp: new Date().toISOString(),
    };
    const buf = this.reasoningBuffer.get(handle.id) ?? [];
    buf.push(step);
    this.reasoningBuffer.set(handle.id, buf);
  }

  /**
   * Mark a tool call as started. Returns a correlation id that must be passed
   * to `completeToolCall`. Use when you want accurate per-call durations.
   */
  startToolCall(
    handle: TraceHandle,
    tool: string,
    args: Record<string, unknown>,
  ): string {
    const callId = `${handle.id}:${tool}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const pending = this.pendingTools.get(handle.id) ?? new Map<string, PendingToolCall>();
    pending.set(callId, {
      tool,
      args: scrubSecrets(args),
      startedAt: Date.now(),
    });
    this.pendingTools.set(handle.id, pending);
    return callId;
  }

  /** Complete a previously-started tool call with its result. */
  completeToolCall(
    handle: TraceHandle,
    callId: string,
    result: string,
    ok: boolean = true,
  ): void {
    const pending = this.pendingTools.get(handle.id);
    const started = pending?.get(callId);
    if (!pending || !started) return;

    pending.delete(callId);

    const entry: TraceToolCall = {
      tool: started.tool,
      args: started.args,
      result: truncate(result, this.maxToolResultChars),
      ok,
      durationMs: Date.now() - started.startedAt,
      timestamp: new Date(started.startedAt).toISOString(),
    };

    const buf = this.toolCallBuffer.get(handle.id) ?? [];
    buf.push(entry);
    this.toolCallBuffer.set(handle.id, buf);
  }

  /**
   * One-shot tool call recording — used when you already have result and duration.
   * Skips the startToolCall/completeToolCall pair.
   */
  recordToolCall(handle: TraceHandle, call: Omit<TraceToolCall, 'args'> & { args: Record<string, unknown> }): void {
    const entry: TraceToolCall = {
      ...call,
      args: scrubSecrets(call.args),
      result: truncate(call.result, this.maxToolResultChars),
    };
    const buf = this.toolCallBuffer.get(handle.id) ?? [];
    buf.push(entry);
    this.toolCallBuffer.set(handle.id, buf);
  }

  /** Record a created or modified artifact (path). */
  recordArtifact(handle: TraceHandle, path: string): void {
    const buf = this.artifactBuffer.get(handle.id) ?? [];
    if (!buf.includes(path)) {
      buf.push(path);
      this.artifactBuffer.set(handle.id, buf);
    }
  }

  /** Flush all buffered events to the store without finalizing the trace. */
  flush(handle: TraceHandle): void {
    const reasoning = this.reasoningBuffer.get(handle.id);
    const toolCalls = this.toolCallBuffer.get(handle.id);
    const artifacts = this.artifactBuffer.get(handle.id);

    if (!reasoning?.length && !toolCalls?.length && !artifacts?.length) return;

    this.store.append(handle.id, {
      reasoning: reasoning ?? [],
      toolCalls: toolCalls ?? [],
      artifacts: artifacts ?? [],
    });

    this.reasoningBuffer.delete(handle.id);
    this.toolCallBuffer.delete(handle.id);
    this.artifactBuffer.delete(handle.id);
  }

  /** Flush buffers and write the final outcome + output. */
  finalize(handle: TraceHandle, options: FinalizeOptions): ExecutionTrace | undefined {
    this.flush(handle);

    const result = this.store.finalize(handle.id, {
      outcome: options.outcome,
      output: options.output,
      tokens: options.tokens,
      costUsd: options.costUsd,
      harness: options.harness,
      correctionFeedback: options.correctionFeedback,
      tags: options.tags,
    });

    this.pendingTools.delete(handle.id);
    return result;
  }

  /**
   * Mark a previously-finalized trace as corrected. Does NOT flush — the
   * trace is assumed to already have been finalized.
   */
  markCorrected(handle: TraceHandle, feedback: string): void {
    this.store.markCorrected(handle.id, feedback);
  }

  /**
   * Produce { onToolUse, onToolResult } callbacks ready to pass into
   * runAgentLoop's config. Correlates start/complete by tool-name and input,
   * so callers don't need to manage correlation ids themselves.
   *
   * Note: if the same tool is called with identical args in rapid succession,
   * durations may be swapped — acceptable trade-off for simplicity.
   */
  wireAgentLoopCallbacks(handle: TraceHandle): {
    onToolUse: (name: string, input: Record<string, unknown>) => void;
    onToolResult: (name: string, input: Record<string, unknown>, result: string) => void;
  } {
    // Stack of in-flight call ids keyed by `${name}::${argsKey}`
    const keyToIds = new Map<string, string[]>();

    const keyOf = (name: string, input: Record<string, unknown>): string => {
      let argsKey: string;
      try {
        argsKey = JSON.stringify(input);
      } catch {
        argsKey = '<unserializable>';
      }
      return `${name}::${argsKey}`;
    };

    return {
      onToolUse: (name, input) => {
        const callId = this.startToolCall(handle, name, input);
        const key = keyOf(name, input);
        const stack = keyToIds.get(key) ?? [];
        stack.push(callId);
        keyToIds.set(key, stack);
      },
      onToolResult: (name, input, result) => {
        const key = keyOf(name, input);
        const stack = keyToIds.get(key);
        const callId = stack?.shift();
        if (!callId) {
          // Fallback — no matching use event, record as one-shot.
          this.recordToolCall(handle, {
            tool: name,
            args: input,
            result,
            ok: true,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          });
          return;
        }
        if (stack && stack.length === 0) keyToIds.delete(key);
        this.completeToolCall(handle, callId, result, true);
      },
    };
  }

  // ── Test / introspection helpers ──────────────────────────

  /** Current buffered reasoning steps (not yet flushed). */
  peekReasoning(handle: TraceHandle): readonly TraceReasoningStep[] {
    return this.reasoningBuffer.get(handle.id) ?? [];
  }

  /** Current buffered tool calls (not yet flushed). */
  peekToolCalls(handle: TraceHandle): readonly TraceToolCall[] {
    return this.toolCallBuffer.get(handle.id) ?? [];
  }

  /** Current buffered artifacts (not yet flushed). */
  peekArtifacts(handle: TraceHandle): readonly string[] {
    return this.artifactBuffer.get(handle.id) ?? [];
  }

  /** Number of still-pending tool calls for a handle. */
  pendingToolCount(handle: TraceHandle): number {
    return this.pendingTools.get(handle.id)?.size ?? 0;
  }
}
