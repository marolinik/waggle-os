/**
 * Curated Ollama-servable model catalog. Every `name` is a real `ollama pull` ref.
 * Clean-room replacement for Odysseus's 917-row HF `hf_models.json` — scoped to the
 * dense + MoE models a 2026 laptop/desktop user would actually run locally.
 * Maintained by hand (small on purpose); no runtime HF fetch.
 * (AGPL-3.0: data curated independently, no code/list copied.)
 */

export interface CatalogModel {
  /** ollama pull ref, e.g. "llama3.1:8b" */
  readonly name: string;
  readonly provider: string;
  readonly parameterCount: string;   // human label, e.g. "8B"
  readonly paramsB: number;          // total params (billions) — VRAM footprint
  readonly activeParamsB?: number;   // MoE active params/token — KV + speed
  readonly isMoe: boolean;
  readonly quant: string;            // native/default GGUF quant tag
  readonly contextLength: number;
  readonly family: string;           // 'llama' | 'qwen' | 'mistral' | ...
  readonly useCase: string;          // 'general' | 'coding' | 'reasoning' | 'multimodal'
  readonly releaseDate: string;      // ISO date for the recency tiebreak
  readonly gguf?: boolean;           // Ollama models are GGUF; defaults true (serve-path gate)
}

export const OLLAMA_CATALOG: ReadonlyArray<CatalogModel> = [
  // ── Llama ─────────────────────────────────────────────
  { name: 'llama3.2:1b', provider: 'Meta', parameterCount: '1B', paramsB: 1.2, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'llama', useCase: 'general', releaseDate: '2024-09-25' },
  { name: 'llama3.2:3b', provider: 'Meta', parameterCount: '3B', paramsB: 3.2, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'llama', useCase: 'general', releaseDate: '2024-09-25' },
  { name: 'llama3.1:8b', provider: 'Meta', parameterCount: '8B', paramsB: 8, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'llama', useCase: 'general', releaseDate: '2024-07-23' },
  { name: 'llama3.1:70b', provider: 'Meta', parameterCount: '70B', paramsB: 70, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'llama', useCase: 'general', releaseDate: '2024-07-23' },
  { name: 'llama3.3:70b', provider: 'Meta', parameterCount: '70B', paramsB: 70, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'llama', useCase: 'general', releaseDate: '2024-12-06' },
  // ── Qwen 2.5 ──────────────────────────────────────────
  { name: 'qwen2.5:0.5b', provider: 'Alibaba', parameterCount: '0.5B', paramsB: 0.5, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
  { name: 'qwen2.5:3b', provider: 'Alibaba', parameterCount: '3B', paramsB: 3, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
  { name: 'qwen2.5:7b', provider: 'Alibaba', parameterCount: '7B', paramsB: 7, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
  { name: 'qwen2.5:14b', provider: 'Alibaba', parameterCount: '14B', paramsB: 14, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
  { name: 'qwen2.5:32b', provider: 'Alibaba', parameterCount: '32B', paramsB: 32, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
  { name: 'qwen2.5:72b', provider: 'Alibaba', parameterCount: '72B', paramsB: 72, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'general', releaseDate: '2024-09-19' },
  // ── Qwen 2.5 Coder ────────────────────────────────────
  { name: 'qwen2.5-coder:1.5b', provider: 'Alibaba', parameterCount: '1.5B', paramsB: 1.5, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'coding', releaseDate: '2024-11-12' },
  { name: 'qwen2.5-coder:7b', provider: 'Alibaba', parameterCount: '7B', paramsB: 7, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'coding', releaseDate: '2024-11-12' },
  { name: 'qwen2.5-coder:14b', provider: 'Alibaba', parameterCount: '14B', paramsB: 14, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'coding', releaseDate: '2024-11-12' },
  { name: 'qwen2.5-coder:32b', provider: 'Alibaba', parameterCount: '32B', paramsB: 32, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'qwen', useCase: 'coding', releaseDate: '2024-11-12' },
  // ── Qwen 3 (incl. MoE) ────────────────────────────────
  { name: 'qwen3:1.7b', provider: 'Alibaba', parameterCount: '1.7B', paramsB: 1.7, isMoe: false, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'general', releaseDate: '2025-04-28' },
  { name: 'qwen3:4b', provider: 'Alibaba', parameterCount: '4B', paramsB: 4, isMoe: false, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'general', releaseDate: '2025-04-28' },
  { name: 'qwen3:8b', provider: 'Alibaba', parameterCount: '8B', paramsB: 8, isMoe: false, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'general', releaseDate: '2025-04-28' },
  { name: 'qwen3:14b', provider: 'Alibaba', parameterCount: '14B', paramsB: 14, isMoe: false, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'general', releaseDate: '2025-04-28' },
  { name: 'qwen3:32b', provider: 'Alibaba', parameterCount: '32B', paramsB: 32, isMoe: false, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'reasoning', releaseDate: '2025-04-28' },
  { name: 'qwen3:30b-a3b', provider: 'Alibaba', parameterCount: '30B', paramsB: 30.5, activeParamsB: 3.3, isMoe: true, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'general', releaseDate: '2025-04-28' },
  { name: 'qwen3:235b-a22b', provider: 'Alibaba', parameterCount: '235B', paramsB: 235, activeParamsB: 22, isMoe: true, quant: 'Q4_K_M', contextLength: 40960, family: 'qwen', useCase: 'reasoning', releaseDate: '2025-04-28' },
  // ── Mistral / Mixtral ─────────────────────────────────
  { name: 'mistral:7b', provider: 'Mistral', parameterCount: '7B', paramsB: 7, isMoe: false, quant: 'Q4_K_M', contextLength: 32768, family: 'mistral', useCase: 'general', releaseDate: '2023-09-27' },
  { name: 'mistral-nemo:12b', provider: 'Mistral', parameterCount: '12B', paramsB: 12, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'mistral', useCase: 'general', releaseDate: '2024-07-18' },
  { name: 'mixtral:8x7b', provider: 'Mistral', parameterCount: '47B', paramsB: 46.7, activeParamsB: 12.9, isMoe: true, quant: 'Q4_K_M', contextLength: 32768, family: 'mistral', useCase: 'general', releaseDate: '2023-12-11' },
  // ── Gemma 2 / 3 ───────────────────────────────────────
  { name: 'gemma2:2b', provider: 'Google', parameterCount: '2B', paramsB: 2.6, isMoe: false, quant: 'Q4_K_M', contextLength: 8192, family: 'gemma', useCase: 'general', releaseDate: '2024-07-31' },
  { name: 'gemma2:9b', provider: 'Google', parameterCount: '9B', paramsB: 9, isMoe: false, quant: 'Q4_K_M', contextLength: 8192, family: 'gemma', useCase: 'general', releaseDate: '2024-06-27' },
  { name: 'gemma2:27b', provider: 'Google', parameterCount: '27B', paramsB: 27, isMoe: false, quant: 'Q4_K_M', contextLength: 8192, family: 'gemma', useCase: 'general', releaseDate: '2024-06-27' },
  { name: 'gemma3:4b', provider: 'Google', parameterCount: '4B', paramsB: 4.3, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'gemma', useCase: 'multimodal', releaseDate: '2025-03-12' },
  { name: 'gemma3:12b', provider: 'Google', parameterCount: '12B', paramsB: 12, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'gemma', useCase: 'multimodal', releaseDate: '2025-03-12' },
  { name: 'gemma3:27b', provider: 'Google', parameterCount: '27B', paramsB: 27, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'gemma', useCase: 'multimodal', releaseDate: '2025-03-12' },
  // ── Phi ───────────────────────────────────────────────
  { name: 'phi3:3.8b', provider: 'Microsoft', parameterCount: '3.8B', paramsB: 3.8, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'phi', useCase: 'general', releaseDate: '2024-04-23' },
  { name: 'phi4:14b', provider: 'Microsoft', parameterCount: '14B', paramsB: 14, isMoe: false, quant: 'Q4_K_M', contextLength: 16384, family: 'phi', useCase: 'reasoning', releaseDate: '2024-12-12' },
  // ── DeepSeek ──────────────────────────────────────────
  { name: 'deepseek-coder-v2:16b', provider: 'DeepSeek', parameterCount: '16B', paramsB: 15.7, activeParamsB: 2.4, isMoe: true, quant: 'Q4_K_M', contextLength: 163840, family: 'deepseek', useCase: 'coding', releaseDate: '2024-06-17' },
  { name: 'deepseek-r1:7b', provider: 'DeepSeek', parameterCount: '7B', paramsB: 7, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'deepseek', useCase: 'reasoning', releaseDate: '2025-01-20' },
  { name: 'deepseek-r1:14b', provider: 'DeepSeek', parameterCount: '14B', paramsB: 14, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'deepseek', useCase: 'reasoning', releaseDate: '2025-01-20' },
  { name: 'deepseek-r1:32b', provider: 'DeepSeek', parameterCount: '32B', paramsB: 32, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'deepseek', useCase: 'reasoning', releaseDate: '2025-01-20' },
  // ── Vision / small ────────────────────────────────────
  { name: 'llama3.2-vision:11b', provider: 'Meta', parameterCount: '11B', paramsB: 11, isMoe: false, quant: 'Q4_K_M', contextLength: 131072, family: 'llama', useCase: 'multimodal', releaseDate: '2024-11-06' },
  { name: 'smollm2:1.7b', provider: 'HuggingFace', parameterCount: '1.7B', paramsB: 1.7, isMoe: false, quant: 'Q4_K_M', contextLength: 8192, family: 'smollm', useCase: 'general', releaseDate: '2024-11-01' },
];
