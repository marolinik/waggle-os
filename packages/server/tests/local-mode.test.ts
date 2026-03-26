import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

describe('Local Server Mode', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    // Create a temp directory for test data
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-local-test-'));

    // Create personal.mind with some test data
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    // Create sessions first (FK constraint: memory_frames.gop_id → sessions.gop_id)
    const s1 = sessions.create('test-project');
    const s2 = sessions.create('test-project-2');
    frames.createIFrame(s1.gop_id, 'Waggle is an AI agent platform', 'normal');
    frames.createIFrame(s2.gop_id, 'Memory search test content', 'important');
    mind.close();

    // Build the local server
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Health check ---
  describe('health check', () => {
    it('returns mode: local with structured health', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // In test mode (no LLM provider initialized), status is not 'ok'
      expect(['ok', 'degraded', 'unavailable']).toContain(body.status);
      expect(body.mode).toBe('local');
      expect(body.timestamp).toBeDefined();
      // Deep health fields present
      expect(body.llm).toBeDefined();
      expect(body.llm.provider).toBeDefined();
      expect(body.llm.health).toBeDefined();
      expect(body.database).toBeDefined();
      expect(body.database.healthy).toBe(true);
    });
  });

  // --- Workspace CRUD ---
  describe('workspace CRUD', () => {
    let createdId: string;

    it('creates a workspace', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: { name: 'Test Project', group: 'Work', icon: 'rocket' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('Test Project');
      expect(body.group).toBe('Work');
      expect(body.icon).toBe('rocket');
      expect(body.id).toBeDefined();
      expect(body.created).toBeDefined();
      createdId = body.id;
    });

    it('lists workspaces', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/workspaces' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body.some((w: { id: string }) => w.id === createdId)).toBe(true);
    });

    it('gets a workspace by id', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: `/api/workspaces/${createdId}` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(createdId);
      expect(body.name).toBe('Test Project');
    });

    it('returns 404 for non-existent workspace', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/workspaces/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });

    it('updates a workspace', async () => {
      const res = await injectWithAuth(server, {
        method: 'PUT',
        url: `/api/workspaces/${createdId}`,
        payload: { name: 'Updated Project', model: 'gpt-4o' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('Updated Project');
      expect(body.model).toBe('gpt-4o');
    });

    it('deletes a workspace', async () => {
      const res = await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${createdId}` });
      expect(res.statusCode).toBe(204);

      // Verify it's gone
      const getRes = await injectWithAuth(server, { method: 'GET', url: `/api/workspaces/${createdId}` });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 400 when creating without required fields', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: { name: 'No Group' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // --- Chat SSE ---
  describe('chat SSE', () => {
    it('returns SSE stream when agent runner is set', async () => {
      // Inject a mock agent runner for this test
      server.agentRunner = async (config) => {
        if (config.onToken) config.onToken('Hi');
        return {
          content: 'Hi',
          toolsUsed: [],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      };

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Hello world', workspace: 'test-ws' },
      });
      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.body).toContain('event: token');
      expect(res.body).toContain('event: done');

      // Clean up
      server.agentRunner = undefined;
    });

    it('returns 400 without message', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // --- Memory search ---
  describe('memory search', () => {
    it('returns search results for matching query', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/memory/search?q=waggle',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.results).toBeDefined();
      expect(body.count).toBeGreaterThanOrEqual(1);
      expect(body.results[0].content).toContain('Waggle');
    });

    it('returns empty results for non-matching query', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/memory/search?q=xyznonexistent',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.count).toBe(0);
    });

    it('returns 400 without query parameter', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/memory/search',
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns normalized frames from /api/memory/frames endpoint', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/memory/frames?limit=10',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
      // Frames should have camelCase field names (UI shape)
      if (body.results.length > 0) {
        const frame = body.results[0];
        expect(frame.frameType).toBeDefined();
        expect(frame.timestamp).toBeDefined();
        expect(frame.source).toBeDefined();
        // Should NOT have raw snake_case fields
        expect(frame.frame_type).toBeUndefined();
        expect(frame.created_at).toBeUndefined();
      }
    });

    it('returns normalized fields from search results', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/memory/search?q=waggle',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      if (body.results.length > 0) {
        const frame = body.results[0];
        expect(frame.frameType).toBeDefined();
        expect(frame.timestamp).toBeDefined();
      }
    });
  });

  // --- Settings ---
  describe('settings', () => {
    it('reads default settings', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/settings' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.defaultModel).toBeDefined();
      expect(body.dataDir).toBe(tmpDir);
    });

    it('updates and reads back settings', async () => {
      // Update
      const putRes = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: { defaultModel: 'claude-opus-4-6' },
      });
      expect(putRes.statusCode).toBe(200);
      const putBody = JSON.parse(putRes.body);
      expect(putBody.defaultModel).toBe('claude-opus-4-6');

      // Read back
      const getRes = await injectWithAuth(server, { method: 'GET', url: '/api/settings' });
      const getBody = JSON.parse(getRes.body);
      expect(getBody.defaultModel).toBe('claude-opus-4-6');
    });
  });
});
