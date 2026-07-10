import type { ToolDefinition } from './tools.js';
import { LoopGuard } from './loop-guard.js';
import { parseChatCompletionStream } from './sse-parser.js';
import { maybeFireCompletionGate, initialGateState } from './loop-gates.js';
import { executeToolCall } from './tool-executor.js';
import { handleNonOkResponse, handleNetworkError, initialRetryState } from './retry-policy.js';
import type { HookRegistry } from './hooks.js';
import type { CapabilityRouter } from './capability-router.js';
import type { TraceRecorder, TraceHandle } from './trace-recorder.js';
import { logTurnEvent } from './turn-context.js';

/** Minimal interface for plugin runtime integration (from @waggle/sdk) */
export interface PluginToolProvider {
  getAllTools(): Array<{ name: string; description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<string> }>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface AgentResponse {
  content: string;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AgentLoopConfig {
  litellmUrl: string;
  litellmApiKey: string;
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  messages: Array<{ role: string; content: string }>;
  onToken?: (token: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, input: Record<string, unknown>, result: string) => void;
  /**
   * Fired once when the tiered loop-guard hits a critical consecutive-failure
   * streak (steal #9, T3) and the run is terminated. The route layer wires this
   * to a user-facing `step` event; the same copy is also returned as the loop's
   * final content.
   */
  onGiveUp?: (message: string) => void;
  maxTurns?: number;
  stream?: boolean;
  fetch?: typeof globalThis.fetch;
  hooks?: HookRegistry;
  capabilityRouter?: CapabilityRouter;
  /** Optional plugin tool provider — merges active plugin tools into the agent's toolset */
  pluginTools?: PluginToolProvider;
  /** Optional maximum token budget (input + output combined). Loop terminates gracefully when exceeded. */
  maxTokenBudget?: number;
  /** Optional abort signal — when aborted, the agent loop exits between turns */
  signal?: AbortSignal;
  /** Team governance policies — blocked tools and allowed sources.
   *  `blockedTools` IS enforced. `allowedSources` is **accepted but NOT
   *  enforced**: tools don't carry source-provenance metadata yet, so setting it
   *  on TEAMS/ENTERPRISE only logs a loud warning at startup and does NOT
   *  restrict tool execution. Do not rely on it as a security control. Remove
   *  this caveat (and the runtime warning) once per-tool source is wired. */
  governancePolicies?: {
    blockedTools?: string[];
    /** ACCEPTED BUT NOT ENFORCED — see the note above. */
    allowedSources?: string[];
  };
  /**
   * Optional trace recording. When provided, the agent loop automatically
   * captures tool calls, reasoning, and artifacts into the handle using
   * recorder.wireAgentLoopCallbacks(). Caller-supplied onToolUse /
   * onToolResult still fire — the trace wiring is additive.
   *
   * The caller is responsible for starting the handle via
   * `recorder.start({...})` BEFORE calling runAgentLoop and finalizing
   * it via `recorder.finalize(handle, {...})` AFTER. The loop never
   * finalizes the trace itself because outcome labeling happens after
   * the user (or correction detector) signals success / corrected /
   * abandoned / verified.
   */
  traceRecording?: {
    recorder: TraceRecorder;
    handle: TraceHandle;
  };
  /**
   * H-AUDIT-1: per-turn trace ID (UUID v4). When provided, the loop logs
   * structured events tagged with this turnId at loop entry, each LLM
   * request, and each tool call. Enables full turn-graph reconstruction
   * across all agent stages from a single correlation key.
   */
  turnId?: string;
  /**
   * D3 verification-before-completion gate. When a final turn asserts the
   * work is verified/passing/working but ran no verification-class tool,
   * the loop injects ONE corrective directive instead of accepting
   * completion (one-shot; maxTurns/loop-guard still bound the loop).
   * Default on — it is the premium contract. Set false to opt out.
   */
  verificationGate?: boolean;
  /**
   * D1 Hermes-parity closed learning loop. On a qualifying ≥5-tool,
   * R2-gated successful turn the loop deterministically injects the real
   * planSkillDistillation directive into the conversation and continues
   * (one-shot) — mechanical closure, not a soft out-of-band event the
   * model may ignore. Default on. Set false to opt out.
   */
  skillDistillationGate?: boolean;
  /**
   * AI-OS Phase 3 — skill diffusion hook. Invoked the moment D1 fires
   * (right before the distillation directive is injected). The route
   * layer typically wires this to record a `skill_share` broadcast on
   * the WaggleDance v2 bus so MCP-consuming external tools can adopt
   * the soon-to-be-authored skill.
   *
   * Failures here are swallowed — skill diffusion is observability,
   * not a precondition for the distillation loop to run.
   */
  onSkillDistillationFire?: (info: {
    patternKey: string;
    toolsUsed: readonly string[];
    directive: string;
  }) => void | Promise<void>;
}

// Phase 2 Commit 2.1: re-export structured-action retrieval loop alongside
// the existing tool-use loop. Implementation lives in retrieval-agent-loop.ts
// to keep this file under the 800-line guideline; agent-loop.ts is the
// canonical "unified entry point" for both loop patterns per sprint plan §2.
export {
  runSoloAgent,
  runRetrievalAgentLoop,
  type SoloAgentRunConfig,
  type MultiStepAgentRunConfig,
  type AgentRunResult,
  type LlmCallFn,
  type LlmCallInput,
  type LlmCallResult,
  type RetrievalSearchFn,
  type RetrievalSearchInput,
  type RetrievalSearchResult,
  type NormalizationPresetName,
  type BaseAgentRunConfig,
  // Phase 3.4 — long-task integration (whole-loop recovery + progress events).
  runRetrievalAgentLoopWithRecovery,
  type LoopRecoveryOptions,
  type AgentRunProgressEvent,
  type AgentRunProgressEventType,
  type AgentRunProgressCallback,
} from './retrieval-agent-loop.js';

function toolCallWithValidConversationArgs(
  toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
): { id: string; type: 'function'; function: { name: string; arguments: string } } {
  try {
    JSON.parse(toolCall.function.arguments || '{}');
    return toolCall;
  } catch {
    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: '{}',
      },
    };
  }
}

