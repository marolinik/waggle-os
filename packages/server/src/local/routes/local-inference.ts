/**
 * Local Inference Routes — hardware detection, model recommendations, Ollama management.
 *
 * Uses llmfit (if available) for hardware scanning and model scoring.
 * Falls back to basic detection (OS, RAM) when llmfit isn't installed.
 *
 * GET  /api/local-inference/hardware    — detect system hardware
 * GET  /api/local-inference/models      — recommend models for this hardware
 * GET  /api/local-inference/status      — check Ollama/vLLM/llama.cpp availability
 * POST /api/local-inference/pull        — pull a model via Ollama
 */

import type { FastifyInstance } from 'fastify';
import os from 'node:os';

interface HardwareInfo {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  cpuName: string;
  platform: string;
  hasGpu: boolean;
  gpuName: string | null;
  gpuVramGb: number | null;
  backend: string;
}

interface ModelRecommendation {
  name: string;
  provider: string;
  parameterCount: string;
  useCase: string;
  fitLevel: 'perfect' | 'good' | 'marginal' | 'too_large';
  score: number;
  estimatedTps: number;
  memoryRequiredGb: number;
  bestQuant: string;
  runMode: string;
}

interface InferenceServerStatus {
  type: 'ollama' | 'vllm' | 'llamacpp' | 'lmstudio' | 'none';
  available: boolean;
  url: string;
  models: string[];
  version?: string;
}

async function detectHardwareBasic(): Promise<HardwareInfo> {
  const totalRam = os.totalmem() / (1024 ** 3);
  const freeRam = os.freemem() / (1024 ** 3);
  const cpus = os.cpus();
  return {
    totalRamGb: Math.round(totalRam * 10) / 10,
    availableRamGb: Math.round(freeRam * 10) / 10,
    cpuCores: cpus.length,
    cpuName: cpus[0]?.model ?? 'Unknown',
    platform: `${os.platform()} ${os.arch()}`,
    hasGpu: false,
    gpuName: null,
    gpuVramGb: null,
    backend: cpus[0]?.model?.includes('Apple') ? 'Metal (Apple Silicon)' : `CPU (${os.arch()})`,
  };
}

