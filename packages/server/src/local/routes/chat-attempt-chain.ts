/**
 * The chat turn's attempt chain (TD-CHAT-3 slice 12): one model attempt
 * (`runAgentAttempt`), its config for a given model
 * (`configForModelAttempt`), the fallback chain after a failed attempt
 * (`runModelFallbackChain`), and the primary attempt with its one same-model
 * replay after an interrupted stream (`runPrimaryWithSafeInterruptedRetry`).
 *
 * Moved verbatim from the chat handler, with two edits: every value the
 * closures read from the handler now arrives in `AttemptChainTurn`, and the
 * one handler variable they wrote, `systemPrompt`, is now
 * `lastSystemPrompt`, which the handler reads back once the chain returns.
 * Credential rotation stays in the handler and calls `runAgentAttempt`
 * (`chat-credential-rotation.ts`).
 */
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import type { FastifyInstance } from 'fastify';
import { isOfflineOllamaModelReference, isRetryableError } from './chat-helpers.js';
import { isExactConfiguredKeylessCompatibleModel } from '../model-availability.js';
import {
  emptyModelResponseError,
  getFailedCompletionUsage,
  isTerminalAttemptError,
  planInterruptedRetry,
} from './chat-attempt-policy.js';
import type { AgentRunner, DirectReadFileDirective, formatDirectReadFileResponse } from './chat.js';
import type { TurnAttemptState } from './chat-turn-attempt-state.js';
import type { ResolveUsableModel, TurnModelSelection } from './chat-turn-model-selection.js';
import type { TurnToolActivity } from './chat-turn-tool-activity.js';
import type { TurnUsageLedger } from './chat-turn-usage-ledger.js';

/** The handler values the attempt chain reads, fixed when the chain is built. */
export interface AttemptChainTurn {
  server: FastifyInstance;
  runConfig: AgentLoopConfig;
  effectiveApiKey: AgentLoopConfig['litellmApiKey'];
  rebuildSystemPromptForModel: ((logicalModel: string) => Promise<string>) | null;
  ollamaUrl: string;
  getLitellmUrl: () => string;
  reasoningForModelAttempt: (logicalModel: string) => AgentLoopConfig['reasoning'];
  throwIfTurnAborted: () => void;
  /** Reads the turn signal at call time; the handler may swap the signal. */
  isTurnAborted: () => boolean;
  sendEvent: (event: string, data: unknown) => void;
  agentRunner: AgentRunner;
  agentMessage: string;
  explicitReadOnlyToolChoice: string | undefined;
  directReadFileDirective: DirectReadFileDirective;
  formatDirectReadFileResponse: typeof formatDirectReadFileResponse;
  boundedExactPersistedMemoryLookup: boolean;
  toolActivity: TurnToolActivity;
  attemptState: TurnAttemptState;
  usageLedger: TurnUsageLedger;
  modelSelection: TurnModelSelection;
  resolveModel: ResolveUsableModel;
  primaryAttemptStartedAt: number;
}

export interface AttemptChain {
  configForModelAttempt: (logicalModel: string, apiKey?: AgentLoopConfig['litellmApiKey']) => Promise<AgentLoopConfig>;
  runAgentAttempt: (config: AgentLoopConfig) => Promise<AgentResponse>;
  runModelFallbackChain: (initialError: unknown, allowNonRetryableConfiguredFallback?: boolean) => Promise<AgentResponse>;
  runPrimaryWithSafeInterruptedRetry: () => Promise<AgentResponse>;
  /** The prompt the latest config was built with, or undefined before any rebuild. */
  readonly lastSystemPrompt: string | undefined;
}

