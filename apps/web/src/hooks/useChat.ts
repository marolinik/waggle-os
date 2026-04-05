import { useState, useCallback, useRef, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { ChatMessage, StreamEvent, ToolExecution, ApprovalRequest } from '@/lib/types';

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
        .then(setMessages)
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
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
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

        switch (evt.type) {
          case 'token': {
            const tokenContent = typeof data === 'string' ? data : (data?.content as string ?? '');
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.role === 'assistant') {
                last.content += tokenContent;
              }
              return [...msgs];
            });
            break;
          }
          case 'step': {
            // Step events are progress indicators (e.g., "Recalling memories...")
            // Optionally show them as tool activity
            break;
          }
          case 'tool_start': {
            const toolExec: ToolExecution = {
              id: (data?.name as string) ?? crypto.randomUUID(),
              name: (data?.name as string) ?? 'unknown',
              status: 'running',
              input: data?.input as Record<string, unknown>,
            };
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.tools) last.tools.push(toolExec);
              return [...msgs];
            });
            break;
          }
          case 'tool_end': {
            const toolName = data?.name as string;
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.tools && toolName) {
                const idx = last.tools.findIndex(t => t.name === toolName && t.status === 'running');
                if (idx >= 0) {
                  last.tools[idx] = { ...last.tools[idx], status: 'done', result: data?.result as string };
                }
              }
              return [...msgs];
            });
            break;
          }
          case 'done': {
            // Final event — update assistant message with complete content if provided
            const doneContent = data?.content as string;
            if (doneContent) {
              setMessages(prev => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last.role === 'assistant' && !last.content) {
                  last.content = doneContent;
                }
                return [...msgs];
              });
            }
            break;
          }
          case 'approval_request':
            setPendingApproval(data as unknown as ApprovalRequest);
            break;
          case 'model_switch': {
            const switchModel = (data as Record<string, string>).model ?? 'fallback';
            const switchReason = (data as Record<string, string>).reason ?? 'primary unavailable';
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.role === 'assistant') {
                const notice = `\n\n⬡ Switched to ${switchModel} — ${switchReason}\n\n`;
                return msgs.map((m, i) =>
                  i === msgs.length - 1 ? { ...m, content: m.content + notice } : m
                );
              }
              return msgs;
            });
            break;
          }
          case 'error': {
            const errorMsg = typeof data === 'string' ? data : (data?.message as string ?? 'Unknown error');
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.role === 'assistant') {
                last.content += `\n\n⚠️ ${errorMsg}`;
              }
              return [...msgs];
            });
            break;
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last.role === 'assistant') {
          last.content = '⚠️ Backend is offline. Connect to a Waggle server to start chatting.';
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
