/**
 * Telemetry REST API Routes — local telemetry management.
 *
 * All data stays local. No cloud reporting.
 */

import type { FastifyPluginAsync } from 'fastify';
import { WaggleConfig } from '@waggle/core';

export const telemetryRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/telemetry/summary
  server.get('/api/telemetry/summary', async () => {
    return server.telemetry.getSummary();
  });

  // GET /api/telemetry/events?event=session_start&since=2026-04-01&limit=50
  server.get<{
    Querystring: { event?: string; since?: string; until?: string; limit?: string };
  }>('/api/telemetry/events', async (request) => {
    const { event, since, until, limit } = request.query;
    return server.telemetry.getEvents({
      event,
      since,
      until,
      limit: limit ? parseInt(limit) : 100,
    });
  });

  // DELETE /api/telemetry/events — user right to delete
  server.delete('/api/telemetry/events', async () => {
    return server.telemetry.clear();
  });

  // GET /api/telemetry/status
  server.get('/api/telemetry/status', async () => {
    return {
      enabled: server.telemetry.isEnabled(),
      totalEvents: server.telemetry.getSummary().totalEvents,
    };
  });

  // POST /api/telemetry/toggle — { enabled: true/false }
  server.post<{
    Body: { enabled: boolean };
  }>('/api/telemetry/toggle', async (request) => {
    const { enabled } = request.body;
    server.telemetry.setEnabled(enabled);
    const config = new WaggleConfig(server.localConfig.dataDir);
    config.setTelemetryEnabled(enabled);
    return { enabled };
  });

  // POST /api/telemetry/track — record a single event (used by frontend)
  server.post<{
    Body: { event: string; properties?: Record<string, unknown> };
  }>('/api/telemetry/track', async (request, reply) => {
    const { event, properties } = request.body;
    if (!event) return reply.status(400).send({ error: 'event is required' });
    server.telemetry.track(event, properties);
    return { ok: true };
  });
};
