/**
 * The conversation a chat turn continues, loaded and prepared for the turn.
 *
 * Extract Method on the POST /api/chat handler (TD-CHAT-3 slice 16b), moved
 * verbatim. Loads and caches the saved transcript unless the turn denies
 * conversation history, applies a structured retry's replacement (refusing
 * a stale target, which ends the turn) or the legacy failed-pair dedup,
 * settles the turn's retention now that the history length is known, and
 * appends and persists the user message. The history is written back
 * through `setActiveHistory` before its first write, because the
 * handler's failure path persists into it.
 */
import type { ServerResponse } from 'node:http';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import {
  loadSessionMessages,
  persistMessage,
  replaceRetryTailWithUser,
  retryTailMatches,
  stripTrailingFailedPair,
  type ChatHistoryMessage,
  type RetryTailExpectation,
} from './chat-persistence.js';
import type { TurnMutationPolicy } from './chat-helpers.js';
import type { TurnRetention } from './chat-turn-retention.js';
import type { DirectReadFileDirective } from './chat-bounded-read-tools.js';

export interface TurnHistoryInput {
  sessionHistories: Map<string, ChatHistoryMessage[]>;
  touchSessionState: (stateKey: string) => void;
  turnMutationPolicy: TurnMutationPolicy;
  sessionStateKey: string;
  sessionPersistenceDataDir: string;
  activeWorkspaceId: string;
  sessionId: string;
  message: string;
  retryTarget: RetryTailExpectation | null | undefined;
  retryTurn: boolean | undefined;
  sendEvent: (event: string, data: unknown) => void;
  raw: ServerResponse;
  retention: TurnRetention;
  toolFreeAdvisoryCandidate: boolean;
  explicitReadOnlyToolCandidate: string | undefined;
  directReadFileDirective: DirectReadFileDirective;
  decisionMatrixToolSequenceRequested: boolean;
  setActiveHistory: (history: ChatHistoryMessage[] | undefined) => void;
}

/** `ended`: the turn already ended its stream with a retry refusal. */
export type TurnHistoryLoad =
  | { ended: true }
  | { ended: false; history: ChatHistoryMessage[] };

export function loadTurnHistory(input: TurnHistoryInput): TurnHistoryLoad {
  const {
    sessionHistories, touchSessionState, turnMutationPolicy, sessionStateKey,
    sessionPersistenceDataDir, activeWorkspaceId, sessionId, message, retryTarget, retryTurn,
    sendEvent, raw, retention, toolFreeAdvisoryCandidate, explicitReadOnlyToolCandidate,
    directReadFileDirective, decisionMatrixToolSequenceRequested, setActiveHistory,
  } = input;

  // A conversation-history denial is a read boundary, not only a prompt-
  // packaging choice. Do not read or cache the saved transcript for this turn.
  if (!turnMutationPolicy.denyConversationHistory && !sessionHistories.has(sessionStateKey)) {
    const saved = loadSessionMessages(
      sessionPersistenceDataDir, activeWorkspaceId, sessionId
    );
    sessionHistories.set(sessionStateKey, saved);
    touchSessionState(sessionStateKey);
  }
  const history = turnMutationPolicy.denyConversationHistory
    ? []
    : sessionHistories.get(sessionStateKey)!;
  setActiveHistory(turnMutationPolicy.denyConversationHistory ? undefined : history);

  let retryUserAlreadyPersisted = false;
  if (retryTarget && !turnMutationPolicy.denyConversationHistory) {
    if (!retryTailMatches(history, message, retryTarget)) {
      sendEvent('error', {
        message: 'This conversation changed before Retry could replace it. Reload and try again.',
        code: 'RETRY_TARGET_STALE',
      });
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return { ended: true };
    }
    const replacement = replaceRetryTailWithUser(
      sessionPersistenceDataDir,
      activeWorkspaceId,
      sessionId,
      message,
      retryTarget,
    );
    if (!replacement.ok) {
      sendEvent('error', {
        message: 'Retry could not safely replace this conversation. Reload and try again.',
        code: 'RETRY_TARGET_STALE',
      });
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return { ended: true };
    }
    history.splice(
      history.length - replacement.removed,
      replacement.removed,
      { role: 'user', content: message },
    );
    retryUserAlreadyPersisted = true;
  }

  // Legacy retry-dedup: older clients only identified failed turns. Drop
  // the previously persisted failed user+assistant pair (RAM + disk) so a
  // reload doesn't render it duplicated alongside the fresh turn.
  if (retryTurn && !retryTarget && !turnMutationPolicy.denyConversationHistory) {
    const n = history.length;
    const legacyTailMatches = n >= 2
      && history[n - 1].role === 'assistant'
      && typeof history[n - 1].content === 'string'
      && history[n - 1].content.startsWith(GENERATION_FAILED_PREFIX)
      && history[n - 2].role === 'user'
      && history[n - 2].content === message;
    if (legacyTailMatches && stripTrailingFailedPair(
      sessionPersistenceDataDir,
      activeWorkspaceId,
      sessionId,
      message,
    )) {
      history.splice(n - 2, 2);
    }
  }

  // Current-message-only packaging is safe only when there is no prior
  // conversation to erase. Capability classifiers above separately keep
  // workspace, memory, connector, and web evidence requests tool-capable.
  retention.settle({
    toolFreeAdvisory: toolFreeAdvisoryCandidate && history.length === 0,
    forcedReadOnlyTurn: (explicitReadOnlyToolCandidate === 'read_file'
        && directReadFileDirective.kind === 'valid')
      || explicitReadOnlyToolCandidate === 'search_memory'
      || decisionMatrixToolSequenceRequested,
  });

  // A saved-history opt-out is both a read and retention boundary for this turn.
  if (!turnMutationPolicy.denyConversationHistory && !retryUserAlreadyPersisted) {
    history.push({ role: 'user', content: message });
    persistMessage(sessionPersistenceDataDir, activeWorkspaceId, sessionId, { role: 'user', content: message });
  }

  return { ended: false, history };
}
