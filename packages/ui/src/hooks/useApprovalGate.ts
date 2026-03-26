/**
 * useApprovalGate — hook that wires approval gates for external mutations.
 *
 * Listens for 'approval_required' events from the service and updates
 * the corresponding ToolUseEvent in the message list.
 *
 * External mutations that require approval (per YOLO model):
 * - git push, git push --force
 * - delete operations outside workspace
 * - API calls to external services
 * - Any tool flagged with requiresApproval by the agent
 */

import { useCallback, useEffect, useRef } from 'react';
import type { WaggleService, Message } from '../services/types.js';

/** Tools that are considered external mutations and require approval gates. */
const EXTERNAL_MUTATION_TOOLS = new Set([
  'git_push',
  'deploy',
  'send_email',
  'send_slack',
  'http_request',
  'delete_workspace',
  'publish',
]);

/**
 * Check if a tool invocation should be flagged as requiring approval.
 * This supplements server-side detection — the server marks requiresApproval
 * on the stream event, but this provides a client-side safety net.
 */
export function isExternalMutation(toolName: string, input: Record<string, unknown>): boolean {
  if (EXTERNAL_MUTATION_TOOLS.has(toolName)) return true;

  // bash commands that push, deploy, or make network calls
  if (toolName === 'bash') {
    const cmd = String(input.command ?? '');
    if (/\bgit\s+push\b/.test(cmd)) return true;
    if (/\bcurl\b/.test(cmd) || /\bwget\b/.test(cmd)) return true;
    if (/\brm\s+-rf\s+\//.test(cmd)) return true;
    if (/\bnpm\s+publish\b/.test(cmd)) return true;
  }

  return false;
}

export interface UseApprovalGateOptions {
  service: WaggleService;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export interface UseApprovalGateReturn {
  handleApprove: (requestId: string) => void;
  handleDeny: (requestId: string, reason?: string) => void;
}

export function useApprovalGate({
  service,
  setMessages,
}: UseApprovalGateOptions): UseApprovalGateReturn {
  const serviceRef = useRef(service);
  serviceRef.current = service;

  // Listen for approval_required events from the service
  useEffect(() => {
    const unsubscribe = service.on('approval_required', (data: unknown) => {
      const event = data as { requestId: string; toolName: string; input: Record<string, unknown> };
      // Mark the matching tool in the messages as requiring approval
      setMessages((prev) =>
        prev.map((msg) => {
          if (!msg.toolUse) return msg;
          const updatedTools = msg.toolUse.map((tool) => {
            if (tool.name === event.toolName && tool.approved === undefined) {
              return { ...tool, requiresApproval: true, status: 'pending_approval' as const, requestId: event.requestId };
            }
            return tool;
          });
          return { ...msg, toolUse: updatedTools };
        }),
      );
    });

    return unsubscribe;
  }, [service, setMessages]);

  const handleApprove = useCallback((requestId: string) => {
    serviceRef.current.approveAction(requestId);
    // Update the tool state in messages
    setMessages((prev) =>
      prev.map((msg) => {
        if (!msg.toolUse) return msg;
        const updatedTools = msg.toolUse.map((tool) => {
          if (tool.requiresApproval && tool.approved === undefined) {
            return { ...tool, approved: true, status: 'running' as const };
          }
          return tool;
        });
        return { ...msg, toolUse: updatedTools };
      }),
    );
  }, [setMessages]);

  const handleDeny = useCallback((requestId: string, reason?: string) => {
    serviceRef.current.denyAction(requestId, reason);
    // Update the tool state in messages
    setMessages((prev) =>
      prev.map((msg) => {
        if (!msg.toolUse) return msg;
        const updatedTools = msg.toolUse.map((tool) => {
          if (tool.requiresApproval && tool.approved === undefined) {
            return { ...tool, approved: false, status: 'denied' as const, result: reason ? `Denied: ${reason}` : 'Denied by user' };
          }
          return tool;
        });
        return { ...msg, toolUse: updatedTools };
      }),
    );
  }, [setMessages]);

  return { handleApprove, handleDeny };
}
