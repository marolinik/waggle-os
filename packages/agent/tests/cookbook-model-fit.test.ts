import { describe, it, expect } from 'vitest';
import {
  estimateMemoryGb, estimateTps, qualityScore, fitScore, contextScore, archAgeBonus,
  versionKey, isServable, rankModels, type Hardware,
} from '../src/cookbook/index.js';
import { OLLAMA_CATALOG, type CatalogModel } from '../src/cookbook/catalog.js';

const llama8b: CatalogModel = { name: 'llama3.1:8b', provider: 'Meta', parameterCount: '8B', paramsB: 8, isMoe: false, quant: 'Q4_K_M', contextLength: 8192, family: 'llama', useCase: 'general', releaseDate: '2024-07-23' };
const qwen30moe: CatalogModel = { name: 'qwen3:30b-a3b', provider: 'Alibaba', parameterCount: '30B', paramsB: 30.5, activeParamsB: 3, isMoe: true, quant: 'Q4_K_M', contextLength: 8192, family: 'qwen', useCase: 'general', releaseDate: '2025-04-28' };
const rtx4090: Hardware = { totalRamGb: 64, availableRamGb: 32, hasGpu: true, gpuName: 'NVIDIA GeForce RTX 4090', gpuVramGb: 24, gpuCount: 1, backend: 'cuda', platform: 'linux x64' };
const cpuBox: Hardware = { totalRamGb: 32, availableRamGb: 24, hasGpu: false, gpuName: null, gpuVramGb: null, gpuCount: 0, backend: 'CPU (x64)', platform: 'win32 x64' };

describe('estimateMemoryGb', () => {
  it('dense 8B Q4_K_M @8192', () => expect(estimateMemoryGb(llama8b, 'Q4_K_M', 8192)).toBeCloseTo(5.024288, 5));
  it('MoE total30/active3 Q4_K_M @8192 (KV uses active)', () => expect(estimateMemoryGb({ ...qwen30moe, paramsB: 30 }, 'Q4_K_M', 8192)).toBeCloseTo(15.696608, 5));
});

describe('estimateTps', () => {
  it('GPU dense — 4090 + llama8B Q4_K_M', () => expect(estimateTps(llama8b, 'Q4_K_M', 'gpu', rtx4090)).toBeCloseTo(138.6, 4));
  it('GPU MoE — 4090 + qwen3:30b-a3b (active 3, ×0.8)', () => expect(estimateTps(qwen30moe, 'Q4_K_M', 'gpu', rtx4090)).toBeCloseTo(295.68, 4));
  it('CPU-only fallback — x86 + llama8B Q4_K_M', () => expect(estimateTps(llama8b, 'Q4_K_M', 'cpu_only', cpuBox)).toBeCloseTo(10.0625, 4));
  it('CPU-offload harmonic blend — frac 0.5, 4090', () => expect(estimateTps(llama8b, 'Q4_K_M', 'cpu_offload', rtx4090, 0.5)).toBeCloseTo(14.342427, 4));
});

describe('fitScore boundaries', () => {
  it('ratio 0.25 → 80', () => expect(fitScore(2, 8)).toBe(80));
  it('ratio 0.5 → 100 (peak start)', () => expect(fitScore(4, 8)).toBe(100));
  it('ratio 0.625 → 100 (in peak)', () => expect(fitScore(5, 8)).toBe(100));
  it('ratio 0.85 → 70', () => expect(fitScore(6.8, 8)).toBe(70));
  it('ratio 0.95 → 50', () => expect(fitScore(7.6, 8)).toBe(50));
  it('over budget → 0', () => expect(fitScore(9, 8)).toBe(0));
  it('zero available → 0', () => expect(fitScore(5, 0)).toBe(0));
});

describe('qualityScore', () => {
  it('llama 8B Q4_K_M general = 72', () => expect(qualityScore(llama8b, 'Q4_K_M', 'general')).toBe(72));
  it('coder model penalized -10 in general scan', () => {
    const dsc: CatalogModel = { name: 'deepseek-coder-v2:16b', provider: 'DeepSeek', parameterCount: '16B', paramsB: 15.7, activeParamsB: 2.4, isMoe: true, quant: 'Q4_K_M', contextLength: 16384, family: 'deepseek', useCase: 'coding', releaseDate: '2024-06-17' };
    expect(qualityScore(dsc, 'Q4_K_M', 'general')).toBe(70); // 82 +3(deepseek) -5(Q4) -10(coder-in-general)
    expect(qualityScore(dsc, 'Q4_K_M', 'coding')).toBe(86);  // +6(coder-in-coding) instead of -10
  });
});

