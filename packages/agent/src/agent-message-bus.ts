/**
 * AgentMessageBus — in-memory message bus for local agent-to-agent communication.
 *
 * Distinct from team messaging (PostgreSQL). This is for cross-workspace
 * communication between concurrent agent sessions on the same machine.
 * Messages expire after TTL to prevent memory growth.
 */

import { randomUUID } from 'node:crypto';

export interface AgentMessage {
  id: string;
  from: string;        // workspaceId
  to: string;          // workspaceId
  content: string;
  correlationId?: string;  // For request/response pairing
  timestamp: number;
  ttlMs: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class AgentMessageBus {
  private queues = new Map<string, AgentMessage[]>();

  /** Send a message to a target workspace agent */
  send(msg: {
    from: string;
    to: string;
    content: string;
    correlationId?: string;
    ttlMs?: number;
  }): string {
    const id = randomUUID();
    const message: AgentMessage = {
      id,
      from: msg.from,
      to: msg.to,
      content: msg.content,
      correlationId: msg.correlationId,
      timestamp: Date.now(),
      ttlMs: msg.ttlMs ?? DEFAULT_TTL_MS,
    };

    const queue = this.queues.get(msg.to) ?? [];
    queue.push(message);
    this.queues.set(msg.to, queue);

    return id;
  }

  /** Reply to a message (sets correlationId to original message ID) */
  reply(originalId: string, content: string, from: string, to: string): string {
    return this.send({ from, to, content, correlationId: originalId });
  }

  /**
   * Receive and drain all pending messages for a workspace.
   * Messages are removed after reading (one-shot consumption).
   */
  receive(workspaceId: string): AgentMessage[] {
    const queue = this.queues.get(workspaceId) ?? [];
    this.queues.delete(workspaceId);

    // Filter out expired messages
    const now = Date.now();
    return queue.filter(m => now - m.timestamp < m.ttlMs);
  }

  /** Peek at pending messages without consuming them */
  peek(workspaceId: string): AgentMessage[] {
    const queue = this.queues.get(workspaceId) ?? [];
    const now = Date.now();
    return queue.filter(m => now - m.timestamp < m.ttlMs);
  }

  /** Get count of pending messages for a workspace */
  pendingCount(workspaceId: string): number {
    return this.peek(workspaceId).length;
  }

  /** Remove expired messages across all queues. Returns count removed. */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [wsId, queue] of this.queues) {
      const before = queue.length;
      const filtered = queue.filter(m => now - m.timestamp < m.ttlMs);
      removed += before - filtered.length;

      if (filtered.length === 0) {
        this.queues.delete(wsId);
      } else {
        this.queues.set(wsId, filtered);
      }
    }

    return removed;
  }
}