export function createAttemptChain(turn: AttemptChainTurn): AttemptChain {
  const {
    server, runConfig, effectiveApiKey, rebuildSystemPromptForModel, ollamaUrl, getLitellmUrl,
    reasoningForModelAttempt, throwIfTurnAborted, isTurnAborted, sendEvent, agentRunner,
    agentMessage, explicitReadOnlyToolChoice, directReadFileDirective, formatDirectReadFileResponse,
    boundedExactPersistedMemoryLookup, toolActivity, attemptState, usageLedger, modelSelection,
    resolveModel, primaryAttemptStartedAt,
  } = turn;
  let lastSystemPrompt: string | undefined;

  const configForModelAttempt = async (
    logicalModel: string,
    apiKey = effectiveApiKey,
  ): Promise<typeof runConfig> => {
    const useOllama = logicalModel.trim().toLowerCase().startsWith('ollama/');
    const systemPromptForAttempt = rebuildSystemPromptForModel
      ? await rebuildSystemPromptForModel(logicalModel)
      : runConfig.systemPrompt;
    throwIfTurnAborted();
    lastSystemPrompt = systemPromptForAttempt;
    return {
      ...runConfig,
      systemPrompt: systemPromptForAttempt,
      model: useOllama ? logicalModel.slice('ollama/'.length) : logicalModel,
      billingModel: logicalModel,
      modelSpendBillingClass: isOfflineOllamaModelReference(logicalModel)
        || isExactConfiguredKeylessCompatibleModel(server, logicalModel)
        ? 'free'
        : 'priced',
      litellmUrl: useOllama ? ollamaUrl : getLitellmUrl(),
      litellmApiKey: apiKey,
      modelOperationTimeoutMs: 100_000,
      initialModelActivityTimeoutMs: undefined,
      reasoning: reasoningForModelAttempt(logicalModel),
    };
  };

  const announceModelSwitch = (attemptModel: string) => {
    const announcement = modelSelection.takeSwitchAnnouncement(attemptModel);
    if (!announcement) return;
    sendEvent('model_switch', announcement);
    sendEvent('step', { content: `⬡ Switched to ${announcement.model} — ${announcement.reason}` });
  };

  const runAgentAttempt = async (config: typeof runConfig) => {
    toolActivity.assertReplayable();
    attemptState.beginAttempt();
    const attemptModel = config.billingModel ?? modelSelection.model;
    usageLedger.beginAttempt(attemptModel, config.modelSpendBillingClass ?? 'priced');
    announceModelSwitch(attemptModel);
    const { toolChoice: _staleToolChoice, ...attemptBaseConfig } = config;
    const initialModelActivityTimeoutMs = attemptState.takeInitialActivityDeadline()
      ? attemptBaseConfig.initialModelActivityTimeoutMs
      : undefined;
    const strictToolRetryContext = toolActivity.strictContinuation(agentMessage);
    let attemptedResult: AgentResponse;
    if (!isTurnAborted() && attemptState.claimOnce('modelRequested')) {
      sendEvent('step', {
        content: 'Sending your request to the model…',
        phase: 'model_requested',
      });
    }
    try {
      attemptedResult = await agentRunner({
        ...attemptBaseConfig,
        initialModelActivityTimeoutMs,
        ...(toolActivity.pendingExplicitToolChoice
          ? { toolChoice: toolActivity.pendingExplicitToolChoice }
          : explicitReadOnlyToolChoice
            ? {
                tools: [],
                ...(strictToolRetryContext
                  ? {
                      systemPrompt: `${attemptBaseConfig.systemPrompt}\n\n# COMPLETED READ-ONLY TOOL CONTINUATION\nThe requested tool already ran exactly once. No tools remain available; synthesize only from the bounded result in the current messages.`,
                      messages: [...attemptBaseConfig.messages, strictToolRetryContext],
                    }
                  : {}),
              }
            : {}),
      });
    } catch (error) {
      const failedUsage = getFailedCompletionUsage(error);
      attemptState.recordFailedTools((error as { toolsUsed?: unknown } | null | undefined)?.toolsUsed);
      usageLedger.recordFailedAttempt(failedUsage, {
        estimated: (error as { usageEstimated?: unknown }).usageEstimated === true,
      });
      throw error;
    }
    if (isTurnAborted()) {
      usageLedger.completeAttempt(attemptedResult.usage, modelSelection.model);
      throwIfTurnAborted();
    }
    toolActivity.assertCompleted();
    const completedResult = explicitReadOnlyToolChoice === 'read_file'
      && directReadFileDirective.kind === 'valid'
      && toolActivity.explicitToolResult !== null
      ? {
          ...attemptedResult,
          content: formatDirectReadFileResponse(
            directReadFileDirective,
            toolActivity.explicitToolResult,
          ),
        }
      : explicitReadOnlyToolChoice === 'search_memory'
        && boundedExactPersistedMemoryLookup
        && toolActivity.explicitToolResult !== null
        ? {
            ...attemptedResult,
            content: toolActivity.explicitToolResult,
          }
      : attemptedResult;
    if (!completedResult.content.trim()) {
      const emptyError = emptyModelResponseError(completedResult);
      attemptState.recordFailedToolNames(completedResult.toolsUsed);
      // `emptyModelResponseError` builds the error here and never marks it
      // estimated, so this attempt is always a counted one.
      usageLedger.recordFailedAttempt(getFailedCompletionUsage(emptyError));
      throw emptyError;
    }
    return strictToolRetryContext
      ? {
          ...completedResult,
          toolsUsed: Array.from(new Set([
            ...(explicitReadOnlyToolChoice ? [explicitReadOnlyToolChoice] : []),
            ...completedResult.toolsUsed,
          ])),
        }
      : completedResult;
  };

  const runModelFallbackChain = async (
    initialError: unknown,
    allowNonRetryableConfiguredFallback = false,
  ) => {
    if (toolActivity.replayBlocked) throw initialError;
    // The agent may already have executed tools before detecting a
    // truncated final completion. Replaying the whole run on another
    // model would repeat those side effects, so this signal is terminal.
    if (isTerminalAttemptError(initialError)) {
      throw initialError;
    }
    let failure = initialError;
    const failedBudgetModel = modelSelection.failedBudgetModel();

    if (failedBudgetModel) {
      const selected = await modelSelection.returnFromFailedBudgetModel(failedBudgetModel, resolveModel);
      if (selected === 'fallback') {
        return await runAgentAttempt(await configForModelAttempt(modelSelection.model));
      }

      try {
        return await runAgentAttempt(await configForModelAttempt(modelSelection.model));
      } catch (primaryRunError) {
        if (toolActivity.replayBlocked) throw primaryRunError;
        if (isTerminalAttemptError(primaryRunError)) {
          throw primaryRunError;
        }
        failure = primaryRunError;
      }
    }

    if ((allowNonRetryableConfiguredFallback || isRetryableError(failure))
      && modelSelection.canSwitchToFallback(failedBudgetModel)) {
      await modelSelection.switchToFallbackAfter(failure, resolveModel);
      return await runAgentAttempt(await configForModelAttempt(modelSelection.model));
    }

    throw failure;
  };

  const runPrimaryWithSafeInterruptedRetry = async (): Promise<AgentResponse> => {
    try {
      return await runAgentAttempt(runConfig);
    } catch (error) {
      const retryAllowance = planInterruptedRetry({
        error,
        maxTokenBudget: runConfig.maxTokenBudget,
        modelOperationTimeoutMs: runConfig.modelOperationTimeoutMs,
        elapsedMs: performance.now() - primaryAttemptStartedAt,
        offersTools: runConfig.tools.length > 0,
        budgetModelSelected: modelSelection.budgetModelSelected,
        replayBlocked: toolActivity.replayBlocked,
        explicitToolWasUsed: toolActivity.explicitToolWasUsed,
      });
      if (!retryAllowance) throw error;
      sendEvent('step', {
        content: 'Model response was interrupted — retrying once on the same model.',
      });
      return await runAgentAttempt({
        ...runConfig,
        maxTokenBudget: retryAllowance.maxTokenBudget,
        modelOperationTimeoutMs: retryAllowance.modelOperationTimeoutMs,
        ...(runConfig.initialModelActivityTimeoutMs === undefined
          ? {}
          : { initialModelActivityTimeoutMs: Math.min(
              runConfig.initialModelActivityTimeoutMs,
              retryAllowance.modelOperationTimeoutMs,
            ) }),
      });
    }
  };

  return {
    configForModelAttempt,
    runAgentAttempt,
    runModelFallbackChain,
    runPrimaryWithSafeInterruptedRetry,
    get lastSystemPrompt() { return lastSystemPrompt; },
  };
}
