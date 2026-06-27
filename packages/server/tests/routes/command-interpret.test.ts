import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('POST /api/command/interpret', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-interpret-test-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    const sessions = new SessionStore(mind);
    sessions.create('test');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* OS cleans temp */ }
  });

  it('400s when text is missing', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/command/interpret',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('degrades gracefully to a Tier-0 fallback when no model key is configured', async () => {
    // No anthropic key in the test vault → the resolver returns the structured
    // fallback (HTTP 200) so the palette can fall back to Tier 0 cleanly.
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/command/interpret',
      payload: { text: 'make a new workspace for the Phoenix project', workspaceId: 'default' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.kind).toBe('none');
    expect(body.fallback).toBe(true);
  });
});
