/**
 * Import Routes Tests (PRQ-043)
 *
 * Tests the memory import endpoints:
 *   POST /api/import/preview — previews a ChatGPT or Claude export
 *   POST /api/import/commit  — commits imported knowledge to personal memory
 *
 * Uses buildLocalServer with a temporary data directory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

// ── Test fixtures ───────────────────────────────────────────

/** Minimal ChatGPT export format with one conversation containing a decision */
const CHATGPT_EXPORT = [
  {
    title: 'Project Architecture Discussion',
    create_time: 1700000000,
    mapping: {
      node1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['I decided to use React with TypeScript for the frontend'] },
          create_time: 1700000001,
        },
      },
      node2: {
        message: {
          author: { role: 'assistant' },
          content: { parts: ['Great choice! React with TypeScript offers excellent type safety.'] },
          create_time: 1700000002,
        },
      },
    },
  },
];

/** Minimal Claude export format with one conversation */
const CLAUDE_EXPORT = [
  {
    name: 'Tech Stack Comparison',
    created_at: '2025-01-15T10:00:00.000Z',
    chat_messages: [
      {
        sender: 'human',
        text: 'I prefer using SQLite for local-first applications',
        created_at: '2025-01-15T10:00:01.000Z',
      },
      {
        sender: 'assistant',
        text: 'SQLite is excellent for local-first apps because of its embedded nature.',
        created_at: '2025-01-15T10:00:02.000Z',
      },
    ],
  },
];

describe('Import Routes', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-import-test-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('import-test');
    frames.createIFrame(s1.gop_id, 'Import test frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── POST /api/import/preview ──────────────────────────────────

  describe('POST /api/import/preview', () => {
    it('previews a ChatGPT export', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/preview',
        payload: { data: CHATGPT_EXPORT, source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.source).toBe('chatgpt');
      expect(body.conversationsFound).toBeGreaterThanOrEqual(1);
      expect(body.conversationsParsed).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(body.knowledgeExtracted)).toBe(true);
      expect(Array.isArray(body.errors)).toBe(true);
    });

    it('previews a Claude export', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/preview',
        payload: { data: CLAUDE_EXPORT, source: 'claude' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.source).toBe('claude');
      expect(body.conversationsFound).toBeGreaterThanOrEqual(1);
      expect(body.conversationsParsed).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(body.knowledgeExtracted)).toBe(true);
    });

    it('returns 400 when data is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/preview',
        payload: { source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('data and source');
    });

    it('returns 400 when source is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/preview',
        payload: { data: [] },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('data and source');
    });

    it('returns 400 when source is invalid', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/preview',
        payload: { data: [], source: 'openai' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('chatgpt');
      expect(body.error).toContain('claude');
    });

    it('handles empty export gracefully', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/preview',
        payload: { data: [], source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.conversationsFound).toBe(0);
      expect(body.knowledgeExtracted).toEqual([]);
      expect(body.errors.length).toBeGreaterThanOrEqual(1);
      expect(body.errors[0]).toContain('No conversations found');
    });
  });

  // ── POST /api/import/commit ───────────────────────────────────

  describe('POST /api/import/commit', () => {
    it('commit returns error shape when save fails (FK constraint on gop_id)', async () => {
      // The import route uses 'import' as gop_id, but no session with that
      // gop_id exists. The FrameStore.createIFrame will fail with a FK
      // constraint error, and the route should return a 500 with error message.
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/commit',
        payload: { data: CHATGPT_EXPORT, source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error).toContain('Import failed');
    });

    it('commit returns saved:0 when no knowledge is extracted', async () => {
      // An export with conversations but no extractable knowledge.
      // Title must be <= 5 chars or 'Untitled' to avoid topic extraction,
      // and messages must be too short to match decision/preference/fact patterns.
      const noKnowledgeExport = [
        {
          title: 'hi',
          create_time: 1700000000,
          mapping: {
            node1: {
              message: {
                author: { role: 'user' },
                content: { parts: ['Hey there'] },
                create_time: 1700000001,
              },
            },
          },
        },
      ];

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/commit',
        payload: { data: noKnowledgeExport, source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.saved).toBe(0);
      expect(body.message).toContain('No knowledge items');
    });

    it('returns 400 when data is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/commit',
        payload: { source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when source is invalid', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/commit',
        payload: { data: [], source: 'notion' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('handles export with no knowledge items (preview path)', async () => {
      // Empty conversations array that parse to 0 conversations
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/import/commit',
        payload: { data: [], source: 'chatgpt' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.saved).toBe(0);
      expect(body.message).toContain('No knowledge items');
    });
  });
});
