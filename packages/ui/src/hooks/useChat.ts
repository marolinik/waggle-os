/**
 * useChat — React hook that manages chat state.
 *
 * Takes a WaggleService instance and returns chat state + actions.
 * Handles streaming responses and accumulating tokens into messages.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { WaggleService, Message, ToolUseEvent, StreamEvent } from '../services/types.js';

export interface UseChatOptions {
  service: WaggleService;
  workspace: string;
  session?: string;
  /** Filesystem directory for agent file operations */
  workspacePath?: string;
  /** Called when agent creates/writes a file */
  onFileCreated?: (filePath: string, action: 'write' | 'edit' | 'generate') => void;
}

/** Q12:C — Tool progress counter for top-bar progress indicator */
export interface ToolProgress {
  total: number;
  completed: number;
  active: string | null;
}

export interface UseChatReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  /** Q12:C — Live tool progress during agent execution */
  toolProgress: ToolProgress;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

/**
 * Core logic for processing stream events into a message.
 * Extracted so it can be tested without React.
 */
export function processStreamEvent(
  event: StreamEvent,
  current: { content: string; tools: ToolUseEvent[]; steps: string[]; cost?: number; tokens?: { input: number; output: number } },
): { content: string; tools: ToolUseEvent[]; steps: string[]; cost?: number; tokens?: { input: number; output: number } } {
  const result = { content: current.content, tools: [...current.tools], steps: [...current.steps], cost: current.cost, tokens: current.tokens };

  switch (event.type) {
    case 'token':
      result.content += event.content ?? '';
      break;
    case 'step':
      // Human-readable reasoning step (e.g., "Searching the web for...")
      if (event.content) {
        result.steps.push(event.content);
      }
      break;
    case 'tool': {
      const toolName = event.name ?? 'unknown';
      // Check if this tool was already created by an earlier approval_required event
      const existing = result.tools.find(
        t => t.name === toolName && t.requiresApproval && t.approved === undefined && !t.result,
      );
      if (existing) {
        // Update input if the tool event has more detail
        if (event.input) existing.input = event.input;
        existing.status = 'running';
      } else {
        const toolEvent: ToolUseEvent = {
          name: toolName,
          input: event.input ?? {},
          requiresApproval: false,
          status: 'running',
        };
        result.tools.push(toolEvent);
      }
      break;
    }
    case 'tool_result': {
      // Find the matching tool by name (last one with that name still running)
      const targetName = event.name;
      let targetTool: ToolUseEvent | undefined;
      if (targetName) {
        for (let i = result.tools.length - 1; i >= 0; i--) {
          if (result.tools[i].name === targetName && result.tools[i].status === 'running') {
            targetTool = result.tools[i];
            break;
          }
        }
      }
      // Fallback to last tool
      if (!targetTool) {
        targetTool = result.tools[result.tools.length - 1];
      }
      if (targetTool) {
        targetTool.result = typeof event.result === 'string'
          ? event.result
          : JSON.stringify(event.result);
        if (event.duration !== undefined) {
          targetTool.duration = event.duration;
        }
        targetTool.status = event.isError ? 'error' : 'done';
      }
      break;
    }
    case 'approval_required': {
      // Mark the matching tool (or last tool) as requiring approval
      const targetName = event.toolName ?? event.name;
      let toolToMark: ToolUseEvent | undefined;
      if (targetName) {
        // Find the last tool with matching name that hasn't been approved/denied yet
        for (let i = result.tools.length - 1; i >= 0; i--) {
          if (result.tools[i].name === targetName && result.tools[i].approved === undefined) {
            toolToMark = result.tools[i];
            break;
          }
        }
      } else {
        toolToMark = result.tools[result.tools.length - 1];
      }
      if (!toolToMark) {
        // approval_required arrived before tool event — create the tool entry
        toolToMark = {
          name: targetName ?? 'unknown',
          input: event.input ?? {},
          requiresApproval: true,
          requestId: event.requestId,
          status: 'pending_approval',
        };
        result.tools.push(toolToMark);
      } else {
        toolToMark.requiresApproval = true;
        toolToMark.requestId = event.requestId;
        toolToMark.status = 'pending_approval';
      }
      break;
    }
    case 'file_created':
      // Handled externally via onFileCreated callback — nothing to accumulate
      break;
    case 'done':
      // Capture per-message cost/token data from the done event
      if (event.cost !== undefined) result.cost = event.cost;
      if (event.tokens) result.tokens = event.tokens;
      break;
    case 'error':
      result.content += `\n[Error: ${event.content ?? 'Unknown error'}]`;
      break;
  }

  return result;
}

