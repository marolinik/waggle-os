/**
 * The chat turn's agent run: the loop config and its callbacks, the
 * credential pool, the execution-trace start, the per-model run config, the
 * attempt chain and credential rotation. It returns the answer, the agent
 * latency, the system prompt of the model that answered, and the attempt
 * state the completion phase reads.
 *
 * Extract Method on the POST /api/chat handler (TD-CHAT-3 slice 15). The
 * one change from the handler body: the first-token timestamp is recorded
 * through `markFirstToken` instead of a write to a handler variable.
 */
import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import {
  capToolResultForModel,
  type AgentLoopConfig,
  type AgentResponse,
  type CostTracker,
  type CredentialPool,
  type HookRegistry,
} from '@waggle/agent';
import { isExactConfiguredKeylessCompatibleModel } from '../model-availability.js';
import { createLogger } from '../logger.js';
import { emitAuditEvent } from './events.js';
import { emitWaggleSignal } from './waggle-signals.js';
import { stripCapabilityRequestMarker } from './capability-proposals.js';
import { describeToolUseSafe, isOfflineOllamaModelReference } from './chat-helpers.js';
import { createPersistedCapabilityReceipt } from './chat-persistence.js';
import { EXPLICIT_READ_ONLY_TOOL_NAMES } from './chat-turn-policy.js';
import { formatDirectReadFileResponse, isReportedToolFailure, type DirectReadFileDirective } from './chat-bounded-read-tools.js';
import { applyToolResultSideEffects } from './chat-tool-result-effects.js';
import { createAttemptChain } from './chat-attempt-chain.js';
import { rotateCredentials } from './chat-credential-rotation.js';
import { isEmptyModelResponseError, isTerminalAttemptError } from './chat-attempt-policy.js';
import { TurnAttemptState } from './chat-turn-attempt-state.js';
import { TurnToolActivity } from './chat-turn-tool-activity.js';
import type { prepareAgentTurn } from './chat-turn-preparation.js';
import type { AgentRunner } from './chat.js';
import type { TurnExecutionTrace } from './chat-turn-execution-trace.js';
import type { ResolveUsableModel, TurnModelSelection } from './chat-turn-model-selection.js';
import type { TurnRetention } from './chat-turn-retention.js';
import type { TurnUsageLedger } from './chat-turn-usage-ledger.js';

const log = createLogger('chat');

/** The handler values the agent run reads, fixed when it starts. */
export interface AgentRunTurn {
  server: FastifyInstance;
  sendEvent: (event: string, data: unknown) => void;
  throwIfTurnAborted: () => void;
  turnSignal: AbortSignal;
  markFirstToken: () => void;
  turnId: string;
  message: string;
  agentMessage: string;
  sessionId: string;
  executionScopeId: string;
  effectiveWorkspace: string | undefined;
  activeExecutionWorkspaceId: string | undefined;
  agentRunner: AgentRunner;
  costTracker: CostTracker;
  getLitellmUrl: () => string;
  getCredentialPool: (provider: string) => CredentialPool | null;
  modelSelection: TurnModelSelection;
  resolveModel: ResolveUsableModel;
  hasDistinctConfiguredFallback: boolean;
  boundedExactPersistedMemoryLookup: boolean;
  directReadFileDirective: DirectReadFileDirective;
  requestHookRegistry: HookRegistry | undefined;
  retention: TurnRetention;
  retainedTurnText: (value: string) => string;
  retainedTurnJson: (value: unknown) => string;
  turnTrace: TurnExecutionTrace;
  usageLedger: TurnUsageLedger;
  turnPreparation: Awaited<ReturnType<typeof prepareAgentTurn>>;
}

export interface AgentRunOutcome {
  result: AgentResponse;
  agentLatencyMs: number;
  /** The prompt of the model that answered; a fallback rebuilds it. */
  systemPrompt: string;
  attemptState: TurnAttemptState;
}

