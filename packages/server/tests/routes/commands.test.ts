import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Command Execution Route', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cmd-test-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test');
    frames.createIFrame(s1.gop_id, 'Test memory about architecture decisions', 'normal');
    frames.createIFrame(s1.gop_id, 'Another memory about deployment', 'important');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-critical — OS will clean temp dir
    }
  });

  it('POST /api/commands/execute with /help returns markdown command list', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/help' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/help');
    expect(body.result).toContain('Available Commands');
    expect(body.result).toContain('/catchup');
    expect(body.result).toContain('/memory');
    expect(body.result).toContain('/skills');
  });

  it('POST /api/commands/execute with /skills returns skill list', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/skills' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/skills');
    expect(body.result).toContain('Active Skills');
    // Server starts with loaded skills — at least the result should be well-formed
    expect(typeof body.result).toBe('string');
  });

  it('POST /api/commands/execute with /memory and query returns search results', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/memory architecture decisions' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/memory architecture decisions');
    expect(body.result).toContain('Memory Search');
    expect(body.result).toContain('architecture decisions');
  });

  it('POST /api/commands/execute with /catchup returns workspace state', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/catchup' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/catchup');
    expect(body.result).toContain('Catch-Up Briefing');
  });

  it('POST /api/commands/execute with empty command returns 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('command is required');
  });

  it('POST /api/commands/execute with /research (no runWorkflow) returns agent-loop reroute', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/research quantum computing' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // B2: Without runWorkflow, /research returns agent-loop reroute instruction
    expect(body.result).toContain('Research the following topic');
    expect(body.result).toContain('quantum computing');
  });

  it('POST /api/commands/execute with /decide (no runWorkflow) returns agent-loop reroute', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/decide Should we use PostgreSQL or MongoDB?' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // B7: Without runWorkflow, /decide returns agent-loop reroute instruction
    expect(body.result).toContain('decision');
    expect(body.result).toContain('PostgreSQL or MongoDB');
  });

  it('POST /api/commands/execute with unknown command returns error', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/nonexistent' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result).toContain('Unknown command');
  });

  it('POST /api/commands/execute with /spawn (no spawnAgent) returns agent-loop reroute', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/spawn researcher find papers' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // B4: Without spawnAgent, /spawn returns agent-loop reroute instruction
    expect(body.result).toContain('specialist researcher');
  });
});
