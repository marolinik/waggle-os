/**
 * Cookbook local-model fit engine — clean-room TypeScript port of the *algorithm*
 * behind Odysseus hwfit `fit.py` + `models.py` (memory-bandwidth tok/s, harmonic
 * CPU-offload blend, MoE active-param math, weighted quality/speed/fit/context
 * composite, arch-age + version tiebreak). No Odysseus code copied; no binary bundled.
 *
 * Pure & deterministic — all hardware/catalog data is injected. Unit-tested.
 */
import {
  QUANT_HIERARCHY, QUANT_BYTES_PER_PARAM, QUANT_SPEED_MULT, QUANT_QUALITY_PENALTY,
  DEFAULT_BPP, DEFAULT_SPEED_MULT,
} from './quant-tables.js';
import { lookupBandwidth, FALLBACK_K } from './gpu-bandwidth.js';
import { type CatalogModel } from './catalog.js';

// ── Calibrated constants (from Odysseus fit.py, ported as named constants) ──
const GPU_EFFICIENCY = 0.55;     // realized fraction of peak bandwidth
const CPU_OFFLOAD_BW = 55.0;     // dual-channel DDR4/5 effective GB/s
const MOE_SPEED_PENALTY = 0.8;   // mixed-dtype/expert dispatch overhead
const RUNTIME_BUFFER_GB = 0.5;   // KV/compute base buffer
const KV_PER_B_PER_TOKEN = 0.000008; // GB per active-billion-param per ctx token
const MIN_CTX = 1024;            // context-shrink floor

export type RunMode = 'gpu' | 'cpu_offload' | 'cpu_only' | 'no_fit';
export type FitLevel = 'perfect' | 'good' | 'marginal' | 'too_tight';

/** Hardware input — a structural SUBSET of the route's HardwareInfo (assignable). */
export interface Hardware {
  readonly totalRamGb: number;
  readonly availableRamGb: number;
  readonly hasGpu: boolean;
  readonly gpuName: string | null;
  readonly gpuVramGb: number | null;
  readonly gpuCount: number;
  readonly backend: string;
  readonly platform: string; // `${os.platform()} ${os.arch()}`
}

/** Output — MUST match local-inference.ts ModelRecommendation exactly. */
export interface ModelRecommendation {
  name: string;
  provider: string;
  parameterCount: string;
  paramsB: number;
  useCase: string;
  category: string;
  fitLevel: FitLevel;
  score: number;
  scoreComponents: { quality: number; speed: number; fit: number; context: number };
  estimatedTps: number;
  memoryRequiredGb: number;
  memoryAvailableGb: number;
  utilizationPct: number;
  bestQuant: string;
  runMode: RunMode;
  runtime: string;
  contextLength: number;
  isMoe: boolean;
  notes: string[];
}

export interface RankOptions {
  useCase?: string;          // scoring use-case (general/coding/reasoning/...)
  limit?: number;            // top-N (default 20)
  quant?: string;            // force a single quant (skip the best-fit ladder)
  fitOnly?: boolean;         // drop too_tight rows
  search?: string;           // name/provider substring filter
}

// USE_CASE_WEIGHTS: (quality, speed, fit, context). Ported from fit.py.
const USE_CASE_WEIGHTS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  general: [0.45, 0.30, 0.15, 0.10],
  coding: [0.50, 0.20, 0.15, 0.15],
  reasoning: [0.55, 0.15, 0.15, 0.15],
  chat: [0.40, 0.35, 0.15, 0.10],
  multimodal: [0.50, 0.20, 0.15, 0.15],
};
const DEFAULT_WEIGHTS = USE_CASE_WEIGHTS.general;

const SPEED_TARGET: Readonly<Record<string, number>> = {
  general: 40, coding: 40, multimodal: 40, chat: 40, reasoning: 25,
};
const CONTEXT_TARGET: Readonly<Record<string, number>> = {
  general: 4096, chat: 4096, coding: 8192, reasoning: 8192, multimodal: 4096,
};

const KNOWN_USE_CASES: ReadonlySet<string> = new Set(Object.keys(USE_CASE_WEIGHTS));

