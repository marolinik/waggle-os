/**
 * Characterization tests for the model-health probe on the chat turn path
 * (TD-REL-2).
 *
 * When the tracked provider is not marked healthy, the route asks the proxy
 * whether it can serve a completion before deciding between the agent loop
 * and the setup-required reply. The probe is pinned through a fetch spy; a
 * probe that answers 503 keeps every turn on the setup-required reply, so no
 * model call is needed. The one turn that passes the probe reaches
 * `runAgentLoop`, replaced through a module mock.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { buildLocalServer } from '../../src/local/index.js';
import { MODEL_HEALTH_PROBE_TTL_MS } from '../../src/local/routes/chat-model-health.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

const PROXY_URL = 'http://proxy.test/v1';
const PROVIDER_ENV = [...new Set(Object.values(PROVIDER_ENV_NAMES).flat())];

describe('POST /api/chat model-health probe (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let previousEnv: Map<string, string | undefined>;
  let fetchSpy: MockInstance<typeof fetch>;

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
    vi.useRealTimers();
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

  it('runs the agent loop when the probe answers ok', async () => {
    const respond = fetchSpy.getMockImplementation()!;
    fetchSpy.mockImplementation(async (input, init) => (
      String(input).endsWith('/health/readiness')
        ? new Response(JSON.stringify({ status: 'ready' }), { status: 200 })
        : respond(input, init)
    ));
    loop.runAgentLoop.mockResolvedValueOnce({
      content: 'Here is the plan.', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 },
    });
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message: 'Draft a launch plan', session: 'model-health-ok' },
    });
    expect(res.body).toContain('Here is the plan.');
    expect(res.body).not.toContain('No AI model is ready');
    expect(loop.runAgentLoop).toHaveBeenCalledTimes(1);
  });

  // Until TD-REL-2 every turn probed the proxy again.
  it('reuses one probe result for turns within the TTL', async () => {
    await turn('Draft a launch plan', 'model-health-a');
    await turn('Draft a release note', 'model-health-b');
    expect(probeCalls()).toBe(1);
  });

  it('probes again once the provider status changes', async () => {
    await turn('Draft a launch plan', 'model-health-c');
    server.agentState.llmProvider = { ...server.agentState.llmProvider, checkedAt: new Date().toISOString() };
    await turn('Draft a release note', 'model-health-d');
    expect(probeCalls()).toBe(2);
  });

  it('probes again after the TTL has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await turn('Draft a launch plan', 'model-health-e');
    vi.setSystemTime(Date.now() + MODEL_HEALTH_PROBE_TTL_MS + 1);
    await turn('Draft a release note', 'model-health-f');
    expect(probeCalls()).toBe(2);
  });

  it('shares one in-flight probe between concurrent turns', async () => {
    // A slow proxy keeps the first probe in flight while the second turn
    // reaches the same point.
    const respond = fetchSpy.getMockImplementation()!;
    fetchSpy.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/health/readiness')) await new Promise(r => setTimeout(r, 500));
      return respond(input, init);
    });
    await Promise.all([
      turn('Draft a launch plan', 'model-health-g'),
      turn('Draft a release note', 'model-health-h'),
    ]);
    expect(probeCalls()).toBe(1);
  });
});
