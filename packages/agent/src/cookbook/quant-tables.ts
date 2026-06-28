/**
 * Quant realism tables — clean-room port of the *concept* behind Odysseus
 * hwfit `models.py` (QUANT_BYTES_PER_PARAM / QUANT_SPEED_MULT / QUANT_QUALITY_PENALTY).
 * Scope-cut to GGUF k-quant tiers + the float formats the memory/speed math needs.
 * The AWQ/GPTQ/MLX/FP4-MoE-mixed prequant long tail is intentionally omitted — a
 * curated Ollama catalog never surfaces those serving paths. (AGPL-3.0: math/tables
 * authored fresh, no code copied, no binary bundled.)
 */

/** GGUF quant tiers, highest quality → smallest. Walked to pick best-fitting quant. */
export const QUANT_HIERARCHY = ['Q8_0', 'Q6_K', 'Q5_K_M', 'Q4_K_M', 'Q3_K_M', 'Q2_K'] as const;

/** Bytes per parameter — drives VRAM/RAM weight footprint. */
export const QUANT_BYTES_PER_PARAM: Readonly<Record<string, number>> = {
  F16: 2.0, BF16: 2.0, FP8: 1.0,
  Q8_0: 1.0, Q6_K: 0.75, Q5_K_M: 0.625,
  Q4_K_M: 0.5, Q4_0: 0.5, Q3_K_M: 0.375, Q2_K: 0.25,
};

/** Speed multiplier for the CPU/fallback tok/s path — smaller quants stream faster. */
export const QUANT_SPEED_MULT: Readonly<Record<string, number>> = {
  F16: 0.6, BF16: 0.6, FP8: 0.85,
  Q8_0: 0.8, Q6_K: 0.95, Q5_K_M: 1.0,
  Q4_K_M: 1.15, Q4_0: 1.15, Q3_K_M: 1.25, Q2_K: 1.35,
};

/** Quality delta (points) added to the base quality score for the chosen quant. */
export const QUANT_QUALITY_PENALTY: Readonly<Record<string, number>> = {
  F16: 0.0, BF16: 0.0, FP8: 0.0,
  Q8_0: 0.0, Q6_K: -1.0, Q5_K_M: -2.0,
  Q4_K_M: -5.0, Q4_0: -5.0, Q3_K_M: -8.0, Q2_K: -12.0,
};

export const DEFAULT_BPP = 0.5;        // unknown quant ≈ a 4-bit GGUF
export const DEFAULT_SPEED_MULT = 1.0;
