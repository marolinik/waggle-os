/**
 * Characterization tests for the model-health probe on the chat turn path
 * (TD-REL-2).
 *
 * When the tracked provider is not marked healthy, the route asks the proxy
 * whether it can serve a completion before deciding between the agent loop
 * and the setup-required reply. The probe is pinned through a fetch spy; a
 * probe that answers 503 keeps every turn on the setup-required reply, so no
 * model call is needed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

const PROXY_URL = 'http://proxy.test/v1';
const PROVIDER_ENV = [...new Set(Object.values(PROVIDER_ENV_NAMES).flat())];

describe('POST /api/chat model-health probe (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let previousEnv: Map<string, string | undefined>;
  let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-model-health-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.localConfig.litellmUrl = PROXY_URL;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  beforeEach(() => {
    previousEnv = new Map(PROVIDER_ENV.map((name) => [name, process.env[name]]));
    for (const name of PROVIDER_ENV) delete process.env[name];
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: 'Built-in provider proxy (no API key)',
      checkedAt: new Date().toISOString(),
    };
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.endsWith('/health/readiness')) {
        return new Response(JSON.stringify({ status: 'unavailable' }), { status: 503 });
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected call' } }), { status: 500 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const probeCalls = () => fetchSpy.mock.calls
    .filter(([input]) => String(input) === `${PROXY_URL}/health/readiness`).length;

  async function turn(message: string, session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload: { message, session } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('No AI model is ready');
    return res;
  }

  it('QUIRK: probes the proxy again on every turn (TD-REL-2)', async () => {
    await turn('Draft a launch plan', 'model-health-a');
    await turn('Draft a release note', 'model-health-b');
    expect(probeCalls()).toBe(2);
  });
});