describe('archAgeBonus + versionKey', () => {
  it('qwen ladder', () => { expect(archAgeBonus('qwen3:8b')).toBe(4); expect(archAgeBonus('qwen2.5:7b')).toBe(2); expect(archAgeBonus('llama3.1:8b')).toBe(0); });
  it('versionKey parses version, skips param-count', () => {
    expect(versionKey('MiniMax-M2.7')).toBeCloseTo(2.7, 5);
    expect(versionKey('Qwen3.6-35B')).toBeCloseTo(3.6, 5);
    expect(versionKey('Qwen3-235B')).toBe(3);  // 235 skipped (bare ≥100)
    expect(versionKey('mistral:7b')).toBe(0);
  });
});

describe('contextScore', () => {
  it('meets target → 100', () => expect(contextScore(8192, 'general')).toBe(100));
  it('half target → 70', () => expect(contextScore(2048, 'general')).toBe(70));
  it('below half → 30', () => expect(contextScore(1000, 'general')).toBe(30));
});

describe('rankModels — composite order (forced Q4_K_M)', () => {
  const cat: CatalogModel[] = [
    llama8b,
    { name: 'qwen2.5:7b', provider: 'Alibaba', parameterCount: '7B', paramsB: 7, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
    { name: 'deepseek-coder-v2:16b', provider: 'DeepSeek', parameterCount: '16B', paramsB: 15.7, activeParamsB: 2.4, isMoe: true, quant: 'Q4_K_M', contextLength: 16384, family: 'deepseek', useCase: 'coding', releaseDate: '2024-06-17' },
  ];
  const ranked = rankModels(cat, rtx4090, { useCase: 'general', quant: 'Q4_K_M' });
  it('orders by composite desc', () => expect(ranked.map((r) => r.name)).toEqual(['qwen2.5:7b', 'deepseek-coder-v2:16b', 'llama3.1:8b']));
  it('exact composites', () => {
    expect(ranked.find((r) => r.name === 'qwen2.5:7b')!.score).toBeCloseTo(85.2, 1);
    expect(ranked.find((r) => r.name === 'deepseek-coder-v2:16b')!.score).toBeCloseTo(84.8, 1);
    expect(ranked.find((r) => r.name === 'llama3.1:8b')!.score).toBeCloseTo(83.9, 1);
  });
  it('MoE flagged + GPU run mode', () => {
    const ds = ranked.find((r) => r.name === 'deepseek-coder-v2:16b')!;
    expect(ds.isMoe).toBe(true);
    expect(ds.runMode).toBe('gpu');
    expect(ds.estimatedTps).toBeCloseTo(369.6, 1); // (1008/1.2)*0.55*0.8
  });
});

describe('serve-path gating', () => {
  const nonGguf: CatalogModel = { name: 'some-awq:32b', provider: 'X', parameterCount: '32B', paramsB: 32, isMoe: false, quant: 'Q4_K_M', contextLength: 8192, family: 'x', useCase: 'general', releaseDate: '2025-01-01', gguf: false };
  const mac: Hardware = { totalRamGb: 32, availableRamGb: 24, hasGpu: true, gpuName: 'Apple M3 Max', gpuVramGb: 24, gpuCount: 1, backend: 'Metal (Apple Silicon)', platform: 'darwin arm64' };
  it('drops non-GGUF on Apple Silicon', () => expect(isServable(nonGguf, mac)).toBe(false));
  it('keeps non-GGUF on Linux+CUDA', () => expect(isServable(nonGguf, rtx4090)).toBe(true));
  it('every shipped catalog row is GGUF-servable everywhere', () => {
    for (const m of OLLAMA_CATALOG) { expect(isServable(m, mac)).toBe(true); expect(isServable(m, rtx4090)).toBe(true); }
  });
});

describe('catalog integrity — every row Ollama-pullable', () => {
  const REF = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/;
  it('names are valid ollama refs', () => { for (const m of OLLAMA_CATALOG) expect(m.name).toMatch(REF); });
  it('positive params/context/quant present', () => {
    for (const m of OLLAMA_CATALOG) {
      expect(m.paramsB).toBeGreaterThan(0);
      expect(m.contextLength).toBeGreaterThan(0);
      expect(m.quant.length).toBeGreaterThan(0);
      if (m.isMoe) expect(m.activeParamsB && m.activeParamsB > 0).toBe(true);
    }
  });
  it('has 30-40 rows spanning dense + MoE', () => {
    expect(OLLAMA_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(OLLAMA_CATALOG.length).toBeLessThanOrEqual(40);
    expect(OLLAMA_CATALOG.some((m) => m.isMoe)).toBe(true);
  });
});