/** Sanitize a (possibly query-supplied) use-case to a known key before it indexes the
 *  scoring Records — guards against inherited keys like '__proto__' (which are non-null,
 *  so a `?? default` would not fire, and array-destructuring them throws). Unknown → 'general'. */
export function normalizeUseCase(uc: string | undefined): string {
  return uc && KNOWN_USE_CASES.has(uc) ? uc : 'general';
}

// ── Pure helpers ───────────────────────────────────────────────────────────

export function activeParamsB(model: CatalogModel): number {
  return model.isMoe && model.activeParamsB && model.activeParamsB > 0
    ? model.activeParamsB
    : model.paramsB;
}

/** VRAM/RAM (GB) to serve `model` at `quant` and `ctx`. All weights resident even
 *  for MoE; KV cache scales with ACTIVE params. Port of estimate_memory_gb. */
export function estimateMemoryGb(model: CatalogModel, quant: string, ctx: number): number {
  const bpp = QUANT_BYTES_PER_PARAM[quant] ?? DEFAULT_BPP;
  const kvParams = activeParamsB(model);
  return model.paramsB * bpp + KV_PER_B_PER_TOKEN * kvParams * ctx + RUNTIME_BUFFER_GB;
}

/** Normalize backend → cpu_x86 | cpu_arm for the fallback speed path. */
export function canonicalCpuBackend(hw: Hardware): 'cpu_x86' | 'cpu_arm' {
  const platform = hw.platform.toLowerCase();
  const backend = hw.backend.toLowerCase();
  if (platform.includes('arm64') || platform.includes('aarch64')) return 'cpu_arm';
  if (backend.includes('apple') || backend.includes('metal')) return 'cpu_arm';
  return 'cpu_x86';
}

/** tok/s estimate. Memory-bandwidth model on GPU/offload; per-param fallback on CPU.
 *  Port of _estimate_speed (harmonic CPU-offload blend, MoE ×0.8). */
export function estimateTps(
  model: CatalogModel, quant: string, runMode: RunMode, hw: Hardware, offloadFrac = 0,
): number {
  const activePb = activeParamsB(model);
  if (activePb <= 0) return 0;
  const bw = lookupBandwidth(hw.gpuName);

  if (bw && (runMode === 'gpu' || runMode === 'cpu_offload')) {
    const bpp = QUANT_BYTES_PER_PARAM[quant] ?? DEFAULT_BPP;
    const modelGb = activePb * bpp; // bytes READ per token (active experts only)
    if (modelGb <= 0) return 0;
    if (runMode === 'cpu_offload') {
      let frac = Math.min(Math.max(offloadFrac, 0), 1);
      if (frac <= 0) frac = 0.5; // unknown spill → assume meaningful
      const effBw = 1 / (frac / CPU_OFFLOAD_BW + (1 - frac) / bw); // harmonic blend
      const raw = (effBw / modelGb) * GPU_EFFICIENCY;
      return model.isMoe ? raw * MOE_SPEED_PENALTY : raw;
    }
    const raw = (bw / modelGb) * GPU_EFFICIENCY;
    return model.isMoe ? raw * MOE_SPEED_PENALTY : raw;
  }

  // CPU-only (or GPU not in the bandwidth table): per-active-param fallback.
  const backend = canonicalCpuBackend(hw);
  const k = FALLBACK_K[backend] ?? 70;
  const sm = QUANT_SPEED_MULT[quant] ?? DEFAULT_SPEED_MULT;
  return (k / activePb) * sm;
}

