import type { ToolDefinition } from './tools.js';
import { RISK_LEVELS, riskAtLeast, type RiskLevel } from '@waggle/shared';
import { LoopGuard } from './loop-guard.js';
import { parseChatCompletionStream } from './sse-parser.js';
import { maybeFireCompletionGate, initialGateState } from './loop-gates.js';
import { executeToolCall } from './tool-executor.js';
import { handleNonOkResponse, handleNetworkError, initialRetryState } from './retry-policy.js';
import type { HookRegistry } from './hooks.js';
import type { CapabilityRouter } from './capability-router.js';
import type { TraceRecorder, TraceHandle } from './trace-recorder.js';
import { logTurnEvent } from './turn-context.js';
import {
  capToolResultForModel,
  compactToolContextForModel,
  type ToolContextBudget,
} from './agent-run-budget.js';
import { estimateTokens as estimateTextTokens } from './tool-output-compressor.js';

/** Minimal interface for plugin runtime integration (from @waggle/sdk) */
type PluginToolCandidate = Omit<ToolDefinition, 'riskLevel'> & { riskLevel?: unknown };

export interface PluginToolProvider {
  getAllTools(): PluginToolCandidate[];
}

function normalizePluginToolRisk(value: unknown): RiskLevel {
  if ((RISK_LEVELS as readonly unknown[]).includes(value)) {
    const declared = value as RiskLevel;
    if (riskAtLeast(declared, 'medium')) return declared;
  }
  return 'medium';
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
  /** Evidence/tool rounds allowed before a final synthesis-only turn is forced. */
  maxToolRounds?: number;
  /** Tokens held back from maxTokenBudget for the final synthesis request. */
  synthesisReserveTokens?: number;
  /** Model-facing tool-result hard cap and historical compaction policy. */
  toolContextBudget?: ToolContextBudget;
  stream?: boolean;
  fetch?: typeof globalThis.fetch;
  hooks?: HookRegistry;
  capabilityRouter?: CapabilityRouter;
  /** Optional plugin tool provider — merges active plugin tools into the agent's toolset */
  pluginTools?: PluginToolProvider;
  /** Optional maximum token budget (input + output combined). Loop terminates gracefully when exceeded. */
  maxTokenBudget?: number;
  /** Maximum completion tokens requested from the provider on any one dispatch. */
  maxOutputTokens?: number;
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

const SUPPORTED_COMPLETION_FINISH_REASONS = new Set(['stop', 'tool_calls']);

type IncompleteCompletionError = Error & {
  code: 'INCOMPLETE_COMPLETION';
  usage?: AgentResponse['usage'];
  partialToolCalls?: unknown;
};

function isIncompleteCompletionError(error: unknown): error is IncompleteCompletionError {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'INCOMPLETE_COMPLETION';
}

function incompleteCompletionError(
  reason: string,
  usage: AgentResponse['usage'],
): IncompleteCompletionError {
  const error = new Error(
    `LLM returned an incomplete completion (${reason}); partial content was not accepted.`,
  ) as IncompleteCompletionError;
  error.name = 'IncompleteCompletionError';
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = usage;
  return error;
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
    maxToolRounds,
    synthesisReserveTokens,
    toolContextBudget = {
      maxSingleResultChars: 8_000,
      recentResultCount: 2,
      historicalResultChars: 750,
    },
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

  if (
    config.maxTokenBudget !== undefined
    && (!Number.isFinite(config.maxTokenBudget) || config.maxTokenBudget < 1)
  ) {
    throw new RangeError('maxTokenBudget must be a positive finite number');
  }
  if (
    config.maxOutputTokens !== undefined
    && (!Number.isFinite(config.maxOutputTokens) || config.maxOutputTokens < 1)
  ) {
    throw new RangeError('maxOutputTokens must be a positive finite number');
  }

  logTurnEvent(turnId, {
    stage: 'agent-loop.enter',
    model,
    maxTurns,
    maxToolRounds,
    maxTokenBudget: config.maxTokenBudget,
    synthesisReserveTokens,
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
    ? [
        ...configTools,
        ...pluginToolProvider.getAllTools().map((tool) => ({
          ...tool,
          riskLevel: normalizePluginToolRisk(tool.riskLevel),
        })),
      ]
    : configTools;

  const userRequest = [...inputMessages]
    .reverse()
    .find(message => message.role === 'user')?.content ?? '';

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
  let toolRoundCount = 0;
  let synthesisForced = false;
  let lastRequestInputTokens = 0;
  const maxTokenBudget = typeof config.maxTokenBudget === 'number'
    && Number.isFinite(config.maxTokenBudget)
    && config.maxTokenBudget > 0
    ? Math.floor(config.maxTokenBudget)
    : undefined;
  const configuredOutputCeiling = config.maxOutputTokens ?? synthesisReserveTokens ?? 8_192;
  const outputTokenCeiling = Number.isFinite(configuredOutputCeiling) && configuredOutputCeiling > 0
    ? Math.floor(configuredOutputCeiling)
    : 8_192;

  const budgetStopResponse = (usableContent?: string): AgentResponse => {
    const used = totalInputTokens + totalOutputTokens;
    const content = gateState.preservedAnswerForDistillation
      ?? usableContent?.trim()
      ?? `Token budget exhausted before another safe provider request (used ${used} tokens, limit ${maxTokenBudget}).`;
    logTurnEvent(turnId, {
      stage: 'agent-loop.exit',
      reason: 'token-budget-exhausted',
      contentChars: content.length,
      toolsUsed,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });
    return {
      content,
      toolsUsed,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };
  };

  const forceSynthesis = (reason: 'tool-round-limit' | 'token-reserve'): void => {
    if (synthesisForced) return;
    synthesisForced = true;
    messages.push({
      role: 'user',
      content: [
        'Evidence collection is complete. Do not call more tools. Produce the final answer now using only the evidence already present.',
        'Use this truncation-safe order:',
        '1. First sentence: directly answer the user\'s main question and state any requested recommendation or decision. If the evidence cannot support one, say that there.',
        '2. Immediately complete every other explicit user deliverable, as compactly as the request allows, including requested tables.',
        '3. Only then add source inventories, methodology, detailed fact-versus-inference discussion, evidence gaps, caveats, or other supporting detail.',
        'Do not open with sources, process, or evidence gaps. Cite source URLs alongside supported claims, distinguish verified facts from inference, and do not mention internal turn or token budgets.',
      ].join('\n'),
    });
    logTurnEvent(turnId, {
      stage: 'agent-loop.synthesis-forced',
      reason,
      toolRoundCount,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });
  };

  for (let turn = 0; turn < maxTurns; turn++) {
    // Check for abort between turns
    if (config.signal?.aborted) {
      return {
        content: 'Agent loop aborted (client disconnected).',
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    if (!synthesisForced && maxToolRounds !== undefined && toolRoundCount >= maxToolRounds) {
      forceSynthesis('tool-round-limit');
    }
    const usedBeforeRequest = totalInputTokens + totalOutputTokens;
    let requestMessages = compactToolContextForModel(messages, toolContextBudget);
    const turnOpenAiTools = gateState.verificationCorrectionUsed
      ? openaiTools.filter(tool => tool.function.name !== 'save_memory')
      : openaiTools;
    const estimateNextRequestTokens = (): number => {
      const serializedEstimate = estimateTextTokens(
        JSON.stringify(requestMessages)
        + (!synthesisForced && turnOpenAiTools.length > 0 ? JSON.stringify(turnOpenAiTools) : ''),
      );
      return synthesisForced
        ? serializedEstimate
        : Math.max(lastRequestInputTokens, serializedEstimate);
    };
    let estimatedNextRequestTokens = estimateNextRequestTokens();
    // A tool turn is not safe merely because its own request fits: the next
    // no-tools synthesis must be able to replay comparable context and still
    // retain the configured completion allowance.
    let futureSynthesisReserve = !synthesisForced && turnOpenAiTools.length > 0 && synthesisReserveTokens
      ? estimatedNextRequestTokens + synthesisReserveTokens
      : 0;
    if (
      !synthesisForced
      && turnOpenAiTools.length > 0
      && maxTokenBudget
      && synthesisReserveTokens
      && usedBeforeRequest + estimatedNextRequestTokens + futureSynthesisReserve >= maxTokenBudget
    ) {
      forceSynthesis('token-reserve');
      requestMessages = compactToolContextForModel(messages, toolContextBudget);
      estimatedNextRequestTokens = estimateNextRequestTokens();
      futureSynthesisReserve = 0;
    }

    const outputTokenLimit = maxTokenBudget === undefined
      ? outputTokenCeiling
      : Math.min(
          outputTokenCeiling,
          Math.floor(maxTokenBudget - usedBeforeRequest - estimatedNextRequestTokens - futureSynthesisReserve),
        );
    if (outputTokenLimit < 1) return budgetStopResponse();

    const body: Record<string, unknown> = {
      model,
      messages: requestMessages,
      max_tokens: outputTokenLimit,
    };
    const currentRequestToolNames = synthesisForced
      ? []
      : turnOpenAiTools.map(tool => tool.function.name);
    if (currentRequestToolNames.length > 0) {
      body.tools = turnOpenAiTools;
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
    let completionFinishReason: string | null = null;
    let streamDoneObserved = !stream;
    let currentTurnStreamedContent = '';

    if (stream) {
      let parsed: Awaited<ReturnType<typeof parseChatCompletionStream>>;
      try {
        parsed = await parseChatCompletionStream(response.body!, {
          onToken: (token) => {
            currentTurnStreamedContent += token;
            allStreamedContent += token;
            if (onToken) onToken(token);
          },
        });
      } catch (error) {
        if (!isIncompleteCompletionError(error)) throw error;
        const observedInput = error.usage?.inputTokens ?? 0;
        const observedOutput = error.usage?.outputTokens ?? 0;
        const failedInputTokens = observedInput > 0
          ? observedInput
          : estimatedNextRequestTokens;
        const failedOutputTokens = observedOutput > 0
          ? observedOutput
          : Math.max(1, estimateTextTokens(JSON.stringify({
            content: currentTurnStreamedContent,
            tool_calls: error.partialToolCalls ?? [],
          })));
        error.usage = {
          inputTokens: totalInputTokens + failedInputTokens,
          outputTokens: totalOutputTokens + failedOutputTokens,
        };
        throw error;
      }
      turnInputTokens = parsed.usage.inputTokens;
      turnOutputTokens = parsed.usage.outputTokens;
      completionFinishReason = parsed.finishReason;
      streamDoneObserved = parsed.doneObserved;
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
          finish_reason?: string | null;
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
      completionFinishReason = data.choices[0].finish_reason ?? null;
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

    // Some OpenAI-compatible providers omit usage entirely. Do not interpret
    // missing counters as free work: fall back to the pre-dispatch input
    // estimate and a conservative serialization estimate for the response.
    if (turnInputTokens <= 0) turnInputTokens = estimatedNextRequestTokens;
    if (turnOutputTokens <= 0) {
      turnOutputTokens = estimateTextTokens(JSON.stringify(assistantMessage));
    }

    totalInputTokens += turnInputTokens;
    totalOutputTokens += turnOutputTokens;

    const incompleteReason = completionFinishReason === 'length'
      ? 'finish_reason=length'
      : stream && !streamDoneObserved
        ? 'stream ended before data: [DONE]'
        : completionFinishReason && !SUPPORTED_COMPLETION_FINISH_REASONS.has(completionFinishReason)
          ? `unsupported finish_reason=${completionFinishReason}`
          : null;
    if (incompleteReason) {
      logTurnEvent(turnId, {
        stage: 'agent-loop.incomplete-completion',
        reason: incompleteReason,
        finishReason: completionFinishReason,
        streamDoneObserved,
        inputTokens: turnInputTokens,
        outputTokens: turnOutputTokens,
      });
      throw incompleteCompletionError(incompleteReason, {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
    }

    lastRequestInputTokens = turnInputTokens;
    retryState = initialRetryState(); // Reset retry counters on success

    // Provider usage is authoritative and known only after the response. Once
    // the hard budget is exhausted, do not execute pending tools, completion
    // gates, or a second synthesis request.
    if (maxTokenBudget !== undefined && (totalInputTokens + totalOutputTokens) >= maxTokenBudget) {
      const usableContent = assistantMessage.tool_calls?.length && !synthesisForced
        ? undefined
        : ((assistantMessage.content ?? '').trim() || allStreamedContent.trim() || undefined);
      const result = budgetStopResponse(
        usableContent
          ?? (synthesisReserveTokens
            ? 'I gathered evidence but the token budget was exhausted before a reliable final synthesis.'
            : `Token budget exceeded (used ${totalInputTokens + totalOutputTokens} tokens, limit ${maxTokenBudget}).`),
      );
      if (!stream && onToken && result.content) onToken(result.content);
      return result;
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
      // See ./loop-gates.ts. If a gate fires, it amends the internal context
      // and returns fired=true → continue loop.
      const gate = await maybeFireCompletionGate({
        content,
        toolsUsed,
        availableToolNames: currentRequestToolNames,
        messages,
        userRequest,
        state: gateState,
        enableVerification: verificationGate,
        enableSkillDistillation: skillDistillationGate,
        onSkillDistillationFire,
        turnId,
      });
      gateState = gate.state;
      if (gate.fired) {
        if (stream && onToken && gate.contentSuffix) onToken(gate.contentSuffix);
        continue;
      }

      const acceptedContent = `${content}${gate.contentSuffix ?? ''}`;
      // Once D1 has fired, surface the preserved user answer instead of the
      // internal skill-distillation summary produced by the current turn.
      const finalContent = gateState.preservedAnswerForDistillation ?? acceptedContent;

      // In non-streaming mode, emit the full content as a single token
      if (!stream && onToken && finalContent) {
        onToken(finalContent);
      } else if (stream && onToken && gate.contentSuffix) {
        onToken(gate.contentSuffix);
      }
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

    // Tool definitions are withheld on the reserved synthesis turn. If a model
    // nevertheless emits a phantom native call, accept its prose but never
    // execute beyond the evidence budget.
    if (synthesisForced) {
      const synthesis = (assistantMessage.content ?? '').trim()
        || allStreamedContent
        || 'I gathered evidence but could not complete a reliable synthesis. Please retry the final synthesis.';
      if (!stream && onToken && synthesis) onToken(synthesis);
      return {
        content: gateState.preservedAnswerForDistillation ?? synthesis,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // Has tool calls — execute them and continue the loop
    toolRoundCount++;
    // Ensure content is never null when tool_calls are present (LiteLLM→Anthropic compat)
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: assistantMessage.tool_calls.map(toolCallWithValidConversationArgs),
    });

    // Execute each tool call through the explicit middleware chain in
    // `./tool-executor.ts`. Review C2 hook-ordering is preserved there.
    const turnToolMap = gateState.verificationCorrectionUsed
      ? new Map([...toolMap].filter(([name]) => name !== 'save_memory'))
      : toolMap;
    for (const toolCall of assistantMessage.tool_calls) {
      const r = await executeToolCall(toolCall, {
        toolMap: turnToolMap,
        guard,
        hooks,
        capabilityRouter: config.capabilityRouter,
        blockedTools: config.governancePolicies?.blockedTools,
        onToolUse,
        onToolResult,
        turnId,
      });
      if (r.countedAsUsed) toolsUsed.push(r.toolName);
      messages.push({
        role: 'tool',
        content: capToolResultForModel(r.content, toolContextBudget.maxSingleResultChars),
        tool_call_id: r.toolCallId,
      });

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

  // maxTurns reached — bounded runs must never expose an internal max-turn
  // message. Normally the reserved synthesis turn returns above; this fallback
  // is only for a malformed provider response during that final request.
  return {
    content: gateState.preservedAnswerForDistillation
      ?? (allStreamedContent || (synthesisReserveTokens
        ? 'I gathered evidence but could not complete a reliable synthesis. Please retry the final synthesis.'
        : `Max tool turns reached (${maxTurns} turns, ${toolsUsed.length} tools used).`)),
    toolsUsed,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
