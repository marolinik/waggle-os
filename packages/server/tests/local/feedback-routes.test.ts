/**
 * Feedback REST API Route Tests
 *
 * Tests the two feedback endpoints:
 *   POST /api/feedback       — record user feedback
 *   GET  /api/feedback/stats — get improvement stats
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Fastify from 'fastify';
import { MindDB, ImprovementSignalStore } from '@waggle/core';
import { feedbackRoutes } from '../../src/local/routes/feedback.js';

/** Minimal multiMind mock that provides a real MindDB for the personal mind. */
function createTestServer(db: MindDB) {
  const server = Fastify({ logger: false });
  const signalStore = new ImprovementSignalStore(db);
  server.decorate('multiMind', {
    personal: db,
  });
  server.decorate('agentState', {
    orchestrator: {
      getImprovementSignals: () => signalStore,
    },
  });
  server.register(feedbackRoutes);
  return { server, signalStore };
}

describe('Feedback Routes', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;
  let signalStore: ImprovementSignalStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    const result = createTestServer(db);
    server = result.server;
    signalStore = result.signalStore;
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  // ── POST /api/feedback ──────────────────────────────────────────────

  describe('POST /api/feedback', () => {
    it('stores thumbs-up feedback', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          sessionId: 'sess-1',
          messageIndex: 3,
          rating: 'up',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('stores thumbs-down feedback with reason', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          sessionId: 'sess-1',
          messageIndex: 5,
          rating: 'down',
          reason: 'too_verbose',
          detail: 'The response was way too long',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('records negative feedback as correction signal', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          sessionId: 'sess-1',
          messageIndex: 2,
          rating: 'down',
          reason: 'wrong_tool',
          detail: 'Should have used web_search',
        },
      });

      // Check that it was recorded in the improvement signals store
      const corrections = signalStore.getByCategory('correction');
      const feedbackSignal = corrections.find(c => c.pattern_key === 'feedback:wrong_tool');
      expect(feedbackSignal).toBeDefined();
      expect(feedbackSignal!.count).toBe(1);
    });

    it('rejects missing sessionId', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          messageIndex: 3,
          rating: 'up',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('sessionId');
    });

    it('rejects invalid rating', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          sessionId: 'sess-1',
          messageIndex: 3,
          rating: 'meh',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('rating');
    });

    it('rejects invalid reason', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          sessionId: 'sess-1',
          messageIndex: 3,
          rating: 'down',
          reason: 'invalid_reason',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('reason');
    });

    it('rejects negative messageIndex', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          sessionId: 'sess-1',
          messageIndex: -1,
          rating: 'up',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('messageIndex');
    });
  });

  // ── GET /api/feedback/stats ─────────────────────────────────────────

  describe('GET /api/feedback/stats', () => {
    it('returns empty stats initially', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/feedback/stats',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalFeedback).toBe(0);
      expect(body.positiveRate).toBe(0);
      expect(body.topIssues).toEqual([]);
      expect(typeof body.correctionsThisWeek).toBe('number');
      expect(typeof body.improvementTrend).toBe('string');
    });

    it('returns correct stats shape after feedback', async () => {
      // Submit some feedback
      await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: { sessionId: 's1', messageIndex: 0, rating: 'up' },
      });
      await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: { sessionId: 's1', messageIndex: 1, rating: 'up' },
      });
      await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: { sessionId: 's1', messageIndex: 2, rating: 'down', reason: 'too_verbose' },
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/feedback/stats',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.totalFeedback).toBe(3);
      expect(body.positiveRate).toBeCloseTo(0.67, 1);
      expect(body.topIssues).toContain('too_verbose');
      expect(typeof body.correctionsThisWeek).toBe('number');
      expect(typeof body.improvementTrend).toBe('string');
    });

    it('tracks top issues from negative feedback', async () => {
      // Submit multiple negative feedbacks with different reasons
      for (let i = 0; i < 3; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/feedback',
          payload: { sessionId: 's1', messageIndex: i, rating: 'down', reason: 'wrong_answer' },
        });
      }
      await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: { sessionId: 's1', messageIndex: 10, rating: 'down', reason: 'too_slow' },
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/feedback/stats',
      });
      const body = res.json();

      expect(body.topIssues[0]).toBe('wrong_answer'); // Most common
      expect(body.topIssues).toContain('too_slow');
    });
  });
});
