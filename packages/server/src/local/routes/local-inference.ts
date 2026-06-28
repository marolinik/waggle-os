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
 * POST /api/local-inference/pull        — pull a model via Ollama
 */

import type { FastifyInstance } from 'fastify';
import { rankModels, OLLAMA_CATALOG } from '@waggle/agent';
import { detectHardware } from '../hardware-detect.js';

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
  version?: string;
}

// ── Ollama / vLLM checks ────────────────────────────────────────────

async function checkOllama(baseUrl: string): Promise<InferenceServerStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { type: 'ollama', available: false, url: baseUrl, models: [] };
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map(m => m.name);
    let version: string | undefined;
    try {
      const vRes = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) });
      if (vRes.ok) version = ((await vRes.json()) as { version?: string }).version;
    } catch { /* ignore */ }
    return { type: 'ollama', available: true, url: baseUrl, models, version };
  } catch {
    return { type: 'ollama', available: false, url: baseUrl, models: [] };
  }
}

async function checkVllm(baseUrl: string): Promise<InferenceServerStatus> {
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { type: 'vllm', available: false, url: baseUrl, models: [] };
    const data = await res.json() as { data?: Array<{ id: string }> };
    return { type: 'vllm', available: true, url: baseUrl, models: (data.data ?? []).map(m => m.id) };
  } catch {
    return { type: 'vllm', available: false, url: baseUrl, models: [] };
  }
}

// ── Routes ──────────────────────────────────────────────────────────

export async function localInferenceRoutes(fastify: FastifyInstance) {
  const OLLAMA_URL = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const VLLM_URL = process.env.VLLM_HOST ?? 'http://localhost:8000';

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
    const [ollama, vllm] = await Promise.all([checkOllama(OLLAMA_URL), checkVllm(VLLM_URL)]);
    const servers = [ollama, vllm].filter(s => s.available);
    return {
      servers,
      primaryServer: servers[0] ?? null,
      ollamaInstalled: ollama.available,
      ollamaUrl: OLLAMA_URL,
      vllmUrl: VLLM_URL,
      totalLocalModels: servers.reduce((acc, s) => acc + s.models.length, 0),
    };
  });

  // POST /api/local-inference/pull
  fastify.post<{ Body: { model: string } }>('/api/local-inference/pull', async (request, reply) => {
    const { model } = request.body;
    if (!model) return reply.code(400).send({ error: 'model is required' });
    try {
      const res = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: false }),
        signal: AbortSignal.timeout(600000),
      });
      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: `Ollama pull failed: ${text}` });
      }
      return { ok: true, model, status: await res.json() };
    } catch {
      return reply.code(502).send({ error: `Ollama not reachable at ${OLLAMA_URL}` });
    }
  });
}
