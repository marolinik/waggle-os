/**
 * Local Inference Routes — hardware detection, model recommendations, Ollama management.
 *
 * Uses an in-process clean-room hardware-fit engine (../hardware-detect for the scan,
 * @waggle/agent cookbook for the ranking math). Falls back to RAM-only detection when
 * GPU probes fail. Also checks Ollama and vLLM availability for local model serving.
 *
 * GET  /api/local-inference/hardware    — detect system hardware (GPU, RAM, CPU)
 * GET  /api/local-inference/models      — recommend models that fit this hardware
 * GET  /api/local-inference/status      — check Ollama/vLLM availability + installed models
 * POST /api/local-inference/bootstrap   — install/start the verified managed runtime
 * POST /api/local-inference/pull        — pull a model via Ollama
 */

import type { FastifyInstance } from 'fastify';
import os from 'node:os';
import path from 'node:path';
import { rankModels, OLLAMA_CATALOG } from '@waggle/agent';
import { detectHardware } from '../hardware-detect.js';
import {
  ManagedOllamaRuntime,
  type ManagedOllamaReadyResult,
  type ManagedOllamaStatus,
} from '../managed-ollama-runtime.js';
import { isRemoteOllamaAlias } from '../provider-model-catalog.js';

// Cache the hardware scan: detectHardware() spawns a subprocess (nvidia-smi) on
// non-Apple hosts, and these are unauthenticated, side-effect-free GET routes — so a
// fresh spawn per request is a needless process-spawn DoS lever. Hardware is effectively
// static for a session; a short TTL keeps availableRamGb roughly fresh while bounding
// spawns to at most one per window. The in-flight PROMISE is cached so concurrent
// requests share a single scan (detectHardware never throws — it degrades to a CPU floor).
const HARDWARE_TTL_MS = 60_000;
let hardwareCache: { at: number; promise: ReturnType<typeof detectHardware> } | null = null;

function getHardware(): ReturnType<typeof detectHardware> {
  const now = Date.now();
  if (hardwareCache && now - hardwareCache.at < HARDWARE_TTL_MS) return hardwareCache.promise;
  const promise = detectHardware();
  hardwareCache = { at: now, promise };
  return promise;
}

interface InferenceServerStatus {
  type: 'ollama' | 'vllm' | 'llamacpp' | 'lmstudio';
  available: boolean;
  url: string;
  models: string[];
  cloudModels: string[];
  version?: string;
}

const OLLAMA_MODEL_REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/;

function isValidOllamaModelRef(model: string): boolean {
  if (model.length > 200 || !OLLAMA_MODEL_REF.test(model)) return false;
  const repository = model.split(':', 1)[0] ?? '';
  return repository.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export interface LocalInferenceRuntimeController {
  getStatus(): ManagedOllamaStatus;
  ensureReady(): Promise<ManagedOllamaReadyResult>;
  stop(): Promise<void>;
}

export interface LocalInferenceRouteOptions {
  runtimeFactory?: (dataDir: string, baseUrl: string) => LocalInferenceRuntimeController;
  ollamaProbe?: (baseUrl: string) => Promise<InferenceServerStatus>;
  vllmProbe?: (baseUrl: string) => Promise<InferenceServerStatus>;
}

// ── Ollama / vLLM checks ────────────────────────────────────────────

async function checkOllama(baseUrl: string): Promise<InferenceServerStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { type: 'ollama', available: false, url: baseUrl, models: [], cloudModels: [] };
    const data = await res.json() as { models?: Array<{ name: string; remote_host?: string }> };
    const entries = (data.models ?? []).filter((model) => typeof model.name === 'string' && model.name.length > 0);
    const models = entries
      .filter((model) => !isRemoteOllamaAlias(model.name, model.remote_host))
      .map((model) => model.name);
    const cloudModels = entries
      .filter((model) => isRemoteOllamaAlias(model.name, model.remote_host))
      .map((model) => model.name);
    let version: string | undefined;
    try {
      const vRes = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) });
      if (vRes.ok) version = ((await vRes.json()) as { version?: string }).version;
    } catch { /* ignore */ }
    return { type: 'ollama', available: true, url: baseUrl, models, cloudModels, version };
  } catch {
    return { type: 'ollama', available: false, url: baseUrl, models: [], cloudModels: [] };
  }
}

async function checkVllm(baseUrl: string): Promise<InferenceServerStatus> {
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { type: 'vllm', available: false, url: baseUrl, models: [], cloudModels: [] };
    const data = await res.json() as { data?: Array<{ id: string }> };
    return { type: 'vllm', available: true, url: baseUrl, models: (data.data ?? []).map(m => m.id), cloudModels: [] };
  } catch {
    return { type: 'vllm', available: false, url: baseUrl, models: [], cloudModels: [] };
  }
}

// ── Routes ──────────────────────────────────────────────────────────

