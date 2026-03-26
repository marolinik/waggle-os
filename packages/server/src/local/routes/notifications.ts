import type { FastifyInstance } from 'fastify';
import { validateOrigin } from '../cors-config.js';

export interface NotificationEvent {
  type: 'notification';
  title: string;
  body: string;
  category: 'cron' | 'approval' | 'task' | 'message' | 'agent';
  timestamp: string;
  actionUrl?: string;
}

/** Sub-agent status event — relayed from SubagentOrchestrator via eventBus */
export interface SubagentStatusEvent {
  type: 'subagent_status';
  workspaceId: string;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    task: string;
    toolsUsed: string[];
    startedAt?: number;
    completedAt?: number;
  }>;
  timestamp: string;
}

/** Workflow suggestion event — relayed from workflow capture detection */
export interface WorkflowSuggestionEvent {
  type: 'workflow_suggestion';
  workspaceId: string;
  pattern: {
    name: string;
    description: string;
    steps: string[];
    tools: string[];
    category: string;
  };
  reason: string;
  timestamp: string;
}

export function emitNotification(fastify: FastifyInstance, event: Omit<NotificationEvent, 'type' | 'timestamp'>) {
  const full: NotificationEvent = {
    type: 'notification',
    timestamp: new Date().toISOString(),
    ...event,
  };
  (fastify as any).eventBus?.emit('notification', full);

  // W5.10: Persist notification so it survives offline/restart
  try {
    (fastify as any).cronStore?.saveNotification(event.title, event.body, event.category, event.actionUrl);
  } catch { /* non-blocking */ }
}

/** Emit a sub-agent status event on the eventBus for SSE relay */
export function emitSubagentStatus(fastify: FastifyInstance, workspaceId: string, agents: SubagentStatusEvent['agents']) {
  const event: SubagentStatusEvent = {
    type: 'subagent_status',
    workspaceId,
    agents,
    timestamp: new Date().toISOString(),
  };
  (fastify as any).eventBus?.emit('subagent_status', event);
}

/** Emit a workflow suggestion event on the eventBus for SSE relay */
export function emitWorkflowSuggestion(
  fastify: FastifyInstance,
  workspaceId: string,
  pattern: WorkflowSuggestionEvent['pattern'],
  reason: string,
) {
  const event: WorkflowSuggestionEvent = {
    type: 'workflow_suggestion',
    workspaceId,
    pattern,
    reason,
    timestamp: new Date().toISOString(),
  };
  (fastify as any).eventBus?.emit('workflow_suggestion', event);
}

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.get('/api/notifications/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': validateOrigin(request.headers.origin as string | undefined),
    });

    reply.raw.write('data: {"type":"connected"}\n\n');

    const notificationHandler = (data: NotificationEvent) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch { /* Client disconnected */ }
    };

    const subagentHandler = (data: SubagentStatusEvent) => {
      try {
        reply.raw.write(`event: subagent_status\ndata: ${JSON.stringify(data)}\n\n`);
      } catch { /* Client disconnected */ }
    };

    const workflowSuggestionHandler = (data: WorkflowSuggestionEvent) => {
      try {
        reply.raw.write(`event: workflow_suggestion\ndata: ${JSON.stringify(data)}\n\n`);
      } catch { /* Client disconnected */ }
    };

    const eventBus = (fastify as any).eventBus;
    if (eventBus) {
      eventBus.on('notification', notificationHandler);
      eventBus.on('subagent_status', subagentHandler);
      eventBus.on('workflow_suggestion', workflowSuggestionHandler);
    }

    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n'); }
      catch { clearInterval(heartbeat); }
    }, 30000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (eventBus) {
        eventBus.removeListener('notification', notificationHandler);
        eventBus.removeListener('subagent_status', subagentHandler);
        eventBus.removeListener('workflow_suggestion', workflowSuggestionHandler);
      }
    });
  });

  // W5.10: REST endpoints for persisted notifications
  fastify.get<{
    Querystring: { since?: string; limit?: string; unread?: string };
  }>('/api/notifications', async (request) => {
    const { since, limit, unread } = request.query;
    const cronStore = (fastify as any).cronStore;
    if (!cronStore?.getNotifications) return { notifications: [], count: 0 };
    const results = cronStore.getNotifications({
      since,
      limit: limit ? parseInt(limit, 10) : 50,
      unreadOnly: unread === 'true',
    });
    return { notifications: results, count: results.length, unread: cronStore.countUnread() };
  });

  fastify.post<{
    Params: { id: string };
  }>('/api/notifications/:id/read', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid ID' });
    const cronStore = (fastify as any).cronStore;
    if (!cronStore?.markNotificationRead) return reply.status(503).send({ error: 'Not available' });
    cronStore.markNotificationRead(id);
    return { read: true, id };
  });

  // Q16:C — GET /api/notifications/history — alias with unread filter support
  fastify.get<{
    Querystring: { unread?: string; limit?: string };
  }>('/api/notifications/history', async (request) => {
    const { unread, limit } = request.query;
    const cronStore = (fastify as any).cronStore;
    if (!cronStore?.getNotifications) return { notifications: [], count: 0, unread: 0 };
    const results = cronStore.getNotifications({
      limit: limit ? parseInt(limit, 10) : 100,
      unreadOnly: unread === 'true',
    });
    return { notifications: results, count: results.length, unread: cronStore.countUnread() };
  });

  // Q16:C — PATCH /api/notifications/:id/read — mark single notification as read
  fastify.patch<{
    Params: { id: string };
  }>('/api/notifications/:id/read', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid ID' });
    const cronStore = (fastify as any).cronStore;
    if (!cronStore?.markNotificationRead) return reply.status(503).send({ error: 'Not available' });
    cronStore.markNotificationRead(id);
    return { read: true, id };
  });

  // Q16:C — POST /api/notifications/read-all — mark all notifications as read
  fastify.post('/api/notifications/read-all', async (_request, reply) => {
    const cronStore = (fastify as any).cronStore;
    if (!cronStore?.markAllRead) return reply.status(503).send({ error: 'Not available' });
    const count = cronStore.markAllRead();
    return { markedRead: count };
  });

  // W5.12: REST endpoint for cron execution history
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/api/cron/:id/history', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid ID' });
    const cronStore = (fastify as any).cronStore;
    if (!cronStore?.getExecutionHistory) return reply.status(503).send({ error: 'Not available' });
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
    const history = cronStore.getExecutionHistory(id, limit);
    return { history, count: history.length };
  });
}
