/**
 * useSubAgentStatus — SSE hook for real-time sub-agent progress.
 *
 * Listens to the notification SSE stream for `subagent_status` events
 * and returns the current list of sub-agents for the active workspace.
 * Also listens for `workflow_suggestion` events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SubAgentInfo } from '../components/chat/SubAgentProgress.js';
import { subscribeSSE } from './useSSEStream.js';

export interface WorkflowSuggestion {
  pattern: {
    name: string;
    description: string;
    steps: string[];
    tools: string[];
    category: string;
  };
  reason: string;
  workspaceId: string;
}

export interface UseSubAgentStatusResult {
  /** Current sub-agents for the active workspace */
  subAgents: SubAgentInfo[];
  /** Latest workflow suggestion (null if none or dismissed) */
  workflowSuggestion: WorkflowSuggestion | null;
  /** Dismiss the current workflow suggestion */
  dismissSuggestion: () => void;
}

/**
 * Track permanently dismissed workflow patterns per workspace.
 * Key = workspaceId::patternName
 */
const dismissedPatterns = new Set<string>();

export function useSubAgentStatus(
  serverUrl: string,
  activeWorkspaceId?: string,
): UseSubAgentStatusResult {
  const [subAgents, setSubAgents] = useState<SubAgentInfo[]>([]);
  const [workflowSuggestion, setWorkflowSuggestion] = useState<WorkflowSuggestion | null>(null);
  const activeWorkspaceRef = useRef(activeWorkspaceId);

  // Keep ref in sync
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  // Shared SSE connection for sub-agent status and workflow suggestions
  useEffect(() => {
    const url = `${serverUrl}/api/notifications/stream`;

    const unsubStatus = subscribeSSE(url, 'subagent_status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        // Only show agents for the active workspace
        if (data.workspaceId && activeWorkspaceRef.current && data.workspaceId !== activeWorkspaceRef.current) {
          return;
        }
        const agents: SubAgentInfo[] = (data.agents ?? []).map((a: SubAgentInfo) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          task: a.task,
          toolsUsed: a.toolsUsed ?? [],
          startedAt: a.startedAt,
          completedAt: a.completedAt,
        }));
        setSubAgents(agents);
      } catch {
        // Ignore parse errors
      }
    });

    const unsubSuggestion = subscribeSSE(url, 'workflow_suggestion', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.workspaceId && activeWorkspaceRef.current && data.workspaceId !== activeWorkspaceRef.current) {
          return;
        }
        const wsId = data.workspaceId ?? activeWorkspaceRef.current ?? 'default';
        const patternKey = `${wsId}::${data.pattern?.name ?? ''}`;
        // Don't show if this pattern was already dismissed
        if (dismissedPatterns.has(patternKey)) {
          return;
        }
        setWorkflowSuggestion({
          pattern: data.pattern,
          reason: data.reason ?? '',
          workspaceId: wsId,
        });
      } catch {
        // Ignore parse errors
      }
    });

    return () => {
      unsubStatus();
      unsubSuggestion();
    };
  }, [serverUrl]);

  // Clear sub-agents when workspace changes (stale data from another workspace)
  useEffect(() => {
    setSubAgents([]);
    setWorkflowSuggestion(null);
  }, [activeWorkspaceId]);

  const dismissSuggestion = useCallback(() => {
    if (workflowSuggestion) {
      const patternKey = `${workflowSuggestion.workspaceId}::${workflowSuggestion.pattern.name}`;
      dismissedPatterns.add(patternKey);
    }
    setWorkflowSuggestion(null);
  }, [workflowSuggestion]);

  return { subAgents, workflowSuggestion, dismissSuggestion };
}