async function detectHardwareLlmfit(llmfitUrl: string): Promise<HardwareInfo | null> {
  try {
    const res = await fetch(`${llmfitUrl}/api/v1/system`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json() as { system: Record<string, unknown> };
    const sys = data.system;
    return {
      totalRamGb: (sys.total_ram_gb as number) ?? 0,
      availableRamGb: (sys.available_ram_gb as number) ?? 0,
      cpuCores: (sys.cpu_cores as number) ?? 0,
      cpuName: (sys.cpu_name as string) ?? 'Unknown',
      platform: `${os.platform()} ${os.arch()}`,
      hasGpu: (sys.has_gpu as boolean) ?? false,
      gpuName: (sys.gpu_name as string) ?? null,
      gpuVramGb: (sys.gpu_vram_gb as number) ?? null,
      backend: (sys.backend as string) ?? `CPU (${os.arch()})`,
    };
  } catch {
    return null;
  }
}

async function getModelsFromLlmfit(llmfitUrl: string, useCase?: string): Promise<ModelRecommendation[]> {
  try {
    let url = `${llmfitUrl}/api/v1/models?fit=runnable&limit=20`;
    if (useCase) url += `&use_case=${encodeURIComponent(useCase)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json() as { models: Array<Record<string, unknown>> };
    return (data.models ?? []).map(m => ({
      name: (m.name as string) ?? '',
      provider: (m.provider as string) ?? '',
      parameterCount: (m.parameter_count as string) ?? '',
      useCase: (m.use_case as string) ?? '',
      fitLevel: (m.fit_level as 'perfect' | 'good' | 'marginal' | 'too_large') ?? 'marginal',
      score: (m.score as number) ?? 0,
      estimatedTps: (m.estimated_tps as number) ?? 0,
      memoryRequiredGb: (m.memory_required_gb as number) ?? 0,
      bestQuant: (m.best_quant as string) ?? '',
      runMode: (m.run_mode_label as string) ?? '',
    }));
  } catch {
    return [];
  }
}

async function checkOllama(baseUrl: string): Promise<InferenceServerStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { type: 'ollama', available: false, url: baseUrl, models: [] };
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map(m => m.name);

    // Get version
    let version: string | undefined;
    try {
      const vRes = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) });
      if (vRes.ok) {
        const vData = await vRes.json() as { version?: string };
        version = vData.version;
      }
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

export async function localInferenceRoutes(fastify: FastifyInstance) {
  const OLLAMA_URL = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const VLLM_URL = process.env.VLLM_HOST ?? 'http://localhost:8000';
  const LLMFIT_URL = process.env.LLMFIT_URL ?? 'http://localhost:8787';

  // GET /api/local-inference/hardware — detect system hardware
  fastify.get('/api/local-inference/hardware', async () => {
    const llmfit = await detectHardwareLlmfit(LLMFIT_URL);
    const hardware = llmfit ?? await detectHardwareBasic();
    return { hardware, source: llmfit ? 'llmfit' : 'basic' };
  });

  // GET /api/local-inference/models — recommend models for this hardware
  fastify.get<{ Querystring: { useCase?: string; limit?: string } }>(
    '/api/local-inference/models',
    async (request) => {
      const models = await getModelsFromLlmfit(LLMFIT_URL, request.query.useCase);
      if (models.length > 0) {
        return { models, source: 'llmfit' };
      }
      // Fallback: basic recommendations based on RAM
      const ram = os.totalmem() / (1024 ** 3);
      const fallback: ModelRecommendation[] = [];
      if (ram >= 8) fallback.push({ name: 'llama3.2:3b', provider: 'Meta', parameterCount: '3B', useCase: 'General', fitLevel: 'good', score: 75, estimatedTps: 30, memoryRequiredGb: 2.5, bestQuant: 'Q4_K_M', runMode: 'CPU' });
      if (ram >= 16) fallback.push({ name: 'qwen2.5-coder:7b', provider: 'Qwen', parameterCount: '7B', useCase: 'Coding', fitLevel: 'good', score: 82, estimatedTps: 15, memoryRequiredGb: 5.5, bestQuant: 'Q4_K_M', runMode: 'CPU' });
      if (ram >= 32) fallback.push({ name: 'llama3.3:70b', provider: 'Meta', parameterCount: '70B', useCase: 'General', fitLevel: 'marginal', score: 90, estimatedTps: 3, memoryRequiredGb: 24, bestQuant: 'Q4_K_M', runMode: 'CPU' });
      return { models: fallback, source: 'basic' };
    },
  );

  // GET /api/local-inference/status — check all local inference servers
  fastify.get('/api/local-inference/status', async () => {
    const [ollama, vllm] = await Promise.all([
      checkOllama(OLLAMA_URL),
      checkVllm(VLLM_URL),
    ]);
    const servers = [ollama, vllm].filter(s => s.available);
    return {
      servers,
      primaryServer: servers[0] ?? null,
      ollamaInstalled: ollama.available,
      totalLocalModels: servers.reduce((acc, s) => acc + s.models.length, 0),
    };
  });

  // POST /api/local-inference/pull — pull a model via Ollama
  fastify.post<{ Body: { model: string } }>('/api/local-inference/pull', async (request, reply) => {
    const { model } = request.body;
    if (!model) return reply.code(400).send({ error: 'model is required' });

    try {
      const res = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: false }),
        signal: AbortSignal.timeout(600000), // 10 min timeout for large models
      });
      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: `Ollama pull failed: ${text}` });
      }
      const data = await res.json();
      return { ok: true, model, status: data };
    } catch (err) {
      return reply.code(502).send({ error: `Ollama not reachable at ${OLLAMA_URL}` });
    }
  });
}
