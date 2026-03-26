/**
 * Fleet Routes Tests (PRQ-043)
 *
 * Tests fleet status and control endpoints:
 *   GET  /api/fleet                      — list active workspace sessions
 *   POST /api/fleet/:workspaceId/pause   — pause a session
 *   POST /api/fleet/:workspaceId/resume  — resume a paused session
 *   POST /api/fleet/:workspaceId/kill    — kill a session
 *
 * Uses a lightweight Fastify server with just the fleet routes registered.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { fleetRoutes } from '../../src/local/routes/fleet.js';

function createTestServer(sessionManager?: any) {
  const server = Fastify({ logger: false });
  if (sessionManager) {
    (server as any).sessionManager = sessionManager;
  }
  server.register(fleetRoutes);
  return server;
}

describe('Fleet Routes', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server.close();
  });

  // ── GET /api/fleet ────────────────────────────────────────────────

  describe('GET /api/fleet', () => {
    it('returns empty array when no session manager is available', async () => {
      server = createTestServer(); // No session manager
      const res = await server.inject({ method: 'GET', url: '/api/fleet' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('returns empty array when session manager has no active sessions', async () => {
      const mockManager = {
        getActive: () => [],
      };
      server = createTestServer(mockManager);
      const res = await server.inject({ method: 'GET', url: '/api/fleet' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions).toEqual([]);
      expect(body.count).toBe(0);
      expect(body.maxSessions).toBe(3);
    });

    it('returns agent status when sessions exist', async () => {
      const now = Date.now();
      const mockManager = {
        getActive: () => [
          {
            workspaceId: 'ws-1',
            personaId: 'persona-1',
            status: 'running',
            lastActivity: now - 5000,
            tools: ['search_memory', 'bash'],
          },
          {
            workspaceId: 'ws-2',
            personaId: null,
            status: 'idle',
            lastActivity: now - 60000,
          },
        ],
      };
      server = createTestServer(mockManager);
      const res = await server.inject({ method: 'GET', url: '/api/fleet' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.count).toBe(2);
      expect(body.maxSessions).toBe(3);
      expect(body.sessions).toHaveLength(2);

      // First session
      expect(body.sessions[0].workspaceId).toBe('ws-1');
      expect(body.sessions[0].personaId).toBe('persona-1');
      expect(body.sessions[0].status).toBe('running');
      expect(body.sessions[0].toolCount).toBe(2);
      expect(typeof body.sessions[0].durationMs).toBe('number');
      expect(body.sessions[0].durationMs).toBeGreaterThanOrEqual(5000);

      // Second session — no tools array
      expect(body.sessions[1].workspaceId).toBe('ws-2');
      expect(body.sessions[1].toolCount).toBe(0);
    });
  });

  // ── POST /api/fleet/:workspaceId/pause ─────────────────────────

  describe('POST /api/fleet/:workspaceId/pause', () => {
    it('returns 503 when session manager is not available', async () => {
      server = createTestServer(); // No session manager
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/pause',
      });

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toContain('Session manager not available');
    });

    it('returns 404 when session not found', async () => {
      const mockManager = {
        pause: () => false,
      };
      server = createTestServer(mockManager);
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/nonexistent/pause',
      });

      expect(res.statusCode).toBe(404);
    });

    it('pauses an active session', async () => {
      const mockManager = {
        pause: (id: string) => id === 'ws-1',
      };
      server = createTestServer(mockManager);
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/pause',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.paused).toBe(true);
      expect(body.workspaceId).toBe('ws-1');
    });
  });

  // ── POST /api/fleet/:workspaceId/resume ────────────────────────

  describe('POST /api/fleet/:workspaceId/resume', () => {
    it('returns 503 when session manager is not available', async () => {
      server = createTestServer(); // No session manager
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/resume',
      });

      expect(res.statusCode).toBe(503);
    });

    it('returns 404 when session not found or not paused', async () => {
      const mockManager = {
        resume: () => false,
      };
      server = createTestServer(mockManager);
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/resume',
      });

      expect(res.statusCode).toBe(404);
    });

    it('resumes a paused session', async () => {
      const mockManager = {
        resume: (id: string) => id === 'ws-1',
      };
      server = createTestServer(mockManager);
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/resume',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.resumed).toBe(true);
      expect(body.workspaceId).toBe('ws-1');
    });
  });

  // ── POST /api/fleet/:workspaceId/kill ──────────────────────────

  describe('POST /api/fleet/:workspaceId/kill', () => {
    it('returns 503 when session manager is not available', async () => {
      server = createTestServer(); // No session manager
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/kill',
      });

      expect(res.statusCode).toBe(503);
    });

    it('returns 404 when session not found', async () => {
      const mockManager = {
        close: () => false,
      };
      server = createTestServer(mockManager);
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/kill',
      });

      expect(res.statusCode).toBe(404);
    });

    it('kills an active session', async () => {
      const mockManager = {
        close: (id: string) => id === 'ws-1',
      };
      server = createTestServer(mockManager);
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/ws-1/kill',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.killed).toBe(true);
      expect(body.workspaceId).toBe('ws-1');
    });
  });
});
