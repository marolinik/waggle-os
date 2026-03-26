/**
 * Agent communication tools — send and receive messages between workspace agents.
 */

import type { ToolDefinition } from './tools.js';
import type { AgentMessageBus } from './agent-message-bus.js';

export function createAgentCommsTools(
  bus: AgentMessageBus,
  currentWorkspaceId: string,
  /** Check if a workspace session is active */
  isSessionActive?: (workspaceId: string) => boolean,
): ToolDefinition[] {
  return [
    {
      name: 'send_agent_message',
      description: 'Send a message to an agent in another workspace. Use for cross-workspace collaboration.',
      parameters: {
        type: 'object',
        properties: {
          workspace: { type: 'string', description: 'Target workspace ID' },
          message: { type: 'string', description: 'Message content to send' },
          correlationId: { type: 'string', description: 'Optional: ID of a message you are replying to' },
        },
        required: ['workspace', 'message'],
      },
      execute: async (args: Record<string, unknown>) => {
        const targetWs = args.workspace as string;
        const message = args.message as string;
        const correlationId = args.correlationId as string | undefined;

        if (targetWs === currentWorkspaceId) {
          return JSON.stringify({ success: false, error: 'Cannot send a message to yourself' });
        }

        if (isSessionActive && !isSessionActive(targetWs)) {
          return JSON.stringify({
            success: false,
            error: `Workspace "${targetWs}" is not active. The target agent must be running to receive messages.`,
          });
        }

        const id = bus.send({
          from: currentWorkspaceId,
          to: targetWs,
          content: message,
          correlationId,
        });

        return JSON.stringify({ success: true, messageId: id, to: targetWs });
      },
    },
    {
      name: 'check_agent_messages',
      description: 'Check for messages from other workspace agents. Messages are consumed on read.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const messages = bus.receive(currentWorkspaceId);

        if (messages.length === 0) {
          return JSON.stringify({ messages: [], count: 0 });
        }

        return JSON.stringify({
          count: messages.length,
          messages: messages.map(m => ({
            id: m.id,
            from: m.from,
            content: m.content,
            correlationId: m.correlationId,
            ageMs: Date.now() - m.timestamp,
          })),
        });
      },
    },
  ];
}
