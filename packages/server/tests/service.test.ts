import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { startService } from '../src/local/service.js';
import { getLiteLLMStatus } from '../src/local/lifecycle.js';
import type { FastifyInstance } from 'fastify';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-svc-test-'));
}

function randomPort(): number {
  return 3333 + Math.floor(Math.random() * 1000);
}

describe('Agent Service', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    // Close all servers
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups.length = 0;

    // Remove temp dirs
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('creates data dir if it does not exist', async () => {
    const base = makeTmpDir();
    tmpDirs.push(base);
    const dataDir = path.join(base, 'nested', 'waggle-data');
    const port = randomPort();

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    expect(fs.existsSync(dataDir)).toBe(true);
  });

  it('runs migration when default.mind exists', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);

    // Create a default.mind (simulating pre-M4 layout)
    const defaultPath = path.join(dataDir, 'default.mind');
    const mind = new MindDB(defaultPath);
    mind.close();
    expect(fs.existsSync(defaultPath)).toBe(true);

    const port = randomPort();
    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    // After migration: personal.mind exists, default.mind renamed to .bak
    expect(fs.existsSync(path.join(dataDir, 'personal.mind'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'default.mind.bak'))).toBe(true);
    expect(fs.existsSync(defaultPath)).toBe(false);
  });

  it('creates personal.mind if fresh install (no default.mind)', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    const personalPath = path.join(dataDir, 'personal.mind');
    expect(fs.existsSync(personalPath)).toBe(true);
  });

  it('returns running server (health check works)', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    // Use inject (no real HTTP needed)
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // With skipLiteLLM, health is degraded (no verified LLM), not 'ok'
    expect(['ok', 'degraded', 'unavailable']).toContain(body.status);
    expect(body.mode).toBe('local');
    // Deep health: LLM provider and database status present
    expect(body.llm).toBeDefined();
    expect(body.llm.provider).toBeDefined();
    expect(body.database).toBeDefined();
  });

  it('server gracefully shuts down on close', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });

    // Close it
    await server.close();

    // After close, inject should fail or server should be closed
    // Fastify sets server.server.listening to false after close
    expect(server.server.listening).toBe(false);
  });
});

describe('LiteLLM Lifecycle', () => {
  it('getLiteLLMStatus returns error when nothing is running', async () => {
    // Use a very unlikely port
    const status = await getLiteLLMStatus(59999);
    expect(status.status).toBe('error');
    expect(status.port).toBe(59999);
    expect(status.error).toContain('not running');
  });
});
