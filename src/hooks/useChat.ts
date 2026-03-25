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

  // Load history when session changes
  useEffect(() => {
    if (workspaceId && sessionId) {
      adapter.getHistory(workspaceId, sessionId)
        .then(setMessages)
        .catch(() => setMessages([]));
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

    try {
      for await (const event of adapter.sendMessage(workspaceId, content, sessionId || undefined, persona)) {
        const evt = event as StreamEvent;
        switch (evt.type) {
          case 'token':
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.role === 'assistant') {
                last.content += evt.data as string;
              }
              return msgs;
            });
            break;
          case 'tool_start':
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.tools) {
                last.tools.push(evt.data as ToolExecution);
              }
              return [...msgs];
            });
            break;
          case 'tool_end':
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              const toolData = evt.data as ToolExecution;
              if (last.tools) {
                const idx = last.tools.findIndex(t => t.id === toolData.id);
                if (idx >= 0) last.tools[idx] = toolData;
              }
              return [...msgs];
            });
            break;
          case 'approval_request':
            setPendingApproval(evt.data as ApprovalRequest);
            break;
          case 'error':
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last.role === 'assistant') {
                last.content += `\n\n⚠️ Error: ${evt.data}`;
              }
              return msgs;
            });
            break;
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
      } catch { /* local clear */ }
      setMessages([]);
    }
  }, [sessionId]);

  const approveAction = useCallback(async (requestId: string, approved: boolean) => {
    try { await adapter.respondApproval(requestId, approved); } catch { /* ignore */ }
    setPendingApproval(null);
  }, []);

  return { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction };
};
