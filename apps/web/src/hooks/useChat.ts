import { useState, useCallback, useRef, useEffect } from 'react';
import { adapter, type ChatRetryTarget } from '@/lib/adapter';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import {
  chatThreadCacheKey,
  readChatThreadCache,
  writeChatThreadCache,
} from '@/hooks/chat-thread-cache';
import {
  normalizeMemoryContextReceipt,
  stripLiveMemoryReceipts,
} from '@/lib/memory-recall-toast';
import type {
  ChatMessage, StreamEvent, ApprovalRequest,
  ContentBlock, TextContentBlock, ToolContextMetrics, ToolExecution,
} from '@/lib/types';

let blockCounter = 0;
function nextBlockId(prefix: string): string {
  return `${prefix}-${++blockCounter}-${Date.now()}`;
}

/** Convert legacy messages (from history API) that lack blocks */
function ensureBlocks(msg: ChatMessage): ChatMessage {
  if (msg.blocks && msg.blocks.length > 0) {
    // Backfill blockId on legacy blocks that were persisted without one
    const patched = msg.blocks.map((b, i) => {
      if (b.type === 'tool_use') return b; // tool_use uses `id` as key
      if ('blockId' in b && b.blockId) return b;
      return { ...b, blockId: `legacy-${msg.id}-${i}` };
    });
    return { ...msg, blocks: patched };
  }
  const blocks: ContentBlock[] = [];
  if (msg.content) {
    // W2G: a persisted failed assistant turn ("Generation failed: …") arrives
    // from /api/history as flat text with no block typing. Decode it back into
    // an error block so a reloaded failure renders the same ErrorBlock (with its
    // Retry / Open-API-key-settings actions) as the live SSE path — stripping the
    // prefix restores the bare message the live 'error' event carried.
    if (msg.role === 'assistant' && msg.content.startsWith(GENERATION_FAILED_PREFIX)) {
      blocks.push({
        type: 'error',
        blockId: nextBlockId('error'),
        message: msg.content.slice(GENERATION_FAILED_PREFIX.length),
      });
    } else {
      blocks.push({ type: 'text', blockId: nextBlockId('text'), content: msg.content });
    }
  }
  if (msg.tools) {
    for (const t of msg.tools) {
      blocks.push({
        type: 'tool_use',
        id: t.id,
        name: t.name,
        input: t.input,
        status: t.status === 'pending' ? 'running' : (t.status as 'running' | 'done' | 'error' | 'denied'),
        result: t.output as string | undefined,
        duration: t.duration,
      });
    }
  }
  return { ...msg, blocks };
}

/** Rebuild flat content string from text blocks (for copy, pins, search) */
function flattenBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextContentBlock => b.type === 'text')
    .map(b => b.content)
    .join('');
}

function replaceTextBlocks(blocks: ContentBlock[], content: string): ContentBlock[] {
  const firstTextIndex = blocks.findIndex(block => block.type === 'text');
  const firstText = firstTextIndex >= 0 ? blocks[firstTextIndex] as TextContentBlock : undefined;
  const next: ContentBlock[] = blocks.filter(block => block.type !== 'text');
  if (!content) return next;
  const insertAt = firstTextIndex < 0 ? next.length : Math.min(firstTextIndex, next.length);
  next.splice(insertAt, 0, {
    type: 'text',
    blockId: firstText?.blockId ?? nextBlockId('text'),
    content,
  });
  return next;
}

function clearDraftPreview(
  draft: ChatMessage['draft'],
  fallbackTurnId: string,
): NonNullable<ChatMessage['draft']> {
  return {
    turnId: draft?.turnId ?? fallbackTurnId,
    revision: draft?.revision ?? 0,
    content: '',
    status: 'streaming',
  };
}

function settleRunningBlocks(blocks: ContentBlock[], failure?: string): ContentBlock[] {
  return blocks.map(block => {
    if (block.type === 'step' && block.status === 'running') {
      return { ...block, status: 'done' as const };
    }
    if (block.type === 'tool_use' && block.status === 'running') {
      return failure
        ? { ...block, status: 'error' as const, result: failure }
        : { ...block, status: 'done' as const };
    }
    return block;
  });
}

function settleRunningTools(tools: ToolExecution[], failure?: string): ToolExecution[] {
  return tools.map(tool => tool.status === 'running'
    ? {
      ...tool,
      status: failure ? 'error' as const : 'done' as const,
      ...(failure ? { output: failure } : {}),
    }
    : tool);
}

function mergeAuthoritativeHistory(
  authoritative: ChatMessage[],
  localTurns: ChatMessage[],
): ChatMessage[] {
  const authoritativeIds = new Set(authoritative.map(message => message.id));
  return [
    ...authoritative,
    ...localTurns.filter(message => !authoritativeIds.has(message.id)),
  ];
}

interface PendingHistoryLoad {
  cacheKey: string;
  localMessageIds: Set<string>;
  localMessages: Map<string, ChatMessage>;
  suppressedMessageIds: Set<string>;
  suppressedRetryTail: {
    userContent: string;
    target: ChatRetryTarget;
  } | null;
  ready: Promise<void>;
  release: () => void;
}

function assistantFailureDetail(message: ChatMessage): string | null {
  if (message.role !== 'assistant') return null;
  if (message.content.startsWith(GENERATION_FAILED_PREFIX)) {
    return message.content.slice(GENERATION_FAILED_PREFIX.length);
  }
  for (let i = (message.blocks?.length ?? 0) - 1; i >= 0; i--) {
    const block = message.blocks?.[i];
    if (block?.type === 'error') return block.message;
  }
  return null;
}

function persistedAssistantRetryContent(message: ChatMessage): string {
  const failure = assistantFailureDetail(message);
  return failure === null
    ? message.content
    : `${GENERATION_FAILED_PREFIX}${failure}`;
}

function persistedRetryMessageCount(messages: readonly ChatMessage[]): number {
  return messages.reduce((count, message) => (
    message.role === 'assistant' && message.draft?.status === 'stopped'
      ? count
      : count + 1
  ), 0);
}

function suppressRetriedHistoryTail(
  history: ChatMessage[],
  retriedTail: PendingHistoryLoad['suppressedRetryTail'],
): ChatMessage[] {
  if (!retriedTail || history.length !== retriedTail.target.expectedMessageCount) {
    return history;
  }
  if (retriedTail.target.kind === 'lone-user') {
    const user = history.at(-1);
    return user?.role === 'user' && user.content === retriedTail.userContent
      ? history.slice(0, -1)
      : history;
  }
  const user = history.at(-2);
  const assistant = history.at(-1);
  return user?.role === 'user'
    && user.content === retriedTail.userContent
    && assistant?.role === 'assistant'
    && assistant.content === retriedTail.target.expectedAssistantContent
    ? history.slice(0, -2)
    : history;
}

function isActiveTurnClearConflict(error: unknown): boolean {
  const candidate = error as { status?: unknown; body?: { code?: unknown } };
  return candidate?.status === 409
    && candidate.body?.code === 'SESSION_TURN_IN_PROGRESS';
}

async function clearHistoryAfterAbort(workspaceId: string, sessionId: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await adapter.clearHistory(workspaceId, sessionId);
      return;
    } catch (error) {
      if (!isActiveTurnClearConflict(error) || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * (2 ** attempt)));
    }
  }
}

export type AutonomyLevel = 'normal' | 'trusted' | 'yolo';
export interface AutonomyState {
  level: AutonomyLevel;
  /** Epoch ms after which the elevated level auto-reverts. null = until session end. */
  expiresAt: number | null;
}

const CHAT_TURN_CONFLICT_MAX_RETRIES = 6;

/**
 * Tool-context metrics are live transport diagnostics, not conversation data.
 * Keep them on the active response, but never let the module cache replay them
 * after a session return as though they were durable history.
 */