const EMPTY_TOOL_PROGRESS: ToolProgress = { total: 0, completed: 0, active: null };

export function useChat({ service, workspace, session, workspacePath, onFileCreated }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolProgress, setToolProgress] = useState<ToolProgress>(EMPTY_TOOL_PROGRESS);
  const abortRef = useRef(false);

  // Load history when session or workspace changes
  useEffect(() => {
    abortRef.current = true; // abort any in-flight stream

    // Load saved history from server — replace messages atomically
    // (no flash-clear: old messages stay visible until new ones arrive)
    if (session || workspace) {
      setIsLoading(true);
      service.getHistory(workspace, session).then((data) => {
        const history = (data as any)?.messages;
        if (Array.isArray(history) && history.length > 0) {
          setMessages(history.map((m: any) => ({
            id: m.id ?? `hist-${Math.random().toString(36).slice(2)}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp ?? new Date().toISOString(),
          })));
        } else {
          setMessages([]);
        }
      }).catch(() => {
        setMessages([]); // History load failed — start fresh
      }).finally(() => {
        setIsLoading(false);
      });
    } else {
      setMessages([]);
    }
  }, [session, workspace, service]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Add user message
    const userMsg: Message = {
      id: nextId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setToolProgress(EMPTY_TOOL_PROGRESS);
    abortRef.current = false;

    // Create placeholder assistant message
    const assistantId = nextId();
    let accumulated = { content: '', tools: [] as ToolUseEvent[], steps: [] as string[], cost: undefined as number | undefined, tokens: undefined as { input: number; output: number } | undefined };

    try {
      const stream = service.sendMessage(workspace, text, session, undefined, workspacePath);

      for await (const event of stream) {
        if (abortRef.current) break;

        // Notify on file creation events
        if (event.type === 'file_created' && event.filePath && onFileCreated) {
          onFileCreated(event.filePath, event.fileAction ?? 'write');
        }

        accumulated = processStreamEvent(event, accumulated);

        // Q12:C — Update tool progress counter from accumulated tools
        if (event.type === 'tool' || event.type === 'tool_result') {
          const total = accumulated.tools.length;
          const completed = accumulated.tools.filter(
            t => t.status === 'done' || t.status === 'error' || t.status === 'denied',
          ).length;
          const activeTool = accumulated.tools.find(t => t.status === 'running');
          setToolProgress({ total, completed, active: activeTool?.name ?? null });
        }

        // Update the assistant message in-place
        const assistantMsg: Message = {
          id: assistantId,
          role: 'assistant',
          content: accumulated.content,
          timestamp: new Date().toISOString(),
          toolUse: accumulated.tools.length > 0 ? accumulated.tools : undefined,
          steps: accumulated.steps.length > 0 ? accumulated.steps : undefined,
          cost: accumulated.cost,
          tokens: accumulated.tokens,
        };

        setMessages((prev) => {
          const existing = prev.findIndex((m) => m.id === assistantId);
          if (existing >= 0) {
            const updated = [...prev];
            // Preserve approval state set by handleToolApprove/handleToolDeny
            const existingTools = updated[existing].toolUse;
            if (existingTools && assistantMsg.toolUse) {
              for (const tool of assistantMsg.toolUse) {
                const prev = existingTools.find(t => t.requestId && t.requestId === tool.requestId);
                if (prev && prev.approved !== undefined) {
                  tool.approved = prev.approved;
                }
              }
            }
            updated[existing] = assistantMsg;
            return updated;
          }
          return [...prev, assistantMsg];
        });
      }
    } catch (err) {
      // Add error as assistant message
      const errorMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: `[Error: ${err instanceof Error ? err.message : 'Unknown error'}]`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => {
        const existing = prev.findIndex((m) => m.id === assistantId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = errorMsg;
          return updated;
        }
        return [...prev, errorMsg];
      });
    } finally {
      setIsLoading(false);
      setToolProgress(EMPTY_TOOL_PROGRESS);
    }
  }, [service, workspace, session, workspacePath, isLoading, onFileCreated]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, setMessages, isLoading, sendMessage, clearMessages, toolProgress };
}
