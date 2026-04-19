/**
 * Model family classifier — orthogonal to ModelTier.
 *
 * Tier (small / mid / frontier) drives scoring profile, recall limit, and
 * scaffold gating. Family drives scaffold-STYLE selection (compression vs
 * expansion).
 *
 * v4 findings motivating this split:
 *  - F > E on 5/6 scenarios: Opus 4.6 + PA beats Opus 4.6 without PA. Claude
 *    benefits from compression scaffolds at frontier tier.
 *  - Qwen3-30B-A3B (instruct variant) showed +26.7pp on compare scenario with
 *    compression scaffold.
 *  - Gemma 4 31B + 26B MoE regressed on 5/6 scenarios with compression
 *    scaffold.
 *
 * Working hypothesis (v5): reasoning-capable families gain from explicit
 * structure; dense instruction-tuned families without reasoning bias are hurt
 * by compression-style scaffolds because compression fights their natural
 * elaboration style. Gemma may still benefit from an EXPANSION scaffold.
 *
 * See PromptAssembler v5 brief §7.1.
 */

export type ModelFamily =
  | 'claude'
  | 'gemma'
  | 'qwen-reasoning'
  | 'qwen-instruction'
  | 'llama'
  | 'other';

/** Reasoning markers that disambiguate qwen-reasoning from qwen-instruction. */
const QWEN_REASONING_MARKERS = ['thinking', 'reasoner', 'reasoning'] as const;

/**
 * Map a model identifier to its training-lineage family.
 *
 * Accepts bare slugs (`claude-opus-4-7`), provider-prefixed slugs
 * (`google/gemma-4-31b-it`), and nested LiteLLM/OpenRouter slugs
 * (`openrouter/qwen/qwen3-30b-a3b-thinking-2507`). Case-insensitive.
 *
 * Unknown models default to `other` (conservative — callers should treat
 * `other` as "don't assume reasoning behavior").
 */
export function familyForModel(model: string): ModelFamily {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return 'other';

  // Strip provider prefix(es): keep only the last slug segment.
  // Handles: "google/gemma-4-31b-it", "qwen/qwen3-...", "openrouter/qwen/qwen3-..."
  const bare = normalized.includes('/')
    ? normalized.slice(normalized.lastIndexOf('/') + 1)
    : normalized;
  if (!bare) return 'other';

  if (bare.startsWith('claude-')) return 'claude';
  if (bare.startsWith('gemma-')) return 'gemma';

  // QwQ is Qwen's dedicated reasoning family — check before generic qwen prefix.
  if (bare.startsWith('qwq-') || bare === 'qwq') return 'qwen-reasoning';

  // Qwen3.6-A3B series unified thinking+base into one SKU with default-on
  // reasoning (per HF model card + LOCKED 2026-04-19 target-model decision).
  // The slug lacks explicit reasoning markers, so special-case the A3B
  // variants of the 3.6 family before the generic qwen prefix check.
  if (bare.startsWith('qwen3.6-') && bare.includes('a3b')) return 'qwen-reasoning';

  if (bare.startsWith('qwen')) {
    const hasReasoningMarker = QWEN_REASONING_MARKERS.some(marker => bare.includes(marker));
    return hasReasoningMarker ? 'qwen-reasoning' : 'qwen-instruction';
  }

  if (bare.startsWith('llama-3') || bare.startsWith('llama-4')) return 'llama';

  return 'other';
}
