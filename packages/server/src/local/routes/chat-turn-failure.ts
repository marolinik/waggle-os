/**
 * A chat turn that fails before its response is committed: the spend its
 * failed attempts reported, the abandoned trace, the user-facing error, the
 * persisted failure turn, and the raw user turn captured to memory anyway.
 *
 * Extract Method on the POST /api/chat handler's outer catch (TD-CHAT-3
 * slice 15). The handler passes the values it holds when the catch runs; a
 * failure after `responseCommitted` only logs and ends the stream.
 */
import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { CostTracker, Orchestrator } from '@waggle/agent';
import { FrameStore, SessionStore } from '@waggle/core';
import { GENERATION_FAILED_PREFIX, isUserFacingError } from '@waggle/shared';
import { createLogger } from '../logger.js';
import {
  getFailedCompletionUsage,
  isIncompleteCompletionError,
  isTerminalModelBudgetError,
} from './chat-attempt-policy.js';
import { persistMessage } from './chat-persistence.js';
import { PERSONAL_CHAT_SCOPE_ID } from './chat-scope.js';
import type { TurnExecutionTrace } from './chat-turn-execution-trace.js';
import type { TurnRetention } from './chat-turn-retention.js';
import { getBillableUsage, type TurnUsageLedger } from './chat-turn-usage-ledger.js';

const log = createLogger('chat');

const CHAT_STORAGE_UNAVAILABLE_MESSAGE = 'Your conversation could not be saved on this device. Check free disk space and folder permissions, then try again.';

/**
 * A Node system error from the filesystem. `code` and `syscall` alone would
 * also match a network failure (ECONNREFUSED on `connect`, a socket error on
 * `read`); only a filesystem error names the `path` it touched.
 */
function isLocalStorageFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code, syscall, path: failedPath } = error as NodeJS.ErrnoException;
  return typeof code === 'string' && typeof syscall === 'string' && typeof failedPath === 'string';
}

const LOCAL_DATABASE_UNAVAILABLE_MESSAGE = 'Waggle could not update its local database just now. Try again in a moment.';

const GENERIC_FAILURE_MESSAGE = 'Something went wrong. Try sending your message again.';

/** The agent loop's fatal HTTP error: `LLM error (<status>): <provider body>`. */
const PROVIDER_HTTP_ERROR = /^LLM error \((\d{3})\):/;

/** A better-sqlite3 error: its `code` names the SQLite result (SQLITE_BUSY, ...). */
function isLocalDatabaseFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && code.startsWith('SQLITE_');
}

/** The handler values the failure path reads, taken when the catch runs. */
export interface TurnFailureTurn {
  server: FastifyInstance;
  raw: ServerResponse;
  sendEvent: (event: string, data: unknown) => void;
  turnSignal: AbortSignal;
  responseCommitted: boolean;
  turnId: string;
  message: string;
  usageLedger: TurnUsageLedger;
  costTracker: CostTracker;
  turnTrace: TurnExecutionTrace;
  retention: TurnRetention;
  hasCustomRunner: boolean;
  usesNamedWorkspace: boolean;
  historyWorkspaceId: string;
  activeWorkspaceId: string;
  activeSessionId: string;
  activeExecutionWorkspaceId: string | undefined;
  sessionPersistenceDataDir: string;
  activeHistory: Array<{ role: string; content: string; model?: string }> | undefined;
  activeSessionOrch: Orchestrator | undefined;
  accountWorkspaceSessionTokens: (delta: number) => void;
  retainedTurnText: (value: string) => string;
}

/**
 * Handles a failure of the turn. Never throws for the failure it handles:
 * accounting and persistence errors are logged, and the stream is ended
 * or left to the handler's finally.
 */
