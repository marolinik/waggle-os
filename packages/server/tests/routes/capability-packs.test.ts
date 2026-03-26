import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Capability Packs API', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-packs-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test');
    frames.createIFrame(s1.gop_id, 'Test content', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/skills/capability-packs/catalog returns packs with skill states', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/skills/capability-packs/catalog' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.packs).toBeDefined();
    expect(body.packs.length).toBeGreaterThanOrEqual(5);

    const research = body.packs.find((p: any) => p.id === 'research-workflow');
    expect(research).toBeDefined();
    expect(research.name).toBe('Research Workflow');
    expect(research.skills).toHaveLength(3);
    expect(research.skillStates).toBeDefined();
    expect(research.packState).toBe('available');
  });

  it('POST /api/skills/capability-packs/:id installs all skills in pack', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/skills/capability-packs/writing-suite',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.installed).toContain('draft-memo');
    expect(body.installed).toContain('compare-docs');
    expect(body.installed).toContain('extract-actions');
    expect(body.installed).toHaveLength(3);
  });

  it('re-installing pack skips already-installed skills', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/skills/capability-packs/writing-suite',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.installed).toHaveLength(0);
    expect(body.skipped).toHaveLength(3);
  });

  it('pack state reflects installed skills', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/skills/capability-packs/catalog' });
    const body = JSON.parse(res.body);
    const writing = body.packs.find((p: any) => p.id === 'writing-suite');
    expect(writing.packState).toBe('complete');
    expect(writing.installedCount).toBe(3);
  });

  it('POST nonexistent pack returns 404', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/skills/capability-packs/nonexistent-pack',
    });
    expect(res.statusCode).toBe(404);
  });

  it('packs with path traversal return 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/skills/capability-packs/..%2F..%2Fetc',
    });
    // URL-encoded path traversal should be caught by validation
    expect([400, 404]).toContain(res.statusCode);
  });
});
