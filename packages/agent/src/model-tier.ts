/**
 * Model tiers — drive scoring profile, recall limit, score floor, and
 * scaffold selection in the PromptAssembler.
 *
 * Frontier: Claude Opus family.
 * Mid: Claude Sonnet/Haiku + unknown-model default.
 * Small: Gemma 4, Qwen3, Llama 3/4 small-family variants.
 */

export type ModelTier = 'small' | 'mid' | 'frontier';

const FRONTIER_PREFIXES = ['claude-opus'] as const;

const SMALL_PREFIXES = [
  'gemma-4-',
  'qwen3-',
  'qwen3.5-',
  'llama-3',
  'llama-4',
] as const;

const MID_PREFIXES = ['claude-sonnet', 'claude-haiku'] as const;

/**
 * Map a model identifier to a tier. Case-insensitive prefix match.
 * Unknown models default to 'mid' (safe middle ground).
 */
export function tierForModel(model: string): ModelTier {
  const normalized = model.toLowerCase();

  for (const prefix of FRONTIER_PREFIXES) {
    if (normalized.startsWith(prefix)) return 'frontier';
  }
  for (const prefix of SMALL_PREFIXES) {
    if (normalized.startsWith(prefix)) return 'small';
  }
  for (const prefix of MID_PREFIXES) {
    if (normalized.startsWith(prefix)) return 'mid';
  }

  return 'mid';
}