export function handleTurnFailure(turn: TurnFailureTurn, err: unknown): void {
  const {
    server, raw, sendEvent, turnSignal, responseCommitted, turnId, message,
    usageLedger, costTracker, turnTrace, retention, hasCustomRunner,
    usesNamedWorkspace, historyWorkspaceId, activeWorkspaceId, activeSessionId,
    activeExecutionWorkspaceId, sessionPersistenceDataDir, activeHistory,
    activeSessionOrch, accountWorkspaceSessionTokens, retainedTurnText,
  } = turn;
    if (responseCommitted) {
      log.warn('[chat] post-commit observer failed after the response was already delivered', {
        workspaceId: activeWorkspaceId,
        sessionId: activeSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return;
    }
    const failedCompletionUsage = getFailedCompletionUsage(err);
    const abortedErrorUsage = turnSignal.aborted
      ? getBillableUsage((err as { usage?: unknown } | null | undefined)?.usage)
      : null;
    const billableAttemptReceipts = [
      ...usageLedger.receipts,
    ];
    const recordedAttemptUsage = billableAttemptReceipts.length > 0
      ? billableAttemptReceipts.reduce((total, receipt) => ({
          inputTokens: total.inputTokens + receipt.usage.inputTokens,
          outputTokens: total.outputTokens + receipt.usage.outputTokens,
        }), { inputTokens: 0, outputTokens: 0 })
      : null;
    const billableFailureUsage = recordedAttemptUsage
      ?? failedCompletionUsage
      ?? abortedErrorUsage
      ?? (turnSignal.aborted ? usageLedger.abortedAttemptUsage : null);
    let failureCostUsd: number | undefined;
    if (billableFailureUsage && usageLedger.attemptModel) {
      try {
        const accountingReceipts = billableAttemptReceipts.length > 0
          ? billableAttemptReceipts
          : [{
              model: usageLedger.attemptModel,
              billingClass: usageLedger.attemptBillingClass,
              usage: billableFailureUsage,
            }];
        failureCostUsd = accountingReceipts.reduce((total, receipt) => (
          total + costTracker.calculateUsageCost({
            model: receipt.model,
            input: receipt.usage.inputTokens,
            output: receipt.usage.outputTokens,
            billingClass: receipt.billingClass,
          })
        ), 0);
        if (!usageLedger.isAccounted && hasCustomRunner) {
          for (const receipt of accountingReceipts) {
            costTracker.addUsage(
              receipt.model,
              receipt.usage.inputTokens,
              receipt.usage.outputTokens,
              activeExecutionWorkspaceId ?? PERSONAL_CHAT_SCOPE_ID,
              { billingClass: receipt.billingClass },
            );
          }
        }
        if (!usageLedger.isAccounted) {
          accountWorkspaceSessionTokens(
            billableFailureUsage.inputTokens + billableFailureUsage.outputTokens,
          );
        }
      } catch (accountingError) {
        log.warn(
          '[chat] incomplete completion usage accounting failed:',
          accountingError instanceof Error ? accountingError.message : String(accountingError),
        );
      }
    }
    // Finalize the hoisted `turnTrace` as aborted so the evolution dataset builder can
    // mine it as a negative example. Without this the row stays 'pending'
    // and GEPA never sees it — starving the loop of counterexamples.
    turnTrace.finalizeOnce(() => {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        outcome: 'abandoned',
        output: '',
        model: usageLedger.attemptModel ?? undefined,
        tokens: billableFailureUsage ? {
          input: billableFailureUsage.inputTokens,
          output: billableFailureUsage.outputTokens,
        } : undefined,
        costUsd: failureCostUsd,
        ...(!turnSignal.aborted && {
          correctionFeedback: retainedTurnText(errMsg).slice(0, 500),
        }),
      };
    });
    // A user Stop/client disconnect is not an assistant answer or generation
    // failure. Keep the already-persisted user turn, but never fabricate an
    // authoritative assistant/error turn from partial work.
    if (turnSignal.aborted) {
      log.info(`[chat] turn ${turnId} cancelled by client or workspace lifecycle`);
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return;
    }
    // Everything past the abort check is a real failure, and it is about to
    // be turned into a user-facing sentence and forgotten. The post-commit
    // branch at the top of this catch logs its error; this path never did, so
    // a failure that matched none of the classifications below left the user
    // holding a raw message and the server holding no record of it at all
    // (TD-CHAT-15). The stack goes to the log and only to the log.
    log.error('[chat] turn failed before the response was committed', {
      workspaceId: activeWorkspaceId,
      sessionId: activeSessionId,
      turnId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    // Send user-friendly error event — never show raw traces
    let errorMessage: string;
    const storageFailure = isLocalStorageFailure(err);
    const databaseFailure = !storageFailure && isLocalDatabaseFailure(err);
    if (storageFailure) {
      // A failed history read or write: Node's message names the absolute
      // file, which must not reach the client or the transcript (TD-CHAT-14).
      errorMessage = CHAT_STORAGE_UNAVAILABLE_MESSAGE;
    } else if (databaseFailure) {
      // A critical-path SQLite write that failed (a locked store, say). The
      // driver's text is internal and is logged above, not sent (TD-REL-4).
      errorMessage = LOCAL_DATABASE_UNAVAILABLE_MESSAGE;
    } else if (err instanceof Error) {
      // Clean up common error messages for the user. Authentication and
      // endpoint availability are different recovery paths: never send a
      // user to API-key settings when a local/OpenAI-compatible endpoint is
      // simply down or restarting.
      if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        errorMessage = 'API key is invalid or expired. Update it in Settings > API Keys.';
      } else if (
        /ECONNREFUSED|fetch failed|ENETUNREACH|EHOSTUNREACH|socket hang up/i.test(err.message)
        || /Could not reach (?:the )?(?:AI )?model endpoint/i.test(err.message)
        || /Server error retry cap exceeded (?:\(\d+ consecutive (?:502|503|504) errors\)|after \d+ retries \(latest (?:502|503|504)\))/i.test(err.message)
      ) {
        errorMessage = 'The model endpoint is not responding. It may be down or restarting. Check Settings > Models, then try again.';
      } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
        errorMessage = 'The request timed out. The model may be overloaded — try again in a moment.';
      } else if (err.message.includes('context_length') || err.message.includes('too many tokens')) {
        errorMessage = 'The conversation is too long for the model. Try clearing the chat and starting fresh.';
      } else if (PROVIDER_HTTP_ERROR.test(err.message)) {
        // The provider's response body is internal: it is in the log above,
        // and only its HTTP status reaches the user (TD-CHAT-15).
        const status = PROVIDER_HTTP_ERROR.exec(err.message)![1];
        errorMessage = `The model provider returned an error (HTTP ${status}). Try again or switch model.`;
      } else if (
        isUserFacingError(err)
        || isTerminalModelBudgetError(err)
        || isIncompleteCompletionError(err)
      ) {
        // Written for the user: an error marked at its throw site, or one
        // classified by the code it already carries (a daily-budget refusal
        // states the cap it hit; an incomplete completion says the partial
        // answer was not accepted).
        errorMessage = err.message;
      } else {
        // Every other message is internal (TD-CHAT-15). It is logged above.
        errorMessage = GENERIC_FAILURE_MESSAGE;
      }
    } else {
      errorMessage = GENERIC_FAILURE_MESSAGE;
    }
    // Send clean error to user — don't leak raw recalled context (contains system prompt instructions)
    const budgetCode = isTerminalModelBudgetError(err)
      ? (err as { code: string }).code
      : storageFailure ? 'CHAT_STORAGE_UNAVAILABLE'
        : databaseFailure ? 'LOCAL_DATABASE_UNAVAILABLE' : undefined;
    sendEvent('error', { message: errorMessage, ...(budgetCode ? { code: budgetCode } : {}) });

    // Persist the assistant-side failure as a real conversation turn. The UI
    // already shows the SSE error while the stream is live, but without this
    // saved message a refresh or /api/history call loses the assistant outcome
    // and the next turn lacks the failure context.
    if (activeHistory && activeWorkspaceId && activeSessionId) {
      const assistantError = `${GENERATION_FAILED_PREFIX}${errorMessage}`;
      try {
        activeHistory.push({ role: 'assistant', content: assistantError });
        persistMessage(sessionPersistenceDataDir, activeWorkspaceId, activeSessionId, {
          role: 'assistant',
          content: assistantError,
        });
      } catch (persistErr) {
        log.warn('[chat] assistant error persistence failed:', persistErr instanceof Error ? persistErr.message : String(persistErr));
      }
    }

    // Memory capture MUST NOT depend on generation success; this is the
    // counterpart of the hoisted `activeSessionOrch`. On the happy path
    // `sessionOrch.autoSaveFromExchange` captures the
    // exchange; when the model call fails that never runs, so the user's
    // turn would be lost from memory ("remembers everything" broken). Persist
    // the raw turn directly here — NOT via the conservative pattern-write-back
    // (which may extract nothing) — so it's recallable (keyword half of
    // HybridSearch now; embedded on the next cognify/distill pass). The 8-char
    // floor skips trivial acks ("ok", "thanks"). Best-effort: a persistence
    // failure must never mask the original error or break the SSE stream.
    // Gated by the resolved persistence policy for automated, bounded, and
    // persona-read-only turns. Persisting one of those prompts here as a
    // 'user_stated' frame would bypass the happy-path memory boundary.
    if (activeSessionOrch && retention.allowMemoryPersistence && message.trim().length >= 8) {
      try {
        const workspaceMind = usesNamedWorkspace
          ? server.agentState.getWorkspaceMindDb(historyWorkspaceId)
          : null;
        if (usesNamedWorkspace && !workspaceMind) {
          throw new Error('Authorized workspace memory is unavailable');
        }
        const frames = workspaceMind
          ? new FrameStore(workspaceMind)
          : activeSessionOrch.getFrames();
        const sessions = workspaceMind
          ? new SessionStore(workspaceMind)
          : activeSessionOrch.getSessions();
        const gopId = sessions.ensureActive().gop_id;
        const latestI = frames.getLatestIFrame(gopId);
        if (latestI) frames.createPFrame(gopId, message, latestI.id, 'normal', 'user_stated');
        else frames.createIFrame(gopId, message, 'normal', 'user_stated');
        log.info('[chat] persisted raw user turn to memory despite generation failure');
      } catch (persistErr) {
        log.warn('[chat] raw-turn persistence on error path failed:', persistErr instanceof Error ? persistErr.message : String(persistErr));
      }
    }
}