/** Base quality by size + family/arch/quant/use-case adjustments. Port of _quality_score. */
export function qualityScore(model: CatalogModel, quant: string, useCase: string): number {
  const pb = model.paramsB;
  let base: number;
  if (pb < 1) base = 30;
  else if (pb < 3) base = 45;
  else if (pb < 7) base = 60;
  else if (pb < 10) base = 75;
  else if (pb < 20) base = 82;
  else if (pb < 40) base = 89;
  else base = 95;

  const n = model.name.toLowerCase();
  if (n.includes('qwen')) base += 2;
  if (n.includes('deepseek')) base += 3;
  if (n.includes('llama')) base += 2;
  if (n.includes('mistral') || n.includes('mixtral')) base += 1;
  if (n.includes('gemma')) base += 1;

  base += archAgeBonus(model.name);
  base += QUANT_QUALITY_PENALTY[quant] ?? 0;

  const modelUc = inferUseCase(model);
  if (modelUc === 'coding' && useCase === 'coding') base += 6;
  else if (modelUc === 'coding' && (useCase === 'general' || useCase === 'chat')) base -= 10;
  if (modelUc === 'reasoning' && useCase === 'reasoning' && pb >= 13) base += 5;
  else if (modelUc === 'reasoning' && useCase === 'chat') base -= 4;
  if (modelUc === 'multimodal' && useCase === 'multimodal') base += 6;

  return Math.max(0, Math.min(100, base));
}

export function speedScore(tps: number, useCase: string): number {
  const target = SPEED_TARGET[useCase] ?? 40;
  return Math.max(0, Math.min(100, (tps / target) * 100));
}

/** Fit score — peaks at 0.5–0.8 VRAM utilization. Port of _fit_score. */
export function fitScore(required: number, available: number): number {
  if (required > available) return 0;
  if (available <= 0) return 0;
  const ratio = required / available;
  if (ratio <= 0.5) return 60 + (ratio / 0.5) * 40;
  if (ratio <= 0.8) return 100;
  if (ratio <= 0.9) return 70;
  return 50;
}

export function contextScore(ctx: number, useCase: string): number {
  const target = CONTEXT_TARGET[useCase] ?? 4096;
  if (ctx >= target) return 100;
  if (ctx >= target / 2) return 70;
  return 30;
}

/** Small architecture-recency bonus (Qwen ladder). Port of _architecture_bonus. */
export function archAgeBonus(name: string): number {
  const t = name.toLowerCase();
  if (t.includes('qwen3.6') || t.includes('qwen3_6')) return 9;
  if (t.includes('qwen3.5') || t.includes('qwen3_5')) return 8;
  if (t.includes('qwen3-next') || t.includes('qwen3_next')) return 6;
  if (t.includes('qwen3')) return 4;
  if (t.includes('qwen2.5') || t.includes('qwen2_5')) return 2;
  return 0;
}

/** Parse a version float from a display name for the score tiebreak. Port of _version_key.
 *  'MiniMax-M2.7'→2.7, 'Qwen3.6-35B'→3.6, 'Qwen3-235B'→3 (235 skipped), 'M2'→2. */
export function versionKey(name: string): number {
  if (!name) return 0;
  const re = /[A-Za-z](\d+(?:\.\d+)?)(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    const raw = m[1];
    const f = Number.parseFloat(raw);
    if (Number.isNaN(f)) continue;
    if (!raw.includes('.') && f >= 100) continue; // bare ≥100 = param count, not version
    return f;
  }
  return 0;
}

export function inferUseCase(model: CatalogModel): string {
  if (model.useCase) return model.useCase;
  const c = `${model.name} ${model.family}`.toLowerCase();
  if (c.includes('embed') || c.includes('bge')) return 'embedding';
  if (c.includes('code')) return 'coding';
  if (c.includes('vision') || c.includes('-vl') || c.includes('multimodal')) return 'multimodal';
  if (c.includes('r1') || c.includes('reason')) return 'reasoning';
  return 'general';
}

// ── Serve-path gating (scope-cut) ───────────────────────────────────────────
/** Apple Silicon / Windows / consumer-AMD can only serve GGUF (Ollama/llama.cpp).
 *  Every curated row IS GGUF, so this never drops a catalog row today — it guards
 *  against a future non-GGUF entry. Port of the serve-path-truth concept. */
export function isServable(model: CatalogModel, hw: Hardware): boolean {
  const isGguf = model.gguf !== false;
  if (isGguf) return true;
  const platform = hw.platform.toLowerCase();
  const backend = hw.backend.toLowerCase();
  const gpu = (hw.gpuName ?? '').toLowerCase();
  const appleSilicon = platform.includes('darwin') || backend.includes('metal') || backend.includes('apple');
  const isWindows = platform.includes('win32') || platform.includes('windows');
  const consumerAmd = /radeon|rx\s?\d{4}|\b9070\b|\b7900\b/.test(gpu) && !/instinct|mi\d{3}/.test(gpu);
  // Non-GGUF model: only CUDA/Linux can serve it (vLLM); gate out Apple/Win/RDNA.
  return !(appleSilicon || isWindows || consumerAmd);
}