function containsRawToolCallMarkup(content: string): boolean {
  return /\[\/?TOOL_CALL\]/i.test(content)
    || /<\s*tool_call\b/i.test(content)
    || /\{\s*tool\s*=>/i.test(content)
    || /```(?:json|tool)?\s*\{[^`]*"tool"/is.test(content);
}

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentResponse> {
  const {
    litellmUrl,
    litellmApiKey,
    model,
    systemPrompt,
    tools: configTools,
    messages: inputMessages,
    onToken,
    onToolUse: userOnToolUse,
    onToolResult: userOnToolResult,
    maxTurns = 10,
    stream = false,
    fetch: fetchFn = globalThis.fetch,
    hooks,
    pluginTools: pluginToolProvider,
    traceRecording,
    turnId,
    verificationGate = true,
    skillDistillationGate = true,
    onSkillDistillationFire,
  } = config;

  logTurnEvent(turnId, {
    stage: 'agent-loop.enter',
    model,
    maxTurns,
    toolCount: configTools.length,
    messageCount: inputMessages.length,
    systemPromptChars: systemPrompt.length,
  });

  // Review C1: surface the honest contract for allowedSources. Admins set this
  // via the TEAMS/ENTERPRISE governance UI believing data-source restrictions
  // are active; they are NOT until ToolDefinition carries source-provenance
  // metadata. Log once per invocation so the policy visibility gap is loud.
  if (config.governancePolicies?.allowedSources && config.governancePolicies.allowedSources.length > 0) {
    console.warn(
      '[agent-loop] SECURITY NOTICE: governancePolicies.allowedSources is accepted but NOT ENFORCED — ' +
      'it does not restrict tool execution (tools carry no source-provenance metadata yet). ' +
      'Do not rely on it as a security control. blockedTools IS enforced. ' +
      `Received ${config.governancePolicies.allowedSources.length} allowed source(s), all ignored.`
    );
  }

  // Wire trace recorder callbacks if configured. The recorder's handlers
  // run BEFORE the caller's so the trace captures the call even if the
  // caller's handler throws.
  const traceCallbacks = traceRecording
    ? traceRecording.recorder.wireAgentLoopCallbacks(traceRecording.handle)
    : null;

  const onToolUse = traceCallbacks
    ? (name: string, input: Record<string, unknown>) => {
        traceCallbacks.onToolUse(name, input);
        userOnToolUse?.(name, input);
      }
    : userOnToolUse;

  const onToolResult = traceCallbacks
    ? (name: string, input: Record<string, unknown>, result: string) => {
        traceCallbacks.onToolResult(name, input, result);
        userOnToolResult?.(name, input, result);
      }
    : userOnToolResult;

  // Merge plugin tools (if any) into the base tool set
  const tools: ToolDefinition[] = pluginToolProvider
    ? [...configTools, ...pluginToolProvider.getAllTools()]
    : configTools;

  // Build messages array with system prompt + input messages
  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    ...inputMessages.map((m) => ({
      role: m.role as AgentMessage['role'],
      content: m.content,
    })),
  ];

  // Build OpenAI-format tool definitions
  // Ensure all parameter schemas have type: 'object' (required by Anthropic via LiteLLM)
  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object' as const,
        properties: {},
        ...t.parameters,
      },
    },
  }));

  // Index tools by name for execution
  const toolMap = new Map<string, ToolDefinition>();
  for (const t of tools) {
    toolMap.set(t.name, t);
  }

  const toolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let allStreamedContent = ''; // Accumulate ALL streamed content across all turns
  const guard = new LoopGuard();
  let rawToolMarkupCorrectionUsed = false;
  // 429 / 5xx / network retry counters — see `./retry-policy.ts` for the protocol.
  let retryState = initialRetryState();
  // Per-request LLM timeout, merged with the client-disconnect signal below, so a
  // hung connection can't wedge a turn forever. Generous default for long
  // streaming generations; override via WAGGLE_LLM_TIMEOUT_MS.
  const llmTimeoutMs = parseInt(process.env.WAGGLE_LLM_TIMEOUT_MS ?? '', 10) || 300_000;
  // One-shot completion gates (D3 verification, D1 skill distillation) +
  // preserved-answer slot for issue #4. See `./loop-gates.ts` for details.
  let gateState = initialGateState();

  for (let turn = 0; turn < maxTurns; turn++) {
    // Check for abort between turns
    if (config.signal?.aborted) {
      return {
        content: 'Agent loop aborted (client disconnected).',
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    const body: Record<string, unknown> = {
      model,
      messages,
    };
    if (openaiTools.length > 0) {
      body.tools = openaiTools;
    }
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }

    // R3-008: forward the client-disconnect signal so an aborted run tears down
    // the connection (and, on the streaming path, the body reader rejects)
    // instead of consuming the stream to completion. Merged with a per-request
    // timeout so a hung connection can't wedge the turn forever.
    const timeoutSignal = AbortSignal.timeout(llmTimeoutMs);
    const requestSignal = config.signal
      ? AbortSignal.any([config.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetchFn(`${litellmUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${litellmApiKey}`,
        },
        body: JSON.stringify(body),
        signal: requestSignal,
      });
    } catch (netErr) {
      // The fetch promise itself rejected — a network-level failure (endpoint
      // down / restarting, socket hang-up, "fetch failed") or our timeout fired.
      // A genuine client disconnect re-throws (caught by the between-turn guard
      // above and the post-read guard below). Everything else is a transient
      // outage that must NOT kill the turn: retry with backoff, same protocol as
      // a 5xx, capped at 3 attempts before surfacing a clean fatal error.
      if (config.signal?.aborted) throw netErr;
      const action = handleNetworkError(netErr, retryState);
      if (action.kind === 'fatal') throw action.error;
      if (onToken) onToken(action.notice);
      await new Promise(r => setTimeout(r, action.waitMs));
      retryState = action.state;
      turn--; // retry this turn without consuming a turn
      continue;
    }

    if (!response.ok) {
      const action = await handleNonOkResponse(response, retryState);
      if (action.kind === 'fatal') throw action.error;
      if (onToken) onToken(action.notice);
      await new Promise(r => setTimeout(r, action.waitMs));
      retryState = action.state;
      turn--; // retry this turn without consuming a turn
      continue;
    }

    let assistantMessage: {
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    };
    let turnInputTokens = 0;
    let turnOutputTokens = 0;

    if (stream) {
      const parsed = await parseChatCompletionStream(response.body!, {
        onToken: (token) => {
          allStreamedContent += token;
          if (onToken) onToken(token);
        },
      });
      turnInputTokens = parsed.usage.inputTokens;
      turnOutputTokens = parsed.usage.outputTokens;
      // Use empty string (not null) when there are tool_calls — some LLM
      // proxies (LiteLLM→Anthropic) mishandle null content alongside tool_use.
      assistantMessage = {
        content: parsed.content || (parsed.toolCalls ? '' : null),
        tool_calls: parsed.toolCalls,
      };
    } else {
      // Non-streaming path: parse the single chat completion response.
      const data = await response.json() as {
        choices?: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (!data.choices || data.choices.length === 0) {
        throw new Error(
          `LiteLLM returned no choices: ${JSON.stringify(data).slice(0, 200)}`
        );
      }
      assistantMessage = data.choices[0].message;
      turnInputTokens = data.usage?.prompt_tokens ?? 0;
      turnOutputTokens = data.usage?.completion_tokens ?? 0;
    }

    // R3-008: if the run was aborted while the in-flight response was being
    // read, return promptly rather than executing tool calls or issuing
    // another request. (The forwarded fetch signal tears down the connection;
    // this guard short-circuits the post-read work that survives that tear-down
    // on mocked/non-signal-honoring fetches.)
    if (config.signal?.aborted) {
      return {
        content: 'Agent loop aborted (client disconnected).',
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    totalInputTokens += turnInputTokens;
    totalOutputTokens += turnOutputTokens;
    retryState = initialRetryState(); // Reset retry counters on success

    // Check token budget
    if (config.maxTokenBudget && (totalInputTokens + totalOutputTokens) > config.maxTokenBudget) {
      const used = totalInputTokens + totalOutputTokens;
      // Issue #4 — if D1 has already fired, the user's answer is the deliverable;
      // surface it rather than swallowing it under a budget message.
      return {
        content: gateState.preservedAnswerForDistillation
          ?? `Token budget exceeded (used ${used} tokens, limit ${config.maxTokenBudget}).`,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // No tool calls — return the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      // Use this turn's content, or fall back to all accumulated streamed content
      const content = (assistantMessage.content ?? '') || allStreamedContent;
      allStreamedContent = ''; // Release accumulated tokens once consumed
      if (content.trim().length === 0) {
        const err = new Error('LLM returned an empty assistant response with no tool calls');
        (err as Error & { status?: number }).status = 502;
        throw err;
      }
      if (containsRawToolCallMarkup(content) && !rawToolMarkupCorrectionUsed) {
        rawToolMarkupCorrectionUsed = true;
        messages.push({
          role: 'user',
          content: 'Your previous response exposed raw tool-call markup instead of answering. Do not output tool-call tags, JSON tool blocks, or pretend tool calls. Answer the previous user request directly in plain language with the tools currently available.',
        });
        continue;
      }

      // Completion-time gates: D3 (verification) + D1 (skill distillation).
      // See ./loop-gates.ts. If a gate fires, it pushes the corrective
      // directive into `messages` and returns fired=true → continue loop.
      const gate = await maybeFireCompletionGate({
        content,
        toolsUsed,
        messages,
        state: gateState,
        enableVerification: verificationGate,
        enableSkillDistillation: skillDistillationGate,
        onSkillDistillationFire,
        turnId,
      });
      gateState = gate.state;
      if (gate.fired) continue;

      // In non-streaming mode, emit the full content as a single token
      if (!stream && onToken && content) {
        onToken(content);
      }
      // Issue #4 — once D1 has fired, the user's answer was captured before
      // the distillation turn ran; the current `content` is the skill
      // summary, NOT the answer. Surface the preserved answer instead.
      const finalContent = gateState.preservedAnswerForDistillation ?? content;
      logTurnEvent(turnId, {
        stage: 'agent-loop.exit',
        contentChars: finalContent.length,
        toolsUsed,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return {
        content: finalContent,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // Has tool calls — execute them and continue the loop
    // Ensure content is never null when tool_calls are present (LiteLLM→Anthropic compat)
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: assistantMessage.tool_calls.map(toolCallWithValidConversationArgs),
    });

    // Execute each tool call through the explicit middleware chain in
    // `./tool-executor.ts`. Review C2 hook-ordering is preserved there.
    for (const toolCall of assistantMessage.tool_calls) {
      const r = await executeToolCall(toolCall, {
        toolMap,
        guard,
        hooks,
        capabilityRouter: config.capabilityRouter,
        blockedTools: config.governancePolicies?.blockedTools,
        onToolUse,
        onToolResult,
        turnId,
      });
      if (r.countedAsUsed) toolsUsed.push(r.toolName);
      messages.push({ role: 'tool', content: r.content, tool_call_id: r.toolCallId });

      // Steal #9 T3 — a critical failure streak: give up rather than burn more
      // turns retrying a tool that keeps failing. Surface the give-up copy and
      // terminate the run.
      if (r.abort) {
        const giveUp = r.abortReason ?? r.content;
        config.onGiveUp?.(giveUp);
        logTurnEvent(turnId, {
          stage: 'agent-loop.exit',
          contentChars: giveUp.length,
          toolsUsed,
          reason: 'loop-guard-critical-abort',
        });
        return {
          content: giveUp,
          toolsUsed,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }
    }
  }

  // maxTurns reached — return any accumulated content rather than generic message.
  // Issue #4 — if D1 has already fired, prefer the user's captured answer
  // over the generic "max tool turns" fallback (the answer is the deliverable).
  return {
    content: gateState.preservedAnswerForDistillation
      ?? (allStreamedContent || `Max tool turns reached (${maxTurns} turns, ${toolsUsed.length} tools used).`),
    toolsUsed,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
