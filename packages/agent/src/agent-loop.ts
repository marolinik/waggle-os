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
import type {
  ModelSpendBudget,
  ModelSpendBillingClass,
  ModelSpendReservation,
} from './cost-tracker.js';
import { MODEL_SPEND_RESERVATION_HEADER } from './cost-tracker.js';
import { normalizeReasoningOutput } from './output-normalize.js';

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
  /** Canonical priced model before any provider-specific ID rewriting. */
  billingModel?: string;
  /** Shared process budget ledger. Omit to preserve unmanaged/library callers. */
  modelSpendBudget?: ModelSpendBudget;
  /** Set to free only after the server has verified the route is offline/free. */
  modelSpendBillingClass?: ModelSpendBillingClass;
  spendWorkspaceId?: string;
  /** Existing durable trace that must own self-proxy spend before dispatch. */
  modelSpendTraceId?: number;
  systemPrompt: string;
  tools: ToolDefinition[];
  messages: Array<{ role: string; content: string }>;
  onToken?: (token: string) => void;
  /** Signals provider reasoning activity without exposing private reasoning text. */
  onReasoningActivity?: () => void;
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
  /**
   * Absolute deadline for one logical model operation, including retries and
   * backoff. It resets after an accepted response, before any tool executes.
   */
  modelOperationTimeoutMs?: number;
  /** One-shot deadline for first provider activity on the first model request. */
  initialModelActivityTimeoutMs?: number;
  /** Optional provider-native reasoning policy. Omitted to preserve provider defaults. */
  reasoning?: {
    enabled: boolean;
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  };
  /** Force one already-authorized tool on the first model turn only. */
  toolChoice?: string;
  /** Force an authorized ordered tool sequence, then reserve one synthesis turn. */
  requiredToolSequence?: readonly string[];
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