export async function localInferenceRoutes(
  fastify: FastifyInstance,
  options: LocalInferenceRouteOptions = {},
) {
  const OLLAMA_URL = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const VLLM_URL = process.env.VLLM_HOST ?? 'http://localhost:8000';
  const dataDir = fastify.localConfig?.dataDir
    || process.env.WAGGLE_DATA_DIR
    || path.join(os.homedir(), '.waggle');
  const runtime = options.runtimeFactory?.(dataDir, OLLAMA_URL)
    ?? new ManagedOllamaRuntime(dataDir, OLLAMA_URL);
  const probeOllama = options.ollamaProbe ?? checkOllama;
  const probeVllm = options.vllmProbe ?? checkVllm;

  fastify.addHook('onClose', async () => {
    await runtime.stop();
  });

  // GET /api/local-inference/hardware — in-process clean-room scan (no external binary)
  fastify.get('/api/local-inference/hardware', async () => {
    const hardware = await getHardware();
    return { hardware, source: 'native', llmfitAvailable: false };
  });

  // GET /api/local-inference/models — rank the curated Ollama catalog against the scan
  fastify.get<{ Querystring: { useCase?: string; limit?: string } }>(
    '/api/local-inference/models',
    async (request) => {
      const limit = Math.max(1, Math.min(Number.parseInt(request.query.limit ?? '20', 10) || 20, 100));
      const hardware = await getHardware();
      const models = rankModels(OLLAMA_CATALOG, hardware, { useCase: request.query.useCase, limit });
      return { models, source: 'native', totalScanned: OLLAMA_CATALOG.length };
    },
  );

  // GET /api/local-inference/status
  fastify.get('/api/local-inference/status', async () => {
    const [ollama, vllm] = await Promise.all([probeOllama(OLLAMA_URL), probeVllm(VLLM_URL)]);
    const servers = [ollama, vllm].filter(s => s.available);
    const localServers = servers.filter((server) => server.models.length > 0);
    const totalLocalModels = localServers.reduce((acc, server) => acc + server.models.length, 0);
    const offlineReady = totalLocalModels > 0;
    const managedRuntime = runtime.getStatus();
    return {
      servers,
      primaryServer: localServers[0] ?? null,
      ollamaInstalled: ollama.available || managedRuntime.installed,
      ollamaRunning: ollama.available,
      ollamaUrl: OLLAMA_URL,
      vllmUrl: VLLM_URL,
      totalLocalModels,
      offlineReady,
      dockerRequired: false,
      managedRuntime,
      setupRequired: !offlineReady,
      setupMessage: offlineReady
        ? null
        : ollama.cloudModels.length > 0
          ? 'Ollama is running, but only cloud aliases are available. Pull an offline model to enable local inference.'
          : managedRuntime.supported
            ? 'Install the private runtime in Waggle, then download an offline model. Docker and a system Ollama install are not required.'
            : 'Start a supported local inference server, then pull an offline model.',
    };
  });

  // Verified runtime download + loopback start. Model weights remain a separate
  // explicit pull so users see the model identity and disk cost before accepting
  // its upstream license.
  fastify.post('/api/local-inference/bootstrap', async (_request, reply) => {
    const existing = await probeOllama(OLLAMA_URL);
    if (existing.available) {
      return {
        ok: true,
        installedNow: false,
        startedNow: false,
        endpoint: OLLAMA_URL,
        server: existing,
        managedRuntime: runtime.getStatus(),
        dockerRequired: false,
      };
    }

    const before = runtime.getStatus();
    if (!before.supported) {
      return reply.code(409).send({
        error: before.reason ?? 'Managed local runtime is unsupported on this platform',
        code: 'MANAGED_RUNTIME_UNSUPPORTED',
        managedRuntime: before,
      });
    }

    try {
      const ready = await runtime.ensureReady();
      const server = await probeOllama(OLLAMA_URL);
      if (!server.available) {
        return reply.code(502).send({
          error: 'Managed local runtime started but failed its loopback health check',
          code: 'MANAGED_RUNTIME_UNHEALTHY',
          managedRuntime: runtime.getStatus(),
        });
      }
      return { ok: true, ...ready, server, dockerRequired: false };
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof Error ? error.message : 'Managed local runtime bootstrap failed',
        code: 'MANAGED_RUNTIME_BOOTSTRAP_FAILED',
        managedRuntime: runtime.getStatus(),
      });
    }
  });

  // POST /api/local-inference/pull
  fastify.post<{ Body: { model: string } }>('/api/local-inference/pull', async (request, reply) => {
    const model = request.body?.model?.trim();
    if (!model) return reply.code(400).send({ error: 'model is required', code: 'MODEL_REQUIRED' });
    if (!isValidOllamaModelRef(model)) {
      return reply.code(400).send({ error: 'model must be a valid Ollama model reference', code: 'INVALID_MODEL_REF' });
    }
    if (isRemoteOllamaAlias(model)) {
      return reply.code(400).send({
        error: 'Ollama cloud aliases are not offline models. Choose a downloadable local model.',
        code: 'REMOTE_MODEL_NOT_LOCAL',
      });
    }
    try {
      const res = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: false }),
        signal: AbortSignal.timeout(45 * 60_000),
      });
      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: `Ollama pull failed: ${text}` });
      }
      const pullStatus = await res.json();
      const installed = await probeOllama(OLLAMA_URL);
      const installedModel = installed.models.find((name) => name === model || name === `${model}:latest`);
      if (!installedModel) {
        return reply.code(502).send({
          error: `Ollama completed the pull but did not advertise "${model}" as a local model`,
          code: 'MODEL_NOT_ADVERTISED_LOCAL',
        });
      }

      const probe = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: installedModel,
          prompt: 'Reply with the single word OK.',
          stream: false,
          think: false,
          options: { temperature: 0, num_predict: 8 },
        }),
        signal: AbortSignal.timeout(5 * 60_000),
      });
      const generation = probe.ok
        ? await probe.json() as { response?: string; done?: boolean }
        : null;
      if (!generation || generation.done !== true || !generation.response?.trim()) {
        return reply.code(502).send({
          error: `Model "${installedModel}" was installed but failed its local generation probe`,
          code: 'MODEL_GENERATION_PROBE_FAILED',
          installed: true,
          model: installedModel,
        });
      }
      return {
        ok: true,
        model: installedModel,
        status: pullStatus,
        verifiedGeneration: true,
        sample: generation.response.trim().slice(0, 40),
      };
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof Error ? error.message : `Ollama not reachable at ${OLLAMA_URL}`,
        code: 'LOCAL_MODEL_SETUP_FAILED',
      });
    }
  });
}
