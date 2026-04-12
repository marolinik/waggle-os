/**
 * Local Inference Routes — hardware detection, model recommendations, Ollama management.
 *
 * Uses llmfit CLI binary (if on PATH or at LLMFIT_PATH) for hardware scanning and model scoring.
 * Falls back to basic detection (OS, RAM) when llmfit isn't installed.
 * Also checks Ollama and vLLM availability for local model serving.
 *
 * GET  /api/local-inference/hardware    — detect system hardware (GPU, RAM, CPU)
 * GET  /api/local-inference/models      — recommend models that fit this hardware
 * GET  /api/local-inference/status      — check Ollama/vLLM availability + installed models
 * POST /api/local-inference/pull        — pull a model via Ollama
 */

import type { FastifyInstance } from 'fastify';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface HardwareInfo {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  cpuName: string;
  platform: string;
  hasGpu: boolean;
  gpuName: string | null;
  gpuVramGb: number | null;
  gpuCount: number;
  gpus: Array<{ name: string; vramGb: number; backend: string }>;
  backend: string;
}

interface ModelRecommendation {
  name: string;
  provider: string;
  parameterCount: string;
  paramsB: number;
  useCase: string;
  category: string;
  fitLevel: string;
  score: number;
  scoreComponents: { quality: number; speed: number; fit: number; context: number };
  estimatedTps: number;
  memoryRequiredGb: number;
  memoryAvailableGb: number;
  utilizationPct: number;
  bestQuant: string;
  runMode: string;
  runtime: string;
  contextLength: number;
  isMoe: boolean;
  notes: string[];
}

interface InferenceServerStatus {
  type: 'ollama' | 'vllm' | 'llamacpp' | 'lmstudio';
  available: boolean;
  url: string;
  models: string[];
  version?: string;
}

// ── llmfit CLI integration ──────────────────────────────────────────

function findLlmfitBinary(): string {
  return process.env.LLMFIT_PATH ?? 'llmfit';
}

interface LlmfitResult {
  system: Record<string, unknown>;
  models: Array<Record<string, unknown>>;
  total_models: number;
}

async function callLlmfit(args: string[]): Promise<LlmfitResult | null> {
  const binary = findLlmfitBinary();
  try {
    const { stdout } = await execFileAsync(binary, args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout) as LlmfitResult;
  } catch {
    return null;
  }
}

async function detectHardwareViaLlmfit(): Promise<HardwareInfo | null> {
  const result = await callLlmfit(['recommend', '--json', '--limit', '1']);
  if (!result?.system) return null;
  const sys = result.system;
  return {
    totalRamGb: (sys.total_ram_gb as number) ?? 0,
    availableRamGb: (sys.available_ram_gb as number) ?? 0,
    cpuCores: (sys.cpu_cores as number) ?? 0,
    cpuName: (sys.cpu_name as string) ?? 'Unknown',
    platform: `${os.platform()} ${os.arch()}`,
    hasGpu: (sys.has_gpu as boolean) ?? false,
    gpuName: (sys.gpu_name as string) ?? null,
    gpuVramGb: (sys.gpu_vram_gb as number) ?? null,
    gpuCount: (sys.gpu_count as number) ?? 0,
    gpus: ((sys.gpus as Array<{ name: string; vram_gb: number; backend: string }>) ?? []).map(g => ({
      name: g.name, vramGb: g.vram_gb, backend: g.backend,
    })),
    backend: (sys.backend as string) ?? `CPU (${os.arch()})`,
  };
}

