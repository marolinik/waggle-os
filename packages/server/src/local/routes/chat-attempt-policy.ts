/**
 * What the chat turn's model attempt chain decides about a failed attempt
 * (TD-CHAT-3): which failures end the turn, and whether an interrupted
 * stream may be replayed once on the same model.
 *
 * The attempt chain in `routes/chat.ts` (`runPrimaryWithSafeInterruptedRetry`,
 * the credential rotation, `runModelFallbackChain`) asks these questions at
 * several points; the answers live here once. The error classification moved
 * verbatim from module scope in `chat.ts`. It imports no framework and reads
 * no turn state: the route hands in what it knows.
 */
import type { AgentResponse } from '@waggle/agent';
import { getBillableUsage } from './chat-turn-usage-ledger.js';

export function isIncompleteCompletionError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'INCOMPLETE_COMPLETION';
}

function isRetryableStreamInterruption(error: unknown): boolean {
  return isIncompleteCompletionError(error)
    && /\(stream ended before data:\s*\[DONE\]\); partial content was not accepted\.?$/i.test(
      (error as { message?: unknown }).message as string,
    );
}

type EmptyModelResponseError = Error & {
  code: 'EMPTY_MODEL_RESPONSE';
  status: 502;
  usage: AgentResponse['usage'];
  toolsUsed: string[];
};

export function isEmptyModelResponseError(error: unknown): error is EmptyModelResponseError {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'EMPTY_MODEL_RESPONSE';
}

export function emptyModelResponseError(response: AgentResponse): EmptyModelResponseError {
  const error = new Error('Model returned an empty response.') as EmptyModelResponseError;
  error.name = 'EmptyModelResponseError';
  error.code = 'EMPTY_MODEL_RESPONSE';
  error.status = 502;
  error.usage = response.usage;
  error.toolsUsed = [...response.toolsUsed];
  return error;
}

function isTerminalEmptyModelResponse(error: unknown): boolean {
  return isEmptyModelResponseError(error) && error.toolsUsed.length > 0;
}

export function getFailedCompletionUsage(
  error: unknown,
): { inputTokens: number; outputTokens: number } | null {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (
    !isIncompleteCompletionError(error)
    && !isEmptyModelResponseError(error)
    && code !== 'MODEL_OPERATION_TIMEOUT'
    && code !== 'INITIAL_MODEL_ACTIVITY_TIMEOUT'
    && code !== 'AGENT_LOOP_ABORTED'
  ) return null;
  return getBillableUsage((error as { usage?: unknown }).usage);
}

export function isTerminalModelBudgetError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'DAILY_MODEL_BUDGET_EXCEEDED'
    || code === 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE';
}

/**
 * A failure that ends the turn: no credential rotation and no fallback model.
 * The agent may already have executed tools before a truncated final
 * completion or an empty answer, and replaying the run elsewhere would repeat
 * those side effects; a daily-budget refusal would only be refused again.
 */
export function isTerminalAttemptError(error: unknown): boolean {
  return isIncompleteCompletionError(error)
    || isTerminalEmptyModelResponse(error)
    || isTerminalModelBudgetError(error);
}

/** What the route knows when the primary attempt fails. */
export interface InterruptedRetryInput {
  readonly error: unknown;
  /** The failed attempt's token budget; undefined leaves nothing to replay with. */
  readonly maxTokenBudget: number | undefined;
  /** The failed attempt's model time limit; undefined leaves nothing to replay with. */
  readonly modelOperationTimeoutMs: number | undefined;
  /** Time spent since the primary attempt started. */
  readonly elapsedMs: number;
  readonly offersTools: boolean;
  readonly budgetModelSelected: boolean;
  readonly replayBlocked: boolean;
  readonly explicitToolWasUsed: boolean;
}

/** The budget a same-model replay inherits: what the failed attempt did not use. */
export interface InterruptedRetryAllowance {
  readonly maxTokenBudget: number;
  readonly modelOperationTimeoutMs: number;
}

/**
 * Whether an interrupted stream may be replayed once on the same model, and
 * with what budget. Only a stream that ended before `[DONE]` qualifies, and
 * only on a tool-free turn on the primary that started nothing side-effecting
 * and still has tokens and time left, so the replay cannot repeat an effect or
 * hand the budget out twice. Returns null when the turn must not replay.
 */
export function planInterruptedRetry(input: InterruptedRetryInput): InterruptedRetryAllowance | null {
  const failedUsage = getFailedCompletionUsage(input.error);
  const consumedTokens = (failedUsage?.inputTokens ?? 0) + (failedUsage?.outputTokens ?? 0);
  const remainingTokenBudget = input.maxTokenBudget === undefined
    ? 0
    : Math.floor(input.maxTokenBudget - consumedTokens);
  const remainingModelTimeMs = input.modelOperationTimeoutMs === undefined
    ? 0
    : Math.floor(input.modelOperationTimeoutMs - input.elapsedMs);
  const canReplayWithoutSideEffects = isRetryableStreamInterruption(input.error)
    && !input.offersTools
    && !input.budgetModelSelected
    && !input.replayBlocked
    && !input.explicitToolWasUsed
    && remainingTokenBudget > 0
    && remainingModelTimeMs > 0;
  return canReplayWithoutSideEffects
    ? { maxTokenBudget: remainingTokenBudget, modelOperationTimeoutMs: remainingModelTimeMs }
    : null;
}