// ── Fit resolution ──────────────────────────────────────────────────────────
interface FitResult {
  runMode: Exclude<RunMode, 'no_fit'>;
  quant: string;
  ctx: number;
  requiredGb: number;
}

/** Pick best-fitting quant + run mode. GPU-resident (best quant first, then shrink
 *  ctx) → offload → cpu_only. Returns null = doesn't fit anywhere (too_tight).
 *  Adapts _try_quant_at + best_quant_for_budget. */
function resolveFit(model: CatalogModel, hw: Hardware, opts: RankOptions): FitResult | null {
  const vram = hw.hasGpu && hw.gpuVramGb && hw.gpuVramGb > 0 ? hw.gpuVramGb : 0;
  const ram = hw.availableRamGb > 0 ? hw.availableRamGb : 0;
  const ladder = opts.quant ? [opts.quant] : [...QUANT_HIERARCHY];
  const fullCtx = model.contextLength > 0 ? model.contextLength : 4096;

  // GPU-resident: prefer full ctx with the best quant that fits VRAM; shrink ctx if needed.
  if (vram > 0) {
    for (let ctx = fullCtx; ctx >= MIN_CTX; ) {
      for (const q of ladder) {
        const mem = estimateMemoryGb(model, q, ctx);
        if (mem <= vram) return { runMode: 'gpu', quant: q, ctx, requiredGb: mem };
      }
      if (ctx === MIN_CTX) break;
      ctx = Math.max(MIN_CTX, Math.floor(ctx / 2)); // clamp so the MIN_CTX floor is always tested
    }
    // Offload: doesn't fit VRAM but fits system RAM (spills experts/layers).
    for (const q of ladder) {
      const mem = estimateMemoryGb(model, q, fullCtx);
      if (mem <= ram) return { runMode: 'cpu_offload', quant: q, ctx: fullCtx, requiredGb: mem };
    }
    return null;
  }

  // No GPU: CPU-only. Best quant that fits RAM, shrinking ctx.
  for (let ctx = fullCtx; ctx >= MIN_CTX; ) {
    for (const q of ladder) {
      const mem = estimateMemoryGb(model, q, ctx);
      if (mem <= ram) return { runMode: 'cpu_only', quant: q, ctx, requiredGb: mem };
    }
    if (ctx === MIN_CTX) break;
    ctx = Math.max(MIN_CTX, Math.floor(ctx / 2));
  }
  return null;
}

function fitLevelFor(runMode: RunMode, requiredGb: number, budget: number, ram: number): FitLevel {
  if (runMode === 'gpu') {
    const ratio = budget > 0 ? requiredGb / budget : 1;
    if (ratio <= 0.7) return 'perfect';
    if (ratio <= 0.9) return 'good';
    return 'marginal';
  }
  if (runMode === 'cpu_offload') return ram >= requiredGb * 1.2 ? 'good' : 'marginal';
  return 'marginal'; // cpu_only
}

