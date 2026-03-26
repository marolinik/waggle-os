/**
 * Waggle Dance Signals — real-time agent activity signals.
 *
 * Signals are emitted by the chat loop on agent events (start, tool call,
 * memory save, completion) and stored in-memory for UI consumption.
 *
 * Endpoints:
 *   GET  /api/waggle/signals       — list recent signals
 *   POST /api/waggle/signals       — publish a signal
 *   PATCH /api/waggle/signals/:id/ack — acknowledge a signal
 *   GET  /api/waggle/stream        — SSE stream of new signals
 */

import type { FastifyPluginAsync } from 'fastify';
import { EventEmitter } from 'node:events';

interface WaggleSignal {
  id: string;
  type: string;          // agent:started, tool:called, memory:saved, agent:completed, etc.
  workspaceId: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  acknowledged: boolean;
}

// In-memory signal store (capped at 500)
const MAX_SIGNALS = 500;
const signals: WaggleSignal[] = [];
const signalBus = new EventEmitter();
signalBus.setMaxListeners(50);

/** Publish a signal — called from chat loop and other subsystems */
export function emitWaggleSignal(signal: Omit<WaggleSignal, 'id' | 'timestamp' | 'acknowledged'>) {
  const full: WaggleSignal = {
    ...signal,
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };
  signals.unshift(full);
  if (signals.length > MAX_SIGNALS) signals.length = MAX_SIGNALS;
  signalBus.emit('signal', full);
  return full;
}

export const waggleSignalRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/waggle/signals — list recent signals
  fastify.get<{ Querystring: { limit?: string; unacked?: string } }>(
    '/api/waggle/signals',
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
      const unackedOnly = request.query.unacked === '1';
      const filtered = unackedOnly ? signals.filter(s => !s.acknowledged) : signals;
      return { signals: filtered.slice(0, limit), total: filtered.length };
    },
  );

  // POST /api/waggle/signals — publish a signal
  fastify.post('/api/waggle/signals', async (request, reply) => {
    const body = request.body as { type?: string; workspaceId?: string; content?: string; metadata?: Record<string, unknown> };
    if (!body?.type || !body?.content) {
      return reply.code(400).send({ error: 'type and content are required' });
    }
    const signal = emitWaggleSignal({
      type: body.type,
      workspaceId: body.workspaceId ?? 'global',
      content: body.content,
      metadata: body.metadata,
    });
    return reply.code(201).send(signal);
  });

  // PATCH /api/waggle/signals/:id/ack — acknowledge a signal
  fastify.patch('/api/waggle/signals/:id/ack', async (request) => {
    const { id } = request.params as { id: string };
    const signal = signals.find(s => s.id === id);
    if (signal) signal.acknowledged = true;
    return { acknowledged: true, id };
  });

  // GET /api/waggle/stream — SSE stream of new signals
  fastify.get('/api/waggle/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
    });
    reply.raw.write('event: connected\ndata: {}\n\n');

    const handler = (signal: WaggleSignal) => {
      try {
        reply.raw.write(`event: signal\ndata: ${JSON.stringify(signal)}\n\n`);
      } catch { /* connection closed */ }
    };

    signalBus.on('signal', handler);

    request.raw.on('close', () => {
      signalBus.off('signal', handler);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      try { reply.raw.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 30000);

    request.raw.on('close', () => clearInterval(heartbeat));

    // Prevent Fastify from auto-sending response
    await new Promise(() => {}); // holds connection open
  });
};
