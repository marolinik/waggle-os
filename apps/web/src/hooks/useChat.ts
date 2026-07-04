import { useState, useCallback, useRef, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type {
  ChatMessage, StreamEvent, ApprovalRequest,
  ContentBlock, TextContentBlock, ToolExecution,
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
    blocks.push({ type: 'text', blockId: nextBlockId('text'), content: msg.content });
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

export type AutonomyLevel = 'normal' | 'trusted' | 'yolo';
export interface AutonomyState {
  level: AutonomyLevel;
  /** Epoch ms after which the elevated level auto-reverts. null = until session end. */
  expiresAt: number | null;
}

interface UseChatOptions {
  workspaceId: string | null;
  sessionId: string | null;
  persona?: string;
  /**
   * Phase B.5: per-window autonomy. When set to 'trusted' or 'yolo' (and not
   * expired), the server's pre-tool gate skips confirmation for the matching
   * tool set. The server owns the final check — client state is advisory.
   */
  autonomy?: AutonomyState;
}

export const useChat = ({ workspaceId, sessionId, persona, autonomy }: UseChatOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  // F2: true only after a real session's history fetch has landed. The wizard
  // auto-send waits on this so its optimistic turn isn't clobbered by the
  // history-replace that fires when the session id resolves.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Load history when session changes
  useEffect(() => {
    if (workspaceId && sessionId) {
      setHistoryLoaded(false);
      adapter.getHistory(workspaceId, sessionId)
        .then((history) => setMessages(history.map(ensureBlocks)))
        .catch((err) => { console.error('[useChat] history fetch failed:', err); setMessages([]); })
        .finally(() => setHistoryLoaded(true));
    } else {
      // No session yet — leave historyLoaded false so an auto-send waits for a
      // real session's history to land (never race the replace below).
      setMessages([]);
    }
  }, [workspaceId, sessionId]);

  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!workspaceId || !content.trim()) return false;
    // F2: report send success so the wizard auto-send knows whether to clear
    // the composer or leave the text for a manual retry. Error handling below
    // is unchanged — this only observes it.
    let failed = false;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      blocks: [{ type: 'text', blockId: nextBlockId('text'), content: content.trim() }],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      blocks: [],
      timestamp: new Date().toISOString(),
      tools: [],
    };
    setMessages(prev => [...prev, assistantMsg]);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      // Phase B.5: only forward autonomy when elevated — Normal is the
      // server default, so passing `undefined` keeps the wire payload lean.
      const autonomyPayload = autonomy && autonomy.level !== 'normal'
        ? { level: autonomy.level, expiresAt: autonomy.expiresAt ?? undefined }
        : undefined;
      for await (const event of adapter.sendMessage(workspaceId, content, sessionId || undefined, persona, autonomyPayload)) {
        if (abortRef.current?.signal.aborted) break;
        const evt = event as StreamEvent;
        const data = evt.data as Record<string, unknown>;

        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          // Guard the empty-array case: a session/workspace switch mid-stream
          // resets messages to [] (load effect), after which a late stream
          // event would read `last.role` off undefined and crash the updater.
          if (!last || last.role !== 'assistant') return msgs;
          const blocks = [...(last.blocks || [])];
          let toolsUpdate: ToolExecution[] | null = null;

          switch (evt.type) {
            case 'token': {
              const tokenContent = typeof data === 'string' ? data : (data?.content as string ?? '');
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock?.type === 'text') {
                blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + tokenContent };
              } else {
                blocks.push({ type: 'text', blockId: nextBlockId('text'), content: tokenContent });
              }
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
              const toolName = (data?.name as string) ?? 'unknown';
              const toolId = toolName + '-' + Date.now();
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
              const result = data?.result as string;
              const duration = data?.duration as number | undefined;
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type === 'tool_use' && b.name === toolName && b.status === 'running') {
                  blocks[i] = { ...b, status: 'done', result, duration };
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
                const idx = last.tools.findIndex(t => t.name === toolName && t.status === 'running');
                if (idx >= 0) {
                  toolsUpdate = last.tools.map((t, ti) =>
                    ti === idx ? { ...t, status: 'done' as const, output: result, duration } : t
                  );
                }
              }
              break;
            }

            case 'model_switch': {
              blocks.push({
                type: 'model_switch',
                blockId: nextBlockId('model'),
                from: (data as Record<string, string>).primary ?? 'primary',
                to: (data as Record<string, string>).model ?? 'fallback',
                reason: (data as Record<string, string>).reason ?? 'primary unavailable',
              });
              break;
            }

            case 'error': {
              const errorMsg = typeof data === 'string' ? data : (data?.message as string ?? 'Unknown error');
              blocks.push({ type: 'error', blockId: nextBlockId('error'), message: errorMsg });
              break;
            }

            case 'done': {
              // Mark all running blocks as done — type-narrowed, no unsafe cast
              for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if (b.type === 'step' && b.status === 'running') {
                  blocks[i] = { ...b, status: 'done' };
                } else if (b.type === 'tool_use' && b.status === 'running') {
                  blocks[i] = { ...b, status: 'done' };
                }
              }
              const doneContent = data?.content as string;
              if (doneContent && !blocks.some(b => b.type === 'text' && b.content)) {
                blocks.push({ type: 'text', blockId: nextBlockId('text'), content: doneContent });
              }
              break;
            }

            case 'approval_request':
            case 'approval_required':
              // Backend emits `approval_required` as the SSE event name;
              // legacy clients sent `approval_request`. Accept both.
              setPendingApproval(data as unknown as ApprovalRequest);
              return msgs; // Don't update blocks for approval
          }

          const content = flattenBlocks(blocks);
          return msgs.map((m, i) =>
            i === msgs.length - 1
              ? { ...m, blocks, content, ...(toolsUpdate && { tools: toolsUpdate }) }
              : m
          );
        });
      }
    } catch (e) {
      failed = true;
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
      const message = isTier403
        ? 'This action needs a higher plan — see the upgrade window.'
        : httpErr
          ? `Chat request failed (${httpErr.status}): ${httpErr.message}`
          : 'Backend is offline. Connect to a Waggle server to start chatting.';
      setMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        // Same empty-array guard as the stream updater: a session/workspace
        // switch mid-flight resets messages to []. Return prev (not the
        // clone) so React's setState bail-out skips the no-op re-render.
        if (!last || last.role !== 'assistant') return prev;
        const blocks = [...(last.blocks || []), { type: 'error' as const, blockId: nextBlockId('error'), message }];
        return msgs.map((m, i) =>
          i === msgs.length - 1 ? { ...m, blocks, content: message } : m
        );
      });
    } finally {
      setIsLoading(false);
    }
    return !failed;
  }, [workspaceId, sessionId, persona, autonomy]);

  // F4: re-issue the last user turn after a failure. Drops the failed
  // user+assistant pair from local state first, then sendMessage re-appends a
  // fresh pair — avoiding a duplicate user bubble.
  const retryLastFailed = useCallback(() => {
    if (isLoading) return;
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { idx = i; break; }
    }
    if (idx === -1) return;
    const content = messages[idx].content;
    setMessages(prev => prev.slice(0, idx));
    void sendMessage(content);
  }, [messages, isLoading, sendMessage]);

  const clearHistory = useCallback(async () => {
    if (sessionId) {
      try {
        await adapter.clearHistory(sessionId);
      } catch (err) { console.error('[useChat] clear history failed:', err); }
      setMessages([]);
    }
  }, [sessionId]);

  const approveAction = useCallback(async (
    requestId: string,
    approved: boolean,
    opts: { always?: boolean } = {},
  ) => {
    try {
      await adapter.respondApproval(requestId, approved, {
        always: opts.always,
        // Phase B.3: echo the source workspace we received on the SSE event
        // back to the backend so the grant stays scoped to this workspace.
        sourceWorkspaceId: pendingApproval?.sourceWorkspaceId ?? null,
      });
    } catch (err) {
      console.error('[useChat] approval response failed:', err);
    }
    setPendingApproval(null);
  }, [pendingApproval]);

  return { messages, isLoading, historyLoaded, sendMessage, retryLastFailed, clearHistory, pendingApproval, approveAction };
};
