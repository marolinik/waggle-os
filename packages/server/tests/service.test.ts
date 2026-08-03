import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { startService } from '../src/local/service.js';
import { getLiteLLMStatus, selectLiteLLMPython } from '../src/local/lifecycle.js';
import { PROVIDER_ENV_NAMES } from '../src/local/provider-env.js';
import type { FastifyInstance } from 'fastify';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-svc-test-'));
}

function randomPort(): number {
  return 3333 + Math.floor(Math.random() * 1000);
}

function occupyLoopbackPort(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve occupied test port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function clearProviderEnv(): void {
  for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
    vi.stubEnv(envName, '');
  }
}

describe('Agent Service', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();

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

  it('reports healthy when a fresh local install can use Ollama without a cloud key', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const litellmPort = randomPort();

    clearProviderEnv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/health/liveliness')) {
        return { ok: false, status: 503 } as Response;
      }
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest' },
              { name: 'llama3.2:latest' },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const { server } = await startService({ dataDir, port, litellmPort, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.llm.provider).toBe('ollama');
    expect(body.llm.health).toBe('healthy');
    expect(body.defaultModel).toBe('ollama/llama3.2:latest');
  });

  it('reports the built-in provider proxy degraded until a configured key is verified', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const litellmPort = randomPort();

    clearProviderEnv();
    vi.stubEnv('OPENAI_API_KEY', 'openai-solo-test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/health/liveliness') || url.endsWith('/api/tags')) {
        return { ok: false, status: 503 } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const { server } = await startService({ dataDir, port, litellmPort, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'degraded',
      llm: {
        provider: 'anthropic-proxy',
        health: 'degraded',
      },
    });
    expect(server.agentState.llmProvider.detail).toContain('provider proxy');
    expect(server.agentState.llmProvider.detail).toContain('verification pending');
    expect(server.localConfig.manageLiteLLM).toBe(false);
  });

  it('does not probe or adopt an unrelated LiteLLM when explicitly skipped', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const litellmPort = randomPort();

    clearProviderEnv();
    vi.stubEnv('OPENAI_API_KEY', 'openai-solo-test-key');
    const workerRequests: Array<{ url: string; authorization: string | null }> = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `http://127.0.0.1:${port}/v1/chat/completions`) {
        workerRequests.push({
          url,
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return new Response(JSON.stringify({
          choices: [{
            message: { role: 'assistant', content: 'Isolated sub-agent response.' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 7, completion_tokens: 4 },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 503 });
    });

    const { server, litellm } = await startService({ dataDir, port, litellmPort, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    expect(litellm).toEqual({ status: 'error', port: litellmPort, error: 'Skipped' });
    expect(server.agentState.llmProvider).toMatchObject({
      provider: 'anthropic-proxy',
      health: 'degraded',
    });
    expect(server.localConfig.manageLiteLLM).toBe(false);
    expect(server.localConfig.useBuiltInProxy).toBe(true);
    expect(server.localConfig.litellmUrl).toBe(`http://127.0.0.1:${port}/v1`);
    expect(fetchSpy.mock.calls.some(([input]) => (
      String(input) === `http://localhost:${litellmPort}/health/liveliness`
    ))).toBe(false);

    const spawn = server.agentState.allTools.find(tool => tool.name === 'spawn_agent');
    expect(spawn).toBeDefined();
    const output = await spawn!.execute({
      name: 'Isolation verifier',
      role: 'custom',
      task: 'Confirm the active provider route.',
      tools: [],
      model: 'openrouter/openai/gpt-5.3-codex',
      max_turns: 1,
    });
    expect(output).toContain('Isolated sub-agent response.');
    expect(workerRequests).toEqual([{
      url: `http://127.0.0.1:${port}/v1/chat/completions`,
      authorization: `Bearer ${server.agentState.wsSessionToken}`,
    }]);
  });

  it('atomically falls back from an occupied desktop port and routes spawned agents to it', async () => {
    const base = makeTmpDir();
    tmpDirs.push(base);
    const dataDir = path.join(base, 'data');
    const readyFile = path.join(base, 'desktop-ready.json');
    const blocker = net.createServer();
    const preferredPort = await occupyLoopbackPort(blocker);
    cleanups.push(() => new Promise<void>((resolve) => blocker.close(() => resolve())));

    vi.stubEnv('WAGGLE_DESKTOP_PORT_FALLBACK', '1');
    vi.stubEnv('WAGGLE_INSTANCE_ID', 'desktop-fallback-test');
    vi.stubEnv('WAGGLE_READY_FILE', readyFile);
    vi.stubEnv('WAGGLE_BIND_ALL', '1');
    clearProviderEnv();
    vi.stubEnv('OPENAI_API_KEY', 'openai-solo-test-key');

    const workerRequests: Array<{ url: string; authorization: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/health/liveliness') || url.endsWith('/api/tags')) {
        return new Response('{}', { status: 503 });
      }
      if (url.endsWith('/v1/chat/completions')) {
        workerRequests.push({
          url,
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return new Response(JSON.stringify({
          choices: [{
            message: { role: 'assistant', content: 'Fallback sub-agent response.' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 7, completion_tokens: 4 },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 503 });
    });

    const { server } = await startService({ dataDir, port: preferredPort, skipLiteLLM: true });
    const address = server.server.address();
    expect(address && typeof address === 'object').toBe(true);
    const actualPort = address && typeof address === 'object' ? address.port : 0;
    expect(address && typeof address === 'object' ? address.address : '').toBe('127.0.0.1');
    expect(actualPort).toBeGreaterThan(0);
    expect(actualPort).not.toBe(preferredPort);
    expect(server.localConfig.port).toBe(actualPort);
    expect(server.localConfig.litellmUrl).toBe(`http://127.0.0.1:${actualPort}/v1`);

    expect(JSON.parse(fs.readFileSync(readyFile, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      instanceId: 'desktop-fallback-test',
      pid: process.pid,
      preferredPort,
      port: actualPort,
    });
    expect((await server.inject({ method: 'GET', url: '/health' })).json()).toMatchObject({
      instanceId: 'desktop-fallback-test',
      port: actualPort,
    });

    const spawn = server.agentState.allTools.find(tool => tool.name === 'spawn_agent');
    expect(spawn).toBeDefined();
    expect(await spawn!.execute({
      name: 'Fallback verifier',
      role: 'custom',
      task: 'Confirm the fallback provider route.',
      tools: [],
      model: 'openrouter/openai/gpt-5.3-codex',
      max_turns: 1,
    })).toContain('Fallback sub-agent response.');
    expect(workerRequests).toEqual([{
      url: `http://127.0.0.1:${actualPort}/v1/chat/completions`,
      authorization: `Bearer ${server.agentState.wsSessionToken}`,
    }]);

    await server.close();
    expect(fs.existsSync(readyFile)).toBe(false);
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
  it('skips a Hermes venv without LiteLLM and selects the next working interpreter', () => {
    const hermesPython = 'C:\\Users\\test\\hermes\\venv\\Scripts\\python.exe';
    const systemPython = 'C:\\Python311\\python.exe';
    const probed: string[] = [];

    const selected = selectLiteLLMPython(
      [hermesPython, systemPython],
      (candidate) => {
        probed.push(candidate);
        return candidate === systemPython;
      },
    );

    expect(selected).toBe(systemPython);
    expect(probed).toEqual([hermesPython, systemPython]);
  });

  it('returns null when no discovered interpreter can import LiteLLM', () => {
    expect(selectLiteLLMPython(['python-a', 'python-b'], () => false)).toBeNull();
  });

  it('getLiteLLMStatus returns error when nothing is running', async () => {
    // Use a very unlikely port
    const status = await getLiteLLMStatus(59999);
    expect(status.status).toBe('error');
    expect(status.port).toBe(59999);
    expect(status.error).toContain('not running');
  });
});