const EXPLICIT_CITATION_INTENT = /\b(?:cite|citations?|source\s+urls?|provide\s+(?:the\s+)?(?:sources?|links?)|include\s+(?:the\s+)?(?:sources?|links?))\b/i;
const NEGATED_CITATION_INTENT = /\b(?:do\s+not|don't|dont|never|avoid|omit|without|no)\b(?:\s+\w+){0,4}\s+(?:cite|citations?|sources?|source\s+urls?|links?)\b/i;
const UNUSABLE_FETCH_RESULT = /^(?:error\b|fetch\s+(?:failed|error)\b|page fetched but no text content found\b|\[(?:security|blocked)\]|tool\s+"[^"]+"\s+(?:is blocked|not found)\b)/i;

function safeFetchedCitationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // Never reproduce credentials or signed/query-bearing URLs automatically.
    if (parsed.username || parsed.password || parsed.search) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function appendFetchedSourceFooter(
  content: string,
  citationIntent: boolean,
  fetchedUrls: ReadonlySet<string>,
): { content: string; suffix: string } {
  if (!citationIntent || fetchedUrls.size === 0) return { content, suffix: '' };
  const missing = [...fetchedUrls].filter(url => !content.includes(url));
  if (missing.length === 0) return { content, suffix: '' };
  const suffix = `${content.endsWith('\n') ? '\n' : '\n\n'}Sources fetched:\n${missing.map(url => `- ${url}`).join('\n')}`;
  return { content: `${content}${suffix}`, suffix };
}

const SUPPORTED_COMPLETION_FINISH_REASONS = new Set(['stop', 'tool_calls']);

type IncompleteCompletionError = Error & {
  code: 'INCOMPLETE_COMPLETION';
  usage?: AgentResponse['usage'];
  partialToolCalls?: unknown;
};

type EmptyModelResponseError = Error & {
  code: 'EMPTY_MODEL_RESPONSE';
  status: 502;
  usage: AgentResponse['usage'];
  toolsUsed: string[];
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

function isQwenModelId(modelId: string): boolean {
  return /(?:^|[/._-])qwen(?:$|[/_.:-]|\d)/i.test(modelId);
}

function emptyModelResponseError(
  usage: AgentResponse['usage'],
  toolsUsed: readonly string[],
): EmptyModelResponseError {
  const error = new Error('LLM returned an empty assistant response with no tool calls') as EmptyModelResponseError;
  error.name = 'EmptyModelResponseError';
  error.code = 'EMPTY_MODEL_RESPONSE';
  error.status = 502;
  error.usage = usage;
  error.toolsUsed = [...toolsUsed];
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
    onReasoningActivity,
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

  const isQwenModel = isQwenModelId(config.billingModel ?? model);
  // Literal reasoning tags cannot be removed safely token-by-token because an
  // orphan close can retroactively mark earlier text as private. Buffer Qwen
  // streams and emit the normalized accepted response once; other providers
  // retain their existing token streaming behavior.
  const bufferReasoningSensitiveStream = stream && isQwenModel;

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
  if (
    config.modelOperationTimeoutMs !== undefined
    && (!Number.isFinite(config.modelOperationTimeoutMs) || config.modelOperationTimeoutMs < 1)
  ) {
    throw new RangeError('modelOperationTimeoutMs must be a positive finite number');
  }
  if (
    config.initialModelActivityTimeoutMs !== undefined
    && (!Number.isFinite(config.initialModelActivityTimeoutMs) || config.initialModelActivityTimeoutMs < 1)
  ) {
    throw new RangeError('initialModelActivityTimeoutMs must be a positive finite number');
  }

  const userRequest = [...inputMessages]
    .reverse()
    .find(message => message.role === 'user')?.content ?? '';
  const citationIntent = EXPLICIT_CITATION_INTENT.test(userRequest)
    && !NEGATED_CITATION_INTENT.test(userRequest);
  const successfullyFetchedCitationUrls = new Set<string>();
  let lastToolObservation: {
    name: string;
    citationUrl: string | null;
    usableResult: boolean;
  } | undefined;

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

  const onToolResult = (
    name: string,
    input: Record<string, unknown>,
    result: string,
  ) => {
    const trimmedResult = result.trim();
    lastToolObservation = {
      name,
      citationUrl: safeFetchedCitationUrl(input.url),
      usableResult: trimmedResult.length > 0 && !UNUSABLE_FETCH_RESULT.test(trimmedResult),
    };
    traceCallbacks?.onToolResult(name, input, result);
    userOnToolResult?.(name, input, result);
  };

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

  const requiredToolSequence = config.requiredToolSequence
    ? [...config.requiredToolSequence]
    : [];
  if (requiredToolSequence.length > 0 && config.toolChoice) {
    throw new Error('toolChoice and requiredToolSequence cannot be used together');
  }
  for (const requiredToolName of requiredToolSequence) {
    if (
      typeof requiredToolName !== 'string'
      || requiredToolName.trim() !== requiredToolName
      || requiredToolName.length === 0
    ) {
      throw new Error('Required tool sequence contains an invalid tool name');
    }
    const matchingTools = tools.filter((tool) => tool.name === requiredToolName);
    if (matchingTools.length === 0) {
      throw new Error(`Required tool ${requiredToolName} is unavailable`);
    }
    if (matchingTools.length > 1) {
      throw new Error(`Required tool ${requiredToolName} is ambiguous`);
    }
  }
  if (requiredToolSequence.length > 0 && maxTurns < requiredToolSequence.length + 1) {
    throw new Error('Required tool sequence does not fit within maxTurns');
  }
  if (
    requiredToolSequence.length > 0
    && maxToolRounds !== undefined
    && maxToolRounds < requiredToolSequence.length
  ) {
    throw new Error('Required tool sequence does not fit within maxToolRounds');
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
  const modelOperationTimeoutMs = config.modelOperationTimeoutMs === undefined
    ? undefined
    : Math.floor(config.modelOperationTimeoutMs);
  let modelOperationDeadlineAt: number | undefined;
  const initialModelActivityTimeoutMs = config.initialModelActivityTimeoutMs === undefined
    ? undefined
    : Math.floor(config.initialModelActivityTimeoutMs);
  let initialModelActivityArmed = initialModelActivityTimeoutMs !== undefined;
  let initialModelActivityDeadlineAt: number | undefined;
  let initialModelActivityTimer: ReturnType<typeof setTimeout> | undefined;
  const initialModelActivityController = new AbortController();
  let activeRequestEstimatedInputTokens = 0;
  let activeRequestEstimatedInputCommitted = false;
  let initialActivityCommittedEstimatedInputTokens = 0;
  const modelOperationTimeoutError = (): Error & {
    code: 'MODEL_OPERATION_TIMEOUT';
    usage: { inputTokens: number; outputTokens: number };
    toolsUsed: string[];
  } => {
    const seconds = (modelOperationTimeoutMs ?? 0) / 1_000;
    const guidance = toolsUsed.length > 0
      ? 'Review completed activity before retrying to avoid duplicate actions.'
      : 'The provider may be unavailable; retry this turn.';
    const error = new Error(
      `Model operation timed out after ${seconds} seconds. ${guidance}`,
    ) as Error & {
      code: 'MODEL_OPERATION_TIMEOUT';
      usage: { inputTokens: number; outputTokens: number };
      toolsUsed: string[];
    };
    error.name = 'ModelOperationTimeoutError';
    error.code = 'MODEL_OPERATION_TIMEOUT';
    error.usage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    error.toolsUsed = [...toolsUsed];
    return error;
  };
  const initialModelActivityTimeoutError = (): Error & {
    code: 'INITIAL_MODEL_ACTIVITY_TIMEOUT';
    retryable: true;
    usageEstimated: true;
    usage: { inputTokens: number; outputTokens: number };
    toolsUsed: string[];
  } => {
    const seconds = (initialModelActivityTimeoutMs ?? 0) / 1_000;
    const error = new Error(
      `Initial model activity timed out after ${seconds} seconds. The provider may be unavailable; retry this turn.`,
    ) as Error & {
      code: 'INITIAL_MODEL_ACTIVITY_TIMEOUT';
      retryable: true;
      usageEstimated: true;
      usage: { inputTokens: number; outputTokens: number };
      toolsUsed: string[];
    };
    error.name = 'InitialModelActivityTimeoutError';
    error.code = 'INITIAL_MODEL_ACTIVITY_TIMEOUT';
    error.retryable = true;
    error.usageEstimated = true;
    error.usage = {
      inputTokens: totalInputTokens
        + initialActivityCommittedEstimatedInputTokens
        + (activeRequestEstimatedInputCommitted ? 0 : activeRequestEstimatedInputTokens),
      outputTokens: totalOutputTokens,
    };
    error.toolsUsed = [...toolsUsed];
    return error;
  };
  const disarmInitialModelActivityTimeout = (): void => {
    if (!initialModelActivityArmed) return;
    initialModelActivityArmed = false;
    initialModelActivityDeadlineAt = undefined;
    if (initialModelActivityTimer !== undefined) clearTimeout(initialModelActivityTimer);
    initialModelActivityTimer = undefined;
    activeRequestEstimatedInputTokens = 0;
    activeRequestEstimatedInputCommitted = false;
    initialActivityCommittedEstimatedInputTokens = 0;
  };
  const commitReservedModelSpend = (reservation: ModelSpendReservation): void => {
    if (initialModelActivityArmed && !activeRequestEstimatedInputCommitted) {
      initialActivityCommittedEstimatedInputTokens += activeRequestEstimatedInputTokens;
      activeRequestEstimatedInputCommitted = true;
    }
    config.modelSpendBudget?.commitReservedModelSpend(reservation);
  };
  const ensureInitialModelActivityDeadline = (): AbortSignal | undefined => {
    if (!initialModelActivityArmed || initialModelActivityTimeoutMs === undefined) return undefined;
    if (initialModelActivityDeadlineAt === undefined) {
      initialModelActivityDeadlineAt = Date.now() + initialModelActivityTimeoutMs;
      initialModelActivityTimer = setTimeout(() => {
        if (initialModelActivityArmed) {
          initialModelActivityController.abort(initialModelActivityTimeoutError());
        }
      }, initialModelActivityTimeoutMs);
    }
    return initialModelActivityController.signal;
  };
  const initialModelActivityExpired = (deadlineSignal?: AbortSignal): boolean => (
    initialModelActivityArmed
    && initialModelActivityDeadlineAt !== undefined
    && (deadlineSignal?.aborted === true || Date.now() >= initialModelActivityDeadlineAt)
  );
  const throwIfInitialModelActivityExpired = (deadlineSignal?: AbortSignal): void => {
    if (initialModelActivityExpired(deadlineSignal)) throw initialModelActivityTimeoutError();
  };
  const clientAbortError = (usage = {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  }): Error & {
    code: 'AGENT_LOOP_ABORTED';
    usage: { inputTokens: number; outputTokens: number };
    toolsUsed: string[];
  } => {
    const error = new Error('Agent loop aborted (client disconnected).') as Error & {
      code: 'AGENT_LOOP_ABORTED';
      usage: { inputTokens: number; outputTokens: number };
      toolsUsed: string[];
    };
    error.name = 'AgentLoopAbortError';
    error.code = 'AGENT_LOOP_ABORTED';
    error.usage = usage;
    error.toolsUsed = [...toolsUsed];
    return error;
  };
  const ensureModelOperationDeadline = (): number | undefined => {
    if (modelOperationTimeoutMs === undefined) return undefined;
    modelOperationDeadlineAt ??= Date.now() + modelOperationTimeoutMs;
    return modelOperationDeadlineAt;
  };
  const modelOperationExpired = (deadlineSignal?: AbortSignal): boolean => (
    modelOperationDeadlineAt !== undefined
    && (deadlineSignal?.aborted === true || Date.now() >= modelOperationDeadlineAt)
  );
  const throwIfModelOperationExpired = (deadlineSignal?: AbortSignal): void => {
    if (modelOperationExpired(deadlineSignal)) throw modelOperationTimeoutError();
  };
  const waitForRequestStage = <T>(
    startOperation: () => Promise<T>,
    requestSignal: AbortSignal,
    deadlineSignal?: AbortSignal,
    cancelOperation?: (reason: unknown) => void,
  ): Promise<T> => {
    if (config.signal?.aborted) {
      return Promise.reject(clientAbortError());
    }
    if (modelOperationExpired(deadlineSignal)) {
      return Promise.reject(modelOperationTimeoutError());
    }
    if (requestSignal.aborted) {
      return Promise.reject(requestSignal.reason ?? new Error('LLM request aborted.'));
    }

    const deadlineAt = modelOperationDeadlineAt;
    const remainingMs = deadlineAt === undefined ? undefined : deadlineAt - Date.now();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let cancelled = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        requestSignal.removeEventListener('abort', onAbort);
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      };
      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        action();
      };
      const cancel = (reason: unknown) => {
        if (cancelled) return;
        cancelled = true;
        try { cancelOperation?.(reason); } catch { /* best effort */ }
      };
      const onAbort = () => {
        const reason = config.signal?.aborted
          ? clientAbortError()
          : initialModelActivityExpired(initialModelActivityController.signal)
            ? initialModelActivityTimeoutError()
          : modelOperationExpired(deadlineSignal)
            ? modelOperationTimeoutError()
            : requestSignal.reason ?? new Error('LLM request aborted.');
        cancel(reason);
        settle(() => reject(reason));
      };

      requestSignal.addEventListener('abort', onAbort, { once: true });
      if (requestSignal.aborted) {
        onAbort();
        return;
      }
      if (remainingMs !== undefined) {
        deadlineTimer = setTimeout(
          () => {
            const error = modelOperationTimeoutError();
            cancel(error);
            settle(() => reject(error));
          },
          Math.max(0, remainingMs),
        );
      }
      let operation: Promise<T>;
      try {
        operation = startOperation();
      } catch (error) {
        settle(() => reject(error));
        return;
      }
      operation.then(
        value => settle(() => resolve(value)),
        error => settle(() => reject(error)),
      );
    });
  };
  const waitForRetry = async (waitMs: number): Promise<void> => {
    if (config.signal?.aborted) {
      throw clientAbortError();
    }
    const deadlineAt = modelOperationDeadlineAt;
    const remainingMs = deadlineAt === undefined ? undefined : deadlineAt - Date.now();
    if (remainingMs !== undefined && remainingMs <= 0) throw modelOperationTimeoutError();
    const initialRemainingMs = initialModelActivityArmed && initialModelActivityDeadlineAt !== undefined
      ? initialModelActivityDeadlineAt - Date.now()
      : undefined;
    if (initialRemainingMs !== undefined && initialRemainingMs <= 0) throw initialModelActivityTimeoutError();
    const boundedWaitMs = Math.min(waitMs, remainingMs ?? waitMs, initialRemainingMs ?? waitMs);

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(clientAbortError());
      };
      const onInitialActivityTimeout = () => {
        clearTimeout(timer);
        config.signal?.removeEventListener('abort', onAbort);
        reject(initialModelActivityTimeoutError());
      };
      const timer = setTimeout(() => {
        config.signal?.removeEventListener('abort', onAbort);
        initialModelActivityController.signal.removeEventListener('abort', onInitialActivityTimeout);
        resolve();
      }, boundedWaitMs);
      config.signal?.addEventListener('abort', onAbort, { once: true });
      if (initialModelActivityArmed) {
        initialModelActivityController.signal.addEventListener('abort', onInitialActivityTimeout, { once: true });
      }
    });

    throwIfInitialModelActivityExpired(initialModelActivityController.signal);
    throwIfModelOperationExpired();
  };
  // One-shot completion gates (D3 verification, D1 skill distillation) +
  // preserved-answer slot for issue #4. See `./loop-gates.ts` for details.
  let gateState = initialGateState();
  let toolRoundCount = 0;
  let requiredToolIndex = 0;
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

  const budgetStopResponse = (
    usableContent?: string,
    usableContentWasStreamed = false,
  ): AgentResponse => {
    const used = totalInputTokens + totalOutputTokens;
    const preservedContent = gateState.preservedAnswerForDistillation;
    const usableAnswer = usableContent?.trim();
    const baseContent = preservedContent
      ?? usableAnswer
      ?? `Token budget exhausted before another safe provider request (used ${used} tokens, limit ${maxTokenBudget}).`;
    const finalized = appendFetchedSourceFooter(
      baseContent,
      citationIntent,
      successfullyFetchedCitationUrls,
    );
    if (onToken) {
      if (!stream || bufferReasoningSensitiveStream) {
        onToken(finalized.content);
      } else if (preservedContent || usableContentWasStreamed) {
        if (finalized.suffix) onToken(finalized.suffix);
      } else {
        onToken(finalized.content);
      }
    }
    const content = finalized.content;
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

  const forceSynthesis = (
    reason: 'tool-round-limit' | 'token-reserve' | 'required-tool-sequence',
  ): void => {
    if (requiredToolIndex < requiredToolSequence.length) {
      throw new Error('Required tool sequence could not complete before synthesis');
    }
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

  try {
  for (let turn = 0; turn < maxTurns; turn++) {
    // Check for abort between turns
    if (config.signal?.aborted) {
      throw clientAbortError();
    }

    const pendingRequiredTool = requiredToolSequence[requiredToolIndex];
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
    if (outputTokenLimit < 1) {
      if (pendingRequiredTool) {
        throw new Error(`Required tool ${pendingRequiredTool} could not start within the token budget`);
      }
      return budgetStopResponse();
    }
    activeRequestEstimatedInputTokens = estimatedNextRequestTokens;
    activeRequestEstimatedInputCommitted = false;

    const body: Record<string, unknown> = {
      model,
      messages: requestMessages,
      max_tokens: outputTokenLimit,
    };
    if (/^openai-compatible\/qwen(?:$|[/_.:-]|\d)/i.test(config.billingModel ?? model)) {
      // Keep keyless/local Qwen chat interactive even when the loop talks to
      // the compatible endpoint directly instead of through Waggle's proxy.
      body.chat_template_kwargs = { enable_thinking: false };
    }
    if (config.reasoning) {
      body.reasoning = { ...config.reasoning };
    }
    const currentRequestToolNames = synthesisForced
      ? []
      : turnOpenAiTools.map(tool => tool.function.name);
    if (currentRequestToolNames.length > 0) {
      body.tools = turnOpenAiTools;
    }
    if (pendingRequiredTool && !currentRequestToolNames.includes(pendingRequiredTool)) {
      throw new Error(`Required tool ${pendingRequiredTool} is unavailable for this turn`);
    }
    const legacyForcedToolChoiceActive = (
      turn === 0
      && config.toolChoice
      && currentRequestToolNames.includes(config.toolChoice)
    );
    const forcedToolName = pendingRequiredTool
      ?? (legacyForcedToolChoiceActive ? config.toolChoice : undefined);
    const forcedToolChoiceActive = Boolean(forcedToolName);
    if (forcedToolChoiceActive) {
      body.tool_choice = {
        type: 'function',
        function: { name: forcedToolName },
      };
      body.parallel_tool_calls = false;
    }
    // A forced synthesis is the only request in the turn that cannot execute
    // tools. Make it atomic so an upstream SSE truncation cannot discard an
    // otherwise complete evidence-backed answer after all tool work finished.
    const requestUsesStream = stream && !synthesisForced;
    if (requestUsesStream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }

    // R3-008: forward the client-disconnect signal so an aborted run tears down
    // the connection (and, on the streaming path, the body reader rejects)
    // instead of consuming the stream to completion. Merged with a per-request
    // timeout so a hung connection can't wedge the turn forever.
    const deadlineAt = ensureModelOperationDeadline();
    const initialModelActivitySignal = ensureInitialModelActivityDeadline();
    const remainingModelOperationMs = deadlineAt === undefined ? undefined : deadlineAt - Date.now();
    if (remainingModelOperationMs !== undefined && remainingModelOperationMs <= 0) {
      throw modelOperationTimeoutError();
    }
    const timeoutSignal = AbortSignal.timeout(llmTimeoutMs);
    const modelOperationSignal = remainingModelOperationMs === undefined
      ? undefined
      : AbortSignal.timeout(Math.max(1, remainingModelOperationMs));
    const requestSignals = [config.signal, timeoutSignal, modelOperationSignal, initialModelActivitySignal]
      .filter((signal): signal is AbortSignal => signal !== undefined);
    const requestSignal = requestSignals.length === 1
      ? requestSignals[0]
      : AbortSignal.any(requestSignals);

    let response: Response;
    let spendReservation: ModelSpendReservation | undefined = config.modelSpendBudget?.reserveModelSpend({
      model: config.billingModel ?? model,
      inputTokens: estimatedNextRequestTokens,
      maxOutputTokens: outputTokenLimit,
      workspaceId: config.spendWorkspaceId,
      billingClass: config.modelSpendBillingClass,
    });
    const reservationHandoff = spendReservation
      ? config.modelSpendBudget?.issueModelSpendReservationHandoff?.(
          spendReservation,
          JSON.stringify(body),
          litellmUrl,
          config.modelSpendTraceId ?? config.traceRecording?.handle.id,
        )
      : undefined;
    try {
      response = await waitForRequestStage(
        () => fetchFn(`${litellmUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${litellmApiKey}`,
            ...(reservationHandoff
              ? { [MODEL_SPEND_RESERVATION_HEADER]: reservationHandoff.token }
              : {}),
          },
          body: JSON.stringify(body),
          signal: requestSignal,
        }),
        requestSignal,
        modelOperationSignal,
      );
    } catch (netErr) {
      if (reservationHandoff) {
        const handoffDisposition = config.modelSpendBudget?.takeModelSpendReservationHandoffDisposition?.(
          reservationHandoff.token,
        );
        config.modelSpendBudget?.discardModelSpendReservationHandoff?.(reservationHandoff.token);
        if (handoffDisposition === 'release' && spendReservation) {
          config.modelSpendBudget?.releaseReservedModelSpend(spendReservation);
          spendReservation = undefined;
        }
      }
      if (spendReservation) {
        commitReservedModelSpend(spendReservation);
        spendReservation = undefined;
      }
      // The fetch promise itself rejected — a network-level failure (endpoint
      // down / restarting, socket hang-up, "fetch failed") or our timeout fired.
      // A genuine client disconnect propagates as a cancellation, never as a
      // successful assistant response.
      // Everything else is a transient
      // outage that must NOT kill the turn: retry with backoff, same protocol as
      // a 5xx, capped at 3 attempts before surfacing a clean fatal error.
      if (config.signal?.aborted) {
        throw clientAbortError();
      }
      if (initialModelActivityExpired(initialModelActivitySignal)) throw initialModelActivityTimeoutError();
      if (modelOperationExpired(modelOperationSignal)) throw modelOperationTimeoutError();
      const action = handleNetworkError(netErr, retryState);
      if (action.kind === 'fatal') throw action.error;
      if (onToken) onToken(action.notice);
      await waitForRetry(action.waitMs);
      retryState = action.state;
      turn--; // retry this turn without consuming a turn
      continue;
    }

    if (reservationHandoff) {
      const handoffDisposition = config.modelSpendBudget?.takeModelSpendReservationHandoffDisposition?.(
        reservationHandoff.token,
      );
      config.modelSpendBudget?.discardModelSpendReservationHandoff?.(reservationHandoff.token);
      if (handoffDisposition === 'release' && spendReservation) {
        config.modelSpendBudget?.releaseReservedModelSpend(spendReservation);
        spendReservation = undefined;
      }
    }
    try {
      throwIfInitialModelActivityExpired(initialModelActivitySignal);
      throwIfModelOperationExpired(modelOperationSignal);
    } catch (error) {
      if (spendReservation) {
        commitReservedModelSpend(spendReservation);
        spendReservation = undefined;
      }
      throw error;
    }
    if (!response.ok) {
      try {
        const action = await waitForRequestStage(
          () => handleNonOkResponse(response, retryState),
          requestSignal,
          modelOperationSignal,
        );
        if (spendReservation) {
          const definitelyRejectedBeforeInference = response.status === 429
            || [400, 401, 403, 404, 405, 413, 415, 422].includes(response.status);
          if (definitelyRejectedBeforeInference) {
            config.modelSpendBudget?.releaseReservedModelSpend(spendReservation);
          } else {
            // Server-side failures can be ambiguous about inference/token use.
            commitReservedModelSpend(spendReservation);
          }
          spendReservation = undefined;
        }
        if (action.kind === 'fatal') throw action.error;
        if (onToken) onToken(action.notice);
        await waitForRetry(action.waitMs);
        retryState = action.state;
        turn--; // retry this turn without consuming a turn
        continue;
      } catch (error) {
        if (spendReservation) {
          commitReservedModelSpend(spendReservation);
          spendReservation = undefined;
        }
        if (config.signal?.aborted) {
          throw clientAbortError();
        }
        throw error;
      }
    }

    let assistantMessage: {
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    };
    let turnInputTokens = 0;
    let turnOutputTokens = 0;
    let completionFinishReason: string | null = null;
    let streamDoneObserved = !requestUsesStream;
    let currentTurnStreamedContent = '';

    if (requestUsesStream) {
      let parsed: Awaited<ReturnType<typeof parseChatCompletionStream>>;
      let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let streamStageActive = true;
      try {
        try {
          parsed = await waitForRequestStage(
            () => {
              upstreamReader = response.body!.getReader();
              const cancellableBody = new ReadableStream<Uint8Array>({
                async pull(controller) {
                  const chunk = await upstreamReader!.read();
                  if (chunk.done) controller.close();
                  else controller.enqueue(chunk.value);
                },
                cancel(reason) {
                  return upstreamReader?.cancel(reason);
                },
              });
              return parseChatCompletionStream(cancellableBody, {
                onActivity: () => {
                  if (!streamStageActive || requestSignal.aborted) return;
                  disarmInitialModelActivityTimeout();
                },
                onToken: (token) => {
                  if (!streamStageActive || requestSignal.aborted || modelOperationExpired(modelOperationSignal)) {
                    return;
                  }
                  currentTurnStreamedContent += token;
                  allStreamedContent += token;
                  if (onToken && !bufferReasoningSensitiveStream) onToken(token);
                },
                onReasoningActivity: () => {
                  if (!streamStageActive || requestSignal.aborted || modelOperationExpired(modelOperationSignal)) {
                    return;
                  }
                  onReasoningActivity?.();
                },
              });
            },
            requestSignal,
            modelOperationSignal,
            reason => { void upstreamReader?.cancel(reason).catch(() => undefined); },
          );
          throwIfInitialModelActivityExpired(initialModelActivitySignal);
          throwIfModelOperationExpired(modelOperationSignal);
        } finally {
          streamStageActive = false;
        }
      } catch (error) {
        if (config.signal?.aborted) {
          if (spendReservation) {
            commitReservedModelSpend(spendReservation);
            spendReservation = undefined;
          }
          throw clientAbortError();
        }
        const bodyReadError = initialModelActivityExpired(initialModelActivitySignal)
          ? initialModelActivityTimeoutError()
          : modelOperationExpired(modelOperationSignal)
            ? modelOperationTimeoutError()
            : error;
        if (!isIncompleteCompletionError(bodyReadError)) {
          if (spendReservation) {
            commitReservedModelSpend(spendReservation);
            spendReservation = undefined;
          }
          throw bodyReadError;
        }
        const observedInput = bodyReadError.usage?.inputTokens ?? 0;
        const observedOutput = bodyReadError.usage?.outputTokens ?? 0;
        const failedInputTokens = observedInput > 0
          ? observedInput
          : estimatedNextRequestTokens;
        const failedOutputTokens = observedOutput > 0
          ? observedOutput
          : Math.max(1, estimateTextTokens(JSON.stringify({
            content: currentTurnStreamedContent,
            tool_calls: bodyReadError.partialToolCalls ?? [],
          })));
        bodyReadError.usage = {
          inputTokens: totalInputTokens + failedInputTokens,
          outputTokens: totalOutputTokens + failedOutputTokens,
        };
        if (spendReservation) {
          if (observedInput > 0 || observedOutput > 0) {
            config.modelSpendBudget?.reconcileModelSpend(spendReservation, {
              inputTokens: failedInputTokens,
              outputTokens: failedOutputTokens,
            });
          } else {
            commitReservedModelSpend(spendReservation);
          }
          spendReservation = undefined;
        }
        throw bodyReadError;
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
      try {
        const data = await waitForRequestStage(
          () => response.json() as Promise<{
            choices?: Array<{
              finish_reason?: string | null;
              message: {
                content: string | null;
                tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
              };
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          }>,
          requestSignal,
          modelOperationSignal,
        );
        if (!data.choices || data.choices.length === 0) {
          throw new Error(
            `LiteLLM returned no choices: ${JSON.stringify(data).slice(0, 200)}`
          );
        }
        const choice = data.choices[0];
        if (!choice.message || typeof choice.message !== 'object') {
          throw new Error(
            `LiteLLM returned an invalid choice: ${JSON.stringify(choice).slice(0, 200)}`
          );
        }
        assistantMessage = choice.message;
        if ((assistantMessage.content ?? '').length > 0 || assistantMessage.tool_calls?.length) {
          disarmInitialModelActivityTimeout();
        }
        completionFinishReason = choice.finish_reason ?? null;
      turnInputTokens = data.usage?.prompt_tokens ?? 0;
      turnOutputTokens = data.usage?.completion_tokens ?? 0;
      throwIfInitialModelActivityExpired(initialModelActivitySignal);
      throwIfModelOperationExpired(modelOperationSignal);
      } catch (error) {
        if (config.signal?.aborted) {
          if (spendReservation) {
            commitReservedModelSpend(spendReservation);
            spendReservation = undefined;
          }
          throw clientAbortError();
        }
        const bodyReadError = initialModelActivityExpired(initialModelActivitySignal)
          ? initialModelActivityTimeoutError()
          : modelOperationExpired(modelOperationSignal)
            ? modelOperationTimeoutError()
            : error;
        if (spendReservation) {
          commitReservedModelSpend(spendReservation);
          spendReservation = undefined;
        }
        throw bodyReadError;
      }
    }

    // Preserve the raw response only for fallback usage/spend accounting.
    // It must never flow into gates, messages, persistence, traces, or output.
    const rawAssistantMessageForUsage = JSON.stringify(assistantMessage);

    // Qwen-compatible engines can emit private reasoning as literal ordinary
    // content even when thinking is disabled. Normalize before budgets, gates,
    // tool-message insertion, trace/autosave, or final return can consume it.
    if (isQwenModel) {
      if (assistantMessage.content !== null) {
        assistantMessage.content = normalizeReasoningOutput(assistantMessage.content).normalized;
      }
      if (allStreamedContent) {
        allStreamedContent = normalizeReasoningOutput(allStreamedContent).normalized;
      }
    }

    // Some OpenAI-compatible providers omit or corrupt usage counters. Do not
    // interpret missing/non-finite counters as free work.
    if (!Number.isFinite(turnInputTokens) || turnInputTokens <= 0) {
      turnInputTokens = estimatedNextRequestTokens;
    }
    if (!Number.isFinite(turnOutputTokens) || turnOutputTokens <= 0) {
      turnOutputTokens = estimateTextTokens(rawAssistantMessageForUsage);
    }

    if (spendReservation) {
      config.modelSpendBudget?.reconcileModelSpend(spendReservation, {
        inputTokens: turnInputTokens,
        outputTokens: turnOutputTokens,
      });
      spendReservation = undefined;
    }

    // R3-008: if the run was aborted while the in-flight response was being
    // read, reject promptly rather than executing tool calls or issuing
    // another request. (The forwarded fetch signal tears down the connection;
    // this guard short-circuits the post-read work that survives that tear-down
    // on mocked/non-signal-honoring fetches.)
    if (config.signal?.aborted) {
      throw clientAbortError({
        inputTokens: totalInputTokens + turnInputTokens,
        outputTokens: totalOutputTokens + turnOutputTokens,
      });
    }

    totalInputTokens += turnInputTokens;
    totalOutputTokens += turnOutputTokens;

    const incompleteReason = completionFinishReason === 'length'
      ? 'finish_reason=length'
      : requestUsesStream && !streamDoneObserved
        ? 'stream ended before data: [DONE]'
        : completionFinishReason === null
          ? 'missing finish_reason'
          : !SUPPORTED_COMPLETION_FINISH_REASONS.has(completionFinishReason)
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

    disarmInitialModelActivityTimeout();
    lastRequestInputTokens = turnInputTokens;
    retryState = initialRetryState(); // Reset retry counters on success
    modelOperationDeadlineAt = undefined;

    // Provider usage is authoritative and known only after the response. Once
    // the hard budget is exhausted, do not execute pending tools, completion
    // gates, or a second synthesis request.
    if (maxTokenBudget !== undefined && (totalInputTokens + totalOutputTokens) >= maxTokenBudget) {
      if (pendingRequiredTool) {
        throw new Error(`Required tool ${pendingRequiredTool} could not complete within the token budget`);
      }
      const usableContent = assistantMessage.tool_calls?.length && !synthesisForced
        ? undefined
        : ((assistantMessage.content ?? '').trim() || allStreamedContent.trim() || undefined);
      const result = budgetStopResponse(
        usableContent
          ?? (synthesisReserveTokens
            ? 'I gathered evidence but the token budget was exhausted before a reliable final synthesis.'
            : `Token budget exceeded (used ${totalInputTokens + totalOutputTokens} tokens, limit ${maxTokenBudget}).`),
        Boolean(requestUsesStream && usableContent),
      );
      return result;
    }

    // No tool calls — return the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      if (pendingRequiredTool) {
        throw new Error(`Required tool ${pendingRequiredTool} was not called`);
      }
      // Use this turn's content, or fall back to all accumulated streamed content
      const content = (assistantMessage.content ?? '') || allStreamedContent;
      allStreamedContent = ''; // Release accumulated tokens once consumed
      if (content.trim().length === 0) {
        throw emptyModelResponseError(
          { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          toolsUsed,
        );
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
      if (config.signal?.aborted) throw clientAbortError();
      gateState = gate.state;
    if (gate.fired) {
      if (stream && !bufferReasoningSensitiveStream && onToken && gate.contentSuffix) {
        onToken(gate.contentSuffix);
      }
      continue;
    }

      const acceptedContent = `${content}${gate.contentSuffix ?? ''}`;
      // Once D1 has fired, surface the preserved user answer instead of the
      // internal skill-distillation summary produced by the current turn.
      const finalized = appendFetchedSourceFooter(
        gateState.preservedAnswerForDistillation ?? acceptedContent,
        citationIntent,
        successfullyFetchedCitationUrls,
      );
      const finalContent = finalized.content;

      // In non-streaming mode, emit the full content as a single token
      if ((!requestUsesStream || bufferReasoningSensitiveStream) && onToken && finalContent) {
        onToken(finalContent);
      } else if (requestUsesStream && onToken) {
        if (gate.contentSuffix) onToken(gate.contentSuffix);
        if (finalized.suffix) onToken(finalized.suffix);
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
      const finalized = appendFetchedSourceFooter(
        gateState.preservedAnswerForDistillation ?? synthesis,
        citationIntent,
        successfullyFetchedCitationUrls,
      );
      if ((!requestUsesStream || bufferReasoningSensitiveStream) && onToken && finalized.content) {
        onToken(finalized.content);
      } else if (requestUsesStream && onToken && finalized.suffix) {
        onToken(finalized.suffix);
      }
      return {
        content: finalized.content,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // Has tool calls — execute them and continue the loop
    if (forcedToolChoiceActive && assistantMessage.tool_calls.length > 1) {
      throw new Error(
        `Forced tool choice ${forcedToolName} returned multiple tool calls; refusing to execute any`,
      );
    }
    if (
      pendingRequiredTool
      && assistantMessage.tool_calls[0]?.function.name !== pendingRequiredTool
    ) {
      throw new Error(`Required tool ${pendingRequiredTool} was not called in sequence`);
    }

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
      lastToolObservation = undefined;
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
      const observation = lastToolObservation as {
        name: string;
        citationUrl: string | null;
        usableResult: boolean;
      } | undefined;
      if (
        citationIntent
        && r.countedAsUsed
        && r.toolName === 'web_fetch'
        && observation?.name === 'web_fetch'
        && observation.usableResult
        && observation.citationUrl
      ) {
        successfullyFetchedCitationUrls.add(observation.citationUrl);
      }
      if (r.countedAsUsed) toolsUsed.push(r.toolName);
      if (config.signal?.aborted) throw clientAbortError();
      messages.push({
        role: 'tool',
        content: capToolResultForModel(r.content, toolContextBudget.maxSingleResultChars),
        tool_call_id: r.toolCallId,
      });
      if (pendingRequiredTool) {
        const requiredToolSucceeded = r.countedAsUsed
          && r.succeeded
          && !r.abort
          && r.toolName === pendingRequiredTool
          && observation?.name === pendingRequiredTool
          && observation.usableResult;
        if (!requiredToolSucceeded) {
          throw new Error(`Required tool ${pendingRequiredTool} failed`);
        }
        requiredToolIndex++;
        if (requiredToolIndex === requiredToolSequence.length) {
          forceSynthesis('required-tool-sequence');
        }
      } else if (legacyForcedToolChoiceActive) {
        forceSynthesis('tool-round-limit');
      }

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

  if (config.signal?.aborted) throw clientAbortError();

  // maxTurns reached — bounded runs must never expose an internal max-turn
  // message. Normally the reserved synthesis turn returns above; this fallback
  // is only for a malformed provider response during that final request.
  const fallbackBaseWasStreamed = Boolean(
    gateState.preservedAnswerForDistillation || allStreamedContent,
  );
  const finalized = appendFetchedSourceFooter(
    gateState.preservedAnswerForDistillation
      ?? (allStreamedContent || (synthesisReserveTokens
        ? 'I gathered evidence but could not complete a reliable synthesis. Please retry the final synthesis.'
        : `Max tool turns reached (${maxTurns} turns, ${toolsUsed.length} tools used).`)),
    citationIntent,
    successfullyFetchedCitationUrls,
  );
  if (stream && onToken) {
    if (bufferReasoningSensitiveStream) {
      onToken(finalized.content);
    } else if (fallbackBaseWasStreamed) {
      if (finalized.suffix) onToken(finalized.suffix);
    } else {
      onToken(finalized.content);
    }
  }
  return {
    content: finalized.content,
    toolsUsed,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
  } finally {
    disarmInitialModelActivityTimeout();
  }
}
