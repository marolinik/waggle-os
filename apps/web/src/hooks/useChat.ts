import { useState, useCallback, useRef, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type {
  ChatMessage, StreamEvent, ApprovalRequest,
  ContentBlock, TextContentBlock,
} from '@/lib/types';

/** Convert legacy messages (from history API) that lack blocks */
function ensureBlocks(msg: ChatMessage): ChatMessage {
  if (msg.blocks && msg.blocks.length > 0) return msg;
  const blocks: ContentBlock[] = [];
  if (msg.content) {
    blocks.push({ type: 'text', content: msg.content });
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

interface UseChatOptions {
  workspaceId: string | null;
  sessionId: string | null;
  persona?: string;
}

export const useChat = ({ workspaceId, sessionId, persona }: UseChatOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Load history when session changes
  useEffect(() => {
    if (workspaceId && sessionId) {
      adapter.getHistory(workspaceId, sessionId)
        .then((history) => setMessages(history.map(ensureBlocks)))
        .catch((err) => { console.error('[useChat] history fetch failed:', err); setMessages([]); });
    } else {
      setMessages([]);
    }
  }, [workspaceId, sessionId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!workspaceId || !content.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      blocks: [{ type: 'text', content: content.trim() }],
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
      for await (const event of adapter.sendMessage(workspaceId, content, sessionId || undefined, persona)) {
        if (abortRef.current?.signal.aborted) break;
        const evt = event as StreamEvent;
        const data = evt.data as Record<string, unknown>;

        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last.role !== 'assistant') return msgs;
          const blocks = [...(last.blocks || [])];

          switch (evt.type) {
            case 'token': {
              const tokenContent = typeof data === 'string' ? data : (data?.content as string ?? '');
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock?.type === 'text') {
                blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + tokenContent };
              } else {
                blocks.push({ type: 'text', content: tokenContent });
              }
              break;
            }

            case 'step': {
              const description = typeof data === 'string' ? data : (data?.content as string ?? '');
              if (description) {
                // Mark previous running steps as done
                for (let i = 0; i < blocks.length; i++) {
                  const b = blocks[i];
                  if (b.type === 'step' && b.status === 'running') {
                    blocks[i] = { ...b, status: 'done' };
                  }
                }
                blocks.push({ type: 'step', description, status: 'running' });
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
              // Legacy tools[] for backward compat
              if (last.tools) {
                last.tools = [...last.tools, { id: toolId, name: toolName, status: 'running', input: data?.input as Record<string, unknown> }];
              }
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
              // Legacy tools[]
              if (last.tools && toolName) {
                const idx = last.tools.findIndex(t => t.name === toolName && t.status === 'running');
                if (idx >= 0) {
                  const updated = [...last.tools];
                  updated[idx] = { ...updated[idx], status: 'done', output: result, duration };
                  last.tools = updated;
                }
              }
              break;
            }

            case 'model_switch': {
              blocks.push({
                type: 'model_switch',
                from: (data as Record<string, string>).primary ?? 'primary',
                to: (data as Record<string, string>).model ?? 'fallback',
                reason: (data as Record<string, string>).reason ?? 'primary unavailable',
              });
              break;
            }

            case 'error': {
              const errorMsg = typeof data === 'string' ? data : (data?.message as string ?? 'Unknown error');
              blocks.push({ type: 'error', message: errorMsg });
              break;
            }

            case 'done': {
              // Mark all running blocks as done
              for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if ((b.type === 'step' && b.status === 'running') ||
                    (b.type === 'tool_use' && b.status === 'running')) {
                  blocks[i] = { ...b, status: 'done' } as ContentBlock;
                }
              }
              const doneContent = data?.content as string;
              if (doneContent && !blocks.some(b => b.type === 'text' && b.content)) {
                blocks.push({ type: 'text', content: doneContent });
              }
              break;
            }

            case 'approval_request':
              setPendingApproval(data as unknown as ApprovalRequest);
              return msgs; // Don't update blocks for approval
          }

          const content = flattenBlocks(blocks);
          return msgs.map((m, i) =>
            i === msgs.length - 1 ? { ...m, blocks, content } : m
          );
        });
      }
    } catch (e) {
      setMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last.role === 'assistant') {
          const blocks = [...(last.blocks || []), { type: 'error' as const, message: 'Backend is offline. Connect to a Waggle server to start chatting.' }];
          return msgs.map((m, i) =>
            i === msgs.length - 1 ? { ...m, blocks, content: 'Backend is offline.' } : m
          );
        }
        return msgs;
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, sessionId, persona]);

  const clearHistory = useCallback(async () => {
    if (sessionId) {
      try {
        await adapter.clearHistory(sessionId);
      } catch (err) { console.error('[useChat] clear history failed:', err); }
      setMessages([]);
    }
  }, [sessionId]);

  const approveAction = useCallback(async (requestId: string, approved: boolean) => {
    try { await adapter.respondApproval(requestId, approved); } catch (err) { console.error('[useChat] approval response failed:', err); }
    setPendingApproval(null);
  }, []);

  return { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction };
};