function analyzeModel(model: CatalogModel, hw: Hardware, opts: RankOptions): ModelRecommendation {
  const scoreUseCase = normalizeUseCase(opts.useCase);
  const modelUseCase = inferUseCase(model);
  const category = modelUseCase.charAt(0).toUpperCase() + modelUseCase.slice(1);
  const vram = hw.hasGpu && hw.gpuVramGb && hw.gpuVramGb > 0 ? hw.gpuVramGb : 0;
  const ram = hw.availableRamGb;
  const fit = resolveFit(model, hw, opts);

  if (!fit) {
    const q = opts.quant ?? QUANT_HIERARCHY[3]; // Q4_K_M reference
    const required = estimateMemoryGb(model, q, model.contextLength || 4096);
    return {
      name: model.name, provider: model.provider, parameterCount: model.parameterCount,
      paramsB: model.paramsB, useCase: modelUseCase, category,
      fitLevel: 'too_tight', score: 0,
      scoreComponents: { quality: 0, speed: 0, fit: 0, context: 0 },
      estimatedTps: 0, memoryRequiredGb: round1(required),
      memoryAvailableGb: vram > 0 ? vram : ram, utilizationPct: 0,
      bestQuant: q, runMode: 'no_fit', runtime: 'Ollama',
      contextLength: model.contextLength, isMoe: model.isMoe,
      notes: ['Exceeds available memory at the smallest quant.'],
    };
  }

  const budget = fit.runMode === 'gpu' ? vram : ram;
  let offloadFrac = 0;
  if (fit.runMode === 'cpu_offload' && fit.requiredGb > 0 && vram > 0) {
    offloadFrac = Math.max(0, (fit.requiredGb - vram) / fit.requiredGb);
  }
  const tps = estimateTps(model, fit.quant, fit.runMode, hw, offloadFrac);
  const quality = qualityScore(model, fit.quant, scoreUseCase);
  const speed = speedScore(tps, scoreUseCase);
  const fitS = fitScore(fit.requiredGb, budget);
  const ctxS = contextScore(fit.ctx, scoreUseCase);
  const [wq, ws, wf, wc] = USE_CASE_WEIGHTS[scoreUseCase] ?? DEFAULT_WEIGHTS;
  const composite = quality * wq + speed * ws + fitS * wf + ctxS * wc;

  const notes: string[] = [];
  if (fit.runMode === 'cpu_offload') notes.push('Partially offloaded to system RAM (slower).');
  if (fit.runMode === 'cpu_only') notes.push('Runs on CPU — no compatible GPU detected.');
  if (model.isMoe) notes.push(`Mixture-of-Experts: ~${activeParamsB(model)}B active per token.`);
  if (fit.ctx < (model.contextLength || 0)) notes.push(`Context reduced to ${fit.ctx} to fit memory.`);

  return {
    name: model.name, provider: model.provider, parameterCount: model.parameterCount,
    paramsB: model.paramsB, useCase: modelUseCase, category,
    fitLevel: fitLevelFor(fit.runMode, fit.requiredGb, budget, ram),
    score: round1(composite),
    scoreComponents: { quality: round1(quality), speed: round1(speed), fit: round1(fitS), context: round1(ctxS) },
    estimatedTps: round1(tps), memoryRequiredGb: round1(fit.requiredGb),
    memoryAvailableGb: round1(budget),
    utilizationPct: budget > 0 ? Math.round((fit.requiredGb / budget) * 100) : 0,
    bestQuant: fit.quant, runMode: fit.runMode, runtime: 'Ollama',
    contextLength: model.contextLength, isMoe: model.isMoe, notes,
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

/** Rank a catalog against detected hardware. Sorted by composite score desc, then
 *  newer version (tiebreak). Port of rank_models (serve-path gated, use-case filtered). */
export function rankModels(
  catalog: ReadonlyArray<CatalogModel>, hw: Hardware, opts: RankOptions = {},
): ModelRecommendation[] {
  const limit = opts.limit ?? 20;
  const search = opts.search?.toLowerCase();
  const wantUseCase = normalizeUseCase(opts.useCase); // unknown/inherited keys → 'general'
  const out: Array<{ rec: ModelRecommendation; version: number }> = [];

  for (const model of catalog) {
    if (!isServable(model, hw)) continue;
    if (search && !model.name.toLowerCase().includes(search) && !model.provider.toLowerCase().includes(search)) continue;
    // Use-case filter: when a concrete (non-general) use-case is requested, keep
    // only models of that use-case. 'general' shows everything.
    if (wantUseCase !== 'general' && inferUseCase(model) !== wantUseCase) continue;
    const rec = analyzeModel(model, hw, opts);
    if (opts.fitOnly && rec.fitLevel === 'too_tight') continue;
    out.push({ rec, version: versionKey(model.name) });
  }

  out.sort((a, b) => (b.rec.score - a.rec.score) || (b.version - a.version));
  return out.slice(0, limit).map((x) => x.rec);
}
