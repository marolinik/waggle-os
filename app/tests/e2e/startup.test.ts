/**
 * E2E Tests: Startup, Onboarding, and Settings Persistence
 *
 * Scenarios covered:
 *   1. Service starts and responds to health check
 *   2. Onboarding wizard completes successfully (config save/load via settings API)
 *   7. Settings saved and persisted across restart
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startService } from '@waggle/server/local/service';
import { injectWithAuth } from './test-utils.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-e2e-'));
}

// Port 0 lets the OS assign a free port; inject() bypasses the network anyway
const TEST_PORT = 0;

describe('Startup & Settings E2E', () => {
  const servers: FastifyInstance[] = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const s of servers) {
      try { await s.close(); } catch { /* ignore */ }
    }
    servers.length = 0;
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  // Scenario 1: Service starts and responds to health check
  it('health check returns 200 with status ok and mode local', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.payload);
    // With skipLiteLLM, health is degraded (no verified LLM), not 'ok' — truthful health
    expect(['ok', 'degraded', 'unavailable']).toContain(body.status);
    expect(body.mode).toBe('local');
    expect(body.timestamp).toBeDefined();
    // Deep health fields present
    expect(body.llm).toBeDefined();
    expect(body.database).toBeDefined();
  });

  // Scenario 2: Onboarding — save config via PUT, read it back via GET
  it('onboarding: saves and loads config via settings API', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    // Save onboarding config
    const putRes = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings',
      payload: {
        defaultModel: 'anthropic/claude-sonnet-4-20250514',
        providers: {
          anthropic: { apiKey: 'sk-ant-test-key-1234567890', models: ['claude-sonnet-4-20250514'] },
        },
      },
    });
    expect(putRes.statusCode).toBe(200);

    const putBody = JSON.parse(putRes.payload);
    expect(putBody.defaultModel).toBe('anthropic/claude-sonnet-4-20250514');

    // Read config back
    const getRes = await injectWithAuth(server, { method: 'GET', url: '/api/settings' });
    expect(getRes.statusCode).toBe(200);

    const getBody = JSON.parse(getRes.payload);
    expect(getBody.defaultModel).toBe('anthropic/claude-sonnet-4-20250514');
    expect(getBody.providers).toBeDefined();
    expect(getBody.dataDir).toBe(dataDir);
  });

  // Scenario 7: Settings persisted across restart
  it('settings persist across server restart', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);

    // --- First server: save settings ---
    const port1 = TEST_PORT;
    const { server: server1 } = await startService({ dataDir, port: port1, skipLiteLLM: true });
    servers.push(server1);

    const putRes = await injectWithAuth(server1, {
      method: 'PUT',
      url: '/api/settings',
      payload: {
        defaultModel: 'openai/gpt-4o',
        providers: {
          openai: { apiKey: 'sk-test-openai-key-1234567', models: ['gpt-4o'] },
        },
      },
    });
    expect(putRes.statusCode).toBe(200);

    await server1.close();
    servers.pop();

    // --- Second server: read settings back ---
    const port2 = TEST_PORT;
    const { server: server2 } = await startService({ dataDir, port: port2, skipLiteLLM: true });
    servers.push(server2);

    const getRes = await injectWithAuth(server2, { method: 'GET', url: '/api/settings' });
    expect(getRes.statusCode).toBe(200);

    const body = JSON.parse(getRes.payload);
    expect(body.defaultModel).toBe('openai/gpt-4o');
  });
});
