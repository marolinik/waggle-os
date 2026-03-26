/**
 * Cockpit health endpoint enhancements — memoryStats, serviceHealth, defaultModel.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';

describe('Cockpit health endpoint enhancements', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cockpit-test-'));

    // Create personal.mind with test data
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('cockpit-test');
    frames.createIFrame(s1.gop_id, 'Test frame 1', 'normal');
    frames.createIFrame(s1.gop_id, 'Test frame 2', 'important');
    frames.createPFrame(s1.gop_id, 'Test P-frame', 1, 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns memoryStats in health response', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.memoryStats).toBeDefined();
    expect(typeof body.memoryStats.frameCount).toBe('number');
    expect(body.memoryStats.frameCount).toBeGreaterThanOrEqual(3); // We created 3 frames
    expect(typeof body.memoryStats.mindSizeBytes).toBe('number');
    expect(body.memoryStats.mindSizeBytes).toBeGreaterThan(0);
    expect(typeof body.memoryStats.embeddingCoverage).toBe('number');
    expect(body.memoryStats.embeddingCoverage).toBeGreaterThanOrEqual(0);
    expect(body.memoryStats.embeddingCoverage).toBeLessThanOrEqual(100);
  });

  it('returns serviceHealth in health response', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.serviceHealth).toBeDefined();
    expect(typeof body.serviceHealth.watchdogRunning).toBe('boolean');
    expect(body.serviceHealth.watchdogRunning).toBe(true); // scheduler starts on server build
    expect(typeof body.serviceHealth.notificationSSEActive).toBe('boolean');
  });

  it('returns defaultModel in health response', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.defaultModel).toBeDefined();
    expect(typeof body.defaultModel).toBe('string');
    expect(body.defaultModel.length).toBeGreaterThan(0);
  });

  it('preserves existing health fields', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // All original fields still present
    expect(['ok', 'degraded', 'unavailable']).toContain(body.status);
    expect(body.mode).toBe('local');
    expect(body.timestamp).toBeDefined();
    expect(body.llm).toBeDefined();
    expect(body.llm.provider).toBeDefined();
    expect(body.llm.health).toBeDefined();
    expect(body.database).toBeDefined();
    expect(body.database.healthy).toBe(true);
  });
});
