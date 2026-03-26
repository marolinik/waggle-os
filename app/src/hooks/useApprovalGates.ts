/**
 * useApprovalGates — Manages pending approval state and approve/deny handlers.
 *
 * On mount, checks for any pending approvals from before this session
 * (reconnection scenario) and surfaces them as tool-card messages.
 * Provides approve/deny callbacks that update both the server and message UI.
 */

import { useEffect, useCallback } from 'react';
import type { Message, WaggleService } from '@waggle/ui';

export interface UseApprovalGatesOptions {
  /** WaggleService for approve/deny calls */
  service: WaggleService;
  /** Server base URL for the pending approval endpoint */
  serverBaseUrl: string;
  /** Message state setter from useChat */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export interface UseApprovalGatesReturn {
  /** Approve a tool action by requestId */
  handleToolApprove: (tool: { requestId?: string }) => void;
  /** Deny a tool action by requestId, with optional reason */
  handleToolDeny: (tool: { requestId?: string }, reason?: string) => void;
}

export function useApprovalGates({
  service,
  serverBaseUrl,
  setMessages,
}: UseApprovalGatesOptions): UseApprovalGatesReturn {
  // C2: Check for pending approvals on startup (reconnection scenario)
  useEffect(() => {
    const checkPending = async () => {
      try {
        const res = await fetch(`${serverBaseUrl}/api/approval/pending`);
        if (res.ok) {
          const data = await res.json() as {
            pending: Array<{
              requestId: string;
              toolName: string;
              input: Record<string, unknown>;
            }>;
          };
          if (data.pending?.length > 0) {
            // Surface pending approvals as tool cards
            for (const p of data.pending) {
              setMessages(prev => [
                ...prev,
                {
                  id: `approval-${p.requestId}`,
                  role: 'assistant' as const,
                  content: '',
                  timestamp: new Date().toISOString(),
                  toolUse: [{
                    name: p.toolName,
                    input: p.input,
                    requiresApproval: true,
                    status: 'pending_approval' as const,
                    requestId: p.requestId,
                  }],
                },
              ]);
            }
          }
        }
      } catch { /* server not ready yet */ }
    };
    checkPending();
  }, [serverBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToolApprove = useCallback((tool: { requestId?: string }) => {
    if (tool.requestId) {
      service.approveAction(tool.requestId);
      // Update message UI to reflect approval
      setMessages(prev => prev.map(msg => {
        if (!msg.toolUse) return msg;
        return {
          ...msg,
          toolUse: msg.toolUse.map(t =>
            t.requestId === tool.requestId ? { ...t, approved: true } : t
          ),
        };
      }));
    }
  }, [service, setMessages]);

  const handleToolDeny = useCallback((tool: { requestId?: string }, reason?: string) => {
    if (tool.requestId) {
      service.denyAction(tool.requestId, reason);
      // Update message UI to reflect denial
      setMessages(prev => prev.map(msg => {
        if (!msg.toolUse) return msg;
        return {
          ...msg,
          toolUse: msg.toolUse.map(t =>
            t.requestId === tool.requestId
              ? { ...t, approved: false, result: reason ? `Denied: ${reason}` : 'Denied by user' }
              : t
          ),
        };
      }));
    }
  }, [service, setMessages]);

  return { handleToolApprove, handleToolDeny };
}