function stripLiveToolContextReceipts(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(message => {
    if (!message.blocks?.some(block => block.type === 'tool_context')) return message;
    return {
      ...message,
      blocks: message.blocks.filter(block => block.type !== 'tool_context'),
    };
  });
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/** Fail closed: malformed or internally inconsistent server telemetry is hidden. */
function normalizeToolContextMetrics(value: unknown): ToolContextMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const toolCatalogCount = nonNegativeInteger(raw.toolCatalogCount);
  const toolEligibleCount = nonNegativeInteger(raw.toolEligibleCount);
  const toolSelectedCount = nonNegativeInteger(raw.toolSelectedCount);
  const toolOmittedCount = nonNegativeInteger(raw.toolOmittedCount);
  const transmittedToolSchemaChars = nonNegativeInteger(raw.transmittedToolSchemaChars);
  const estimatedToolSchemaTokens = nonNegativeInteger(raw.estimatedToolSchemaTokens);
  const finalSystemPromptChars = nonNegativeInteger(raw.finalSystemPromptChars);
  const estimatedSystemPromptTokens = nonNegativeInteger(raw.estimatedSystemPromptTokens);
  const selectorLatencyMs = nonNegativeInteger(raw.selectorLatencyMs);
  const agentLatencyMs = nonNegativeInteger(raw.agentLatencyMs);
  const totalServerLatencyMs = nonNegativeInteger(raw.totalServerLatencyMs);
  const providerInputTokens = nonNegativeInteger(raw.providerInputTokens);
  const providerOutputTokens = nonNegativeInteger(raw.providerOutputTokens);
  const packageMode = raw.packageMode;
  const timeToFirstTokenMs = raw.timeToFirstTokenMs === null
    ? null
    : nonNegativeInteger(raw.timeToFirstTokenMs);

  if (
    toolCatalogCount === null
    || toolEligibleCount === null
    || toolSelectedCount === null
    || toolOmittedCount === null
    || transmittedToolSchemaChars === null
    || estimatedToolSchemaTokens === null
    || finalSystemPromptChars === null
    || estimatedSystemPromptTokens === null
    || selectorLatencyMs === null
    || (timeToFirstTokenMs === null && raw.timeToFirstTokenMs !== null)
    || agentLatencyMs === null
    || totalServerLatencyMs === null
    || providerInputTokens === null
    || providerOutputTokens === null
    || (packageMode !== 'compact' && packageMode !== 'full' && packageMode !== 'custom')
    || toolEligibleCount > toolCatalogCount
    || toolSelectedCount > toolEligibleCount
    || toolOmittedCount !== toolEligibleCount - toolSelectedCount
    || estimatedToolSchemaTokens !== Math.ceil(transmittedToolSchemaChars / 4)
    || ((toolSelectedCount === 0) !== (transmittedToolSchemaChars === 0))
    || estimatedSystemPromptTokens !== Math.ceil(finalSystemPromptChars / 4)
    || selectorLatencyMs > totalServerLatencyMs
    || agentLatencyMs > totalServerLatencyMs
    || (timeToFirstTokenMs !== null && timeToFirstTokenMs > totalServerLatencyMs)
  ) return null;

  return {
    toolCatalogCount,
    toolEligibleCount,
    toolSelectedCount,
    toolOmittedCount,
    transmittedToolSchemaChars,
    estimatedToolSchemaTokens,
    finalSystemPromptChars,
    estimatedSystemPromptTokens,
    packageMode,
    selectorLatencyMs,
    timeToFirstTokenMs,
    agentLatencyMs,
    totalServerLatencyMs,
    providerInputTokens,
    providerOutputTokens,
  };
}

export type ChatHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

const HISTORY_LOAD_ERROR = "We couldn't load this conversation. Check your connection and try again.";

interface ChatHistoryState {
  threadKey: string | null;
  status: ChatHistoryStatus;
  error: string | null;
}

interface UseChatOptions {
  workspaceId: string | null;
  sessionId: string | null;
  persona?: string;
  /** Model selected when the user sends this turn. */
  model?: string;
  /**
   * Phase B.5: per-window autonomy. When set to 'trusted' or 'yolo' (and not
   * expired), the server's pre-tool gate skips confirmation for the matching
   * tool set. The server owns the final check — client state is advisory.
   */
  autonomy?: AutonomyState;
  onTurnSettled?: (owner: { workspaceId: string; sessionId: string }) => void;
}