export async function runAgentTurn(turn: AgentRunTurn): Promise<AgentRunOutcome> {
  const {
    server, sendEvent, throwIfTurnAborted, turnSignal, markFirstToken, turnId, message,
    agentMessage, sessionId, executionScopeId, effectiveWorkspace, activeExecutionWorkspaceId,
    agentRunner, costTracker, getLitellmUrl, getCredentialPool, modelSelection, resolveModel,
    hasDistinctConfiguredFallback, boundedExactPersistedMemoryLookup, directReadFileDirective,
    requestHookRegistry, retention, retainedTurnText, retainedTurnJson, turnTrace, usageLedger,
    turnPreparation,
  } = turn;
  const {
    activePersonaId,
    agentRunBudget,
    capabilityRouter,
    effectiveTools,
    explicitReadOnlyToolChoice,
    externalToolNames,
    governancePolicies,
    maxOutputTokens,
    reasoningForModelAttempt,
    rebuildSystemPromptForModel,
    requiredToolSequence,
    windowedMessages,
  } = turnPreparation;
  let { systemPrompt } = turnPreparation;

  // Build agent loop config — with windowed conversation history + hooks
  const attemptState = new TurnAttemptState();
  const toolActivity = new TurnToolActivity({
    explicitReadOnlyToolChoice,
    requiredToolSequence,
    capResultForModel: result => capToolResultForModel(
      result,
      Math.min(4_000, agentRunBudget.toolContextBudget.maxSingleResultChars),
    ),
  });

  const agentConfig: AgentLoopConfig = {
    // Breaker-wrapped, from the composition root (R-2). Read defensively so
    // suites that mount no decorator keep the platform fetch.
    fetch: server.llmFetch ?? globalThis.fetch,
    litellmUrl: getLitellmUrl(),
    litellmApiKey: server.agentState.litellmApiKey,
    model: modelSelection.model,
    billingModel: modelSelection.model,
    modelSpendBudget: costTracker,
    modelSpendBillingClass: isOfflineOllamaModelReference(modelSelection.model)
      || isExactConfiguredKeylessCompatibleModel(server, modelSelection.model)
      ? 'free'
      : 'priced',
    spendWorkspaceId: executionScopeId,
    systemPrompt,
    tools: effectiveTools,
    ...(requiredToolSequence ? { requiredToolSequence } : {}),
    messages: windowedMessages,
    stream: true,
    modelOperationTimeoutMs: 100_000,
    ...(hasDistinctConfiguredFallback ? { initialModelActivityTimeoutMs: 20_000 } : {}),
    ...agentRunBudget,
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    reasoning: reasoningForModelAttempt(modelSelection.model),
    hooks: requestHookRegistry,
    capabilityRouter,
    governancePolicies,
    skillDistillationGate: retention.allowDerivedPersistence,
    signal: turnSignal,
    turnId, // propagate trace ID into the loop (H-AUDIT-1)

    onModelActivity: () => {
      if (turnSignal.aborted || !attemptState.claimOnce('modelResponding')) return;
      sendEvent('step', {
        content: 'Model is responding; verifying the answer before display…',
        phase: 'model_active',
      });
    },
    onReasoningActivity: () => {
      if (turnSignal.aborted || !attemptState.claimOnce('reasoning')) return;
      sendEvent('step', { content: 'Thinking through your request…' });
    },
    onRetry: (notice: string) => {
      const content = notice.trim();
      if (content) sendEvent('step', { content });
    },
    onToken: (token: string) => {
      markFirstToken();
      if (token.length > 0 && !turnSignal.aborted && attemptState.claimOnce('modelStreaming')) {
        sendEvent('step', {
          content: 'Writing the answer…',
          phase: 'model_streaming',
        });
      }
      attemptState.bufferToken(token);
    },
    onGiveUp: (giveUpMessage: string) => {
      // The tiered loop-guard aborted the run after a
      // critical failure streak. Surface the give-up copy as a step so the
      // client sees it immediately (it is also the loop's final content).
      sendEvent('step', { content: giveUpMessage });
    },
    onToolUse: (name: string, input: Record<string, unknown>) => {
      toolActivity.recordUse(
        name,
        externalToolNames.has(name) || !EXPLICIT_READ_ONLY_TOOL_NAMES.has(name),
      );
      // Send human-readable step description + raw tool event
      const disclosedInput = name === 'search_memory'
        && explicitReadOnlyToolChoice === 'search_memory'
        && boundedExactPersistedMemoryLookup
        ? {}
        : input;
      const stepText = describeToolUseSafe(name, disclosedInput);
      sendEvent('step', { content: stepText });
      sendEvent('tool', { name, input: disclosedInput });
      // Waggle Dance: emit tool call signal
    emitWaggleSignal({ type: 'tool:called', workspaceId: executionScopeId, content: `${name}(${retainedTurnJson(disclosedInput).slice(0, 100)})` });
      // Track start time for duration calculation
      toolActivity.startTimer(name);
    // Audit trail — log tool call
    emitAuditEvent(server, {
      workspaceId: executionScopeId,
        eventType: 'tool_call',
        toolName: name,
        input: retainedTurnJson(disclosedInput),
        sessionId,
        model: modelSelection.model,
      });
    },
    onToolResult: (name: string, input: Record<string, unknown>, result: string) => {
      const isBoundedExactMemoryResult = name === 'search_memory'
        && explicitReadOnlyToolChoice === 'search_memory'
        && boundedExactPersistedMemoryLookup;
      const isError = isBoundedExactMemoryResult && turnPreparation.boundedExactMemoryExecutionOutcome
        ? turnPreparation.boundedExactMemoryExecutionOutcome.status === 'failure'
        : name === 'read_file' && explicitReadOnlyToolChoice === 'read_file'
        ? turnPreparation.directReadFileExecutionOutcome === null
          || turnPreparation.directReadFileExecutionOutcome.isError
          || turnPreparation.directReadFileExecutionOutcome.content !== result
        : isReportedToolFailure(result);
      const duration = toolActivity.recordResult(name, result, isError);

      const boundedExactMemoryResultSummary = isBoundedExactMemoryResult && !isError
        ? turnPreparation.boundedExactMemoryExecutionOutcome?.status === 'no-match'
          ? 'No reliable matching value was found in this workspace.'
          : 'Found one matching value in this workspace.'
        : null;

      // Send tool_result SSE event so client can update status + show result
      if (name === 'acquire_capability') {
        if (createPersistedCapabilityReceipt(input, result)) {
          attemptState.addPendingCapability({ input, output: result, duration });
        } else {
          sendEvent('tool_result', {
            name,
            result: stripCapabilityRequestMarker(result),
            duration,
            isError,
          });
        }
      } else {
        const disclosedResult = boundedExactMemoryResultSummary ?? result;
        sendEvent('tool_result', { name, result: disclosedResult, duration, isError });
      }
    // Audit trail — log tool result (truncated output)
    const auditedResult = boundedExactMemoryResultSummary ?? result;
    emitAuditEvent(server, {
      workspaceId: executionScopeId,
        eventType: 'tool_result',
        toolName: name,
        output: retainedTurnText(auditedResult).length > 2000
          ? retainedTurnText(auditedResult).slice(0, 2000) + '...[truncated]'
          : retainedTurnText(auditedResult),
        sessionId,
      });

      applyToolResultSideEffects({
        server,
        executionScopeId,
        activeExecutionWorkspaceId,
        sessionId,
        retention,
        sendEvent,
        name,
        input,
        result,
        isError,
      });
    },
  };

  // ── Credential pool: resolve API key with round-robin ──
  // Extract provider name from model ID (e.g., "anthropic" from "claude-sonnet-4-6")
  // NOTE: the credential pool injects a *provider* key (e.g. sk-ant-…). That is
  // correct only on the direct-provider path (anthropic-proxy / openai-compat).
  // When routing THROUGH LiteLLM, every request must use the LiteLLM master key —
  // LiteLLM holds the real provider keys internally and validates any *other* key
  // as a virtual key against its DB, returning "No connected db." (no_db_connection)
  // when no DB is attached. So skip the pool entirely on the LiteLLM path.
  const usingLiteLLM = server.agentState.llmProvider?.provider === 'litellm';
  const providerName = modelSelection.model.startsWith('claude') ? 'anthropic' : modelSelection.model.split('/')[0] ?? 'anthropic';
  const credPool = usingLiteLLM ? undefined : getCredentialPool(providerName);
  const poolKey = credPool?.getKey();
  const effectiveApiKey = poolKey ?? server.agentState.litellmApiKey;

  // ── Start execution trace (self-evolution substrate) ──
  // Taken from the composition root, not built here (CA-5). Still read
  // defensively so unit tests with no decorator (legacy suites) pass.
  // Started on the hoisted `turnTrace` so the outer catch can finalize
  // with outcome='abandoned' on any exception path.
  // This operational audit trail is intentionally retained for
  // bounded/read-only turns; it is not learned memory or a user-work
  // mutation.
  turnTrace.start(server.traceRecorder ?? null, {
    sessionId,
    personaId: activePersonaId,
    workspaceId: effectiveWorkspace ?? null,
    model: modelSelection.model,
    input: retainedTurnText(message),
  });

  // Route locally-selected Ollama models to Ollama's OpenAI-compatible
  // endpoint instead of LiteLLM (graceful degradation / sovereignty story).
  // The sidecar reaches Ollama directly (as it does for embeddings) — no
  // Docker->host hop, no API key. Strip the 'ollama/' routing prefix to the
  // bare tag Ollama expects (e.g. "llama3.2:latest").
  const isOllamaModel = modelSelection.model.startsWith('ollama/');
  const ollamaUrl = (process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434') + '/v1';

  const runConfig: typeof agentConfig = {
    ...agentConfig,
    ...(isOllamaModel ? { litellmUrl: ollamaUrl, model: modelSelection.model.slice('ollama/'.length) } : {}),
    litellmApiKey: effectiveApiKey,
    modelSpendTraceId: turnTrace.id,
    ...(retention.allowDerivedPersistence && turnTrace.recording
      ? { traceRecording: turnTrace.recording }
      : {}),
    // Skill diffusion. When the closed
    // learning loop fires, broadcast a skill_share signal on
    // the v2 bus so MCP-consuming external tools can adopt
    // the soon-to-be-authored skill. Failures are swallowed
    // upstream (agent-loop wraps in try/catch).
    onSkillDistillationFire: retention.allowDerivedPersistence && server.signalBus
      ? async ({ patternKey, toolsUsed, directive }) => {
          const signalBus = server.signalBus;
          if (!signalBus) return;
          const now = new Date();
          signalBus.record({
            id: `skill-share-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      teamId: executionScopeId,
            senderId: `agent-loop:${activePersonaId ?? 'agent'}`,
            type: 'broadcast',
            subtype: 'skill_share',
            content: {
              tool: 'waggle-agent',
              patternKey,
              toolsUsed: [...toolsUsed],
              directive,
              sessionId,
              workspaceId: effectiveWorkspace ?? null,
            },
            referenceId: null,
            routing: null,
            createdAt: now,
          });
        }
      : undefined,
  };

  const primaryAttemptStartedAt = performance.now();
  const attemptChain = createAttemptChain({
    server,
    runConfig,
    effectiveApiKey,
    rebuildSystemPromptForModel,
    ollamaUrl,
    getLitellmUrl,
    reasoningForModelAttempt,
    throwIfTurnAborted,
    isTurnAborted: () => turnSignal.aborted,
    sendEvent,
    agentRunner,
    agentMessage,
    explicitReadOnlyToolChoice,
    directReadFileDirective,
    formatDirectReadFileResponse,
    boundedExactPersistedMemoryLookup,
    toolActivity,
    attemptState,
    usageLedger,
    modelSelection,
    resolveModel,
    primaryAttemptStartedAt,
  });
  const { runAgentAttempt, runModelFallbackChain, runPrimaryWithSafeInterruptedRetry } = attemptChain;

  // ── Run agent with credential pool + fallback chain ──
  let result: AgentResponse;
  const agentStartedAt = performance.now();
  let agentLatencyMs = 0;
  try {
    result = await runPrimaryWithSafeInterruptedRetry();
    // Report success to credential pool
    if (credPool && poolKey) credPool.reportSuccess(poolKey);
  } catch (primaryErr) {
    if (turnSignal.aborted) throw primaryErr;
    if (toolActivity.replayBlocked) throw primaryErr;
    if (toolActivity.explicitToolWasUsed && toolActivity.explicitToolResult === null) {
      throw primaryErr;
    }
    if (isTerminalAttemptError(primaryErr)) {
      throw primaryErr;
    }
    // Report error to credential pool and try next key
    if (credPool && poolKey && !isEmptyModelResponseError(primaryErr)) {
      const rotation = await rotateCredentials({
        pool: credPool,
        failedKey: poolKey,
        error: primaryErr,
        runWithKey: (key) => runAgentAttempt({ ...runConfig, litellmApiKey: key }),
        isAborted: () => turnSignal.aborted,
        isReplayBlocked: () => toolActivity.replayBlocked,
        onRotate: () => sendEvent('step', { content: `API key rotated — retrying with next credential` }),
        warn: (message) => log.warn(message),
      });
      result = rotation.result
        ?? await runModelFallbackChain(rotation.error, rotation.poolExhausted);
    } else {
      result = await runModelFallbackChain(primaryErr);
    }
  } finally {
    agentLatencyMs = Math.max(0, Math.round(performance.now() - agentStartedAt));
  }
  // configForModelAttempt rebuilt the prompt for the model that answered.
  if (attemptChain.lastSystemPrompt !== undefined) systemPrompt = attemptChain.lastSystemPrompt;
  return { result, agentLatencyMs, systemPrompt, attemptState };
}