async function getModelsViaLlmfit(useCase?: string, limit = 20): Promise<ModelRecommendation[]> {
  const args = ['recommend', '--json', '--limit', String(limit)];
  if (useCase) args.push('--use-case', useCase);
  const result = await callLlmfit(args);
  if (!result?.models) return [];
  return result.models.map((m: Record<string, unknown>) => ({
    name: (m.name as string) ?? '',
    provider: (m.provider as string) ?? '',
    parameterCount: (m.parameter_count as string) ?? '',
    paramsB: (m.params_b as number) ?? 0,
    useCase: (m.use_case as string) ?? '',
    category: (m.category as string) ?? '',
    fitLevel: (m.fit_level as string) ?? 'marginal',
    score: (m.score as number) ?? 0,
    scoreComponents: (m.score_components as { quality: number; speed: number; fit: number; context: number }) ?? { quality: 0, speed: 0, fit: 0, context: 0 },
    estimatedTps: (m.estimated_tps as number) ?? 0,
    memoryRequiredGb: (m.memory_required_gb as number) ?? 0,
    memoryAvailableGb: (m.memory_available_gb as number) ?? 0,
    utilizationPct: (m.utilization_pct as number) ?? 0,
    bestQuant: (m.best_quant as string) ?? '',
    runMode: (m.run_mode as string) ?? '',
    runtime: (m.runtime_label as string) ?? '',
    contextLength: (m.context_length as number) ?? 0,
    isMoe: (m.is_moe as boolean) ?? false,
    notes: (m.notes as string[]) ?? [],
  }));
}

// ── Basic fallback (no llmfit) ──────────────────────────────────────

function detectHardwareBasic(): HardwareInfo {
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
    gpuCount: 0,
    gpus: [],
    backend: cpus[0]?.model?.includes('Apple') ? 'Metal (Apple Silicon)' : `CPU (${os.arch()})`,
  };
}

function basicModelRecommendations(ramGb: number): ModelRecommendation[] {
  const models: ModelRecommendation[] = [];
  const base = { scoreComponents: { quality: 0, speed: 0, fit: 0, context: 0 }, memoryAvailableGb: ramGb, utilizationPct: 0, isMoe: false, notes: [] as string[], runtime: 'Ollama' };
  if (ramGb >= 8) models.push({ ...base, name: 'llama3.2:3b', provider: 'Meta', parameterCount: '3B', paramsB: 3, useCase: 'General chat', category: 'General', fitLevel: 'Good', score: 75, estimatedTps: 30, memoryRequiredGb: 2.5, bestQuant: 'Q4_K_M', runMode: 'CPU', contextLength: 8192 });
  if (ramGb >= 16) models.push({ ...base, name: 'qwen2.5-coder:7b', provider: 'Qwen', parameterCount: '7B', paramsB: 7, useCase: 'Code generation', category: 'Coding', fitLevel: 'Good', score: 82, estimatedTps: 15, memoryRequiredGb: 5.5, bestQuant: 'Q4_K_M', runMode: 'CPU', contextLength: 32768 });
  if (ramGb >= 16) models.push({ ...base, name: 'mistral:7b', provider: 'Mistral', parameterCount: '7B', paramsB: 7, useCase: 'General chat', category: 'General', fitLevel: 'Good', score: 80, estimatedTps: 14, memoryRequiredGb: 5.2, bestQuant: 'Q4_K_M', runMode: 'CPU', contextLength: 32768 });
  if (ramGb >= 32) models.push({ ...base, name: 'llama3.3:70b', provider: 'Meta', parameterCount: '70B', paramsB: 70, useCase: 'General chat', category: 'General', fitLevel: 'Marginal', score: 90, estimatedTps: 3, memoryRequiredGb: 24, bestQuant: 'Q4_K_M', runMode: 'CPU', contextLength: 8192 });
  return models;
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

  // GET /api/local-inference/hardware
  fastify.get('/api/local-inference/hardware', async () => {
    const llmfit = await detectHardwareViaLlmfit();
    if (llmfit) return { hardware: llmfit, source: 'llmfit', llmfitAvailable: true };
    return { hardware: detectHardwareBasic(), source: 'basic', llmfitAvailable: false };
  });

  // GET /api/local-inference/models
  fastify.get<{ Querystring: { useCase?: string; limit?: string } }>(
    '/api/local-inference/models',
    async (request) => {
      const limit = parseInt(request.query.limit ?? '20', 10);
      const models = await getModelsViaLlmfit(request.query.useCase, limit);
      if (models.length > 0) return { models, source: 'llmfit', totalScanned: models.length };
      const ram = os.totalmem() / (1024 ** 3);
      return { models: basicModelRecommendations(ram), source: 'basic', totalScanned: 0 };
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