export const useChat = ({
  workspaceId,
  sessionId,
  persona,
  model,
  autonomy,
  onTurnSettled,
}: UseChatOptions) => {
  const currentThreadKey = workspaceId && sessionId
    ? chatThreadCacheKey(workspaceId, sessionId)
    : null;
  const [messages, setMessages] = useState<ChatMessage[]>(() => (
    currentThreadKey ? (readChatThreadCache(currentThreadKey) ?? []) : []
  ));
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const messagesThreadKeyRef = useRef<string | null>(currentThreadKey);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [historyReloadRevision, setHistoryReloadRevision] = useState(0);
  const settledCacheThreadRef = useRef<string | null>(null);
  const historyGenerationRef = useRef(0);
  const pendingHistoryRef = useRef<PendingHistoryLoad | null>(null);
  const clearingThreadCountsRef = useRef<Map<string, number>>(new Map());
  const clearSucceededThreadsRef = useRef<Set<string>>(new Set());
  const clearNeedsHistoryRecoveryRef = useRef<Set<string>>(new Set());
  const recoveringHistoryThreadsRef = useRef<Set<string>>(new Set());
  const historyRecoveryLocalIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const historyRecoveryLocalMessagesRef = useRef<Map<string, Map<string, ChatMessage>>>(new Map());
  const historyRecoveryRetryCountsRef = useRef<Map<string, number>>(new Map());
  const currentThreadRef = useRef({ workspaceId, sessionId });
  const onTurnSettledRef = useRef(onTurnSettled);
  currentThreadRef.current = { workspaceId, sessionId };
  onTurnSettledRef.current = onTurnSettled;
  // F2: true only after a real session's history fetch has landed. The wizard
  // auto-send waits on this so its optimistic turn isn't clobbered by the
  // history-replace that fires when the session id resolves.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyState, setHistoryState] = useState<ChatHistoryState>({
    threadKey: null,
    status: 'idle',
    error: null,
  });
  const historyReadyThreadRef = useRef<string | null>(null);
  const activeDispatchRef = useRef<{
    controller: AbortController;
    workspaceId: string;
    sessionId: string;
    assistantId: string;
  } | null>(null);

  // Lane C (Pillar 2.2/2.5): a send fired while a reply is still streaming must
  // NOT lock the composer or spawn a second concurrent SSE stream. Such sends
  // QUEUE behind the in-flight one — the optimistic user turn renders at once
  // with a truthful `queued` marker and dispatches when the current reply ends.
  const inFlightRef = useRef(false);
  const sessionTransitionBlockRef = useRef<{ cacheKey: string } | null>(null);
  const queueRef = useRef<Array<{
    id: string;
    content: string;
    retry?: boolean;
    retryTarget?: ChatRetryTarget;
    model?: string;
    persona?: string;
    autonomy?: AutonomyState;
    turnConflictAttempts?: number;
    workspaceId: string;
    sessionId: string;
  }>>([]);
  // Late-bound so the dispatch loop can flush its own queue without a self-dep.
  const runDispatchRef = useRef<
    (
      content: string,
      opts: { retry?: boolean; retryTarget?: ChatRetryTarget } | undefined,
      optimisticId?: string,
      turnModel?: string,
      turnPersona?: string,
      turnAutonomy?: AutonomyState,
      turnConflictAttempts?: number,
    ) => Promise<boolean>
  >(async () => false);

  const flushNextQueuedFor = useCallback((ownerWorkspaceId: string, ownerSessionId: string) => {
    const currentThread = currentThreadRef.current;
    if (
      currentThread.workspaceId !== ownerWorkspaceId
      || (currentThread.sessionId ?? '') !== ownerSessionId
    ) return;

    let next = queueRef.current.shift();
    while (
      next
      && (next.workspaceId !== ownerWorkspaceId || next.sessionId !== ownerSessionId)
    ) {
      next = queueRef.current.shift();
    }
    if (next) {
      void runDispatchRef.current(
        next.content,
        { retry: next.retry, retryTarget: next.retryTarget },
        next.id,
        next.model,
        next.persona,
        next.autonomy,
        next.turnConflictAttempts,
      );
    }
  }, []);

  const cancelActiveDispatch = useCallback(async () => {
    const activeDispatch = activeDispatchRef.current;
    queueRef.current = [];
    setMessages(prev => (
      prev.some(message => message.queued)
        ? prev.filter(message => !message.queued)
        : prev
    ));
    setPendingApproval(null);
    inFlightRef.current = false;
    setIsLoading(false);
    if (!activeDispatch) return;

    activeDispatchRef.current = null;
    activeDispatch.controller.abort();
    try {
      await Promise.resolve(adapter.abortAgent(
        activeDispatch.workspaceId,
        activeDispatch.sessionId,
      ));
    } catch { /* best-effort */ }
  }, []);

  // Cancel any in-flight stream on unmount
  useEffect(() => {
    return () => {
      sessionTransitionBlockRef.current = null;
      const activeDispatch = activeDispatchRef.current;
      if (!activeDispatch) return;
      activeDispatchRef.current = null;
      activeDispatch.controller.abort();
      try {
        void Promise.resolve(adapter.abortAgent(
          activeDispatch.workspaceId,
          activeDispatch.sessionId,
        )).catch(() => { /* best-effort */ });
      } catch { /* adapter unavailable */ }
    };
  }, []);

  // Load history when session changes
  useEffect(() => {
    const generation = ++historyGenerationRef.current;
    const recoveringHistoryThreads = recoveringHistoryThreadsRef.current;
    const historyRecoveryLocalIds = historyRecoveryLocalIdsRef.current;
    const historyRecoveryLocalMessages = historyRecoveryLocalMessagesRef.current;
    const historyRecoveryRetryCounts = historyRecoveryRetryCountsRef.current;
    let effectPendingHistory: PendingHistoryLoad | null = null;
    if (
      sessionTransitionBlockRef.current
      && sessionTransitionBlockRef.current.cacheKey !== currentThreadKey
    ) {
      sessionTransitionBlockRef.current = null;
    }
    const activeDispatch = activeDispatchRef.current;
    if (
      activeDispatch
      && (
        activeDispatch.workspaceId !== workspaceId
        || activeDispatch.sessionId !== (sessionId ?? '')
      )
    ) {
      void cancelActiveDispatch();
    }
    // Lane C: a message queued into the previous thread must never dispatch into
    // a freshly loaded one — drop the pending queue on every thread change.
    queueRef.current = [];
    setPendingApproval(null);
    let cancelled = false;
    let historyFetchSucceeded = false;
    let recoveryLocalIds: Set<string> | undefined;
    let recoveryLocalMessages: Map<string, ChatMessage> | undefined;
    let isHistoryRecovery = false;
    if (workspaceId && sessionId) {
      const cacheKey = chatThreadCacheKey(workspaceId, sessionId);
      setHistoryState({ threadKey: cacheKey, status: 'loading', error: null });
      recoveryLocalIds = historyRecoveryLocalIds.get(cacheKey);
      recoveryLocalMessages = historyRecoveryLocalMessages.get(cacheKey);
      isHistoryRecovery = (
        recoveringHistoryThreads.has(cacheKey)
        && recoveryLocalIds !== undefined
      );
      let releaseHistory!: () => void;
      const ready = new Promise<void>(resolve => { releaseHistory = resolve; });
      const pendingHistory: PendingHistoryLoad = {
        cacheKey,
        localMessageIds: new Set(recoveryLocalIds ?? []),
        localMessages: new Map(recoveryLocalMessages ?? []),
        suppressedMessageIds: new Set(),
        suppressedRetryTail: null,
        ready,
        release: releaseHistory,
      };
      effectPendingHistory = pendingHistory;
      pendingHistoryRef.current = pendingHistory;
      // Lane C (2.6-chat) cache-first paint: seed from the last-known thread so a
      // return to a visited session renders instantly, then refresh silently.
      const cached = readChatThreadCache(cacheKey);
      messagesThreadKeyRef.current = cacheKey;
      setMessages(isHistoryRecovery
        ? Array.from(pendingHistory.localMessages.values())
        : (cached ?? []));
      setHistoryLoaded(false);
      adapter.getHistory(workspaceId, sessionId)
        .then((history) => {
          if (
            cancelled
            || historyGenerationRef.current !== generation
            || pendingHistoryRef.current !== pendingHistory
          ) return;
          const shaped = suppressRetriedHistoryTail(
            history.map(ensureBlocks),
            pendingHistory.suppressedRetryTail,
          );
          const visibleHistory = pendingHistory.suppressedMessageIds.size === 0
            ? shaped
            : shaped.filter(message => !pendingHistory.suppressedMessageIds.has(message.id));
          messagesThreadKeyRef.current = cacheKey;
          setMessages(prev => {
            if (pendingHistory.localMessageIds.size === 0) return visibleHistory;
            const localTurns = new Map(pendingHistory.localMessages);
            for (const message of prev) {
              if (pendingHistory.localMessageIds.has(message.id)) {
                localTurns.set(message.id, message);
              }
            }
            return mergeAuthoritativeHistory(visibleHistory, Array.from(localTurns.values()));
          });
          writeChatThreadCache(cacheKey, visibleHistory);
          historyReadyThreadRef.current = cacheKey;
          historyFetchSucceeded = true;
        })
        .catch((err) => {
          if (cancelled || historyGenerationRef.current !== generation) return;
          console.error('[useChat] history fetch failed:', err);
          // Keep a good cached paint on a transient refresh failure; only clear
          // when there was nothing to show.
          if (!cached && pendingHistory.localMessageIds.size === 0) {
            messagesThreadKeyRef.current = cacheKey;
            setMessages([]);
          }
        })
        .finally(() => {
          pendingHistory.release();
          const completedCurrent = (
            !cancelled
            && historyGenerationRef.current === generation
            && pendingHistoryRef.current === pendingHistory
          );
          if (completedCurrent) {
            pendingHistoryRef.current = null;
            if (isHistoryRecovery && !historyFetchSucceeded) {
              setHistoryLoaded(false);
              const retryCount = historyRecoveryRetryCounts.get(cacheKey) ?? 0;
              if (retryCount < 1) {
                historyRecoveryRetryCounts.set(cacheKey, retryCount + 1);
                setHistoryState({ threadKey: cacheKey, status: 'loading', error: null });
                setHistoryReloadRevision(revision => revision + 1);
              } else {
                setHistoryState({
                  threadKey: cacheKey,
                  status: 'error',
                  error: HISTORY_LOAD_ERROR,
                });
              }
            } else {
              // Ordinary history loads are considered settled for this exact
              // thread even when a transient refresh fails. Cached/local chat
              // remains usable; failed-clear recovery stays fail-closed above.
              historyReadyThreadRef.current = cacheKey;
              setHistoryLoaded(true);
              setHistoryState({
                threadKey: cacheKey,
                status: historyFetchSucceeded ? 'ready' : 'error',
                error: historyFetchSucceeded ? null : HISTORY_LOAD_ERROR,
              });
            }
          }
          if (
            completedCurrent
            && isHistoryRecovery
            && historyFetchSucceeded
            && historyRecoveryLocalIds.get(cacheKey) === recoveryLocalIds
          ) {
            recoveringHistoryThreads.delete(cacheKey);
            historyRecoveryLocalIds.delete(cacheKey);
            historyRecoveryLocalMessages.delete(cacheKey);
            historyRecoveryRetryCounts.delete(cacheKey);
          }
        });
    } else {
      pendingHistoryRef.current = null;
      // No session yet — leave historyLoaded false so an auto-send waits for a
      // real session's history to land (never race the replace below).
      messagesThreadKeyRef.current = null;
      setMessages([]);
      setHistoryState({ threadKey: null, status: 'idle', error: null });
    }
    return () => {
      cancelled = true;
      effectPendingHistory?.release();
    };
  }, [workspaceId, sessionId, currentThreadKey, historyReloadRevision, cancelActiveDispatch]);

  // Lane C: persist the SETTLED thread (never mid-stream partials or queued
  // turns) so a remount/return paints instantly from the cache above.
  useEffect(() => {
    const cacheKey = workspaceId && sessionId
      ? chatThreadCacheKey(workspaceId, sessionId)
      : null;
    // On a thread change this effect still sees the previous render's messages.
    // Skip that transition commit so session A can never be written under B's
    // cache key; the history effect above then installs B's cache (or []).
    if (settledCacheThreadRef.current !== cacheKey) {
      settledCacheThreadRef.current = cacheKey;
      return;
    }
    if (!cacheKey) return;
    if (isLoading) return;
    if (messages.length === 0) return;
    if (messages.some((m) => m.queued)) return;
    const settledMessages = messages.filter(message => !message.draft);
    if (settledMessages.length === 0) return;
    writeChatThreadCache(
      cacheKey,
      stripLiveToolContextReceipts(stripLiveMemoryReceipts(settledMessages)),
    );
  }, [messages, workspaceId, sessionId, isLoading]);

  const runDispatch = useCallback(async (
    content: string,
    opts?: { retry?: boolean; retryTarget?: ChatRetryTarget },
    optimisticId?: string,
    turnModel?: string,
    turnPersona?: string,
    turnAutonomy?: AutonomyState,
    turnConflictAttempts = 0,
  ): Promise<boolean> => {
    if (!workspaceId || !sessionId || !content.trim()) return false;
    setHistoryLoaded(true);
    setPendingApproval(null);
    inFlightRef.current = true;
    // F2: report send success so the wizard auto-send knows whether to clear
    // the composer or leave the text for a manual retry. Error handling below
    // is unchanged — this only observes it.
    let failed = false;
    const trimmed = content.trim();

    const assistantId = crypto.randomUUID();
    const legacyTurnId = `legacy:${assistantId}`;
    const immediateUserId = optimisticId ? undefined : crypto.randomUUID();
    let initialHistoryReady: Promise<void> | undefined;
    if (sessionId) {
      const pendingHistory = pendingHistoryRef.current;
      if (pendingHistory?.cacheKey === chatThreadCacheKey(workspaceId, sessionId)) {
        pendingHistory.localMessageIds.add(assistantId);
        pendingHistory.localMessageIds.add(optimisticId ?? immediateUserId!);
        initialHistoryReady = pendingHistory.ready;
      }
    }
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      blocks: [],
      timestamp: new Date().toISOString(),
      tools: [],
      // Preserve the authoring persona on the turn itself. The active persona
      // can change while this message remains in the thread; rendering from
      // mutable window state would otherwise relabel historical responses.
      persona: turnPersona,
      // The placeholder is already an uncommitted draft even before the first
      // token. Keeping this marker through tool/model events prevents Stop from
      // ever caching a non-authoritative assistant record.
      draft: {
        turnId: legacyTurnId,
        revision: 0,
        content: '',
        status: 'streaming',
      },
    };
    // Target the assistant turn BY ID (not "last message"): a queued turn may
    // sit after it in the list, so position is not stable during streaming.
    if (optimisticId) {
      // Flush path: the optimistic user turn is already rendered (queued while a
      // prior reply streamed). Promote it (clear `queued`) and insert the
      // assistant placeholder directly after it — position-stable so any later
      // queued turn keeps its order. If the turn was dropped (a thread switch
      // between queueing and flush — which also clears the queue, so an edge),
      // append the assistant at the end so streaming still has a target.
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === optimisticId);
        if (idx === -1) return [...prev, assistantMsg];
        const next = [...prev];
        next[idx] = { ...next[idx], queued: false };
        next.splice(idx + 1, 0, assistantMsg);
        return next;
      });
    } else {
      const userMsg: ChatMessage = {
        id: immediateUserId!,
        role: 'user',
        content: trimmed,
        blocks: [{ type: 'text', blockId: nextBlockId('text'), content: trimmed }],
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMsg, assistantMsg]);
    }
    setIsLoading(true);

    activeDispatchRef.current?.controller.abort();
    // Lane S2 (Pillar 3.1): capture THIS stream's controller locally. The break
    // guard below reads the local `controller`, while activeDispatch records
    // which request owns the shared loading/queue state and server-side cancel.
    const controller = new AbortController();
    const activeDispatch = {
      controller,
      workspaceId,
      sessionId: sessionId ?? '',
      assistantId,
    };
    activeDispatchRef.current = activeDispatch;

    try {
      // A history request that started before this turn cannot reliably tell an
      // older identical exchange from this new one because the current API uses
      // positional `hist-N` ids. Paint optimistically, but wait to POST until
      // that snapshot settles so reconciliation is identity-safe.
      if (initialHistoryReady) await initialHistoryReady;
      if (controller.signal.aborted || activeDispatchRef.current !== activeDispatch) {
        return true;
      }
      let terminalEventSeen = false;
      let legacyCanonicalContent = '';
      // Phase B.5: only forward autonomy when elevated — Normal is the
      // server default, so passing `undefined` keeps the wire payload lean.
      const autonomyPayload = turnAutonomy && turnAutonomy.level !== 'normal'
        ? { level: turnAutonomy.level, expiresAt: turnAutonomy.expiresAt ?? undefined }
        : undefined;
      const eventStream = opts?.retryTarget
        ? adapter.sendMessage(
          workspaceId,
          content,
          sessionId || undefined,
          turnPersona,
          autonomyPayload,
          opts.retry,
          turnModel,
          opts.retryTarget,
        )
        : turnModel
          ? adapter.sendMessage(
            workspaceId,
            content,
            sessionId || undefined,
            turnPersona,
            autonomyPayload,
            opts?.retry,
            turnModel,
          )
          : adapter.sendMessage(
            workspaceId,
            content,
            sessionId || undefined,
            turnPersona,
            autonomyPayload,
            opts?.retry,
          );
      for await (const event of eventStream) {
        if (controller.signal.aborted) break;
        const evt = event as StreamEvent;
        const data = evt.data as Record<string, unknown>;
        if (terminalEventSeen) continue;
        if (evt.type === 'error' && data?.code === 'SESSION_TURN_IN_PROGRESS') {
          const conflict = new Error('The previous response is still stopping.');
          conflict.name = 'ChatSessionTurnInProgressError';
          throw conflict;
        }
        if (evt.type === 'done') {
          const canonicalContent = typeof data?.content === 'string'
            ? data.content
            : legacyCanonicalContent;
          if (!canonicalContent.trim()) {
            const emptyResponse = new Error('The model returned an empty response. Please retry.');
            emptyResponse.name = 'ChatStreamIncompleteError';
            throw emptyResponse;
          }
        }
        const isTerminalEvent = evt.type === 'done' || evt.type === 'error';
        const legacyTokenContent = evt.type === 'token'
          ? typeof data === 'string' ? data : (data?.content as string ?? '')
          : '';
        if (evt.type === 'token') legacyCanonicalContent += legacyTokenContent;
        if (evt.type === 'error') failed = true;
        if (isTerminalEvent) terminalEventSeen = true;
        const retryTargetStale = evt.type === 'error'
          && data?.code === 'RETRY_TARGET_STALE';
        if (evt.type === 'approval_request' || evt.type === 'approval_required') {
          const currentThread = currentThreadRef.current;
          if (
            activeDispatchRef.current === activeDispatch
            && currentThread.workspaceId === activeDispatch.workspaceId
            && (currentThread.sessionId ?? '') === activeDispatch.sessionId
          ) {
            setPendingApproval(data as unknown as ApprovalRequest);
          }
        } else if (isTerminalEvent) {
          setPendingApproval(null);
        }

        if (retryTargetStale) {
          const cacheKey = chatThreadCacheKey(
            activeDispatch.workspaceId,
            activeDispatch.sessionId,
          );
          const pendingHistory = pendingHistoryRef.current;
          if (pendingHistory?.cacheKey === cacheKey) {
            historyGenerationRef.current += 1;
            pendingHistory.release();
            pendingHistoryRef.current = null;
          }
          historyReadyThreadRef.current = null;
          setHistoryLoaded(false);
          setHistoryState({ threadKey: cacheKey, status: 'loading', error: null });
          setHistoryReloadRevision(revision => revision + 1);
        }

        setMessages(prev => {
          if (retryTargetStale) {
            return readChatThreadCache(chatThreadCacheKey(
              activeDispatch.workspaceId,
              activeDispatch.sessionId,
            )) ?? [];
          }
          const msgs = [...prev];
          const targetIdx = msgs.findIndex(m => m.id === assistantId);
          const last = targetIdx >= 0 ? msgs[targetIdx] : undefined;
          // Guard the missing-target case: a session/workspace switch mid-stream
          // resets messages via the load effect, after which a late stream event
          // would read `last.role` off undefined and crash the updater.
          if (!last || last.role !== 'assistant') return msgs;
          const blocks = [...(last.blocks || [])];
          let toolsUpdate: ToolExecution[] | null = null;
          let modelUpdate: string | null = null;
          let memoryContextUpdate: ChatMessage['memoryContext'];
          let draftUpdate: ChatMessage['draft'] | null | undefined;

          switch (evt.type) {
            case 'token': {
              if (last.draft && last.draft.turnId !== legacyTurnId) break;
              const previous = last.draft?.turnId === legacyTurnId ? last.draft : undefined;
              draftUpdate = {
                turnId: legacyTurnId,
                revision: (previous?.revision ?? 0) + 1,
                content: (previous?.content ?? '') + legacyTokenContent,
                status: 'streaming',
              };
              break;
            }

            case 'draft_update': {
              const turnId = typeof data?.turnId === 'string' ? data.turnId : '';
              const revision = typeof data?.revision === 'number' ? data.revision : 0;
              const draftContent = typeof data?.content === 'string' ? data.content : '';
              if (!turnId || !Number.isInteger(revision) || revision <= 0) break;
              if (last.draft?.turnId && last.draft.turnId !== legacyTurnId && last.draft.turnId !== turnId) break;
              if (last.draft?.turnId === turnId && revision <= last.draft.revision) break;
              draftUpdate = {
                turnId,
                revision,
                content: draftContent,
                status: 'streaming',
              };
              break;
            }

            case 'step': {
              const description = typeof data === 'string' ? data : (data?.content as string ?? '');
              // PR3.5: carry memory-recall provenance (distinct raw source
              // values) onto the step block; absent on non-memory steps.
              const stepProvenance = (data?.provenance as { sources?: string[] } | undefined);
              const stepSources = Array.isArray(stepProvenance?.sources) ? stepProvenance.sources : undefined;
              if (description) {
                // Mark previous running steps as done
                for (let i = 0; i < blocks.length; i++) {
                  const b = blocks[i];
                  if (b.type === 'step' && b.status === 'running') {
                    blocks[i] = { ...b, status: 'done' };
                  }
                }
                blocks.push({
                  type: 'step',
                  blockId: nextBlockId('step'),
                  description,
                  status: 'running',
                  ...(stepSources && stepSources.length > 0 ? { provenance: { sources: stepSources } } : {}),
                });
              }
              break;
            }

            case 'tool_start': {
              draftUpdate = clearDraftPreview(last.draft, legacyTurnId);
              const toolName = (data?.name as string) ?? 'unknown';
              const toolId = `${toolName}-${nextBlockId('tool')}`;
              blocks.push({
                type: 'tool_use',
                id: toolId,
                name: toolName,
                input: data?.input as Record<string, unknown>,
                status: 'running',
              });
              // Legacy tools[] — immutable accumulation
              const prevTools = last.tools || [];
              toolsUpdate = [...prevTools, { id: toolId, name: toolName, status: 'running' as const, input: data?.input as Record<string, unknown> }];
              break;
            }

            case 'tool_end': {
              const toolName = data?.name as string;
              const reportedResult = typeof data?.result === 'string' ? data.result : '';
              const duration = data?.duration as number | undefined;
              const statusReported = typeof data?.isError === 'boolean';
              const status = data?.isError === false ? 'done' as const : 'error' as const;
              const result = statusReported
                ? reportedResult
                : `Tool completion status was not reported${reportedResult ? `\n${reportedResult}` : ''}`;
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type === 'tool_use' && b.name === toolName && b.status === 'running') {
                  blocks[i] = { ...b, status, result, duration };
                  break;
                }
              }
              // Mark most recent running step as done
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type === 'step' && b.status === 'running') {
                  blocks[i] = { ...b, status: 'done' };
                  break;
                }
              }
              // Legacy tools[] — immutable update
              if (last.tools && toolName) {
                let idx = -1;
                for (let i = last.tools.length - 1; i >= 0; i--) {
                  if (last.tools[i]?.name === toolName && last.tools[i]?.status === 'running') {
                    idx = i;
                    break;
                  }
                }
                if (idx >= 0) {
                  toolsUpdate = last.tools.map((t, ti) =>
                    ti === idx ? { ...t, status, output: result, duration } : t
                  );
                }
              }
              break;
            }

            case 'model_switch': {
              draftUpdate = clearDraftPreview(last.draft, legacyTurnId);
              const switchedModel = (data as Record<string, string>).model;
              blocks.push({
                type: 'model_switch',
                blockId: nextBlockId('model'),
                from: (data as Record<string, string>).primary ?? 'primary',
                to: switchedModel ?? 'fallback',
                reason: (data as Record<string, string>).reason ?? 'primary unavailable',
              });
              if (switchedModel) modelUpdate = switchedModel;
              break;
            }

            case 'error': {
              draftUpdate = null;
              const errorMsg = typeof data === 'string' ? data : (data?.message as string ?? 'Unknown error');
              blocks.splice(0, blocks.length, ...settleRunningBlocks(blocks, errorMsg));
              if (last.tools) toolsUpdate = settleRunningTools(last.tools, errorMsg);
              setPendingApproval(null);
              blocks.push({ type: 'error', blockId: nextBlockId('error'), message: errorMsg });
              break;
            }

            case 'done': {
              draftUpdate = null;
              setPendingApproval(null);
              const missingToolResult = 'Tool completion was not reported';
              // Thinking may settle at terminal done. A tool cannot truthfully
              // settle as successful unless its own tool_result arrived.
              for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (b.type === 'step' && b.status === 'running') {
                  blocks[i] = { ...b, status: 'done' };
                } else if (b.type === 'tool_use' && b.status === 'running') {
                  blocks[i] = { ...b, status: 'error', result: missingToolResult };
                }
              }
              if (last.tools) toolsUpdate = settleRunningTools(last.tools, missingToolResult);
              const doneContent = typeof data?.content === 'string'
                ? data.content
                : last.draft?.turnId === legacyTurnId
                  ? legacyCanonicalContent
                  : last.content;
              blocks.splice(0, blocks.length, ...replaceTextBlocks(blocks, doneContent));
              const resolvedModel = data?.model;
              if (typeof resolvedModel === 'string' && resolvedModel) modelUpdate = resolvedModel;
              memoryContextUpdate = normalizeMemoryContextReceipt(
                data?.memoryContext,
                `${activeDispatch.workspaceId}\u0000${activeDispatch.sessionId}\u0000${assistantId}`,
              );
              const contextMetrics = normalizeToolContextMetrics(data?.contextMetrics);
              if (contextMetrics) {
                blocks.push({
                  type: 'tool_context',
                  blockId: nextBlockId('tool-context'),
                  metrics: contextMetrics,
                });
              }
              break;
            }

            case 'approval_request':
            case 'approval_required':
              // Backend emits `approval_required` as the SSE event name;
              // legacy clients sent `approval_request`. Accept both.
              draftUpdate = clearDraftPreview(last.draft, legacyTurnId);
              break;
          }

          const content = flattenBlocks(blocks);
          return msgs.map((m, i) =>
            i === targetIdx
              ? {
                ...m,
                blocks,
                content,
                ...(toolsUpdate && { tools: toolsUpdate }),
                ...(modelUpdate && { model: modelUpdate }),
                ...(memoryContextUpdate && { memoryContext: memoryContextUpdate }),
                ...(draftUpdate !== undefined && { draft: draftUpdate ?? undefined }),
              }
              : m
          );
        });
        if (isTerminalEvent) {
          const currentThread = currentThreadRef.current;
          if (
            activeDispatchRef.current === activeDispatch
            && currentThread.workspaceId === activeDispatch.workspaceId
            && (currentThread.sessionId ?? '') === activeDispatch.sessionId
          ) {
            try {
              onTurnSettledRef.current?.({
                workspaceId: activeDispatch.workspaceId,
                sessionId: activeDispatch.sessionId,
              });
            } catch {
              // Session metadata refresh is best-effort and must not fail the turn.
            }
          }
          break;
        }
      }
      if (!terminalEventSeen && !controller.signal.aborted) {
        const incomplete = new Error('The response ended before completion. Please retry.');
        incomplete.name = 'ChatStreamIncompleteError';
        throw incomplete;
      }
    } catch (e) {
      if (controller.signal.aborted) {
        // User Stop is a successful cancellation, not a backend outage. Preserve
        // the partial answer and let finally release the composer/queue.
        return true;
      }
      const isTurnConflict = e instanceof Error
        && e.name === 'ChatSessionTurnInProgressError';
      if (isTurnConflict && turnConflictAttempts < CHAT_TURN_CONFLICT_MAX_RETRIES) {
        setMessages(prev => prev.map(message => message.id === assistantId
          ? { ...message, retrying: true }
          : message));
        await new Promise(resolve => setTimeout(
          resolve,
          25 * (2 ** turnConflictAttempts),
        ));
        if (controller.signal.aborted) return true;
        const queuedId = optimisticId ?? immediateUserId;
        const currentThread = currentThreadRef.current;
        if (
          queuedId
          && activeDispatchRef.current === activeDispatch
          && currentThread.workspaceId === activeDispatch.workspaceId
          && (currentThread.sessionId ?? '') === activeDispatch.sessionId
        ) {
          const pendingHistory = pendingHistoryRef.current;
          if (pendingHistory?.cacheKey === chatThreadCacheKey(
            activeDispatch.workspaceId,
            activeDispatch.sessionId,
          )) {
            pendingHistory.localMessageIds.delete(assistantId);
          }
          setPendingApproval(null);
          setMessages(prev => prev
            .filter(message => message.id !== assistantId)
            .map(message => message.id === queuedId
              ? { ...message, queued: true }
              : message));
          queueRef.current.unshift({
            id: queuedId,
            content: trimmed,
            retry: opts?.retry,
            retryTarget: opts?.retryTarget,
            model: turnModel,
            persona: turnPersona,
            autonomy: turnAutonomy ? { ...turnAutonomy } : undefined,
            turnConflictAttempts: turnConflictAttempts + 1,
            workspaceId: activeDispatch.workspaceId,
            sessionId: activeDispatch.sessionId,
          });
          return true;
        }
      }
      failed = true;
      setPendingApproval(null);
      // P1b D3: sendMessage now THROWS AdapterHttpError on HTTP failure (it
      // used to parse the error body as an empty SSE stream — silent dead
      // chat). 'Backend is offline' is reserved for genuine network failures;
      // a tier 403 already opened the UpgradeModal via the adapter's global
      // dispatch, so its inline copy points there instead of duplicating the
      // upsell. Duck-typed on error.name (NOT instanceof an imported class) so
      // component tests that vi.mock('@/lib/adapter') wholesale stay decoupled.
      const httpErr = e instanceof Error && e.name === 'AdapterHttpError'
        ? (e as Error & { status?: number; body?: unknown })
        : null;
      const isTier403 = (httpErr?.body as { error?: string } | undefined)?.error === 'TIER_INSUFFICIENT';
      const isIncompleteStream = e instanceof Error && e.name === 'ChatStreamIncompleteError';
      const isUnexpectedAbort = e instanceof Error && e.name === 'AbortError';
      const message = isTurnConflict
        ? 'The previous response is still stopping. Please retry in a moment.'
        : isIncompleteStream
        ? e.message
        : isUnexpectedAbort
        ? 'The response was interrupted before completion. Please retry.'
        : isTier403
        ? 'This action needs a higher plan — see the upgrade window.'
        : httpErr
          ? `Chat request failed (${httpErr.status}): ${httpErr.message}`
          : 'Backend is offline. Connect to a Waggle server to start chatting.';
      setMessages(prev => {
        const msgs = [...prev];
        const targetIdx = msgs.findIndex(m => m.id === assistantId);
        const last = targetIdx >= 0 ? msgs[targetIdx] : undefined;
        // Same missing-target guard as the stream updater: a session/workspace
        // switch mid-flight resets messages. Return prev (not the clone) so
        // React's setState bail-out skips the no-op re-render.
        if (!last || last.role !== 'assistant') return prev;
        const blocks = [
          ...settleRunningBlocks(last.blocks || [], message),
          { type: 'error' as const, blockId: nextBlockId('error'), message },
        ];
        return msgs.map((m, i) =>
          i === targetIdx
            ? {
              ...m,
              blocks,
              content: message,
              draft: undefined,
              ...(m.tools && { tools: settleRunningTools(m.tools, message) }),
            }
            : m
        );
      });
    } finally {
      // A stopped request may settle after its replacement has started. Only
      // the dispatch that still owns the shared state may release or flush it.
      if (activeDispatchRef.current === activeDispatch) {
        activeDispatchRef.current = null;
        setIsLoading(false);
        inFlightRef.current = false;
        // Flush the next queued send (FIFO) now that the stream has ended.
        flushNextQueuedFor(activeDispatch.workspaceId, activeDispatch.sessionId);
      }
    }
    return !failed;
  }, [workspaceId, sessionId, flushNextQueuedFor]);
  runDispatchRef.current = runDispatch;

  const sendMessage = useCallback(async (
    content: string,
    opts?: { retry?: boolean; retryTarget?: ChatRetryTarget; onAccepted?: () => void },
  ): Promise<boolean> => {
    if (!workspaceId || !sessionId || !content.trim()) return false;
    const cacheKey = sessionId ? chatThreadCacheKey(workspaceId, sessionId) : null;
    if (messagesThreadKeyRef.current !== cacheKey) return false;
    if (sessionTransitionBlockRef.current?.cacheKey === cacheKey) return false;
    if (cacheKey && (
      (clearingThreadCountsRef.current.get(cacheKey) ?? 0) > 0
      || recoveringHistoryThreadsRef.current.has(cacheKey)
    )) return false;
    const trimmed = content.trim();
    // Lane C: if a reply is already streaming, QUEUE this send behind it instead
    // of racing a second SSE stream. The optimistic user turn renders now with a
    // truthful `queued` marker; it dispatches when the current reply finishes.
    if (inFlightRef.current) {
      const id = crypto.randomUUID();
      queueRef.current.push({
        id,
        content: trimmed,
        retry: opts?.retry,
        retryTarget: opts?.retryTarget,
        model: model || undefined,
        persona,
        autonomy: autonomy ? { ...autonomy } : undefined,
        workspaceId,
        sessionId: sessionId ?? '',
      });
      if (sessionId) {
        const pendingHistory = pendingHistoryRef.current;
        if (pendingHistory?.cacheKey === chatThreadCacheKey(workspaceId, sessionId)) {
          pendingHistory.localMessageIds.add(id);
        }
      }
      setMessages(prev => [...prev, {
        id,
        role: 'user',
        content: trimmed,
        blocks: [{ type: 'text', blockId: nextBlockId('text'), content: trimmed }],
        timestamp: new Date().toISOString(),
        queued: true,
      }]);
      opts?.onAccepted?.();
      return true;
    }
    const dispatch = runDispatch(
      content,
      opts,
      undefined,
      model || undefined,
      persona,
      autonomy ? { ...autonomy } : undefined,
    );
    opts?.onAccepted?.();
    return dispatch;
  }, [workspaceId, sessionId, model, persona, autonomy, runDispatch]);

  // F4: re-issue the last user turn after a failure. Drops the failed
  // user+assistant pair from local state first, then sendMessage re-appends a
  // fresh pair — avoiding a duplicate user bubble.
  const retryLastFailed = useCallback(() => {
    if (isLoading) return;
    const cacheKey = workspaceId && sessionId
      ? chatThreadCacheKey(workspaceId, sessionId)
      : null;
    if (!cacheKey || messagesThreadKeyRef.current !== cacheKey) return;
    if (cacheKey && (
      (clearingThreadCountsRef.current.get(cacheKey) ?? 0) > 0
      || recoveringHistoryThreadsRef.current.has(cacheKey)
    )) return;
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { idx = i; break; }
    }
    if (idx === -1) return;
    const content = messages[idx].content;
    const retryTail = messages.slice(idx);
    const expectedMessageCount = persistedRetryMessageCount(messages);
    let retryTarget: ChatRetryTarget;
    if (retryTail.length === 1 && retryTail[0].role === 'user') {
      retryTarget = {
        kind: 'lone-user',
        expectedMessageCount,
      };
    } else if (
      retryTail.length === 2
      && retryTail[0].role === 'user'
      && retryTail[1].role === 'assistant'
    ) {
      retryTarget = retryTail[1].draft?.status === 'stopped'
          ? {
              kind: 'lone-user',
              expectedMessageCount,
            }
          : {
              kind: 'assistant-pair',
              expectedMessageCount,
              expectedAssistantContent: persistedAssistantRetryContent(retryTail[1]),
            };
    } else {
      return;
    }
    if (cacheKey) {
      const pendingHistory = pendingHistoryRef.current;
      if (pendingHistory?.cacheKey === cacheKey) {
        for (const message of retryTail) {
          pendingHistory.suppressedMessageIds.add(message.id);
        }
        pendingHistory.suppressedRetryTail = { userContent: content, target: retryTarget };
      }
    }
    setMessages(prev => prev.slice(0, idx));
    void sendMessage(content, { retry: true, retryTarget });
  }, [messages, isLoading, workspaceId, sessionId, sendMessage]);

  // Lane S2 (Pillar 3.1): user-initiated halt of the in-flight reply. The
  // default Stop action preserves queued FIFO. A session transition instead
  // discards queued work and revokes this dispatch's ownership before awaiting
  // the exact server cancellation, so a late generator cannot flush into the
  // old thread while the new session is being created.
  const stopStreaming = useCallback(async (
    options?: { discardQueued?: boolean },
  ): Promise<void | (() => void)> => {
    const activeDispatch = activeDispatchRef.current;
    if (!inFlightRef.current || !activeDispatch) return;
    const discardQueued = options?.discardQueued === true;
    const discardedQueue = discardQueued ? [...queueRef.current] : [];
    const discardedIds = new Set(discardedQueue.map(entry => entry.id));
    const discardedMessages = new Map(messagesRef.current
      .filter(message => message.queued && discardedIds.has(message.id))
      .map(message => [message.id, message]));
    let transitionBlock: { cacheKey: string } | null = null;
    if (discardQueued) {
      transitionBlock = {
        cacheKey: chatThreadCacheKey(
          activeDispatch.workspaceId,
          activeDispatch.sessionId,
        ),
      };
      sessionTransitionBlockRef.current = transitionBlock;
      activeDispatchRef.current = null;
      queueRef.current = [];
      inFlightRef.current = false;
    }
    activeDispatch.controller.abort();
    setPendingApproval(null);
    setMessages(prev => prev
      .filter(message => !discardQueued || !message.queued)
      .map(message => {
        if (message.id !== activeDispatch.assistantId || !message.draft) return message;
        const failure = 'Stopped by user';
        return {
          ...message,
          retrying: false,
          blocks: settleRunningBlocks(message.blocks || [], failure),
          draft: { ...message.draft, status: 'stopped' as const },
          ...(message.tools && { tools: settleRunningTools(message.tools, failure) }),
        };
      }));
    setIsLoading(false);
    let cancellation: Promise<unknown>;
    try {
      cancellation = Promise.resolve(adapter.abortAgent(
        activeDispatch.workspaceId,
        activeDispatch.sessionId,
      )).catch(() => undefined);
    } catch {
      cancellation = Promise.resolve();
    }
    // Manual Stop leaves internal ownership intact until runDispatch.finally.
    // A new send can still be accepted into FIFO, but cannot overlap the old
    // server transaction. The discard path has revoked ownership above.
    await cancellation;
    if (transitionBlock) {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (sessionTransitionBlockRef.current !== transitionBlock) return;
        sessionTransitionBlockRef.current = null;

        const currentThread = currentThreadRef.current;
        if (
          currentThread.workspaceId !== activeDispatch.workspaceId
          || (currentThread.sessionId ?? '') !== activeDispatch.sessionId
        ) return;

        const queuedIds = new Set(queueRef.current.map(entry => entry.id));
        const restorable = discardedQueue.filter(entry => !queuedIds.has(entry.id));
        if (restorable.length === 0) return;
        queueRef.current.push(...restorable);
        setMessages(prev => {
          const visibleIds = new Set(prev.map(message => message.id));
          const restored = restorable
            .filter(entry => !visibleIds.has(entry.id))
            .map(entry => discardedMessages.get(entry.id) ?? {
              id: entry.id,
              role: 'user' as const,
              content: entry.content,
              blocks: [{ type: 'text' as const, blockId: nextBlockId('text'), content: entry.content }],
              timestamp: new Date().toISOString(),
              queued: true,
            });
          return restored.length > 0 ? [...prev, ...restored] : prev;
        });
        flushNextQueuedFor(activeDispatch.workspaceId, activeDispatch.sessionId);
      };
    }
  }, [flushNextQueuedFor]);

  const clearHistory = useCallback(async () => {
    if (sessionId && workspaceId) {
      const cacheKey = chatThreadCacheKey(workspaceId, sessionId);
      if (messagesThreadKeyRef.current !== cacheKey) return false;
      const clearCounts = clearingThreadCountsRef.current;
      const previousClearCount = clearCounts.get(cacheKey) ?? 0;
      if (previousClearCount === 0) {
        clearSucceededThreadsRef.current.delete(cacheKey);
        clearNeedsHistoryRecoveryRef.current.delete(cacheKey);
      }
      clearCounts.set(cacheKey, previousClearCount + 1);
      const activeDispatch = activeDispatchRef.current;
      // Invalidate both the settled paint and any older in-flight refresh before
      // waiting on the sidecar, so cleared history cannot reappear locally.
      const pendingHistory = pendingHistoryRef.current;
      if (pendingHistory?.cacheKey === cacheKey) {
        clearNeedsHistoryRecoveryRef.current.add(cacheKey);
        const recoveryLocalIds = new Set(
          historyRecoveryLocalIdsRef.current.get(cacheKey) ?? []
        );
        for (const messageId of pendingHistory.localMessageIds) {
          recoveryLocalIds.add(messageId);
        }
        historyRecoveryLocalIdsRef.current.set(cacheKey, recoveryLocalIds);
        const recoveryLocalMessages = new Map(
          historyRecoveryLocalMessagesRef.current.get(cacheKey) ?? []
        );
        for (const message of messages) {
          if (recoveryLocalIds.has(message.id) && !message.queued) {
            recoveryLocalMessages.set(message.id, message);
          }
        }
        historyRecoveryLocalMessagesRef.current.set(cacheKey, recoveryLocalMessages);
        historyRecoveryRetryCountsRef.current.set(cacheKey, 0);
        historyGenerationRef.current += 1;
        pendingHistory.release();
        pendingHistoryRef.current = null;
      } else if (recoveringHistoryThreadsRef.current.has(cacheKey)) {
        // A preceding failed clear can arm recovery one render before its GET is
        // installed. A second clear in that window must inherit (and re-own) the
        // recovery transaction instead of treating the absent GET as no recovery.
        clearNeedsHistoryRecoveryRef.current.add(cacheKey);
        const recoveryLocalIds = new Set(
          historyRecoveryLocalIdsRef.current.get(cacheKey) ?? []
        );
        historyRecoveryLocalIdsRef.current.set(cacheKey, recoveryLocalIds);
        const recoveryLocalMessages = new Map(
          historyRecoveryLocalMessagesRef.current.get(cacheKey) ?? []
        );
        for (const message of messages) {
          if (recoveryLocalIds.has(message.id) && !message.queued) {
            recoveryLocalMessages.set(message.id, message);
          }
        }
        historyRecoveryLocalMessagesRef.current.set(cacheKey, recoveryLocalMessages);
        historyRecoveryRetryCountsRef.current.set(cacheKey, 0);
      }
      const clearGeneration = historyGenerationRef.current;
      const cancellation = cancelActiveDispatch();
      setHistoryLoaded(true);
      await cancellation;
      try {
        await clearHistoryAfterAbort(workspaceId, sessionId);
        clearSucceededThreadsRef.current.add(cacheKey);
        const clearOwner = currentThreadRef.current;
        const remainsCurrent = (
          clearOwner.workspaceId === workspaceId
          && clearOwner.sessionId === sessionId
          && historyGenerationRef.current === clearGeneration
        );
        // The user may have switched A -> B -> A while DELETE A was pending,
        // starting a fresh GET A after the invalidation above. Invalidate that
        // exact thread's newer snapshot without disturbing an active B fetch.
        const currentHistory = pendingHistoryRef.current;
        if (currentHistory?.cacheKey === cacheKey) {
          historyGenerationRef.current += 1;
          currentHistory.release();
          pendingHistoryRef.current = null;
        }
        const currentThread = currentThreadRef.current;
        if (
          currentThread.workspaceId === workspaceId
          && currentThread.sessionId === sessionId
        ) {
          setMessages([]);
          setHistoryLoaded(true);
          historyReadyThreadRef.current = cacheKey;
          setHistoryState({ threadKey: cacheKey, status: 'ready', error: null });
        }
        writeChatThreadCache(cacheKey, []);
        return remainsCurrent;
      } catch (err) {
        console.error('[useChat] clear history failed:', err);
        if (activeDispatch) {
          const settleCanceledAssistant = (message: ChatMessage): ChatMessage => (
            message.id === activeDispatch.assistantId && message.draft
              ? {
                ...message,
                retrying: false,
                blocks: settleRunningBlocks(message.blocks || [], 'Clear failed'),
                draft: { ...message.draft, status: 'stopped' as const },
                ...(message.tools && { tools: settleRunningTools(message.tools, 'Clear failed') }),
              }
              : message
          );
          setMessages(prev => prev.map(settleCanceledAssistant));
          const recoveryLocalMessages = historyRecoveryLocalMessagesRef.current.get(cacheKey);
          if (recoveryLocalMessages) {
            const nextRecoveryLocalMessages = new Map(recoveryLocalMessages);
            const assistant = nextRecoveryLocalMessages.get(activeDispatch.assistantId);
            if (assistant) {
              nextRecoveryLocalMessages.set(
                activeDispatch.assistantId,
                settleCanceledAssistant(assistant)
              );
            }
            historyRecoveryLocalMessagesRef.current.set(cacheKey, nextRecoveryLocalMessages);
          }
        }
        return false;
      } finally {
        const remaining = (clearCounts.get(cacheKey) ?? 1) - 1;
        if (remaining <= 0) {
          clearCounts.delete(cacheKey);
          const shouldRecoverHistory = (
            !clearSucceededThreadsRef.current.has(cacheKey)
            && clearNeedsHistoryRecoveryRef.current.has(cacheKey)
          );
          clearSucceededThreadsRef.current.delete(cacheKey);
          clearNeedsHistoryRecoveryRef.current.delete(cacheKey);
          const currentThread = currentThreadRef.current;
          if (shouldRecoverHistory) {
            recoveringHistoryThreadsRef.current.add(cacheKey);
            if (!historyRecoveryLocalIdsRef.current.has(cacheKey)) {
              historyRecoveryLocalIdsRef.current.set(cacheKey, new Set<string>());
            }
            if (!historyRecoveryLocalMessagesRef.current.has(cacheKey)) {
              historyRecoveryLocalMessagesRef.current.set(cacheKey, new Map());
            }
            if (!historyRecoveryRetryCountsRef.current.has(cacheKey)) {
              historyRecoveryRetryCountsRef.current.set(cacheKey, 0);
            }
            if (
              currentThread.workspaceId === workspaceId
              && currentThread.sessionId === sessionId
            ) {
              setHistoryLoaded(false);
              setHistoryState({ threadKey: cacheKey, status: 'loading', error: null });
              setHistoryReloadRevision(revision => revision + 1);
            }
          } else {
            recoveringHistoryThreadsRef.current.delete(cacheKey);
            historyRecoveryLocalIdsRef.current.delete(cacheKey);
            historyRecoveryLocalMessagesRef.current.delete(cacheKey);
            historyRecoveryRetryCountsRef.current.delete(cacheKey);
          }
        } else {
          clearCounts.set(cacheKey, remaining);
        }
      }
    }
    return false;
  }, [sessionId, workspaceId, messages, cancelActiveDispatch]);

  const retryHistory = useCallback(() => {
    if (!workspaceId || !sessionId) return;
    const cacheKey = chatThreadCacheKey(workspaceId, sessionId);
    if (pendingHistoryRef.current?.cacheKey === cacheKey) return;

    setHistoryState({ threadKey: cacheKey, status: 'loading', error: null });
    // A manual retry is a fresh authoritative read. Failed-clear recovery must
    // remain fail-closed; ordinary refresh failures become usable again when
    // the retry settles, matching the existing exact-thread readiness rule.
    setHistoryLoaded(false);
    setHistoryReloadRevision(revision => revision + 1);
  }, [sessionId, workspaceId]);

  const approveAction = useCallback(async (
    requestId: string,
    approved: boolean,
    opts: { always?: boolean } = {},
  ) => {
    if (messagesThreadKeyRef.current !== currentThreadKey) return;
    const approval = pendingApproval;
    if (!approval || approval.requestId !== requestId) return;
    try {
      await adapter.respondApproval(requestId, approved, {
        always: opts.always,
        // Phase B.3: echo the source workspace we received on the SSE event
        // back to the backend so the grant stays scoped to this workspace.
        sourceWorkspaceId: approval.sourceWorkspaceId ?? null,
      });
    } catch (err) {
      console.error('[useChat] approval response failed:', err);
      return;
    }
    setPendingApproval(current =>
      current?.requestId === requestId ? null : current
    );
  }, [currentThreadKey, pendingApproval]);

  const historyReady = Boolean(
    historyLoaded
    && workspaceId
    && sessionId
    && historyReadyThreadRef.current === chatThreadCacheKey(workspaceId, sessionId),
  );

  const currentHistoryThreadKey = currentThreadKey;
  const historyStatus: ChatHistoryStatus = currentHistoryThreadKey === null
    ? 'idle'
    : historyState.threadKey === currentHistoryThreadKey
      ? historyState.status
      : 'loading';
  const historyError = (
    currentHistoryThreadKey !== null
    && historyState.threadKey === currentHistoryThreadKey
  ) ? historyState.error : null;
  const threadStateOwned = messagesThreadKeyRef.current === currentThreadKey;
  const visibleMessages = threadStateOwned
    ? messages
    : currentThreadKey && recoveringHistoryThreadsRef.current.has(currentThreadKey)
      ? Array.from(historyRecoveryLocalMessagesRef.current.get(currentThreadKey)?.values() ?? [])
      : currentThreadKey
        ? (readChatThreadCache(currentThreadKey) ?? [])
        : [];

  return {
    messages: visibleMessages,
    isLoading: threadStateOwned ? isLoading : false,
    historyLoaded,
    historyReady,
    historyStatus,
    historyError,
    retryHistory,
    sendMessage,
    retryLastFailed,
    stopStreaming,
    clearHistory,
    pendingApproval: threadStateOwned ? pendingApproval : null,
    approveAction,
  };
};
